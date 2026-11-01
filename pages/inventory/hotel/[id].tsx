import {
  createHotelFull,
  deactivateHotel,
  deleteHotel,
  getHotel,
  publishHotel,
  updateHotel
} from "@/api/functions/admin.api";
import DeleteButton from "@/components/DeleteButton";
import ImageUploader from "@/components/Form/ImageUploader";
import LocationPicker, { type Geo } from "@/components/Form/LocationPicker";
import SupplierSelect from "@/components/Form/SupplierSelect";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import TagTranslations from "@/components/Form/TagTranslations";
import VideoField from "@/components/Form/VideoField";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deactivatePrompt,
  label,
  LISTING_STATUS
} from "@/lib/functions/labels.lib";
import { useLeaveGuard, useUnsaved } from "@/hooks/useUnsaved";
import { toLocalized } from "@/lib/functions/localized.lib";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Hotel create / edit (§5.2 level 1 of three: hotel → room type → nightly lot).
 *
 * Room types and nightly pricing live on the hotel *detail* screen, because
 * neither can exist before the hotel does.
 */
export default function HotelFormPage() {
  const { query } = useRouter();
  // A fresh form for each record. Opened over another one — the global search
  // does that — it must not start from that record's fields or its unsaved
  // flag: a failed load would leave them on screen under the new address, one
  // Save away from overwriting it.
  return <HotelForm key={String(query.id ?? "")} />;
}

function HotelForm() {
  const router = useRouter();
  const id = router.query.id as string;
  const isNew = !id || id === "new";
  const queryClient = useQueryClient();
  const { t } = useT();
  const { dirty, setDirty, isDirty, mark } = useUnsaved();
  // Reading a hotel is inventory:read; create, save and publish are
  // inventory:write. Without it this form is a read-only view. Deleting the
  // hotel is inventory:delete, which that button checks for itself.
  const { can } = useCan();
  const canWrite = can("inventory:write");

  const [name, setName] = useState<Localized>({});
  const [description, setDescription] = useState<Localized>({});
  const [policies, setPolicies] = useState<Localized>({});
  const [tags, setTags] = useState<Record<string, Localized>>({});
  const [form, setForm] = useState({
    city: "",
    address: "",
    stars: "3",
    supplier: "",
    checkInTime: "14:00",
    checkOutTime: "11:00",
    amenities: ""
  });
  const [images, setImages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  // A video being sent: the form waits for it (see VideoField's onBusy).
  const [videoBusy, setVideoBusy] = useState(false);
  const [geo, setGeo] = useState<Geo>(null);

  const { data, isError, error, isFetching, isFetchedAfterMount, refetch } =
    useQuery({
      queryKey: ["hotel", id],
      queryFn: () => getHotel(id),
      enabled: Boolean(id) && !isNew,
      // A status changed on another screen must not come back from the cache.
      refetchOnMount: "always",
    });

  // The form opens once THIS visit has read the record — and then stays open.
  // A read that fails leaves `data` holding the copy kept from an earlier
  // visit: a form opened on that looks right and saves the old copy back over
  // whatever has been saved since (a video added a minute ago, say).
  const [opened, setOpened] = useState(false);
  if (!opened && data && isFetchedAfterMount && !isError) setOpened(true);

  useEffect(() => {
    if (!data?.hotel) return;
    // Typed and not yet saved: the form is ahead of the server, not behind it.
    if (isDirty()) return;
    const h = data.hotel as never as Record<string, never>;
    const hotel = data.hotel;
    setName((hotel.name as unknown as Localized) ?? {});
    setDescription((hotel.description as unknown as Localized) ?? {});
    setPolicies(toLocalized(hotel.policies));
    setTags(hotel.tagTranslations ?? {});
    setImages(hotel.images ?? []);
    setVideoUrl(hotel.videoUrl ?? "");
    setGeo(hotel.geo ?? null);
    setForm({
      city: hotel.city,
      address: (h.address as unknown as string) ?? "",
      stars: String(hotel.stars ?? 3),
      supplier: hotel.supplier ?? "",
      checkInTime: (h.checkInTime as unknown as string) ?? "14:00",
      checkOutTime: (h.checkOutTime as unknown as string) ?? "11:00",
      amenities: (hotel.amenities ?? []).join(", ")
    });
  }, [data, isDirty]);

  /**
   * §13: ask before unsaved changes — or a video on its way — are left
   * behind, by closing the tab or by moving on inside the panel.
   */
  const letGo = useLeaveGuard({ dirty, uploading: videoBusy });

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const splitList = (s: string) =>
    s ? s.split(",").map((x) => x.trim()).filter(Boolean) : [];

  const body = () => ({
    name,
    city: form.city,
    address: form.address,
    stars: Number(form.stars) || 0,
    // An id from the Suppliers list; blank clears it.
    supplier: form.supplier,
    checkInTime: form.checkInTime,
    checkOutTime: form.checkOutTime,
    description,
    amenities: splitList(form.amenities),
    images,
    // Sent even when blank: "" is what removes a video on the server.
    videoUrl,
    geo,
    policies,
    tagTranslations: tags
  });

  const onError = (e: unknown) =>
    toast.error(
      (e as AxiosError<{ message?: string }>).response?.data?.message ??
        t("inv.hotelForm.saveFailed")
    );

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      const unchanged = mark();
      const r = await (isNew ? createHotelFull(body()) : updateHotel(id, body()));
      // Asked the moment the answer is back: was anything typed meanwhile?
      return { ...r, saved: unchanged() };
    },
    meta: { showToast: false },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["hotels"] });
      if (!isNew && !r.saved) {
        // Typed while it was saving: stay, so that can be saved as well.
        toast.success(t("inv.hotelForm.savedTypedSince"));
        return;
      }
      setDirty(false);
      toast.success(
        !isNew
          ? t("inv.hotelForm.saved")
          : r.saved
            ? t("inv.hotelForm.created")
            : t("inv.hotelForm.createdTypedSince")
      );
      // Straight to the detail screen — room types and pricing are the next step.
      letGo();
      router.replace(`/inventory/${r.hotel.id}`);
    },
    onError
  });

  const { mutate: publish, isPending: publishing } = useMutation({
    mutationFn: () => publishHotel(id),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel", id] });
      toast.success(t("inv.hotelForm.published"));
    },
    onError
  });

  const { mutate: deactivate, isPending: deactivating } = useMutation({
    mutationFn: () => deactivateHotel(id),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel", id] });
      toast.success(t("inv.hotelForm.deactivated"));
    },
    onError
  });

  // The list hides "New hotel" without inventory:write; this covers the URL.
  if (id === "new" && !canWrite) {
    return (
      <AdminLayout title={t("inv.newHotel")}>
        <p className="text-sm text-muted-foreground">
          {t("inv.hotelForm.cannotAdd")}
        </p>
      </AdminLayout>
    );
  }

  // Not an empty, editable form while the record is on its way — a save from
  // it would wipe fields that simply had not arrived. Not one filled from the
  // cache either: see `opened` above. And when the record does not arrive, an
  // error with a way to try again, never a form that passes for the record.
  if (!isNew && !opened) {
    return (
      <AdminLayout title={t("inv.hotel")}>
        {isError && !isFetching ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        )}
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={isNew ? t("inv.newHotel") : name.fr || name.en || t("inv.hotel")}
      description={t("inv.hotelForm.description")}
    >
      <div className="flex max-w-4xl flex-col gap-5">
        <div className="flex items-center gap-2">
          <Link href="/inventory?group=HOTEL">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="size-4 rtl:-scale-x-100" />
              {t("nav.inventory")}
            </Button>
          </Link>
          {data?.hotel ? (
            <Badge variant="secondary">
              {label(LISTING_STATUS, data.hotel.status)}
            </Badge>
          ) : null}
          {/* Up here, not beside Save: that row is inventory:write and this
              is not. Only for a hotel that exists. */}
          {data?.hotel ? (
            <DeleteButton
              permission="inventory:delete"
              label={t("inv.hotelForm.delete")}
              className="ms-auto"
              what={t("inv.hotelForm.what", { name: data.hotel.displayName })}
              consequence={t("inv.hotelForm.consequence")}
              onDelete={(confirmed) => deleteHotel(id, confirmed)}
              onDeleted={() => {
                queryClient.invalidateQueries({ queryKey: ["hotels"] });
                // Nothing typed here is left to save.
                letGo();
                // The hotel's own page is forgotten too, once this one has
                // been left: kept, it would open again from memory; dropped
                // while still up, it would be read again.
                router
                  .replace("/inventory?group=HOTEL")
                  .then(() => queryClient.removeQueries({ queryKey: ["hotel", id] }));
              }}
            />
          ) : null}
        </div>

        <Card className="gap-0 p-5">
          <h2 className="mb-4 text-sm font-medium">{t("inv.hotelForm.basics")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <LocalizedInput
                disabled={!canWrite}
                label={t("inv.hotelForm.name")}
                required
                value={name}
                placeholder="Hôtel Memling"
                onChange={(v) => {
                  setName(v);
                  setDirty(true);
                }}
              />
            </div>
            <div>
              <Label className="text-xs">{t("inv.hotelForm.city")}</Label>
              <Input
                disabled={!canWrite}
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                placeholder="Kinshasa"
              />
            </div>
            <div>
              <Label className="text-xs">{t("inv.hotelForm.address")}</Label>
              <Input disabled={!canWrite} value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("inv.hotelForm.stars")}</Label>
              <Input
                disabled={!canWrite}
                type="number"
                min={0}
                max={5}
                value={form.stars}
                onChange={(e) => set("stars", e.target.value)}
              />
            </div>
            {/* §18 Q9: per-supplier margin reporting is cheap now, expensive to backfill. */}
            <SupplierSelect
              disabled={!canWrite}
              value={form.supplier}
              onChange={(id) => set("supplier", id)}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{t("inv.hotelForm.checkIn")}</Label>
                <Input disabled={!canWrite} value={form.checkInTime} onChange={(e) => set("checkInTime", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">{t("inv.hotelForm.checkOut")}</Label>
                <Input disabled={!canWrite} value={form.checkOutTime} onChange={(e) => set("checkOutTime", e.target.value)} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <LocationPicker
                disabled={!canWrite}
                city={form.city}
                value={geo}
                onChange={(g) => {
                  setGeo(g);
                  setDirty(true);
                }}
              />
            </div>
          </div>
        </Card>

        <Card className="gap-0 p-5">
          <h2 className="mb-1 text-sm font-medium">{t("inv.hotelForm.media")}</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {t("inv.hotelForm.mediaHint")}
          </p>
          <LocalizedInput
            disabled={!canWrite}
            label={t("inv.hotelForm.descriptionField")}
            required
            multiline
            value={description}
            onChange={(v) => {
              setDescription(v);
              setDirty(true);
            }}
          />
          <div className="mt-4">
            <ImageUploader
              label={t("inv.hotelForm.galleryImages")}
              folder="hotels"
              value={images}
              onChange={(v) => {
                setImages(v);
                setDirty(true);
              }}
            />
          </div>
          <div className="mt-4">
            <VideoField
              onBusy={setVideoBusy}
              saving={isPending}
              disabled={!canWrite}
              value={videoUrl}
              onChange={(v) => {
                setVideoUrl(v);
                setDirty(true);
              }}
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs">{t("inv.hotelForm.amenities")}</Label>
              <Input
                disabled={!canWrite}
                value={form.amenities}
                onChange={(e) => set("amenities", e.target.value)}
                placeholder="WIFI, POOL, RESTAURANT"
              />
            </div>

          </div>
          <TagTranslations
            disabled={!canWrite}
            words={splitList(form.amenities)}
            value={tags}
            onChange={(v) => {
              setTags(v);
              setDirty(true);
            }}
          />
          <div className="mt-4">
            <LocalizedInput
              disabled={!canWrite}
              label={t("inv.hotelForm.policies")}
              multiline
              rows={2}
              value={policies}
              onChange={(v) => {
                setPolicies(v);
                setDirty(true);
              }}
            />
          </div>
        </Card>

        {canWrite ? (
          <div className="flex items-center gap-3">
            <Button
              onClick={() => save()}
              disabled={isPending || videoBusy || !name.fr || !form.city}
            >
              {isNew ? t("inv.hotelForm.create") : t("common.save")}
            </Button>
            {!isNew && data?.hotel.status !== "PUBLISHED" ? (
              <Button
                variant="outline"
                // Publishing what is on screen but not yet saved would put the
                // old version on the website.
                disabled={publishing || dirty}
                onClick={() => publish()}
              >
                {t("common.publish")}
              </Button>
            ) : null}
            {!isNew && data?.hotel.status === "PUBLISHED" ? (
              <Button
                variant="outline"
                disabled={deactivating || dirty}
                onClick={() =>
                  window.confirm(deactivatePrompt(data.hotel.displayName)) &&
                  deactivate()
                }
              >
                {t("inv.hotelForm.deactivate")}
              </Button>
            ) : null}
            {dirty ? (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                {isNew ? t("inv.hotelForm.unsaved") : t("inv.hotelForm.unsavedPublish")}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}
