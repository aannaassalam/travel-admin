import {
  createListing,
  deactivateListing,
  getListing,
  publishListing,
  updateListing,
  listLocations
} from "@/api/functions/admin.api";
import ImageUploader from "@/components/Form/ImageUploader";
import LocationPicker, { type Geo } from "@/components/Form/LocationPicker";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import MoneyInput, {
  formToMoney,
  moneyToForm
} from "@/components/Form/MoneyInput";
import AdminLayout from "@/components/Layout/AdminLayout";
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
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Create / edit for the five non-hotel verticals (§5.2).
 *
 * One form, driven by `vertical` — the universal §5.1 fields are shared and
 * only the per-vertical block changes. Five separate forms would be five places
 * to fix every universal rule.
 */

type Attrs = Record<string, unknown>;
type Segment = Record<string, string | undefined>;

/**
 * A stored attribute as its input shows it, and the input's text as it is
 * stored again. The API returns full ISO instants, which a date box cannot
 * display — left as they came, a saved departure showed as an empty field.
 */
const shown = (type: string, value: unknown) => {
  if (value === undefined || value === null) return "";
  if (type === "datetime-local") return String(value).slice(0, 16);
  if (type === "date") return String(value).slice(0, 10);
  // Minor units on the record, like every other amount; dollars in the box.
  // A number, not text: React leaves a half-typed "12." alone that way.
  if (type === "money") return Number(value) / 100;
  return typeof value === "number" ? value : String(value);
};
const stored = (type: string, raw: string) => {
  // Blank is "not set", not "" — which the fixed-choice fields would refuse.
  if (raw === "") return undefined;
  // Kept exactly as typed, the same as a time in an imported spreadsheet. Only
  // a whole one: cut to length, a five-digit year became a date nothing could
  // read, in a box the browser had already emptied.
  if (type === "datetime-local") {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)
      ? `${raw.slice(0, 16)}:00.000Z`
      : undefined;
  }
  if (type === "money") return Math.round(Number(raw) * 100);
  return type === "number" ? Number(raw) : raw;
};
/** Stops the year at four digits, so typing straight through lands in the time. */
const latest = (type: string) =>
  type === "datetime-local"
    ? "9999-12-31T23:59"
    : type === "date"
      ? "9999-12-31"
      : undefined;

const VERTICAL_LABELS: Record<string, string> = {
  FLIGHT: "Flight offer",
  BUS: "Bus service",
  CAR: "Car rental",
  ACTIVITY: "Activity / tour",
  PROPERTY: "Property"
};

export default function ListingFormPage() {
  const router = useRouter();
  const id = router.query.id as string;
  // `/inventory/listing/new` routes here with id="new". Guard undefined too,
  // so the page never tries to fetch a listing that has no id.
  const isNew = !id || id === "new";
  const vertical =
    (router.query.vertical as string) || "FLIGHT";
  const queryClient = useQueryClient();
  const [dirty, setDirty] = useState(false);
  // The listing and the location list are inventory:read; create, save and
  // publish are inventory:write. Without it this form is a read-only view.
  const { can } = useCan();
  const canWrite = can("inventory:write");

  const [title, setTitle] = useState<Localized>({});
  const [description, setDescription] = useState<Localized>({});
  const [costPrice, setCostPrice] = useState<Record<string, string>>({});
  const [sellPrice, setSellPrice] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    vertical,
    city: "",
    supplier: "",
    quantityTotal: "",
    validFrom: ""
  });
  const [images, setImages] = useState<string[]>([]);
  const [geo, setGeo] = useState<Geo>(null);
  const [attrs, setAttrs] = useState<Attrs>({});

  const { data, isLoading, isFetchedAfterMount } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => getListing(id),
    enabled: Boolean(id) && !isNew,
    // A status changed on another screen must not come back from the cache.
    refetchOnMount: "always"
  });

  /** The serviced list — the only cities this listing may be saved against. */
  const { data: locationOptions } = useQuery({
    queryKey: ["locations"],
    queryFn: listLocations,
    staleTime: 5 * 60 * 1000
  });

  useEffect(() => {
    if (!data?.listing) return;
    const l = data.listing;
    setTitle((l.title as unknown as Localized) ?? {});
    setDescription(
      ((l as unknown as { description: Localized }).description) ?? {}
    );
    setCostPrice(moneyToForm(l.costPrice));
    setSellPrice(moneyToForm(l.sellPrice));
    setForm({
      vertical: l.vertical,
      city: l.city,
      supplier: l.supplier ?? "",
      quantityTotal: String(l.quantityTotal ?? ""),
      validFrom: l.validFrom?.slice(0, 10) ?? ""
    });
    setImages(l.images ?? []);
    setGeo(l.geo ?? null);
    setAttrs(l.attributes ?? {});
    // The form now shows the saved copy, so nothing on it is unsaved — also
    // when this is another record opened over the last one.
    setDirty(false);
  }, [data]);

  /** §13 Forgiveness: warn before navigating away from unsaved changes. */
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const v = form.vertical;
  const isProperty = v === "PROPERTY";

  const body = () => ({
    vertical: v,
    title,
    city: form.city,
    description,
    supplier: form.supplier || undefined,
    // Per-currency, exactly as typed. Minor units on the wire.
    costPrice: formToMoney(costPrice),
    sellPrice: formToMoney(sellPrice),
    quantityTotal: Number(form.quantityTotal) || 0,
    validFrom: form.validFrom || undefined,
    // Retired field: a record from before may still carry a date the panel can
    // no longer show, so a save clears it rather than leaving it to expire.
    validUntil: null,
    images,
    geo,
    attributes: attrs
  });

  const onError = (e: unknown) => {
    const err = e as AxiosError<{ message?: string }>;
    if (err.response?.status === 409) {
      // §5.1 price-change guard.
      if (window.confirm(`${err.response.data?.message}\n\nProceed anyway?`)) {
        updateListing(id, { ...body(), confirmPriceChange: true }).then(() => {
          setDirty(false);
          queryClient.invalidateQueries({ queryKey: ["listing", id] });
          toast.success("Saved");
        });
      }
      return;
    }
    toast.error(err.response?.data?.message ?? "Could not save");
  };

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () =>
      isNew ? createListing(body()) : updateListing(id, body()),
    meta: { showToast: false },
    onSuccess: (r) => {
      setDirty(false);
      toast.success(isNew ? "Created — inactive until you publish it" : "Saved");
      if (isNew) router.replace(`/inventory/listing/${r.listing.id}`);
      else queryClient.invalidateQueries({ queryKey: ["listing", id] });
    },
    onError
  });

  /**
   * Publish and deactivate fail with a sentence to show. `onError` above reads
   * a 409 as the price guard and would offer to save the form instead.
   */
  const refused = (fallback: string) => (e: unknown) =>
    toast.error(
      (e as AxiosError<{ message?: string }>).response?.data?.message ?? fallback
    );

  const { mutate: publish, isPending: publishing } = useMutation({
    mutationFn: () => publishListing(id),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listing", id] });
      toast.success("Published");
    },
    onError: refused("Could not publish")
  });

  const { mutate: deactivate, isPending: deactivating } = useMutation({
    mutationFn: () => deactivateListing(id),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listing", id] });
      toast.success("Deactivated — publish it again whenever you like");
    },
    onError: refused("Could not deactivate")
  });

  const set = (k: keyof typeof form, val: string) => {
    setForm((f) => ({ ...f, [k]: val }));
    setDirty(true);
  };
  const setAttr = (k: string, val: unknown) => {
    setAttrs((a) => ({ ...a, [k]: val }));
    setDirty(true);
  };

  const attrField = (key: string, label: string, type = "text") => (
    <div key={key}>
      <Label className="text-xs">{label}</Label>
      <Input
        disabled={!canWrite}
        type={type === "money" ? "number" : type}
        min={type === "money" ? 0 : undefined}
        max={latest(type)}
        step={type === "money" ? "0.01" : undefined}
        value={shown(type, attrs[key])}
        onChange={(e) => setAttr(key, stored(type, e.target.value))}
      />
    </div>
  );

  /**
   * The flights themselves. The first one's times are copied onto the listing:
   * that pair is what the catalogue sorts by, and what takes the offer off sale
   * once the flight has left.
   */
  const segments = (attrs.segments as Segment[] | undefined) ?? [];
  const setSegments = (next: Segment[], tripType = attrs.tripType) => {
    setAttrs((a) => ({
      ...a,
      segments: next,
      tripType: tripType ?? "ONE_WAY",
      departsAt: next[0]?.departsAt,
      arrivesAt: next[0]?.arrivesAt
    }));
    setDirty(true);
  };
  const isAirport = (key: string) => key === "origin" || key === "destination";
  const segField = (i: number, key: string, label: string, type = "text") => (
    <div key={key}>
      <Label className="text-xs">{label}</Label>
      <Input
        disabled={!canWrite}
        type={type}
        max={latest(type)}
        maxLength={isAirport(key) ? 3 : undefined}
        placeholder={isAirport(key) ? "FIH" : undefined}
        value={shown(type, segments[i]?.[key])}
        onChange={(e) => {
          const val = stored(type, e.target.value) as string | undefined;
          setSegments(
            // A new flight has no segment yet; the first keystroke makes one.
            (segments.length ? segments : [{}]).map((seg, n) =>
              n === i
                ? { ...seg, [key]: isAirport(key) ? val?.toUpperCase() : val }
                : seg
            )
          );
        }}
      />
    </div>
  );

  // The list hides "New …" without inventory:write; this covers the URL.
  if (id === "new" && !canWrite) {
    return (
      <AdminLayout title={`New ${VERTICAL_LABELS[v]}`}>
        <p className="text-sm text-muted-foreground">
          Your role can view inventory but not add to it.
        </p>
      </AdminLayout>
    );
  }

  // Don't render an empty, editable form while the record is still loading — a
  // save from it would wipe fields that simply hadn't arrived yet. Nor one
  // filled from the cache: the fresh copy would land a moment later and
  // replace whatever had been typed into it.
  if (!isNew && (isLoading || !isFetchedAfterMount)) {
    return (
      <AdminLayout title="Listing">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={isNew ? `New ${VERTICAL_LABELS[v]}` : title.fr || title.en || "Listing"}
      description={VERTICAL_LABELS[v]}
    >
      <div className="flex max-w-4xl flex-col gap-5">
        <div className="flex items-center gap-2">
          <Link href={`/inventory?group=${v}`}>
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </Link>
          {data?.listing ? (
            <Badge variant="secondary">
              {label(LISTING_STATUS, data.listing.status)}
            </Badge>
          ) : null}
        </div>

        {/* §5.1: validate before publish — show exactly what blocks it. */}
        {data?.publishBlockers?.length ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-900 dark:text-amber-300">
              <p className="font-medium">Cannot publish yet:</p>
              <ul className="mt-1 list-inside list-disc">
                {data.publishBlockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <Card className="gap-0 p-5">
          <h2 className="mb-4 text-sm font-medium">Basics</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <LocalizedInput
                disabled={!canWrite}
                label="Title"
                required
                value={title}
                onChange={(v) => {
                  setTitle(v);
                  setDirty(true);
                }}
              />
            </div>
            <div>
              <Label className="text-xs">City *</Label>
              <>
                {/* A select, not free text. `city` used to be typed by hand, so
                    one mistake invented a permanent new city in the public
                    filter facets — and the server now refuses anything not on
                    the serviced list, so offering a text box would only produce
                    a save that fails. */}
                <select
                  disabled={!canWrite}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                  value={form.city ?? ""}
                  onChange={(e) => set("city", e.target.value)}
                >
                  <option value="">Select a location…</option>
                  {(locationOptions?.items ?? [])
                    .filter((l) => l.isActive)
                    .map((l) => (
                      <option key={l.id} value={l.name}>
                        {l.name}
                        {l.province ? ` · ${l.province}` : ""}
                      </option>
                    ))}
                </select>
                {form.city &&
                  !(locationOptions?.items ?? []).some(
                    (l) => l.isActive && l.name === form.city
                  ) && (
                    <p className="mt-1 text-xs text-amber-600">
                      &ldquo;{form.city}&rdquo; is not a live location. Add or
                      re-activate it under Locations before saving.
                    </p>
                  )}
              </>
            </div>
            <div>
              <Label className="text-xs">Supplier</Label>
              <Input
                disabled={!canWrite}
                value={form.supplier}
                onChange={(e) => set("supplier", e.target.value)}
                placeholder="Who you bought this from"
              />
            </div>
            {/* Only a property stands somewhere. A flight, bus, car or
                activity has no address to pin, so the picker is not offered. */}
            {v === "PROPERTY" ? (
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
            ) : null}
          </div>
          <div className="mt-4">
            <ImageUploader
              label="Gallery images"
              folder={v.toLowerCase()}
              value={images}
              minimum={isProperty ? 3 : 1}
              onChange={(vals) => {
                setImages(vals);
                setDirty(true);
              }}
            />
          </div>
          <div className="mt-4">
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
          </div>
        </Card>

        <Card className="gap-0 p-5">
          <h2 className="mb-1 text-sm font-medium">
            {isProperty ? "Price" : "Price & availability"}
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {isProperty
              ? "Properties carry no quantity and no checkout."
              : "Enter each currency you sell in. Blank means not offered in that currency."}
          </p>
          <div className="flex flex-col gap-4">
            {!isProperty ? (
              <MoneyInput
                disabled={!canWrite}
                label="Cost price — what you paid"
                requireBase
                value={costPrice}
                hint="Never shown to customers. USD is required — margin reporting depends on it."
                onChange={(v) => {
                  setCostPrice(v);
                  setDirty(true);
                }}
              />
            ) : null}
            <MoneyInput
              disabled={!canWrite}
              label="Sell price — what the customer pays"
              requireBase
              value={sellPrice}
              onChange={(v) => {
                setSellPrice(v);
                setDirty(true);
              }}
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {!isProperty ? (
              <div>
                <Label className="text-xs">Quantity *</Label>
                <Input
                  disabled={!canWrite}
                  type="number"
                  value={form.quantityTotal}
                  onChange={(e) => set("quantityTotal", e.target.value)}
                />
              </div>
            ) : null}
            <div>
              <Label className="text-xs">Valid from</Label>
              <Input
                disabled={!canWrite}
                type="date"
                max="9999-12-31"
                value={form.validFrom}
                onChange={(e) => set("validFrom", e.target.value)}
              />
            </div>
          </div>
        </Card>

        <Card className="gap-0 p-5">
          <h2 className="mb-4 text-sm font-medium">{VERTICAL_LABELS[v]} details</h2>
          {v === "FLIGHT" ? (
            <div className="mb-5 flex flex-col gap-4">
              {(segments.length ? segments : [{}]).map((_seg, i) => (
                <div key={i}>
                  <div className="mb-2 flex h-7 items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">
                      {i === 0
                        ? "Outbound flight"
                        : i === 1 && attrs.tripType === "RETURN"
                          ? "Return flight"
                          : `Flight ${i + 1}`}
                    </p>
                    {i > 0 && canWrite ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setSegments(
                            segments.filter((_s, n) => n !== i),
                            segments.length === 2 ? "ONE_WAY" : attrs.tripType
                          )
                        }
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {segField(i, "carrier", "Airline *")}
                    {segField(i, "flightNumber", "Flight number")}
                    {segField(i, "origin", "From (airport code) *")}
                    {segField(i, "destination", "To (airport code) *")}
                    {segField(i, "departsAt", "Departs *", "datetime-local")}
                    {segField(i, "arrivesAt", "Arrives *", "datetime-local")}
                  </div>
                </div>
              ))}
              {canWrite && segments.length === 1 ? (
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSegments(
                        [
                          ...segments,
                          // The way back is the way out, reversed.
                          {
                            carrier: segments[0].carrier,
                            origin: segments[0].destination,
                            destination: segments[0].origin
                          }
                        ],
                        "RETURN"
                      )
                    }
                  >
                    Add a return flight
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {v === "FLIGHT" &&
              [
                attrField("cabin", "Cabin"),
                attrField("baggage", "Baggage"),
                attrField("bookingDeadline", "Booking deadline", "date"),
                attrField("fareRules", "Fare rules")
              ]}
            {v === "BUS" &&
              [
                attrField("operator", "Operator *"),
                attrField("vehicleClass", "Vehicle class"),
                attrField("departsAt", "Departs", "datetime-local"),
                attrField("arrivesAt", "Arrives", "datetime-local")
              ]}
            {v === "CAR" &&
              [
                attrField("make", "Make *"),
                attrField("model", "Model"),
                attrField("year", "Year", "number"),
                attrField("transmission", "Transmission"),
                attrField("deposit", "Deposit (USD)", "money"),
                attrField("mileageLimit", "Mileage limit")
              ]}
            {v === "ACTIVITY" &&
              [
                attrField("durationMinutes", "Duration (minutes) *", "number"),
                attrField("minParticipants", "Min participants", "number"),
                attrField("maxParticipants", "Max participants", "number"),
                attrField("meetingPoint", "Meeting point"),
                attrField("advanceNoticeHours", "Advance notice (hours)", "number")
              ]}
            {v === "PROPERTY" &&
              [
                attrField("propertyType", "Type * (HOUSE_SALE / LAND_SALE / …)"),
                attrField("priceBasis", "Price basis (TOTAL / PER_MONTH)"),
                attrField("areaSqm", "Area (m²)", "number"),
                attrField("bedrooms", "Bedrooms", "number"),
                attrField("bathrooms", "Bathrooms", "number"),
                attrField("titleDeedStatus", "Title deed status")
              ]}
          </div>
        </Card>

        {canWrite ? (
          <div className="flex items-center gap-3">
            <Button onClick={() => save()} disabled={isPending || !title.fr || !form.city}>
              {isNew ? "Create" : "Save"}
            </Button>
            {!isNew && data?.listing.status !== "PUBLISHED" ? (
              <Button
                variant="outline"
                // Unsaved edits first: the website would get the version that
                // was saved, not the one on screen.
                disabled={Boolean(data?.publishBlockers?.length) || publishing || dirty}
                onClick={() => publish()}
              >
                Publish
              </Button>
            ) : null}
            {/* Sold out is still on show, so it can be taken down too. */}
            {!isNew &&
            ["PUBLISHED", "SOLD_OUT"].includes(data?.listing.status ?? "") ? (
              <Button
                variant="outline"
                disabled={deactivating || dirty}
                onClick={() =>
                  window.confirm(
                    deactivatePrompt(data?.listing.displayTitle ?? "this listing")
                  ) && deactivate()
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
