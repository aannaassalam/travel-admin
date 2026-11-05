import {
  archiveMenuItem,
  createMenuItem,
  createRestaurant,
  deactivateMenuItem,
  deactivateRestaurant,
  deleteMenuItem,
  deleteRestaurant,
  getRestaurant,
  publishMenuItem,
  publishRestaurant,
  updateMenuItem,
  updateRestaurant,
  type DeliveryZone,
  type MenuItem
} from "@/api/functions/admin.api";
import DeleteButton from "@/components/DeleteButton";
import AssetImage from "@/components/Form/AssetImage";
import ImageUploader from "@/components/Form/ImageUploader";
import LocationPicker, { type Geo } from "@/components/Form/LocationPicker";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import TagTranslations from "@/components/Form/TagTranslations";
import MoneyInput, {
  formToMoney,
  moneyToForm,
  stillInDollars
} from "@/components/Form/MoneyInput";
import PromotionFields, {
  onePrice,
  PromoNote,
  promotionBody,
  type PromotionDraft
} from "@/components/Form/PromotionFields";
import VideoField from "@/components/Form/VideoField";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { PAGE_SIZE, usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
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
import { Archive, ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Restaurant editor: details, delivery zones, and the menu, on one screen.
 *
 * The menu lives here rather than behind its own route because a menu is only
 * meaningful next to the restaurant it belongs to — unlike a hotel's rate
 * calendar, which is a grid big enough to earn a page. Adding a dish is the
 * thing this screen exists for, so it is one row and one Save, not a dialog.
 */

const SECTIONS: { value: string; label: TranslationKey }[] = [
  { value: "STARTER", label: "inv.restaurant.section.starter" },
  { value: "MAIN", label: "inv.restaurant.section.main" },
  { value: "SIDE", label: "inv.restaurant.section.side" },
  { value: "DESSERT", label: "inv.restaurant.section.dessert" },
  { value: "DRINK", label: "inv.restaurant.section.drink" }
];

const emptyZone = (): ZoneForm => ({
  name: {},
  fee: moneyToForm(),
  minOrder: moneyToForm(),
  etaMinutes: "45",
  isActive: true
});

interface ZoneForm {
  id?: string;
  name: Localized;
  fee: Record<string, string>;
  minOrder: Record<string, string>;
  etaMinutes: string;
  isActive: boolean;
}

export default function RestaurantFormPage() {
  const { query } = useRouter();
  // A fresh form for each record. Opened over another one — the global search
  // does that — it must not start from that record's fields or its unsaved
  // flag: a failed load would leave them on screen under the new address, one
  // Save away from overwriting it.
  return <RestaurantForm key={String(query.id ?? "")} />;
}

function RestaurantForm() {
  const router = useRouter();
  const id = router.query.id as string;
  const isNew = !id || id === "new";
  const queryClient = useQueryClient();
  const { t } = useT();
  const { dirty, setDirty, isDirty, mark } = useUnsaved();
  // Reading a restaurant and its menu is inventory:read; every change on this
  // screen is inventory:write, bar one. Without it the screen is a read-only
  // view. Deleting — the restaurant, or a dish — is inventory:delete, which
  // those buttons check for themselves.
  const { can } = useCan();
  const canWrite = can("inventory:write");

  const [name, setName] = useState<Localized>({});
  const [description, setDescription] = useState<Localized>({});
  const [images, setImages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  // A video being sent: the form waits for it (see VideoField's onBusy).
  const [videoBusy, setVideoBusy] = useState(false);
  const [geo, setGeo] = useState<Geo>(null);
  const [zones, setZones] = useState<ZoneForm[]>([]);
  const [openingHours, setOpeningHours] = useState<Localized>({});
  const [tags, setTags] = useState<Record<string, Localized>>({});
  // Charged once per order, whatever the dishes (the delivery fee is apart).
  const [processingFee, setProcessingFee] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    city: "",
    address: "",
    phone: "",
    cuisines: "",
    prepTimeMinutes: "30"
  });

  const { data, isError, error, isFetching, isFetchedAfterMount, refetch } =
    useQuery({
      queryKey: ["restaurant", id],
      queryFn: () => getRestaurant(id),
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
    const r = data?.restaurant;
    if (!r) return;
    // Typed and not yet saved: the form is ahead of the server, not behind it.
    if (isDirty()) return;
    setName((r.name as Localized) ?? {});
    setDescription((r.description as Localized) ?? {});
    setImages(r.images ?? []);
    setVideoUrl(r.videoUrl ?? "");
    setGeo(r.geo ?? null);
    setOpeningHours(toLocalized(r.openingHours));
    setTags(r.tagTranslations ?? {});
    setProcessingFee(moneyToForm(r.processingFee));
    setForm({
      city: r.city ?? "",
      address: r.address ?? "",
      phone: r.phone ?? "",
      cuisines: (r.cuisines ?? []).join(", "),
      prepTimeMinutes: String(r.prepTimeMinutes ?? 30)
    });
    setZones(
      (r.deliveryZones ?? []).map((z: DeliveryZone) => ({
        id: z.id,
        name: toLocalized(z.name),
        fee: moneyToForm(z.fee),
        minOrder: moneyToForm(z.minOrder),
        etaMinutes: String(z.etaMinutes ?? 45),
        isActive: z.isActive !== false
      }))
    );
    // The restaurant, not the whole answer: a dish action refetches both, and
    // there is nothing to refill when the restaurant itself has not changed.
  }, [data?.restaurant, isDirty]);

  /**
   * §13: ask before unsaved changes — or a video on its way — are left
   * behind, by closing the tab or by moving on inside the panel.
   */
  const letGo = useLeaveGuard({ dirty, uploading: videoBusy });

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const setZone = (i: number, patch: Partial<ZoneForm>) => {
    setZones((zs) => zs.map((z, n) => (n === i ? { ...z, ...patch } : z)));
    setDirty(true);
  };

  const cuisines = form.cuisines
    ? form.cuisines.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const body = () => ({
    name,
    description,
    city: form.city,
    address: form.address,
    phone: form.phone || undefined,
    cuisines,
    tagTranslations: tags,
    openingHours,
    prepTimeMinutes: Number(form.prepTimeMinutes) || 0,
    images,
    // Sent even when blank: "" is what removes a video on the server.
    videoUrl,
    geo,
    processingFee: formToMoney(processingFee),
    deliveryZones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      fee: formToMoney(z.fee),
      minOrder: formToMoney(z.minOrder),
      etaMinutes: Number(z.etaMinutes) || 45,
      isActive: z.isActive
    }))
  });

  const onError = (e: unknown) =>
    toast.error(
      (e as AxiosError<{ message?: string }>).response?.data?.message ?? t("inv.restaurant.saveFailed")
    );

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      const unchanged = mark();
      const r = await (isNew ? createRestaurant(body()) : updateRestaurant(id, body()));
      // Asked the moment the answer is back: was anything typed meanwhile?
      return { ...r, saved: unchanged() };
    },
    meta: { showToast: false },
    onSuccess: (r) => {
      // Still dirty if typing went on while this was in flight: that text was
      // not sent, and Publish must stay off until it is.
      if (r.saved) setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant", id] });
      toast.success(
        isNew
          ? r.saved
            ? t("inv.restaurant.created")
            : t("inv.restaurant.createdPartial")
          : r.saved
            ? t("inv.restaurant.saved")
            : t("inv.restaurant.savedPartial")
      );
      if (isNew) {
        letGo();
        router.replace(`/inventory/restaurant/${r.restaurant.id}`);
      }
    },
    onError
  });

  const { mutate: publish, isPending: publishing } = useMutation({
    mutationFn: () => publishRestaurant(id),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant", id] });
      queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      toast.success(t("inv.restaurant.published"));
    },
    onError
  });

  const { mutate: deactivate, isPending: deactivating } = useMutation({
    mutationFn: () => deactivateRestaurant(id),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant", id] });
      queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      toast.success(t("inv.restaurant.deactivated"));
    },
    onError
  });

  const restaurant = data?.restaurant;
  const blockers = restaurant?.publishBlockers ?? [];

  // The list hides "New restaurant" without inventory:write; this covers the URL.
  if (id === "new" && !canWrite) {
    return (
      <AdminLayout title={t("inv.restaurant.new")}>
        <p className="text-sm text-muted-foreground">
          {t("inv.restaurant.noWrite")}
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
      <AdminLayout title={t("inv.restaurant.title")}>
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
      title={isNew ? t("inv.restaurant.new") : name.fr || name.en || t("inv.restaurant.title")}
      description={t("inv.restaurant.description")}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/inventory?group=RESTAURANT">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="size-4 rtl:-scale-x-100" />
            {t("inv.restaurant.back")}
          </Button>
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* In words: a disabled button cannot show a tooltip. */}
          {canWrite && dirty && !isNew && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {t("inv.restaurant.unsaved")}
            </span>
          )}
          {restaurant && (
            <Badge variant="secondary">
              {label(LISTING_STATUS, restaurant.status)}
            </Badge>
          )}
          {canWrite && (
            <Button
              onClick={() => {
                // Each zone needs a name and a fee (0 is free delivery): said
                // here, naming the zone and the box, before the server refuses.
                const unnamed = zones.findIndex((x) => !x.name.fr?.trim());
                const unpriced = zones.find((x) => !stillInDollars(x.fee) && !(x.fee.CDF ?? "").trim());
                // Zones are saved whole: a fee or minimum still in dollars
                // cannot ride along untouched, so it is typed in francs first.
                const z = zones.find((x) => stillInDollars(x.fee) || stillInDollars(x.minOrder));
                if (unnamed >= 0) {
                  toast.error(t("inv.restaurant.zoneUnnamed", { n: unnamed + 1 }));
                } else if (unpriced) {
                  toast.error(t("inv.restaurant.zoneUnpriced", { name: lz(unpriced.name) }));
                } else if (z) {
                  toast.error(
                    t("inv.restaurant.zoneDollars", { name: lz(z.name) || t("inv.restaurant.unnamed") })
                  );
                } else save();
              }}
              disabled={isPending || videoBusy || !name.fr || !form.city}
            >
              {isPending ? t("inv.restaurant.saving") : t("common.save")}
            </Button>
          )}
          {canWrite && !isNew && restaurant?.status !== "PUBLISHED" && (
            <Button
              variant="secondary"
              onClick={() => publish()}
              // The server refuses anyway; disabling here explains why without
              // making someone click to find out. Unsaved edits first: the
              // website would get the version that was saved, not this one.
              disabled={blockers.length > 0 || publishing || dirty}
              title={blockers.join("; ") || undefined}
            >
              {t("common.publish")}
            </Button>
          )}
          {canWrite && !isNew && restaurant?.status === "PUBLISHED" && (
            <Button
              variant="outline"
              disabled={deactivating || dirty}
              onClick={() =>
                window.confirm(deactivatePrompt(restaurant.displayName)) &&
                deactivate()
              }
            >
              {t("inv.restaurant.deactivate")}
            </Button>
          )}
          {/* Only for a restaurant that exists. As tall as Save beside it. */}
          {restaurant && (
            <DeleteButton
              permission="inventory:delete"
              label={t("inv.restaurant.delete")}
              className="h-9"
              what={t("inv.restaurant.deleteWhat", { name: restaurant.displayName })}
              consequence={t("inv.restaurant.deleteConsequence")}
              onDelete={(confirmed) => deleteRestaurant(id, confirmed)}
              onDeleted={() => {
                queryClient.invalidateQueries({ queryKey: ["restaurants"] });
                // Nothing typed here is left to save.
                letGo();
                router.replace("/inventory?group=RESTAURANT");
              }}
            />
          )}
        </div>
      </div>

      {!isNew && blockers.length > 0 && (
        <Card className="mb-4 border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30">
          <p className="text-sm font-medium">{t("inv.restaurant.blockers")}</p>
          <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">{t("inv.restaurant.details")}</h2>
          <LocalizedInput disabled={!canWrite} label={t("common.name")} value={name} onChange={(v) => { setName(v); setDirty(true); }} required />
          <LocalizedInput
            disabled={!canWrite}
            label={t("inv.restaurant.descriptionLabel")}
            value={description}
            onChange={(v) => { setDescription(v); setDirty(true); }}
            multiline
            required
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t("common.city")} *</Label>
              <Input disabled={!canWrite} value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div>
              <Label>{t("common.phone")}</Label>
              <Input disabled={!canWrite} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>{t("inv.restaurant.address")}</Label>
            <Input disabled={!canWrite} value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <LocationPicker
            disabled={!canWrite}
            city={form.city}
            value={geo}
            onChange={(g) => { setGeo(g); setDirty(true); }}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t("inv.restaurant.cuisines")}</Label>
              <Input
                disabled={!canWrite}
                value={form.cuisines}
                onChange={(e) => set("cuisines", e.target.value)}
                placeholder={t("inv.restaurant.cuisinesPlaceholder")}
              />
            </div>
            <div>
              <Label>{t("inv.restaurant.kitchenTime")}</Label>
              <Input
                disabled={!canWrite}
                type="number"
                min={0}
                value={form.prepTimeMinutes}
                onChange={(e) => set("prepTimeMinutes", e.target.value)}
              />
            </div>
          </div>
          {/* Under the pair, not in its half: six boxes a word need the width. */}
          <TagTranslations
            disabled={!canWrite}
            words={cuisines}
            value={tags}
            onChange={(v) => { setTags(v); setDirty(true); }}
          />
          <MoneyInput
            disabled={!canWrite}
            label={t("inv.processingFee")}
            hint={t("inv.processingFeeHint")}
            value={processingFee}
            onChange={(v) => { setProcessingFee(v); setDirty(true); }}
          />
          <LocalizedInput
            disabled={!canWrite}
            label={t("inv.restaurant.openingHours")}
            value={openingHours}
            onChange={(v) => { setOpeningHours(v); setDirty(true); }}
            placeholder={t("inv.restaurant.hoursPlaceholder")}
          />
          <ImageUploader
            label={t("inv.restaurant.images")}
            folder="restaurants"
            value={images}
            onChange={(v) => { setImages(v); setDirty(true); }}
            minimum={1}
          />
          <VideoField
            onBusy={setVideoBusy}
            saving={isPending}
            disabled={!canWrite}
            value={videoUrl}
            onChange={(v) => { setVideoUrl(v); setDirty(true); }}
          />
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t("inv.restaurant.zones")}</h2>
            {canWrite && (
              <Button
                size="sm"
                variant="secondary"
                className="gap-2"
                onClick={() => { setZones((z) => [...z, emptyZone()]); setDirty(true); }}
              >
                <Plus className="size-4" />
                {t("inv.restaurant.addZone")}
              </Button>
            )}
          </div>
          {/* §13: an empty state that says what to do, not just that it is empty.
              Publishing is blocked without a zone, so this is not cosmetic. */}
          {!zones.length && (
            <p className="text-sm text-muted-foreground">{t("inv.restaurant.noZones")}</p>
          )}
          {zones.map((z, i) => (
            <div key={z.id ?? i} className="space-y-3 rounded-lg border p-3">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <LocalizedInput
                    disabled={!canWrite}
                    label={t("inv.restaurant.zoneName")}
                    required
                    value={z.name}
                    onChange={(v) => setZone(i, { name: v })}
                    placeholder="Gombe"
                  />
                </div>
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title={t("inv.restaurant.removeZone")}
                    onClick={() => { setZones((zs) => zs.filter((_, n) => n !== i)); setDirty(true); }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              <MoneyInput
                disabled={!canWrite}
                label={t("inv.restaurant.deliveryFee")}
                value={z.fee}
                onChange={(v) => setZone(i, { fee: v })}
                requireBase
              />
              <MoneyInput
                disabled={!canWrite}
                label={t("inv.restaurant.minOrder")}
                value={z.minOrder}
                onChange={(v) => setZone(i, { minOrder: v })}
                hint={t("inv.restaurant.minOrderHint")}
              />
              <div className="grid grid-cols-2 items-end gap-3">
                <div>
                  <Label>{t("inv.restaurant.travelTime")}</Label>
                  <Input
                    disabled={!canWrite}
                    type="number"
                    min={0}
                    value={z.etaMinutes}
                    onChange={(e) => setZone(i, { etaMinutes: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
                    disabled={!canWrite}
                    type="checkbox"
                    checked={z.isActive}
                    onChange={(e) => setZone(i, { isActive: e.target.checked })}
                  />
                  {t("inv.restaurant.active")}
                </label>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* The menu needs a saved restaurant to hang off, so it appears only once
          one exists rather than collecting dishes with nowhere to put them. */}
      {!isNew && <MenuEditor restaurantId={id} menu={data?.menu ?? []} />}
    </AdminLayout>
  );
}

/** A dish as its boxes hold it: the add row and the edit form alike. */
interface DishDraft {
  section: string;
  name: Localized;
  description: Localized;
  sell: Record<string, string>;
  cost: Record<string, string>;
  /** Only in the edit form: a promotion is put on a dish once it exists. */
  promo?: PromotionDraft;
}

/** Section, names, prices and description, on a four-column grid; `action` ends the first row. */
function DishFields({
  draft,
  onChange,
  action
}: {
  draft: DishDraft;
  onChange: (next: DishDraft) => void;
  action: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <>
      <div>
        <Label>{t("inv.restaurant.section")}</Label>
        <Select value={draft.section} onValueChange={(v) => onChange({ ...draft, section: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SECTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {t(s.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="lg:col-span-2">
        <LocalizedInput
          label={t("common.name")}
          required
          value={draft.name}
          onChange={(name) => onChange({ ...draft, name })}
          placeholder="Poulet à la moambe"
        />
      </div>
      {action}
      <div className="lg:col-span-2">
        <MoneyInput
          label={t("inv.restaurant.sellPrice")}
          value={draft.sell}
          onChange={(v) => onChange({ ...draft, sell: v })}
          requireBase
        />
      </div>
      <div className="lg:col-span-2">
        <MoneyInput
          label={t("inv.restaurant.costPrice")}
          value={draft.cost}
          onChange={(v) => onChange({ ...draft, cost: v })}
          requireBase
          hint={t("inv.restaurant.costHint")}
        />
      </div>
      <div className="lg:col-span-4">
        <LocalizedInput
          label={t("inv.restaurant.dishDescription")}
          multiline
          rows={2}
          value={draft.description}
          onChange={(description) => onChange({ ...draft, description })}
        />
      </div>
    </>
  );
}

function MenuEditor({ restaurantId, menu }: { restaurantId: string; menu: MenuItem[] }) {
  const queryClient = useQueryClient();
  const { t, locale } = useT();
  // Add, publish, 86 and photos are all inventory:write. Deleting a dish is
  // inventory:delete, which the bin checks for itself.
  const { can } = useCan();
  const canWrite = can("inventory:write");
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId] });

  const onError = (e: unknown) =>
    toast.error(
      (e as AxiosError<{ message?: string }>).response?.data?.message ?? t("inv.restaurant.saveFailed")
    );

  const { mutate: add } = useMutation({
    mutationFn: (b: Record<string, unknown>) => createMenuItem(restaurantId, b),
    meta: { showToast: false },
    onSuccess: () => {
      invalidate();
      toast.success(t("inv.restaurant.dishAdded"));
    },
    onError
  });

  // Archiving puts a dish away without deleting it, and is part of editing
  // the menu: an account that may edit but not delete still tidies with it.
  const { mutate: archive, isPending: archiving } = useMutation({
    mutationFn: (itemId: string) => archiveMenuItem(restaurantId, itemId),
    meta: { showToast: false },
    onSuccess: () => { invalidate(); toast.success(t("inv.restaurant.dishArchived")); },
    onError
  });

  // A dish's status has its own calls: the server never takes one from an
  // edit, which is why this button used to do nothing at all.
  const { mutate: setLive, isPending: switching } = useMutation({
    mutationFn: ({ itemId, live }: { itemId: string; live: boolean }) =>
      live
        ? publishMenuItem(restaurantId, itemId)
        : deactivateMenuItem(restaurantId, itemId),
    meta: { showToast: false },
    onSuccess: (_r, { live }) => {
      invalidate();
      toast.success(live ? t("inv.restaurant.dishPublished") : t("inv.restaurant.dishOff"));
    },
    onError
  });

  const { mutate: patch } = useMutation({
    mutationFn: ({ itemId, b }: { itemId: string; b: Record<string, unknown> }) =>
      updateMenuItem(restaurantId, itemId, b),
    meta: { showToast: false },
    onSuccess: invalidate,
    onError
  });

  // The dish being edited in place, as it was read: its version guards the save.
  const [editing, setEditing] = useState<{ item: MenuItem; draft: DishDraft } | null>(null);
  const edit = (m: MenuItem) =>
    setEditing({
      item: m,
      draft: {
        section: m.section,
        name: m.name ?? {},
        description: m.description ?? {},
        sell: moneyToForm(m.sellPrice),
        cost: moneyToForm(m.costPrice),
        promo: m.promoCompareAtPrice?.CDF
          ? {
              old: { promoCompareAtPrice: moneyToForm(m.promoCompareAtPrice) },
              ends: m.promoEndsAt?.slice(0, 10) ?? ""
            }
          : { old: {}, ends: "" }
      }
    });
  const { mutate: saveDish, isPending: savingDish } = useMutation({
    mutationFn: ({ item, draft: d }: { item: MenuItem; draft: DishDraft }) =>
      updateMenuItem(restaurantId, item.id, {
        section: d.section,
        name: d.name,
        description: d.description,
        // A blank box ({}) leaves that price as it was.
        sellPrice: formToMoney(d.sell),
        costPrice: formToMoney(d.cost),
        ...(d.promo ? promotionBody(d.promo) : {}),
        version: item.version
      }),
    meta: { showToast: false },
    onSuccess: () => {
      setEditing(null);
      invalidate();
      toast.success(t("inv.restaurant.dishSaved"));
    },
    onError: async (e, { item }) => {
      if ((e as AxiosError).response?.status !== 409) return onError(e);
      // Changed meanwhile (its Available box, say): the new version under
      // what was typed, so saving again is not refused again.
      await invalidate();
      const fresh = queryClient
        .getQueryData<{ menu?: MenuItem[] }>(["restaurant", restaurantId])
        ?.menu?.find((x) => x.id === item.id);
      // Not if another dish's form was opened while this loaded.
      setEditing((ed) =>
        fresh && ed?.item.id === item.id ? { ...ed, item: fresh } : ed
      );
      toast.error(t("inv.restaurant.dishConflict"));
    }
  });

  const [draft, setDraft] = useState({
    section: "MAIN",
    name: {} as Localized,
    description: {} as Localized,
    sell: moneyToForm(),
    cost: moneyToForm(),
    images: [] as string[]
  });

  const live = menu.filter((m) => m.status !== "ARCHIVED");
  const archived = menu.filter((m) => m.status === "ARCHIVED");
  const dishes = usePaged(live);

  return (
    <Card className="mt-4 space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t("inv.restaurant.menu")}</h2>
        <span className="text-sm text-muted-foreground">
          {t("inv.restaurant.menuCount", {
            published: live.filter((m) => m.status === "PUBLISHED").length,
            total: live.length
          })}
        </span>
      </div>

      {/* --- add a dish --- */}
      {canWrite && (
        <div className="grid items-end gap-3 rounded-lg border p-3 lg:grid-cols-[130px_1fr_1fr_auto]">
          <DishFields
            draft={draft}
            onChange={(next) => setDraft((d) => ({ ...d, ...next }))}
            action={
              <Button
                className="gap-2"
                disabled={!draft.name.fr?.trim() || !draft.sell.CDF || !draft.cost.CDF}
                onClick={() =>
                  add(
                    {
                      section: draft.section,
                      name: draft.name,
                      description: draft.description,
                      sellPrice: formToMoney(draft.sell),
                      costPrice: formToMoney(draft.cost),
                      images: draft.images,
                      sortOrder: live.filter((m) => m.section === draft.section).length
                    },
                    {
                      onSuccess: () =>
                        setDraft({
                          section: draft.section,
                          name: {},
                          description: {},
                          sell: moneyToForm(),
                          cost: moneyToForm(),
                          images: []
                        })
                    }
                  )
                }
              >
                <Plus className="size-4" />
                {t("inv.restaurant.add")}
              </Button>
            }
          />
          <div className="lg:col-span-4">
            <ImageUploader
              label={t("inv.restaurant.photosOptional")}
              folder="menu"
              value={draft.images}
              onChange={(v) => setDraft({ ...draft, images: v })}
            />
          </div>
        </div>
      )}

      {/* --- the menu itself --- */}
      {!live.length ? (
        <p className="text-sm text-muted-foreground">{t("inv.restaurant.noDishes")}</p>
      ) : (
        <div className="divide-y rounded-lg border">
          {dishes.rows.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 p-3">
              <Badge variant="outline" className="w-20 justify-center">
                {m.section}
              </Badge>
              {/* First photo as a thumbnail so the list shows at a glance which
                  dishes still have none — the gap is the prompt. */}
              <AssetImage
                src={m.images?.[0]}
                className="size-9 shrink-0"
                title={m.images?.length ? undefined : t("inv.restaurant.noPhoto")}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.displayName}</p>
                {typeof m.sellPrice.USD === "number" ? (
                  // Not reached by the conversion to francs yet: its dollars, as dollars.
                  <p className="text-xs text-amber-700 tabular-nums dark:text-amber-400">
                    {t("inv.restaurant.notConverted", {
                      sell: formatMoney(m.sellPrice.USD, "USD"),
                      cost: formatMoney(m.costPrice.USD, "USD")
                    })}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {t("inv.restaurant.prices", {
                      sell: formatMoney(m.sellPrice.CDF, "CDF", locale),
                      cost: formatMoney(m.costPrice.CDF, "CDF", locale),
                      margin: formatMoney(m.marginBase, "CDF", locale)
                    })}
                  </p>
                )}
                <PromoNote item={m} locale={locale} />
              </div>

              {/* The 86 toggle. Separate from status on purpose: "off today"
                  and "withdrawn from the menu" are different decisions, and
                  collapsing them loses the dish when the kitchen restocks. */}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={m.isAvailable}
                  disabled={!canWrite}
                  onChange={(e) => patch({ itemId: m.id, b: { isAvailable: e.target.checked } })}
                />
                {t("inv.restaurant.available")}
              </label>

              {canWrite ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    title={t("inv.restaurant.editDish")}
                    aria-label={t("inv.restaurant.editDishAria", { name: m.displayName })}
                    onClick={() => edit(m)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={m.status === "PUBLISHED" ? "outline" : "secondary"}
                    disabled={switching}
                    onClick={() =>
                      setLive({ itemId: m.id, live: m.status !== "PUBLISHED" })
                    }
                  >
                    {m.status === "PUBLISHED" ? t("inv.restaurant.deactivate") : t("common.publish")}
                  </Button>
                  {/* Amber, as on the inventory list, to tell it from the
                      red bin beside it. */}
                  <Button
                    variant="ghost"
                    size="icon"
                    title={t("inv.restaurant.archiveDish")}
                    aria-label={t("inv.restaurant.archiveDishAria", { name: m.displayName })}
                    disabled={archiving}
                    onClick={() => archive(m.id)}
                    className="text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                  >
                    <Archive className="size-4" />
                  </Button>
                </>
              ) : (
                // The button's label was the only place a dish's status showed.
                <Badge variant="secondary">{label(LISTING_STATUS, m.status)}</Badge>
              )}
              {/* Its own permission, so outside the choice above. */}
              <DeleteButton
                permission="inventory:delete"
                what={t("inv.restaurant.dishWhat", { name: m.displayName })}
                consequence={t("inv.restaurant.dishConsequence")}
                onDelete={(confirmed) => deleteMenuItem(restaurantId, m.id, confirmed)}
                onDeleted={invalidate}
              />

              {editing?.item.id === m.id ? (
                <div className="grid w-full items-end gap-3 rounded-lg border bg-muted/30 p-3 lg:grid-cols-[130px_1fr_1fr_auto]">
                  <DishFields
                    draft={editing.draft}
                    onChange={(next) => setEditing((ed) => ed && { ...ed, draft: next })}
                    action={
                      <div className="flex gap-2">
                        <Button
                          disabled={!editing.draft.name.fr?.trim() || savingDish}
                          onClick={() => saveDish(editing)}
                        >
                          {savingDish ? t("inv.restaurant.saving") : t("common.save")}
                        </Button>
                        <Button variant="ghost" disabled={savingDish} onClick={() => setEditing(null)}>
                          {t("common.cancel")}
                        </Button>
                      </div>
                    }
                  />
                  {editing.draft.promo ? (
                    <PromotionFields
                      className="mt-1 lg:col-span-4"
                      value={editing.draft.promo}
                      rows={onePrice(Number(editing.draft.sell.CDF) || 0, t)}
                      onChange={(patch) =>
                        setEditing(
                          (ed) =>
                            ed && { ...ed, draft: { ...ed.draft, promo: { ...ed.draft.promo!, ...patch } } }
                        )
                      }
                    />
                  ) : null}
                </div>
              ) : null}

              {/* Photos are behind a disclosure rather than inline: a menu is
                  twenty rows, and twenty open uploaders is a page nobody can
                  scan. `w-full` breaks it onto its own line inside the flex
                  row so it spans the width when opened. */}
              <details className="w-full">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  {t("inv.restaurant.photosCount", { n: m.images?.length ?? 0 })}
                </summary>
                <div className="pt-3">
                  <ImageUploader
                    label=""
                    folder="menu"
                    value={m.images ?? []}
                    // Saved immediately: there is no Save button down here, and
                    // an upload that vanished on navigate would be worse than
                    // one extra request.
                    onChange={(v) => patch({ itemId: m.id, b: { images: v } })}
                  />
                </div>
              </details>
            </div>
          ))}
        </div>
      )}
      {/* A short menu needs no count under it; a long one gets its pages. */}
      {live.length > PAGE_SIZE ? (
        <Pager
          {...dishes.pager}
          noun={t("inv.restaurant.dish.one")}
          plural={t("inv.restaurant.dish.other")}
        />
      ) : null}

      {/* Put away, and off the menu above — listed so that one archived by
          mistake can still be found and deleted for good. */}
      {archived.length ? (
        <details className="rounded-lg border">
          <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
            {t("inv.restaurant.archivedDishes", { n: archived.length })}
          </summary>
          <ul className="divide-y border-t">
            {archived.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 px-3 py-1.5 text-sm text-muted-foreground"
              >
                <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                <DeleteButton
                  permission="inventory:delete"
                  what={t("inv.restaurant.dishWhat", { name: m.displayName })}
                  consequence={t("inv.restaurant.dishConsequence")}
                  onDelete={(confirmed) => deleteMenuItem(restaurantId, m.id, confirmed)}
                  onDeleted={invalidate}
                />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}
