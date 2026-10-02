import {
  createHotelFull,
  getHotel,
  publishHotel,
  updateHotel
} from "@/api/functions/admin.api";
import ImageUploader from "@/components/Form/ImageUploader";
import LocationPicker, { type Geo } from "@/components/Form/LocationPicker";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import AdminLayout from "@/components/Layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  const router = useRouter();
  const id = router.query.id as string;
  const isNew = !id || id === "new";
  const queryClient = useQueryClient();
  const [dirty, setDirty] = useState(false);
  // Reading a hotel is inventory:read; create, save and publish are
  // inventory:write. Without it this form is a read-only view.
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
  const [geo, setGeo] = useState<Geo>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["hotel", id],
    queryFn: () => getHotel(id),
    enabled: Boolean(id) && !isNew
  });

  useEffect(() => {
    if (!data?.hotel) return;
    const h = data.hotel as never as Record<string, never>;
    const hotel = data.hotel;
    setName((hotel.name as unknown as Localized) ?? {});
    setDescription((hotel.description as unknown as Localized) ?? {});
    setImages(hotel.images ?? []);
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
    geo,
    policies: form.policies
  });

  const onError = (e: unknown) =>
    toast.error(
      (e as AxiosError<{ message?: string }>).response?.data?.message ??
        "Could not save"
    );

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => (isNew ? createHotelFull(body()) : updateHotel(id, body())),
    meta: { showToast: false },
    onSuccess: (r) => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["hotels"] });
      toast.success(isNew ? "Hotel created as a draft" : "Saved");
      // Straight to the detail screen — room types and pricing are the next step.
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

  // Don't render an empty, editable form while the record is still loading — a
  // save from it would wipe fields that simply hadn't arrived yet.
  if (!isNew && isLoading) {
    return (
      <AdminLayout title="Hotel">
        <p className="text-sm text-muted-foreground">Loading…</p>
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
            <Badge variant="secondary">{data.hotel.status}</Badge>
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
            <Button onClick={() => save()} disabled={isPending || !name.fr || !form.city}>
              {isNew ? "Create hotel" : "Save"}
            </Button>
            {!isNew && data?.hotel.status !== "PUBLISHED" ? (
              <Button variant="outline" disabled={publishing} onClick={() => publish()}>
                Publish
              </Button>
            ) : null}
            {dirty ? (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Unsaved changes
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}
