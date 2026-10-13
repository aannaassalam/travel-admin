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
import MoneyInput, { formToMoney, moneyToForm } from "@/components/Form/MoneyInput";
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
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Archive, ArrowLeft, Plus, Trash2 } from "lucide-react";
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

const SECTIONS = [
  { value: "STARTER", label: "Starters" },
  { value: "MAIN", label: "Mains" },
  { value: "SIDE", label: "Sides" },
  { value: "DESSERT", label: "Desserts" },
  { value: "DRINK", label: "Drinks" }
];

const emptyZone = (): ZoneForm => ({
  name: "",
  fee: moneyToForm(),
  minOrder: moneyToForm(),
  etaMinutes: "45",
  isActive: true
});

interface ZoneForm {
  id?: string;
  name: string;
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
  const [form, setForm] = useState({
    city: "",
    address: "",
    phone: "",
    cuisines: "",
    openingHours: "",
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
    setForm({
      city: r.city ?? "",
      address: r.address ?? "",
      phone: r.phone ?? "",
      cuisines: (r.cuisines ?? []).join(", "),
      openingHours: r.openingHours ?? "",
      prepTimeMinutes: String(r.prepTimeMinutes ?? 30)
    });
    setZones(
      (r.deliveryZones ?? []).map((z: DeliveryZone) => ({
        id: z.id,
        name: z.name,
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

  const body = () => ({
    name,
    description,
    city: form.city,
    address: form.address,
    phone: form.phone || undefined,
    cuisines: form.cuisines
      ? form.cuisines.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    openingHours: form.openingHours,
    prepTimeMinutes: Number(form.prepTimeMinutes) || 0,
    images,
    // Sent even when blank: "" is what removes a video on the server.
    videoUrl,
    geo,
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
      (e as AxiosError<{ message?: string }>).response?.data?.message ?? "Could not save"
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
            ? "Restaurant created — inactive until you publish it"
            : "Restaurant created — what you typed while it was saving was not included"
          : r.saved
            ? "Saved"
            : "Saved — what you typed since is not saved yet"
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
      toast.success("Restaurant published");
    },
    onError
  });

  const { mutate: deactivate, isPending: deactivating } = useMutation({
    mutationFn: () => deactivateRestaurant(id),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant", id] });
      queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      toast.success("Restaurant deactivated — publish it again whenever you like");
    },
    onError
  });

  const restaurant = data?.restaurant;
  const blockers = restaurant?.publishBlockers ?? [];

  // The list hides "New restaurant" without inventory:write; this covers the URL.
  if (id === "new" && !canWrite) {
    return (
      <AdminLayout title="New restaurant">
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
      <AdminLayout title="Restaurant">
        {isError && !isFetching ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={isNew ? "New restaurant" : name.fr || name.en || "Restaurant"}
      description="A menu is stock. Cost price is required on every dish."
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/inventory?group=RESTAURANT">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="size-4" />
            Restaurants
          </Button>
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* In words: a disabled button cannot show a tooltip. */}
          {canWrite && dirty && !isNew && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Unsaved changes — save them before you publish or deactivate
            </span>
          )}
          {restaurant && (
            <Badge variant="secondary">
              {label(LISTING_STATUS, restaurant.status)}
            </Badge>
          )}
          {canWrite && (
            <Button
              onClick={() => save()}
              disabled={isPending || videoBusy || !name.fr || !form.city}
            >
              {isPending ? "Saving…" : "Save"}
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
              Publish
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
              Deactivate
            </Button>
          )}
          {/* Only for a restaurant that exists. As tall as Save beside it. */}
          {restaurant && (
            <DeleteButton
              permission="inventory:delete"
              label="Delete"
              className="h-9"
              what={`the restaurant “${restaurant.displayName}”`}
              consequence="Its menu goes with it. Orders already placed keep their own details."
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
          <p className="text-sm font-medium">Before this can be published:</p>
          <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">Details</h2>
          <LocalizedInput disabled={!canWrite} label="Name" value={name} onChange={(v) => { setName(v); setDirty(true); }} required />
          <LocalizedInput
            disabled={!canWrite}
            label="Description"
            value={description}
            onChange={(v) => { setDescription(v); setDirty(true); }}
            multiline
            required
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>City *</Label>
              <Input disabled={!canWrite} value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input disabled={!canWrite} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Address</Label>
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
              <Label>Cuisines</Label>
              <Input
                disabled={!canWrite}
                value={form.cuisines}
                onChange={(e) => set("cuisines", e.target.value)}
                placeholder="Congolais, Grillades"
              />
            </div>
            <div>
              <Label>Kitchen time (min)</Label>
              <Input
                disabled={!canWrite}
                type="number"
                min={0}
                value={form.prepTimeMinutes}
                onChange={(e) => set("prepTimeMinutes", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Opening hours</Label>
            <Input
              disabled={!canWrite}
              value={form.openingHours}
              onChange={(e) => set("openingHours", e.target.value)}
              placeholder="Lun–Sam 11h00–22h00"
            />
          </div>
          <ImageUploader
            label="Images"
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
            <h2 className="font-semibold">Delivery zones</h2>
            {canWrite && (
              <Button
                size="sm"
                variant="secondary"
                className="gap-2"
                onClick={() => { setZones((z) => [...z, emptyZone()]); setDirty(true); }}
              >
                <Plus className="size-4" />
                Add zone
              </Button>
            )}
          </div>
          {/* §13: an empty state that says what to do, not just that it is empty.
              Publishing is blocked without a zone, so this is not cosmetic. */}
          {!zones.length && (
            <p className="text-sm text-muted-foreground">
              No zones yet. A restaurant cannot be published until it has one — the fee
              is what checkout adds to the order total.
            </p>
          )}
          {zones.map((z, i) => (
            <div key={z.id ?? i} className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Input
                  disabled={!canWrite}
                  value={z.name}
                  onChange={(e) => setZone(i, { name: e.target.value })}
                  placeholder="Gombe"
                />
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Remove zone"
                    onClick={() => { setZones((zs) => zs.filter((_, n) => n !== i)); setDirty(true); }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              <MoneyInput
                disabled={!canWrite}
                label="Delivery fee"
                value={z.fee}
                onChange={(v) => setZone(i, { fee: v })}
                requireBase
              />
              <MoneyInput
                disabled={!canWrite}
                label="Minimum order (optional)"
                value={z.minOrder}
                onChange={(v) => setZone(i, { minOrder: v })}
                hint="Checked against the food only, not the fee."
              />
              <div className="grid grid-cols-2 items-end gap-3">
                <div>
                  <Label>Travel time (min)</Label>
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
                  Active
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

function MenuEditor({ restaurantId, menu }: { restaurantId: string; menu: MenuItem[] }) {
  const queryClient = useQueryClient();
  // Add, publish, 86 and photos are all inventory:write. Deleting a dish is
  // inventory:delete, which the bin checks for itself.
  const { can } = useCan();
  const canWrite = can("inventory:write");
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId] });

  const onError = (e: unknown) =>
    toast.error(
      (e as AxiosError<{ message?: string }>).response?.data?.message ?? "Could not save"
    );

  const { mutate: add } = useMutation({
    mutationFn: (b: Record<string, unknown>) => createMenuItem(restaurantId, b),
    meta: { showToast: false },
    onSuccess: () => {
      invalidate();
      toast.success("Dish added — publish it to put it on the menu");
    },
    onError
  });

  // Archiving puts a dish away without deleting it, and is part of editing
  // the menu: an account that may edit but not delete still tidies with it.
  const { mutate: archive, isPending: archiving } = useMutation({
    mutationFn: (itemId: string) => archiveMenuItem(restaurantId, itemId),
    meta: { showToast: false },
    onSuccess: () => { invalidate(); toast.success("Dish archived"); },
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
      toast.success(live ? "Dish published — it is on the menu" : "Dish taken off the menu");
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

  const [draft, setDraft] = useState({
    section: "MAIN",
    fr: "",
    en: "",
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
        <h2 className="font-semibold">Menu</h2>
        <span className="text-sm text-muted-foreground">
          {live.filter((m) => m.status === "PUBLISHED").length} published · {live.length} total
        </span>
      </div>

      {/* --- add a dish --- */}
      {canWrite && (
        <div className="grid items-end gap-3 rounded-lg border p-3 lg:grid-cols-[130px_1fr_1fr_auto]">
          <div>
            <Label>Section</Label>
            <Select value={draft.section} onValueChange={(v) => setDraft({ ...draft, section: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Name (FR)</Label>
            <Input
              value={draft.fr}
              onChange={(e) => setDraft({ ...draft, fr: e.target.value })}
              placeholder="Poulet à la moambe"
            />
          </div>
          <div>
            <Label>Name (EN)</Label>
            <Input
              value={draft.en}
              onChange={(e) => setDraft({ ...draft, en: e.target.value })}
              placeholder="Moambe chicken"
            />
          </div>
          <Button
            className="gap-2"
            disabled={!draft.fr.trim() || !draft.sell.USD || !draft.cost.USD}
            onClick={() =>
              add(
                {
                  section: draft.section,
                  name: { fr: draft.fr.trim(), en: draft.en.trim() },
                  sellPrice: formToMoney(draft.sell),
                  costPrice: formToMoney(draft.cost),
                  images: draft.images,
                  sortOrder: live.filter((m) => m.section === draft.section).length
                },
                {
                  onSuccess: () =>
                    setDraft({
                      section: draft.section,
                      fr: "",
                      en: "",
                      sell: moneyToForm(),
                      cost: moneyToForm(),
                      images: []
                    })
                }
              )
            }
          >
            <Plus className="size-4" />
            Add
          </Button>
          <div className="lg:col-span-2">
            <MoneyInput
              label="Sell price"
              value={draft.sell}
              onChange={(v) => setDraft({ ...draft, sell: v })}
              requireBase
            />
          </div>
          <div className="lg:col-span-2">
            <MoneyInput
              label="Cost price"
              value={draft.cost}
              onChange={(v) => setDraft({ ...draft, cost: v })}
              requireBase
              hint="Required — margin reporting has no other source."
            />
          </div>
          <div className="lg:col-span-4">
            <ImageUploader
              label="Photos (optional)"
              folder="menu"
              value={draft.images}
              onChange={(v) => setDraft({ ...draft, images: v })}
            />
          </div>
        </div>
      )}

      {/* --- the menu itself --- */}
      {!live.length ? (
        <p className="text-sm text-muted-foreground">
          No dishes yet. A restaurant cannot be published until at least one is.
        </p>
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
                title={m.images?.length ? undefined : "No photo yet"}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.displayName}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  sell {(m.sellPrice.USD ?? 0) / 100} · cost {(m.costPrice.USD ?? 0) / 100} ·
                  margin {m.marginBase / 100}
                </p>
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
                Available
              </label>

              {canWrite ? (
                <>
                  <Button
                    size="sm"
                    variant={m.status === "PUBLISHED" ? "outline" : "secondary"}
                    disabled={switching}
                    onClick={() =>
                      setLive({ itemId: m.id, live: m.status !== "PUBLISHED" })
                    }
                  >
                    {m.status === "PUBLISHED" ? "Deactivate" : "Publish"}
                  </Button>
                  {/* Amber, as on the inventory list, to tell it from the
                      red bin beside it. */}
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Archive dish"
                    aria-label={`Archive the dish “${m.displayName}”`}
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
                what={`the dish “${m.displayName}”`}
                consequence="Orders already placed keep their own details."
                onDelete={(confirmed) => deleteMenuItem(restaurantId, m.id, confirmed)}
                onDeleted={invalidate}
              />

              {/* Photos are behind a disclosure rather than inline: a menu is
                  twenty rows, and twenty open uploaders is a page nobody can
                  scan. `w-full` breaks it onto its own line inside the flex
                  row so it spans the width when opened. */}
              <details className="w-full">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  Photos ({m.images?.length ?? 0})
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
      {live.length > PAGE_SIZE ? <Pager {...dishes.pager} noun="dish" plural="dishes" /> : null}

      {/* Put away, and off the menu above — listed so that one archived by
          mistake can still be found and deleted for good. */}
      {archived.length ? (
        <details className="rounded-lg border">
          <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
            Archived dishes ({archived.length})
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
                  what={`the dish “${m.displayName}”`}
                  consequence="Orders already placed keep their own details."
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
