import {
  createRoomType,
  deactivateHotel,
  deleteHotel,
  deleteRoomType,
  getHotel,
  publishHotel,
  updateRoomType
} from "@/api/functions/admin.api";
import { assetUrl } from "@/api/endpoints";
import DeleteButton from "@/components/DeleteButton";
import AssetImage from "@/components/Form/AssetImage";
import { moneyToForm } from "@/components/Form/MoneyInput";
import PromotionFields, {
  onePrice,
  PromoNote,
  promotionBody,
  type PromotionDraft
} from "@/components/Form/PromotionFields";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import TagTranslations from "@/components/Form/TagTranslations";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { PAGE_SIZE, usePaged } from "@/components/Pager";
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
import { useState } from "react";
import { toast } from "sonner";

const BLANK = {
  maxAdults: "2",
  maxChildren: "0",
  amenities: "",
  cost: "",
  sell: "",
  mealPlan: "ROOM_ONLY"
};

const NO_PROMO: PromotionDraft = { old: {}, ends: "" };

const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

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

export default function HotelDetailPage() {
  const router = useRouter();
  const id = router.query.id as string;
  const queryClient = useQueryClient();
  const { t, locale } = useT();
  const [roomForm, setRoomForm] = useState(BLANK);
  const [roomName, setRoomName] = useState<Localized>({});
  const [roomBeds, setRoomBeds] = useState<Localized>({});
  const [roomTags, setRoomTags] = useState<Record<string, Localized>>({});
  const [roomPromo, setRoomPromo] = useState<PromotionDraft>(NO_PROMO);
  const [editingRoom, setEditingRoom] = useState<string | null>(null);
  const [showRoomForm, setShowRoomForm] = useState(false);
  // Publishing and room types are inventory:write; the rest is inventory:read.
  // Deleting — the hotel, or a room type — is inventory:delete, which those
  // buttons check for themselves.
  const { can } = useCan();
  const canWrite = can("inventory:write");

  const { data, isLoading } = useQuery({
    queryKey: ["hotel", id],
    queryFn: () => getHotel(id),
    enabled: Boolean(id),
    // A status changed on another screen must not come back from the cache.
    refetchOnMount: "always",
  });
  const rooms = usePaged(data?.roomTypes ?? []);

  const onError = (e: unknown) =>
    toast.error(
      (e as AxiosError<{ message?: string }>).response?.data?.message ??
        t("inv.rooms.error")
    );

  const { mutate: publish, isPending } = useMutation({
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

  const { mutate: saveRoom, isPending: savingRoom } = useMutation({
    mutationFn: () => {
      const body = {
        name: roomName,
        maxAdults: Number(roomForm.maxAdults) || 1,
        maxChildren: Number(roomForm.maxChildren) || 0,
        beds: roomBeds,
        amenities: splitList(roomForm.amenities),
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
    onError
  });

  const hotel = data?.hotel;

  return (
    <AdminLayout
      title={hotel?.displayName ?? t("inv.hotel")}
      description={hotel ? `${hotel.city} · ${"★".repeat(hotel.stars)}` : undefined}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/inventory?group=HOTEL">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="size-4 rtl:-scale-x-100" />
              {t("nav.inventory")}
            </Button>
          </Link>
          {hotel ? (
            <>
              <Badge variant="secondary">{label(LISTING_STATUS, hotel.status)}</Badge>
              <div className="ms-auto flex gap-2">
                {/* The form behind this link holds fields this screen does not
                    show, so it stays for everyone; it opens read-only. */}
                <Link href={`/inventory/hotel/${id}`}>
                  <Button variant="outline" size="sm" className="gap-2">
                    {canWrite ? <Pencil className="size-3.5" /> : null}
                    {canWrite ? t("inv.rooms.editDetails") : t("inv.rooms.viewDetails")}
                  </Button>
                </Link>
                {canWrite && hotel.status !== "PUBLISHED" ? (
                  <Button size="sm" onClick={() => publish()} disabled={isPending}>
                    {t("common.publish")}
                  </Button>
                ) : null}
                {canWrite && hotel.status === "PUBLISHED" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={deactivating}
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
                  consequence={t("inv.rooms.hotelConsequence")}
                  onDelete={(confirmed) => deleteHotel(id, confirmed)}
                  onDeleted={() => {
                    queryClient.invalidateQueries({ queryKey: ["hotels"] });
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

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !hotel ? (
          <p className="text-sm text-muted-foreground">{t("inv.rooms.notFound")}</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="gap-0 p-4">
                <p className="text-xs text-muted-foreground">{t("inv.supplier")}</p>
                <p className="mt-1 font-medium">{hotel.supplierName || "—"}</p>
              </Card>
              <Card className="gap-0 p-4">
                <p className="text-xs text-muted-foreground">{t("inv.roomTypes")}</p>
                <p className="mt-1 font-medium tabular-nums">
                  {data.roomTypes.length}
                </p>
              </Card>
              <Card className="gap-0 p-4">
                <p className="text-xs text-muted-foreground">{t("inv.translations")}</p>
                <p className="mt-1 font-mono text-sm">
                  {Object.entries(hotel.translations).map(([loc, done]) => (
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

            {/* Gallery. Saving the form lands here, so the images have to be
                visible on this screen — otherwise a successful upload reads as
                a lost one. */}
            <section>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-sm font-medium">{t("inv.rooms.gallery")}</h2>
                <span className="text-xs text-muted-foreground">
                  {t(
                    (hotel.images?.length ?? 0) === 1 ? "inv.rooms.images.one" : "inv.rooms.images.other",
                    { n: hotel.images?.length ?? 0 }
                  )}
                </span>
                {canWrite ? (
                  <Link href={`/inventory/hotel/${id}`} className="ms-auto">
                    <Button variant="ghost" size="sm" className="gap-2">
                      <Pencil className="size-3.5" />
                      {t("inv.rooms.manageImages")}
                    </Button>
                  </Link>
                ) : null}
              </div>
              {hotel.images?.length ? (
                <div className="flex flex-wrap gap-2">
                  {hotel.images.map((src) => (
                    <AssetImage key={src} src={src} className="size-28" />
                  ))}
                </div>
              ) : (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  {t("inv.rooms.noImages")}
                </Card>
              )}
              {/* For the same reason as the images: a video just saved in the
                  form has to be somewhere on the screen that save lands on. */}
              {hotel.videoUrl ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {t("inv.rooms.video")}{" "}
                  <a
                    href={assetUrl(hotel.videoUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    {t("inv.rooms.playVideo")}
                  </a>
                </p>
              ) : null}
            </section>

            {/* Room types, each with one nightly price for every future night.
                Rooms are not counted: the hotel confirms each booking. */}
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
                      words={splitList(roomForm.amenities)}
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
                      <select
                        aria-label={t("inv.rooms.meals")}
                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                        value={roomForm.mealPlan}
                        onChange={(e) => setRoomForm({ ...roomForm, mealPlan: e.target.value })}
                      >
                        {Object.entries(MEAL_PLANS).map(([value, key]) => (
                          <option key={value} value={value}>
                            {t(key)}
                          </option>
                        ))}
                      </select>
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
                {!data.roomTypes.length ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    {t("inv.rooms.empty")}
                  </p>
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
              {data.roomTypes.length > PAGE_SIZE ? (
                <div className="mt-3">
                  <Pager
                    {...rooms.pager}
                    noun={t("inv.rooms.pager.one")}
                    plural={t("inv.rooms.pager.other")}
                  />
                </div>
              ) : null}
            </section>

          </>
        )}
      </div>
    </AdminLayout>
  );
}
