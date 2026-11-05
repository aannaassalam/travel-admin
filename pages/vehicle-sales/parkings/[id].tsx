import {
  getParking,
  listCatalogue,
  listLocations,
  refId,
  saveParking,
  setParkingStatus,
  type StatusAction
} from "@/api/functions/admin.api";
import ImageUploader from "@/components/Form/ImageUploader";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import LocationPicker, { type Geo } from "@/components/Form/LocationPicker";
import { OptionSelect } from "@/components/Form/OptionSelect";
import SupplierSelect from "@/components/Form/SupplierSelect";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
import { message } from "@/components/Transfers/transfers.lib";
import { STATUS_DONE, StatusActions, StatusBadge } from "@/components/VehicleSales/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLeaveGuard, useUnsaved } from "@/hooks/useUnsaved";
import { lz, toLocalized } from "@/lib/functions/localized.lib";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/** A parking: its town, address and pin, photos, and the types of vehicles it holds. */
export default function ParkingFormPage() {
  const { query } = useRouter();
  // A fresh form for each record, as the restaurant form.
  return <ParkingForm key={String(query.id ?? "")} />;
}

function ParkingForm() {
  const router = useRouter();
  const id = router.query.id as string;
  const isNew = !id || id === "new";
  const queryClient = useQueryClient();
  const { t } = useT();
  const { dirty, setDirty, isDirty, mark } = useUnsaved();
  const { can } = useCan();
  const canWrite = can("inventory:write");

  const [name, setName] = useState<Localized>({});
  const [description, setDescription] = useState<Localized>({});
  const [openingHours, setOpeningHours] = useState<Localized>({});
  const [images, setImages] = useState<string[]>([]);
  const [geo, setGeo] = useState<Geo>(null);
  const [vehicleTypes, setVehicleTypes] = useState<string[]>([]);
  const [form, setForm] = useState({ city: "", address: "", phone: "", supplier: "" });

  const { data: parking, isError, error, isFetching, isFetchedAfterMount, refetch } = useQuery({
    queryKey: ["parking", id],
    queryFn: () => getParking(id),
    enabled: !isNew,
    refetchOnMount: "always"
  });
  const { data: locations } = useQuery({
    queryKey: ["locations"],
    queryFn: listLocations,
    staleTime: 5 * 60 * 1000
  });
  const { data: types } = useQuery({
    queryKey: ["vs-catalogue", "types"],
    queryFn: () => listCatalogue("types"),
    staleTime: 60 * 1000
  });

  // Opened once THIS visit has read the record (see the restaurant form).
  const [opened, setOpened] = useState(false);
  if (!opened && parking && isFetchedAfterMount && !isError) setOpened(true);

  useEffect(() => {
    if (!parking || isDirty()) return;
    setName(toLocalized(parking.name));
    setDescription(toLocalized(parking.description));
    setOpeningHours(toLocalized(parking.openingHours));
    setImages(parking.images ?? []);
    setGeo(parking.geo ?? null);
    setVehicleTypes((parking.vehicleTypes ?? []).map(refId));
    setForm({
      city: parking.city ?? "",
      address: parking.address ?? "",
      phone: parking.phone ?? "",
      supplier: refId(parking.supplier)
    });
  }, [parking, isDirty]);

  const letGo = useLeaveGuard({ dirty });
  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };
  const toggleType = (typeId: string, on: boolean) => {
    setVehicleTypes((ts) => (on ? [...ts, typeId] : ts.filter((x) => x !== typeId)));
    setDirty(true);
  };

  const onError = (e: unknown) => toast.error(message(e, t("inv.restaurant.saveFailed")));
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["parking", id] });
    queryClient.invalidateQueries({ queryKey: ["parkings"] });
  };

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      const unchanged = mark();
      const saved = await saveParking(isNew ? undefined : id, {
        name,
        description,
        openingHours,
        city: form.city,
        address: form.address.trim(),
        phone: form.phone.trim(),
        geo,
        images,
        vehicleTypes,
        // "" takes the supplier away, as on hotels and listings.
        supplier: form.supplier
      });
      return { saved, clean: unchanged() };
    },
    meta: { showToast: false },
    onSuccess: ({ saved, clean }) => {
      if (clean) setDirty(false);
      refresh();
      toast.success(t("vs.saved"));
      if (isNew && saved?.id) {
        letGo();
        router.replace(`/vehicle-sales/parkings/${saved.id}`);
      }
    },
    onError
  });

  const { mutate: act, isPending: acting } = useMutation({
    mutationFn: (action: StatusAction) => setParkingStatus(id, action),
    meta: { showToast: false },
    onSuccess: (_r, action) => {
      refresh();
      toast.success(t(STATUS_DONE[action], { name: lz(name) }));
    },
    onError
  });

  if (isNew && !canWrite) {
    return (
      <AdminLayout title={t("vs.parking.new")}>
        <p className="text-sm text-muted-foreground">{t("inv.restaurant.noWrite")}</p>
      </AdminLayout>
    );
  }
  if (!isNew && !opened) {
    return (
      <AdminLayout title={t("vs.parking.title")}>
        {isError && !isFetching ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        )}
      </AdminLayout>
    );
  }

  const places = (locations?.items ?? []).filter((l) => l.isActive);
  const typeOptions = (types?.items ?? []).filter((x) => x.isActive || vehicleTypes.includes(x.id));
  const blockers = parking?.publishBlockers ?? [];

  return (
    <AdminLayout
      title={isNew ? t("vs.parking.new") : lz(name) || t("vs.parking.title")}
      description={t("vs.parking.description")}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/vehicle-sales/parkings">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="size-4 rtl:-scale-x-100" />
            {t("nav.vehicleSales.parkings")}
          </Button>
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canWrite && dirty && !isNew ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {t("inv.restaurant.unsaved")}
            </span>
          ) : null}
          {parking ? <StatusBadge value={parking.status} /> : null}
          {canWrite ? (
            <Button disabled={isPending || !name.fr?.trim() || !form.city} onClick={() => save()}>
              {isPending ? t("inv.restaurant.saving") : t("common.save")}
            </Button>
          ) : null}
          {canWrite && parking ? (
            <StatusActions
              status={parking.status}
              name={lz(name)}
              dirty={dirty}
              blockers={blockers}
              busy={acting}
              onAction={act}
            />
          ) : null}
        </div>
      </div>

      {!isNew && blockers.length > 0 ? (
        <Card className="mb-4 border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30">
          <p className="text-sm font-medium">{t("inv.restaurant.blockers")}</p>
          <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">{t("inv.restaurant.details")}</h2>
          <LocalizedInput
            disabled={!canWrite}
            label={t("common.name")}
            required
            value={name}
            onChange={(v) => { setName(v); setDirty(true); }}
          />
          <LocalizedInput
            disabled={!canWrite}
            label={t("inv.restaurant.descriptionLabel")}
            multiline
            value={description}
            onChange={(v) => { setDescription(v); setDirty(true); }}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">{t("common.city")} *</Label>
              {/* From the serviced locations, never typed: the website's town filter reads it. */}
              <OptionSelect
                disabled={!canWrite}
                aria-label={t("common.city")}
                value={form.city}
                onChange={(v) => set("city", v)}
                options={[
                  { value: "", label: t("inv.listing.selectLocation") },
                  ...places.map((l) => ({ value: l.name, label: l.name })),
                  // One saved before its location was switched off stays chosen.
                  ...(form.city && !places.some((l) => l.name === form.city)
                    ? [{ value: form.city, label: form.city }]
                    : [])
                ]}
              />
              {form.city && locations && !places.some((l) => l.name === form.city) ? (
                <p className="mt-1 text-xs text-amber-600">
                  {t("inv.listing.notLive", { city: form.city })}
                </p>
              ) : null}
            </div>
            <div>
              <Label className="text-xs">{t("common.phone")}</Label>
              <Input disabled={!canWrite} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">{t("inv.restaurant.address")}</Label>
            <Input disabled={!canWrite} value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <LocationPicker
            disabled={!canWrite}
            city={form.city}
            value={geo}
            onChange={(g) => { setGeo(g); setDirty(true); }}
          />
          <LocalizedInput
            disabled={!canWrite}
            label={t("inv.restaurant.openingHours")}
            value={openingHours}
            onChange={(v) => { setOpeningHours(v); setDirty(true); }}
            placeholder={t("inv.restaurant.hoursPlaceholder")}
          />
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{t("vs.cat.tab.types")}</h2>
              <Link
                href="/vehicle-sales/catalogue?tab=types"
                className="text-xs text-muted-foreground underline underline-offset-2"
              >
                {t("vs.editList")}
              </Link>
            </div>
            {typeOptions.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {typeOptions.map((x) => (
                  <label key={x.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      disabled={!canWrite}
                      checked={vehicleTypes.includes(x.id)}
                      onCheckedChange={(v) => toggleType(x.id, v === true)}
                    />
                    {lz(x.name)}
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("vs.parking.noTypes")}</p>
            )}
            <SupplierSelect
              disabled={!canWrite}
              value={form.supplier}
              onChange={(v) => set("supplier", v)}
            />
          </Card>

          <Card className="space-y-4 p-5">
            <ImageUploader
              label={t("inv.restaurant.images")}
              folder="parkings"
              value={images}
              onChange={(v) => { setImages(v); setDirty(true); }}
              minimum={1}
            />
          </Card>

          {!isNew ? (
            <Card className="flex flex-row flex-wrap items-center gap-2 p-5">
              <h2 className="me-auto font-semibold">{t("nav.vehicleSales.vehicles")}</h2>
              <Link href={`/vehicle-sales?parking=${id}`}>
                <Button variant="outline" size="sm">{t("vs.parking.seeVehicles")}</Button>
              </Link>
              {canWrite ? (
                <Link href={`/vehicle-sales/vehicles/new?parking=${id}`}>
                  <Button size="sm" className="gap-2">
                    <Plus className="size-4" />
                    {t("vs.vehicle.new")}
                  </Button>
                </Link>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
    </AdminLayout>
  );
}
