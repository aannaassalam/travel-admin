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
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import VideoField from "@/components/Form/VideoField";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deactivatePrompt,
  label,
  LISTING_STATUS
} from "@/lib/functions/labels.lib";
import { useLeaveGuard, useUnsaved } from "@/hooks/useUnsaved";
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
  const { dirty, setDirty, isDirty, mark } = useUnsaved();
  // Reading a hotel is inventory:read; create, save and publish are
  // inventory:write. Without it this form is a read-only view. Deleting the
  // hotel is inventory:delete, which that button checks for itself.
  const { can } = useCan();
  const canWrite = can("inventory:write");

  const [name, setName] = useState<Localized>({});
  const [description, setDescription] = useState<Localized>({});
  const [form, setForm] = useState({
    city: "",
    address: "",
    stars: "3",
    supplier: "",
    checkInTime: "14:00",
    checkOutTime: "11:00",
    amenities: "",
    policies: ""
  });
  const [images, setImages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  // A video being sent: the form waits for it (see VideoField's onBusy).
  const [videoBusy, setVideoBusy] = useState(false);
  const [geo, setGeo] = useState<Geo>(null);

  const { data, isError, isFetching, isFetchedAfterMount, refetch } =
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
      amenities: ((h.amenities as unknown as string[]) ?? []).join(", "),
      policies: (h.policies as unknown as string) ?? ""
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
    supplier: form.supplier || undefined,
    checkInTime: form.checkInTime,
    checkOutTime: form.checkOutTime,
    description,
    amenities: splitList(form.amenities),
    images,
    // Sent even when blank: "" is what removes a video on the server.
    videoUrl,
    geo,
    policies: form.policies
  });

  const onError = (e: unknown) =>
    toast.error(
      (e as AxiosError<{ message?: string }>).response?.data?.message ??
        "Could not save"
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
        toast.success("Saved — what you typed since is not saved yet");
        return;
      }
      setDirty(false);
      toast.success(
        !isNew
          ? "Saved"
          : r.saved
            ? "Hotel created — inactive until you publish it"
            : "Hotel created — what you typed while it was saving was not included"
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
      toast.success("Hotel published");
    },
    onError
  });

  const { mutate: deactivate, isPending: deactivating } = useMutation({
    mutationFn: () => deactivateHotel(id),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel", id] });
      toast.success("Hotel deactivated — publish it again whenever you like");
    },
    onError
  });

  // The list hides "New hotel" without inventory:write; this covers the URL.
  if (id === "new" && !canWrite) {
    return (
      <AdminLayout title="New hotel">
        <p className="text-sm text-muted-foreground">
          Your role can view inventory but not add to it.
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
      <AdminLayout title="Hotel">
        {isError && !isFetching ? (
          <QueryError onRetry={() => refetch()} />
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={isNew ? "New hotel" : name.fr || name.en || "Hotel"}
      description="Hotel details. Room types and nightly rates come next."
    >
      <div className="flex max-w-4xl flex-col gap-5">
        <div className="flex items-center gap-2">
          <Link href="/inventory?group=HOTEL">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="size-4" />
              Inventory
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
              label="Delete"
              className="ml-auto"
              what={`the hotel “${data.hotel.displayName}”`}
              consequence="Its room types and nightly prices go with it. Bookings already made keep their own details."
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
          <h2 className="mb-4 text-sm font-medium">Basics</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <LocalizedInput
                disabled={!canWrite}
                label="Hotel name"
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
              <Label className="text-xs">City *</Label>
              <Input
                disabled={!canWrite}
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                placeholder="Kinshasa"
              />
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Input disabled={!canWrite} value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Stars</Label>
              <Input
                disabled={!canWrite}
                type="number"
                min={0}
                max={5}
                value={form.stars}
                onChange={(e) => set("stars", e.target.value)}
              />
            </div>
            <div>
              {/* §18 Q9: per-supplier margin reporting is cheap now, expensive to backfill. */}
              <Label className="text-xs">Supplier</Label>
              <Input
                disabled={!canWrite}
                value={form.supplier}
                onChange={(e) => set("supplier", e.target.value)}
                placeholder="Who you bought the rooms from"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Check-in</Label>
                <Input disabled={!canWrite} value={form.checkInTime} onChange={(e) => set("checkInTime", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Check-out</Label>
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
          <h2 className="mb-1 text-sm font-medium">Description &amp; media</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            A French description and at least one image are required before
            publishing.
          </p>
          <LocalizedInput
            disabled={!canWrite}
            label="Description"
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
              label="Gallery images"
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
              <Label className="text-xs">Amenities (comma-separated)</Label>
              <Input
                disabled={!canWrite}
                value={form.amenities}
                onChange={(e) => set("amenities", e.target.value)}
                placeholder="WIFI, POOL, RESTAURANT"
              />
            </div>

          </div>
          <div className="mt-4">
            <Label className="text-xs">Hotel policies</Label>
            <Textarea
              disabled={!canWrite}
              rows={2}
              value={form.policies}
              onChange={(e) => set("policies", e.target.value)}
            />
          </div>
        </Card>

        {canWrite ? (
          <div className="flex items-center gap-3">
            <Button
              onClick={() => save()}
              disabled={isPending || videoBusy || !name.fr || !form.city}
            >
              {isNew ? "Create hotel" : "Save"}
            </Button>
            {!isNew && data?.hotel.status !== "PUBLISHED" ? (
              <Button
                variant="outline"
                // Publishing what is on screen but not yet saved would put the
                // old version on the website.
                disabled={publishing || dirty}
                onClick={() => publish()}
              >
                Publish
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
                Deactivate
              </Button>
            ) : null}
            {dirty ? (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                {isNew ? "Unsaved changes" : "Unsaved changes — save them before you publish or deactivate"}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}
