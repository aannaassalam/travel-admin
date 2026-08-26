import {
  archiveMenuItem,
  createMenuItem,
  createRestaurant,
  getRestaurant,
  publishRestaurant,
  updateMenuItem,
  updateRestaurant,
  type DeliveryZone,
  type MenuItem
} from "@/api/functions/admin.api";
import ImageUploader from "@/components/Form/ImageUploader";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import MoneyInput, { formToMoney, moneyToForm } from "@/components/Form/MoneyInput";
import AdminLayout from "@/components/Layout/AdminLayout";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
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
  const router = useRouter();
  const id = router.query.id as string;
  const isNew = !id || id === "new";
  const queryClient = useQueryClient();
  const [dirty, setDirty] = useState(false);

  const [name, setName] = useState<Localized>({});
  const [description, setDescription] = useState<Localized>({});
  const [images, setImages] = useState<string[]>([]);
  const [zones, setZones] = useState<ZoneForm[]>([]);
  const [form, setForm] = useState({
    city: "",
    address: "",
    phone: "",
    cuisines: "",
    openingHours: "",
    prepTimeMinutes: "30"
  });

  const { data } = useQuery({
    queryKey: ["restaurant", id],
    queryFn: () => getRestaurant(id),
    enabled: Boolean(id) && !isNew
  });

  useEffect(() => {
    const r = data?.restaurant;
    if (!r) return;
    setName((r.name as Localized) ?? {});
    setDescription((r.description as Localized) ?? {});
    setImages(r.images ?? []);
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
  }, [data]);

  /** §13: warn before navigating away from unsaved changes. */
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

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
    mutationFn: async () => (isNew ? createRestaurant(body()) : updateRestaurant(id, body())),
    meta: { showToast: false },
    onSuccess: (r) => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant", id] });
      toast.success(isNew ? "Restaurant created as a draft" : "Saved");
      if (isNew) router.replace(`/inventory/restaurant/${r.restaurant.id}`);
    },
    onError
  });

  const { mutate: publish } = useMutation({
    mutationFn: () => publishRestaurant(id),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant", id] });
      queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      toast.success("Restaurant published");
    },
    onError
  });

  const restaurant = data?.restaurant;
  const blockers = restaurant?.publishBlockers ?? [];

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
        <div className="flex items-center gap-2">
          {restaurant && <Badge variant="secondary">{restaurant.status}</Badge>}
          <Button onClick={() => save()} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
          {!isNew && restaurant?.status !== "PUBLISHED" && (
            <Button
              variant="secondary"
              onClick={() => publish()}
              // The server refuses anyway; disabling here explains why without
              // making someone click to find out.
              disabled={blockers.length > 0}
              title={blockers.join("; ") || undefined}
            >
              Publish
            </Button>
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
          <LocalizedInput label="Name" value={name} onChange={(v) => { setName(v); setDirty(true); }} required />
          <LocalizedInput
            label="Description"
            value={description}
            onChange={(v) => { setDescription(v); setDirty(true); }}
            multiline
            required
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Cuisines</Label>
              <Input
                value={form.cuisines}
                onChange={(e) => set("cuisines", e.target.value)}
                placeholder="Congolais, Grillades"
              />
            </div>
            <div>
              <Label>Kitchen time (min)</Label>
              <Input
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
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Delivery zones</h2>
            <Button
              size="sm"
              variant="secondary"
              className="gap-2"
              onClick={() => { setZones((z) => [...z, emptyZone()]); setDirty(true); }}
            >
              <Plus className="size-4" />
              Add zone
            </Button>
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
                  value={z.name}
                  onChange={(e) => setZone(i, { name: e.target.value })}
                  placeholder="Gombe"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  title="Remove zone"
                  onClick={() => { setZones((zs) => zs.filter((_, n) => n !== i)); setDirty(true); }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <MoneyInput
                label="Delivery fee"
                value={z.fee}
                onChange={(v) => setZone(i, { fee: v })}
                requireBase
              />
              <MoneyInput
                label="Minimum order (optional)"
                value={z.minOrder}
                onChange={(v) => setZone(i, { minOrder: v })}
                hint="Checked against the food only, not the fee."
              />
              <div className="grid grid-cols-2 items-end gap-3">
                <div>
                  <Label>Travel time (min)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={z.etaMinutes}
                    onChange={(e) => setZone(i, { etaMinutes: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
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
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId] });

  const onError = (e: unknown) =>
    toast.error(
      (e as AxiosError<{ message?: string }>).response?.data?.message ?? "Could not save"
    );

  const { mutate: add } = useMutation({
    mutationFn: (b: Record<string, unknown>) => createMenuItem(restaurantId, b),
    meta: { showToast: false },
    onSuccess: () => { invalidate(); toast.success("Dish added as a draft"); },
    onError
  });

  const { mutate: patch } = useMutation({
    mutationFn: ({ itemId, b }: { itemId: string; b: Record<string, unknown> }) =>
      updateMenuItem(restaurantId, itemId, b),
    meta: { showToast: false },
    onSuccess: invalidate,
    onError
  });

  const { mutate: archive } = useMutation({
    mutationFn: (itemId: string) => archiveMenuItem(restaurantId, itemId),
    meta: { showToast: false },
    onSuccess: () => { invalidate(); toast.success("Dish archived"); },
    onError
  });

  const [draft, setDraft] = useState({
    section: "MAIN",
    fr: "",
    en: "",
    sell: moneyToForm(),
    cost: moneyToForm()
  });

  const live = menu.filter((m) => m.status !== "ARCHIVED");

  return (
    <Card className="mt-4 space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Menu</h2>
        <span className="text-sm text-muted-foreground">
          {live.filter((m) => m.status === "PUBLISHED").length} published · {live.length} total
        </span>
      </div>

      {/* --- add a dish --- */}
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
                sortOrder: live.filter((m) => m.section === draft.section).length
              },
              {
                onSuccess: () =>
                  setDraft({ section: draft.section, fr: "", en: "", sell: moneyToForm(), cost: moneyToForm() })
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
      </div>

      {/* --- the menu itself --- */}
      {!live.length ? (
        <p className="text-sm text-muted-foreground">
          No dishes yet. A restaurant cannot be published until at least one is.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {live.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 p-3">
              <Badge variant="outline" className="w-20 justify-center">
                {m.section}
              </Badge>
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
                  onChange={(e) => patch({ itemId: m.id, b: { isAvailable: e.target.checked } })}
                />
                Available
              </label>

              <Button
                size="sm"
                variant={m.status === "PUBLISHED" ? "outline" : "secondary"}
                onClick={() =>
                  patch({
                    itemId: m.id,
                    b: { status: m.status === "PUBLISHED" ? "PAUSED" : "PUBLISHED" }
                  })
                }
              >
                {m.status === "PUBLISHED" ? "Unpublish" : "Publish"}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Archive dish"
                onClick={() => archive(m.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
