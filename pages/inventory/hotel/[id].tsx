import {
  createHotelFull,
  createRoomType,
  deactivateHotel,
  deleteHotel,
  deleteRoomType,
  getHotel,
  publishHotel,
  updateHotel,
  updateRoomType,
  type RoomType
} from "@/api/functions/admin.api";
import DeleteButton from "@/components/DeleteButton";
import ImageUploader from "@/components/Form/ImageUploader";
import LocationPicker, { type Geo } from "@/components/Form/LocationPicker";
import MoneyInput, { formToMoney, moneyToForm } from "@/components/Form/MoneyInput";
import { OptionSelect } from "@/components/Form/OptionSelect";
import PromotionFields, {
  onePrice,
  PromoNote,
  promotionBody,
  type PromotionDraft
} from "@/components/Form/PromotionFields";
import SupplierSelect from "@/components/Form/SupplierSelect";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import TagTranslations from "@/components/Form/TagTranslations";
import VideoField from "@/components/Form/VideoField";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { PAGE_SIZE, usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  deactivatePrompt,
  label,
  LISTING_STATUS
} from "@/lib/functions/labels.lib";
import { useLeaveGuard, useUnsaved } from "@/hooks/useUnsaved";
import { formatMoney } from "@/lib/functions/format.lib";
import { lz, toLocalized } from "@/lib/functions/localized.lib";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * One page per hotel (§5.2: hotel → room type → nightly price), in two tabs:
 * its details, and its room types with their prices. /inventory/[id], where
 * the room types used to be, sends here with ?tab=rooms.
 *
 * A new hotel has the details only: room types cannot exist before it does.
 * Saving it lands on its Rooms tab, the next step.
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
  // Opened on the tab the link asked for. Not written back to the address: a
  // route change would set off the unsaved-changes question.
  const [tab, setTab] = useState(router.query.tab === "rooms" ? "rooms" : "details");

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
  // Charged once per booking, whatever the rooms and nights.
  const [processingFee, setProcessingFee] = useState<Record<string, string>>({});

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
    setProcessingFee(moneyToForm(hotel.processingFee));
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
    tagTranslations: tags,
    processingFee: formToMoney(processingFee)
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
      if (!isNew) {
        toast.success(t("inv.hotelForm.saved"));
        return;
      }
      toast.success(
        r.saved ? t("inv.hotelForm.created") : t("inv.hotelForm.createdTypedSince")
      );
      // Straight to its room types — the next step.
      letGo();
      router.replace(`/inventory/hotel/${r.hotel.id}?tab=rooms`);
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

  const hotel = data?.hotel;

  const details = (
    <>
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
            <MoneyInput
              disabled={!canWrite}
              label={t("inv.processingFee")}
              hint={t("inv.processingFeeHint")}
              value={processingFee}
              onChange={(v) => {
                setProcessingFee(v);
                setDirty(true);
              }}
            />
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
            {dirty ? (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                {isNew ? t("inv.hotelForm.unsaved") : t("inv.hotelForm.unsavedPublish")}
              </span>
            ) : null}
          </div>
        ) : null}
    </>
  );

  return (
    <AdminLayout
      title={isNew ? t("inv.newHotel") : name.fr || name.en || t("inv.hotel")}
      description={
        hotel
          ? `${hotel.city} · ${"★".repeat(hotel.stars)}`
          : t("inv.hotelForm.description")
      }
    >
      <div className="flex max-w-4xl flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/inventory?group=HOTEL">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="size-4 rtl:-scale-x-100" />
              {t("nav.inventory")}
            </Button>
          </Link>
          {/* Up here, on both tabs. Only for a hotel that exists. */}
          {hotel ? (
            <>
              <Badge variant="secondary">{label(LISTING_STATUS, hotel.status)}</Badge>
              <div className="ms-auto flex gap-2">
                {canWrite && hotel.status !== "PUBLISHED" ? (
                  <Button
                    size="sm"
                    // Publishing what is on screen but not yet saved would put
                    // the old version on the website.
                    disabled={publishing || dirty}
                    title={dirty ? t("inv.hotelForm.unsavedPublish") : undefined}
                    onClick={() => publish()}
                  >
                    {t("common.publish")}
                  </Button>
                ) : null}
                {canWrite && hotel.status === "PUBLISHED" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={deactivating || dirty}
                    title={dirty ? t("inv.hotelForm.unsavedPublish") : undefined}
                    onClick={() =>
                      window.confirm(deactivatePrompt(hotel.displayName)) && deactivate()
                    }
                  >
                    {t("inv.hotelForm.deactivate")}
                  </Button>
                ) : null}
                <DeleteButton
                  permission="inventory:delete"
                  label={t("inv.hotelForm.delete")}
                  what={t("inv.hotelForm.what", { name: hotel.displayName })}
                  consequence={t("inv.hotelForm.consequence")}
                  onDelete={(confirmed) => deleteHotel(id, confirmed)}
                  onDeleted={() => {
                    queryClient.invalidateQueries({ queryKey: ["hotels"] });
                    // Nothing typed here is left to save.
                    letGo();
                    // This page is forgotten too, once it has been left: kept,
                    // it would open again from memory; dropped while still up,
                    // it would be read again.
                    router
                      .replace("/inventory?group=HOTEL")
                      .then(() => queryClient.removeQueries({ queryKey: ["hotel", id] }));
                  }}
                />
              </div>
            </>
          ) : null}
        </div>

        {isNew || !data ? (
          details
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="details">
                {t("inv.hotelTabs.details")}
                {dirty ? " •" : ""}
              </TabsTrigger>
              <TabsTrigger value="rooms">
                {t("inv.hotelTabs.rooms")} ({data.roomTypes.length})
              </TabsTrigger>
            </TabsList>
            {/* Both stay mounted: a half-typed form, or an image or video on
                its way, survives a look at the other tab. */}
            <TabsContent
              value="details"
              forceMount
              className="mt-3 flex flex-col gap-5 data-[state=inactive]:hidden"
            >
              {details}
            </TabsContent>
            <TabsContent
              value="rooms"
              forceMount
              className="mt-3 flex flex-col gap-5 data-[state=inactive]:hidden"
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="gap-0 p-4">
                  <p className="text-xs text-muted-foreground">{t("inv.supplier")}</p>
                  <p className="mt-1 font-medium">{data.hotel.supplierName || "—"}</p>
                </Card>
                <Card className="gap-0 p-4">
                  <p className="text-xs text-muted-foreground">{t("inv.roomTypes")}</p>
                  <p className="mt-1 font-medium tabular-nums">{data.roomTypes.length}</p>
                </Card>
                <Card className="gap-0 p-4">
                  <p className="text-xs text-muted-foreground">{t("inv.translations")}</p>
                  <p className="mt-1 font-mono text-sm">
                    {Object.entries(data.hotel.translations).map(([loc, done]) => (
                      <span
                        key={loc}
                        className={done ? "text-emerald-600" : "text-muted-foreground/50"}
                      >
                        {loc.toUpperCase()}
                        {done ? "✓" : "✗"}{" "}
                      </span>
                    ))}
                  </p>
                </Card>
              </div>
              <HotelRooms id={id} roomTypes={data.roomTypes} canWrite={canWrite} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AdminLayout>
  );
}

const BLANK = {
  maxAdults: "2",
  maxChildren: "0",
  amenities: "",
  cost: "",
  sell: "",
  mealPlan: "ROOM_ONLY"
};

const NO_PROMO: PromotionDraft = { old: {}, ends: "" };

const splitRooms = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** A saved promotion as the form holds it: an old price of 0 is none. */
const promoDraft = (r: { promoCompareAtPrice?: { CDF?: number }; promoEndsAt?: string | null }) =>
  r.promoCompareAtPrice?.CDF
    ? {
        old: { promoCompareAtPrice: moneyToForm(r.promoCompareAtPrice) },
        ends: r.promoEndsAt?.slice(0, 10) ?? ""
      }
    : NO_PROMO;

const MEAL_PLANS: Record<string, TranslationKey> = {
  ROOM_ONLY: "inv.rooms.meal.ROOM_ONLY",
  BREAKFAST: "inv.rooms.meal.BREAKFAST",
  HALF_BOARD: "inv.rooms.meal.HALF_BOARD",
  FULL_BOARD: "inv.rooms.meal.FULL_BOARD",
  ALL_INCLUSIVE: "inv.rooms.meal.ALL_INCLUSIVE"
};

/**
 * The Rooms & prices tab: room types, each with one nightly price for every
 * future night. Rooms are not counted: the hotel confirms each booking.
 * Room types are inventory:write; deleting one is inventory:delete, which
 * that button checks for itself.
 */
function HotelRooms({
  id,
  roomTypes,
  canWrite
}: {
  id: string;
  roomTypes: RoomType[];
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const { t, locale } = useT();
  const [roomForm, setRoomForm] = useState(BLANK);
  const [roomName, setRoomName] = useState<Localized>({});
  const [roomBeds, setRoomBeds] = useState<Localized>({});
  const [roomTags, setRoomTags] = useState<Record<string, Localized>>({});
  const [roomPromo, setRoomPromo] = useState<PromotionDraft>(NO_PROMO);
  const [editingRoom, setEditingRoom] = useState<string | null>(null);
  const [showRoomForm, setShowRoomForm] = useState(false);
  const rooms = usePaged(roomTypes);

  const { mutate: saveRoom, isPending: savingRoom } = useMutation({
    mutationFn: () => {
      const body = {
        name: roomName,
        maxAdults: Number(roomForm.maxAdults) || 1,
        maxChildren: Number(roomForm.maxChildren) || 0,
        beds: roomBeds,
        amenities: splitRooms(roomForm.amenities),
        tagTranslations: roomTags,
        // One nightly price for every future night, in whole francs; USD and
        // EUR are worked out from the exchange rates in Settings.
        costPrice: { CDF: Math.round(Number(roomForm.cost)) },
        sellPrice: { CDF: Math.round(Number(roomForm.sell)) },
        mealPlan: roomForm.mealPlan,
        ...promotionBody(roomPromo)
      };
      return editingRoom
        ? updateRoomType(id, editingRoom, body)
        : createRoomType(id, body);
    },
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel", id] });
      setRoomForm(BLANK);
      setRoomName({});
      setRoomBeds({});
      setRoomTags({});
      setRoomPromo(NO_PROMO);
      setEditingRoom(null);
      setShowRoomForm(false);
      toast.success(editingRoom ? t("inv.rooms.updated") : t("inv.rooms.added"));
    },
    onError: (e: unknown) =>
      toast.error(
        (e as AxiosError<{ message?: string }>).response?.data?.message ??
          t("inv.rooms.error")
      )
  });

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-sm font-medium">{t("inv.roomTypes")}</h2>
        {canWrite ? (
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => {
              setRoomForm(BLANK);
              setRoomName({});
              setRoomBeds({});
              setRoomTags({});
              setRoomPromo(NO_PROMO);
              setEditingRoom(null);
              setShowRoomForm((s) => !s);
            }}
          >
            <Plus className="size-3.5" />
            {t("inv.rooms.add")}
          </Button>
        ) : null}
      </div>

      {canWrite && showRoomForm ? (
        <Card className="mb-3 gap-0 p-4">
          <LocalizedInput
            label={t("inv.rooms.name")}
            required
            value={roomName}
            placeholder="Chambre Standard"
            onChange={setRoomName}
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">{t("inv.rooms.maxAdults")}</Label>
              <Input
                type="number"
                value={roomForm.maxAdults}
                onChange={(e) => setRoomForm({ ...roomForm, maxAdults: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">{t("inv.rooms.maxChildren")}</Label>
              <Input
                type="number"
                value={roomForm.maxChildren}
                onChange={(e) => setRoomForm({ ...roomForm, maxChildren: e.target.value })}
              />
            </div>
            <LocalizedInput
              label={t("inv.rooms.beds")}
              value={roomBeds}
              placeholder={t("inv.rooms.bedsPlaceholder")}
              onChange={setRoomBeds}
            />
          </div>
          <div className="mt-3">
            <Label className="text-xs">{t("inv.hotelForm.amenities")}</Label>
            <Input
              value={roomForm.amenities}
              onChange={(e) => setRoomForm({ ...roomForm, amenities: e.target.value })}
              placeholder="Climatisation, Wifi, Télévision"
            />
            <TagTranslations
              words={splitRooms(roomForm.amenities)}
              value={roomTags}
              onChange={setRoomTags}
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">{t("inv.rooms.cost")}</Label>
              <Input
                type="number"
                min={0}
                step="1"
                value={roomForm.cost}
                placeholder={t("inv.rooms.costPlaceholder")}
                onChange={(e) => setRoomForm({ ...roomForm, cost: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">{t("inv.rooms.price")}</Label>
              <Input
                type="number"
                min={0}
                step="1"
                value={roomForm.sell}
                placeholder={t("inv.rooms.pricePlaceholder")}
                onChange={(e) => setRoomForm({ ...roomForm, sell: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">{t("inv.rooms.meals")}</Label>
              <OptionSelect
                aria-label={t("inv.rooms.meals")}
                value={roomForm.mealPlan}
                onChange={(v) => setRoomForm({ ...roomForm, mealPlan: v })}
                options={Object.entries(MEAL_PLANS).map(([value, key]) => ({
                  value,
                  label: t(key)
                }))}
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t("inv.rooms.priceHint")}
          </p>
          <PromotionFields
            className="mt-4"
            value={roomPromo}
            rows={onePrice(Number(roomForm.sell) || 0, t)}
            onChange={(patch) => setRoomPromo((p) => ({ ...p, ...patch }))}
          />
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              disabled={
                !roomName.fr ||
                savingRoom ||
                !(Number(roomForm.sell) > 0) ||
                !(Number(roomForm.cost) > 0)
              }
              onClick={() => saveRoom()}
            >
              {editingRoom ? t("inv.rooms.save") : t("inv.rooms.add")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowRoomForm(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="gap-0 divide-y p-0">
        {!roomTypes.length ? (
          <p className="p-4 text-sm text-muted-foreground">{t("inv.rooms.empty")}</p>
        ) : (
          rooms.rows.map((r) => (
            <div key={r.id} className="flex items-center gap-1 p-4">
              <div className="me-auto">
                <p className="text-sm font-medium">{r.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {t(r.maxAdults === 1 ? "inv.rooms.adults.one" : "inv.rooms.adults.other", {
                    n: r.maxAdults
                  })}
                  {r.maxChildren
                    ? ` · ${t(r.maxChildren === 1 ? "inv.rooms.children.one" : "inv.rooms.children.other", { n: r.maxChildren })}`
                    : ""}
                  {lz(r.beds) ? ` · ${lz(r.beds)}` : ""}
                  {r.mealPlan
                    ? ` · ${MEAL_PLANS[r.mealPlan] ? t(MEAL_PLANS[r.mealPlan]) : r.mealPlan}`
                    : ""}
                </p>
              </div>
              <div className="me-3 text-end text-sm tabular-nums">
                {typeof r.sellPrice?.USD === "number" ? (
                  // Not reached by the conversion to francs yet: its dollars, as dollars.
                  <p className="text-xs text-amber-600">
                    {t("inv.rooms.notConverted", {
                      amount: formatMoney(r.sellPrice.USD, "USD")
                    })}
                  </p>
                ) : r.sellPrice?.CDF ? (
                  <>
                    <p className="font-medium">
                      {t("inv.rooms.perNight", {
                        amount: formatMoney(r.sellPrice.CDF, "CDF", locale)
                      })}
                    </p>
                    <PromoNote item={r} locale={locale} />
                    <p className="text-xs text-muted-foreground">
                      {t("inv.rooms.costMargin", {
                        cost: formatMoney(r.costPrice?.CDF, "CDF", locale),
                        margin: formatMoney(r.margin, "CDF", locale)
                      })}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-amber-600">{t("inv.rooms.noPrice")}</p>
                )}
              </div>
              {canWrite ? (
                <Button
                  variant="ghost"
                  size="icon"
                  title={t("common.edit")}
                  onClick={() => {
                    setRoomName((r.name as unknown as Localized) ?? {});
                    setRoomBeds(toLocalized(r.beds));
                    setRoomTags(r.tagTranslations ?? {});
                    setRoomForm({
                      maxAdults: String(r.maxAdults),
                      maxChildren: String(r.maxChildren),
                      amenities: (r.amenities ?? []).join(", "),
                      cost: moneyToForm(r.costPrice).CDF,
                      sell: moneyToForm(r.sellPrice).CDF,
                      mealPlan: r.mealPlan ?? "ROOM_ONLY"
                    });
                    setRoomPromo(promoDraft(r));
                    setEditingRoom(r.id);
                    setShowRoomForm(true);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
              ) : null}
              <DeleteButton
                permission="inventory:delete"
                what={t("inv.rooms.what", { name: r.displayName })}
                consequence={t("inv.rooms.consequence")}
                onDelete={(confirmed) => deleteRoomType(id, r.id, confirmed)}
                onDeleted={() => {
                  queryClient.invalidateQueries({ queryKey: ["hotel", id] });
                  // The form above may be open on this very room type.
                  if (editingRoom === r.id) setShowRoomForm(false);
                }}
              />
            </div>
          ))
        )}
      </Card>
      {roomTypes.length > PAGE_SIZE ? (
        <div className="mt-3">
          <Pager
            {...rooms.pager}
            noun={t("inv.rooms.pager.one")}
            plural={t("inv.rooms.pager.other")}
          />
        </div>
      ) : null}
    </section>
  );
}
