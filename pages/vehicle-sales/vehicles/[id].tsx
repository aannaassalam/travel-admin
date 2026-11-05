import {
  getSaleVehicle,
  listCatalogue,
  listParkings,
  refId,
  saveSaleVehicle,
  setSaleVehicleStatus,
  type SaleVehicleSpecValue,
  type StatusAction,
  type VehicleAccessory
} from "@/api/functions/admin.api";
import ImageUploader from "@/components/Form/ImageUploader";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import MoneyInput, { formToMoney, moneyToForm } from "@/components/Form/MoneyInput";
import { OptionSelect } from "@/components/Form/OptionSelect";
import PromotionFields, {
  onePrice,
  promotionBody,
  type PromotionDraft
} from "@/components/Form/PromotionFields";
import VideoField from "@/components/Form/VideoField";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
import { message } from "@/components/Transfers/transfers.lib";
import {
  AvailabilityBadge,
  STATUS_DONE,
  StatusActions,
  StatusBadge,
  vehicleName
} from "@/components/VehicleSales/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLeaveGuard, useUnsaved } from "@/hooks/useUnsaved";
import { formatDate } from "@/lib/functions/format.lib";
import { lz, toLocalized } from "@/lib/functions/localized.lib";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * A vehicle for sale: where it stands, what it is, its price, photos, and the
 * catalogue's specifications and accessories. Its availability is the orders'
 * business — shown here, never edited.
 */

/** Each spec's value as its box holds it, by spec id. */
type SpecDraft = Record<string, { choice?: string; number?: string; text?: Localized }>;

// A blank number box is sent as null: "not given".
const num = (s: string) => (s.trim() === "" ? null : Number(s));

export default function SaleVehicleFormPage() {
  const { query } = useRouter();
  // A fresh form for each record, as the restaurant form.
  return <VehicleForm key={String(query.id ?? "")} />;
}

function VehicleForm() {
  const router = useRouter();
  const id = router.query.id as string;
  const isNew = !id || id === "new";
  const queryClient = useQueryClient();
  const { t } = useT();
  const { dirty, setDirty, isDirty, mark } = useUnsaved();
  const { can } = useCan();
  const canWrite = can("inventory:write");

  const [form, setForm] = useState({
    // A parking's "Add a vehicle" comes with it.
    parking: typeof router.query.parking === "string" ? router.query.parking : "",
    vehicleType: "",
    make: "",
    model: "",
    year: "",
    mileageKm: "",
    condition: "USED",
    colour: "",
    vin: ""
  });
  const [title, setTitle] = useState<Localized>({});
  const [description, setDescription] = useState<Localized>({});
  const [cost, setCost] = useState(moneyToForm());
  const [sell, setSell] = useState(moneyToForm());
  const [processingFee, setProcessingFee] = useState(moneyToForm());
  // Sent only once changed here, as on listings: an ended promotion must not block saving.
  const [promo, setPromo] = useState<PromotionDraft & { touched?: boolean }>({ old: {}, ends: "" });
  const [images, setImages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoBusy, setVideoBusy] = useState(false);
  const [specs, setSpecs] = useState<SpecDraft>({});
  const [accessories, setAccessories] = useState<string[]>([]);

  const { data: vehicle, isError, error, isFetching, isFetchedAfterMount, refetch } = useQuery({
    queryKey: ["sale-vehicle", id],
    queryFn: () => getSaleVehicle(id),
    enabled: !isNew,
    refetchOnMount: "always"
  });
  const { data: parkings } = useQuery({
    queryKey: ["parkings", {}],
    queryFn: () => listParkings(),
    staleTime: 60 * 1000
  });
  const catalogue = { staleTime: 60 * 1000 };
  const { data: types } = useQuery({
    queryKey: ["vs-catalogue", "types"],
    queryFn: () => listCatalogue("types"),
    ...catalogue
  });
  const { data: specList } = useQuery({
    queryKey: ["vs-catalogue", "specs"],
    queryFn: () => listCatalogue("specs"),
    ...catalogue
  });
  const { data: accessoryList } = useQuery({
    queryKey: ["vs-catalogue", "accessories"],
    queryFn: () => listCatalogue("accessories"),
    ...catalogue
  });

  // Opened once THIS visit has read the record (see the restaurant form).
  const [opened, setOpened] = useState(false);
  if (!opened && vehicle && isFetchedAfterMount && !isError) setOpened(true);

  useEffect(() => {
    const v = vehicle;
    if (!v || isDirty()) return;
    setForm({
      parking: refId(v.parking),
      vehicleType: refId(v.vehicleType),
      make: v.make ?? "",
      model: v.model ?? "",
      year: v.year ? String(v.year) : "",
      mileageKm: typeof v.mileageKm === "number" ? String(v.mileageKm) : "",
      condition: v.condition ?? "USED",
      colour: v.colour ?? "",
      vin: v.vin ?? ""
    });
    setTitle(toLocalized(v.title));
    setDescription(toLocalized(v.description));
    setCost(moneyToForm(v.costPrice));
    setSell(moneyToForm(v.sellPrice));
    setProcessingFee(moneyToForm(v.processingFee));
    setPromo({
      old: { promoCompareAtPrice: moneyToForm(v.promoCompareAtPrice?.CDF ? v.promoCompareAtPrice : undefined) },
      ends: v.promoEndsAt?.slice(0, 10) ?? ""
    });
    setImages(v.images ?? []);
    setVideoUrl(v.videoUrl ?? "");
    setSpecs(
      Object.fromEntries(
        (v.specs ?? []).map((s) => [
          refId(s.spec),
          {
            choice: s.choice,
            number: typeof s.number === "number" ? String(s.number) : undefined,
            text: s.text ? toLocalized(s.text) : undefined
          }
        ])
      )
    );
    setAccessories((v.accessories ?? []).map(refId));
  }, [vehicle, isDirty]);

  const letGo = useLeaveGuard({ dirty, uploading: videoBusy });
  const touch = () => setDirty(true);
  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    touch();
  };
  const setSpec = (specId: string, value: SpecDraft[string]) => {
    setSpecs((s) => ({ ...s, [specId]: value }));
    touch();
  };

  const parking = parkings?.items.find((p) => p.id === form.parking);
  // The types the parking holds; all of them until the parkings have loaded.
  const allowed = parking ? (parking.vehicleTypes ?? []).map(refId) : undefined;
  const typeOptions = (types?.items ?? []).filter(
    (x) => x.id === form.vehicleType || (x.isActive && (!allowed || allowed.includes(x.id)))
  );
  const byOrder = (a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder;
  // Switched-off ones only where this vehicle already has them.
  const shownSpecs = (specList?.items ?? []).filter((s) => s.isActive || specs[s.id]).sort(byOrder);
  const groups = new Map<string, VehicleAccessory[]>();
  for (const a of (accessoryList?.items ?? [])
    .filter((x) => x.isActive || accessories.includes(x.id))
    .sort(byOrder)) {
    const g = lz(a.group) || t("vs.vehicle.otherGroup");
    groups.set(g, [...(groups.get(g) ?? []), a]);
  }

  const onError = (e: unknown) => toast.error(message(e, t("inv.restaurant.saveFailed")));
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["sale-vehicle", id] });
    queryClient.invalidateQueries({ queryKey: ["sale-vehicles"] });
  };

  const body = () => ({
    parking: form.parking,
    vehicleType: form.vehicleType,
    make: form.make.trim(),
    model: form.model.trim(),
    year: num(form.year),
    mileageKm: num(form.mileageKm),
    condition: form.condition,
    colour: form.colour.trim(),
    vin: form.vin.trim(),
    title,
    description,
    costPrice: formToMoney(cost),
    sellPrice: formToMoney(sell),
    processingFee: formToMoney(processingFee),
    ...(promo.touched ? promotionBody(promo) : {}),
    images,
    // Sent even when blank: "" is what removes a video on the server.
    videoUrl,
    // Each box knows its kind: a choice, a number or a text. Blank ones are left out.
    specs: Object.entries(specs).flatMap(([spec, v]): SaleVehicleSpecValue[] =>
      v.choice
        ? [{ spec, choice: v.choice }]
        : v.number?.trim()
          ? [{ spec, number: Number(v.number) }]
          : v.text && Object.values(v.text).some((x) => x?.trim())
            ? [{ spec, text: v.text }]
            : []
    ),
    accessories
  });

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      const unchanged = mark();
      const saved = await saveSaleVehicle(isNew ? undefined : id, body());
      return { saved, clean: unchanged() };
    },
    meta: { showToast: false },
    onSuccess: ({ saved, clean }) => {
      if (clean) {
        setDirty(false);
        setPromo((p) => ({ ...p, touched: false }));
      }
      refresh();
      toast.success(t("vs.saved"));
      if (isNew && saved?.id) {
        letGo();
        router.replace(`/vehicle-sales/vehicles/${saved.id}`);
      }
    },
    onError
  });

  const { mutate: act, isPending: acting } = useMutation({
    mutationFn: (action: StatusAction) => setSaleVehicleStatus(id, action),
    meta: { showToast: false },
    onSuccess: (_r, action) => {
      refresh();
      toast.success(t(STATUS_DONE[action], { name: vehicle ? vehicleName(vehicle) : "" }));
    },
    onError
  });

  if (isNew && !canWrite) {
    return (
      <AdminLayout title={t("vs.vehicle.new")}>
        <p className="text-sm text-muted-foreground">{t("inv.restaurant.noWrite")}</p>
      </AdminLayout>
    );
  }
  if (!isNew && !opened) {
    return (
      <AdminLayout title={t("label.booking.VEHICLE_SALE")}>
        {isError && !isFetching ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        )}
      </AdminLayout>
    );
  }

  const blockers = vehicle?.publishBlockers ?? [];
  const canSave =
    form.parking &&
    form.vehicleType &&
    form.make.trim() &&
    form.model.trim() &&
    (sell.CDF ?? "").trim() &&
    (cost.CDF ?? "").trim();
  const heading = vehicle ? vehicleName(vehicle) : "";

  return (
    <AdminLayout
      title={isNew ? t("vs.vehicle.new") : heading || t("label.booking.VEHICLE_SALE")}
      description={vehicle?.stockRef ?? t("vs.vehicle.description")}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/vehicle-sales">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="size-4 rtl:-scale-x-100" />
            {t("nav.vehicleSales")}
          </Button>
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canWrite && dirty && !isNew ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {t("inv.restaurant.unsaved")}
            </span>
          ) : null}
          {vehicle ? <StatusBadge value={vehicle.status} /> : null}
          {canWrite ? (
            <Button disabled={!canSave || isPending || videoBusy} onClick={() => save()}>
              {isPending ? t("inv.restaurant.saving") : t("common.save")}
            </Button>
          ) : null}
          {canWrite && vehicle ? (
            <StatusActions
              status={vehicle.status}
              name={heading}
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">{t("vs.parking.title")} *</Label>
              <OptionSelect
                disabled={!canWrite}
                aria-label={t("vs.parking.title")}
                value={form.parking}
                onChange={(v) => {
                  const next = parkings?.items.find((p) => p.id === v);
                  const keep = !next || (next.vehicleTypes ?? []).map(refId).includes(form.vehicleType);
                  setForm((f) => ({ ...f, parking: v, vehicleType: keep ? f.vehicleType : "" }));
                  touch();
                }}
                options={[
                  { value: "", label: t("vs.vehicle.chooseParking") },
                  ...(parkings?.items ?? [])
                    .filter((p) => p.status !== "ARCHIVED" || p.id === form.parking)
                    .map((p) => ({ value: p.id, label: `${lz(p.name)} · ${p.city}` }))
                ]}
              />
              {parking ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("vs.vehicle.town", { city: parking.city })}
                </p>
              ) : null}
            </div>
            <div>
              <Label className="text-xs">{t("vs.vehicle.type")} *</Label>
              <OptionSelect
                disabled={!canWrite}
                aria-label={t("vs.vehicle.type")}
                value={form.vehicleType}
                onChange={(v) => set("vehicleType", v)}
                options={[
                  { value: "", label: t("vs.vehicle.chooseType") },
                  ...typeOptions.map((x) => ({ value: x.id, label: lz(x.name) }))
                ]}
              />
              {parking && !allowed?.length ? (
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                  {t("vs.vehicle.parkingNoTypes")}{" "}
                  <Link href={`/vehicle-sales/parkings/${parking.id}`} className="underline underline-offset-2">
                    {lz(parking.name)}
                  </Link>
                </p>
              ) : null}
            </div>
            <div>
              <Label className="text-xs">{t("vs.vehicle.make")} *</Label>
              <Input disabled={!canWrite} value={form.make} maxLength={60} placeholder="Toyota" onChange={(e) => set("make", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("vs.vehicle.model")} *</Label>
              <Input disabled={!canWrite} value={form.model} maxLength={60} placeholder="Land Cruiser" onChange={(e) => set("model", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("vs.vehicle.year")}</Label>
              <Input disabled={!canWrite} type="number" min={1950} max={2100} value={form.year} onChange={(e) => set("year", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("vs.vehicle.mileage")}</Label>
              <Input disabled={!canWrite} type="number" min={0} value={form.mileageKm} onChange={(e) => set("mileageKm", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("vs.vehicle.condition")}</Label>
              <OptionSelect
                disabled={!canWrite}
                aria-label={t("vs.vehicle.condition")}
                value={form.condition}
                onChange={(v) => set("condition", v)}
                options={[
                  { value: "USED", label: t("vs.condition.USED") },
                  { value: "NEW", label: t("vs.condition.NEW") }
                ]}
              />
            </div>
            <div>
              <Label className="text-xs">{t("vs.vehicle.colour")}</Label>
              <Input disabled={!canWrite} value={form.colour} maxLength={30} onChange={(e) => set("colour", e.target.value)} />
            </div>
          </div>
          <LocalizedInput
            disabled={!canWrite}
            label={t("vs.vehicle.titleLabel")}
            placeholder={[form.make, form.model, form.year].filter(Boolean).join(" ")}
            value={title}
            onChange={(v) => { setTitle(v); touch(); }}
          />
          <p className="-mt-3 text-[11px] text-muted-foreground">{t("vs.vehicle.titleHint")}</p>
          <LocalizedInput
            disabled={!canWrite}
            label={t("inv.restaurant.descriptionLabel")}
            multiline
            rows={4}
            value={description}
            onChange={(v) => { setDescription(v); touch(); }}
          />
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">{t("vs.vehicle.stockRef")}</Label>
                <p className="font-mono text-sm" dir="ltr">
                  {vehicle?.stockRef ?? <span className="font-sans text-muted-foreground">{t("vs.vehicle.stockRefNew")}</span>}
                </p>
              </div>
              <div>
                <Label className="text-xs">{t("vs.vehicle.availability")}</Label>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <AvailabilityBadge value={vehicle?.availability ?? "AVAILABLE"} />
                  {vehicle?.reservedOrder ? (
                    <Link href={`/bookings/${vehicle.reservedOrder}`} className="text-xs underline underline-offset-2">
                      {t("vs.vehicle.openOrder")}
                    </Link>
                  ) : null}
                  {vehicle?.soldAt ? (
                    <span className="text-xs text-muted-foreground">{formatDate(vehicle.soldAt)}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{t("vs.vehicle.availabilityHint")}</p>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">{t("vs.vehicle.vin")}</Label>
                <Input
                  disabled={!canWrite}
                  dir="ltr"
                  className="font-mono uppercase"
                  maxLength={32}
                  value={form.vin}
                  onChange={(e) => set("vin", e.target.value.toUpperCase())}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">{t("vs.vehicle.vinHint")}</p>
              </div>
            </div>
            <MoneyInput
              disabled={!canWrite}
              label={t("inv.restaurant.sellPrice")}
              value={sell}
              onChange={(v) => { setSell(v); touch(); }}
              requireBase
            />
            <MoneyInput
              disabled={!canWrite}
              label={t("inv.restaurant.costPrice")}
              value={cost}
              onChange={(v) => { setCost(v); touch(); }}
              requireBase
              hint={t("inv.restaurant.costHint")}
            />
            <MoneyInput
              disabled={!canWrite}
              label={t("inv.processingFee")}
              hint={t("inv.processingFeeHint")}
              value={processingFee}
              onChange={(v) => { setProcessingFee(v); touch(); }}
            />
            <PromotionFields
              disabled={!canWrite}
              value={promo}
              rows={onePrice(Number(sell.CDF) || 0, t)}
              onChange={(patch) => {
                setPromo((p) => ({ ...p, ...patch, touched: true }));
                touch();
              }}
            />
          </Card>

          <Card className="space-y-4 p-5">
            <ImageUploader
              label={t("inv.restaurant.images")}
              folder="sale-vehicles"
              value={images}
              onChange={(v) => { setImages(v); touch(); }}
              minimum={1}
            />
            <VideoField
              onBusy={setVideoBusy}
              saving={isPending}
              disabled={!canWrite}
              value={videoUrl}
              onChange={(v) => { setVideoUrl(v); touch(); }}
            />
          </Card>
        </div>
      </div>

      <Card className="mt-4 space-y-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">{t("vs.cat.tab.specs")}</h2>
          <Link href="/vehicle-sales/catalogue?tab=specs" className="text-xs text-muted-foreground underline underline-offset-2">
            {t("vs.editList")}
          </Link>
        </div>
        {!shownSpecs.length ? (
          <p className="text-sm text-muted-foreground">{t("vs.vehicle.noSpecs")}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {shownSpecs.map((s) =>
              s.valueType === "CHOICE" ? (
                <div key={s.id}>
                  <Label className="text-xs">{lz(s.name)}</Label>
                  <OptionSelect
                    disabled={!canWrite}
                    aria-label={lz(s.name)}
                    value={specs[s.id]?.choice ?? ""}
                    onChange={(v) => setSpec(s.id, { choice: v || undefined })}
                    options={[
                      { value: "", label: "—" },
                      ...s.choices.map((c) => ({ value: c.key, label: lz(c.label) }))
                    ]}
                  />
                </div>
              ) : s.valueType === "NUMBER" ? (
                <div key={s.id}>
                  <Label className="text-xs">
                    {lz(s.name)}
                    {s.unit ? ` (${s.unit})` : ""}
                  </Label>
                  <Input
                    disabled={!canWrite}
                    type="number"
                    min={0}
                    value={specs[s.id]?.number ?? ""}
                    onChange={(e) => setSpec(s.id, { number: e.target.value })}
                  />
                </div>
              ) : (
                <div key={s.id} className="sm:col-span-2">
                  <LocalizedInput
                    disabled={!canWrite}
                    label={lz(s.name)}
                    value={specs[s.id]?.text ?? {}}
                    onChange={(text) => setSpec(s.id, { text })}
                  />
                </div>
              )
            )}
          </div>
        )}
      </Card>

      <Card className="mt-4 space-y-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">{t("vs.cat.tab.accessories")}</h2>
          <Link href="/vehicle-sales/catalogue?tab=accessories" className="text-xs text-muted-foreground underline underline-offset-2">
            {t("vs.editList")}
          </Link>
        </div>
        {!groups.size ? (
          <p className="text-sm text-muted-foreground">{t("vs.vehicle.noAccessories")}</p>
        ) : (
          [...groups].map(([group, list]) => (
            <div key={group}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {list.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      disabled={!canWrite}
                      checked={accessories.includes(a.id)}
                      onCheckedChange={(v) => {
                        setAccessories((xs) => (v === true ? [...xs, a.id] : xs.filter((x) => x !== a.id)));
                        touch();
                      }}
                    />
                    {lz(a.name)}
                  </label>
                ))}
              </div>
            </div>
          ))
        )}
      </Card>
    </AdminLayout>
  );
}
