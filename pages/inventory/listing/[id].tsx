import {
  createListing,
  deactivateListing,
  deleteListing,
  getListing,
  publishListing,
  updateListing,
  listLocations
} from "@/api/functions/admin.api";
import DateField from "@/components/DateField";
import DeleteButton from "@/components/DeleteButton";
import ImageUploader from "@/components/Form/ImageUploader";
import LocationPicker, { type Geo } from "@/components/Form/LocationPicker";
import SupplierSelect from "@/components/Form/SupplierSelect";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import MoneyInput, {
  formToMoney,
  moneyToForm
} from "@/components/Form/MoneyInput";
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
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { AlertTriangle, ArrowLeft, Plus, X } from "lucide-react";
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
type WeeklyTime = { day: number; time: string };

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
const VERTICAL_LABELS: Record<string, string> = {
  FLIGHT: "Flight route",
  BUS: "Bus route",
  CAR: "Car rental",
  ACTIVITY: "Activity / tour",
  PROPERTY: "Property"
};

export default function ListingFormPage() {
  const { query } = useRouter();
  // A fresh form for each record. Opened over another one — the global search
  // does that — it must not start from that record's fields or its unsaved
  // flag: a failed load would leave them on screen under the new address, one
  // Save away from overwriting it.
  return <ListingForm key={String(query.id ?? "")} />;
}

function ListingForm() {
  const router = useRouter();
  const id = router.query.id as string;
  // `/inventory/listing/new` routes here with id="new". Guard undefined too,
  // so the page never tries to fetch a listing that has no id.
  const isNew = !id || id === "new";
  const vertical =
    (router.query.vertical as string) || "FLIGHT";
  const queryClient = useQueryClient();
  const { dirty, setDirty, isDirty, mark } = useUnsaved();
  // The listing and the location list are inventory:read; create, save and
  // publish are inventory:write. Without it this form is a read-only view.
  // Deleting the listing is inventory:delete, which that button checks for
  // itself.
  const { can } = useCan();
  const canWrite = can("inventory:write");

  const [title, setTitle] = useState<Localized>({});
  const [description, setDescription] = useState<Localized>({});
  const [costPrice, setCostPrice] = useState<Record<string, string>>({});
  const [sellPrice, setSellPrice] = useState<Record<string, string>>({});
  // A bus or flight's other two fares: a child of 2 to 12, a baby under 2.
  const [fares, setFares] = useState<Record<FareKey, Record<string, string>>>({
    childCostPrice: {},
    childSellPrice: {},
    infantCostPrice: {},
    infantSellPrice: {}
  });
  const [form, setForm] = useState({
    vertical,
    city: "",
    supplier: "",
    quantityTotal: "",
    validFrom: ""
  });
  const [images, setImages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  // A video being sent: the form waits for it (see VideoField's onBusy).
  const [videoBusy, setVideoBusy] = useState(false);
  const [geo, setGeo] = useState<Geo>(null);
  const [attrs, setAttrs] = useState<Attrs>({});

  const { data, isError, error, isFetching, isFetchedAfterMount, refetch } =
    useQuery({
      queryKey: ["listing", id],
      queryFn: () => getListing(id),
      enabled: Boolean(id) && !isNew,
      // A status changed on another screen must not come back from the cache.
      refetchOnMount: "always"
    });

  // The form opens once THIS visit has read the record — and then stays open.
  // A read that fails leaves `data` holding the copy kept from an earlier
  // visit: a form opened on that looks right and saves the old copy back over
  // whatever has been saved since (a video added a minute ago, say).
  const [opened, setOpened] = useState(false);
  if (!opened && data && isFetchedAfterMount && !isError) setOpened(true);

  /** The serviced list — the only cities this listing may be saved against. */
  const { data: locationOptions } = useQuery({
    queryKey: ["locations"],
    queryFn: listLocations,
    staleTime: 5 * 60 * 1000
  });

  useEffect(() => {
    if (!data?.listing) return;
    // Typed and not yet saved: the form is ahead of the server, not behind it.
    // A refetch landing now — after a save, a reconnect — leaves it alone.
    if (isDirty()) return;
    const l = data.listing;
    setTitle((l.title as unknown as Localized) ?? {});
    setDescription(
      ((l as unknown as { description: Localized }).description) ?? {}
    );
    setCostPrice(moneyToForm(l.costPrice));
    setSellPrice(moneyToForm(l.sellPrice));
    setFares({
      childCostPrice: moneyToForm(l.childCostPrice),
      childSellPrice: moneyToForm(l.childSellPrice),
      infantCostPrice: moneyToForm(l.infantCostPrice),
      infantSellPrice: moneyToForm(l.infantSellPrice)
    });
    setForm({
      vertical: l.vertical,
      city: l.city,
      supplier: l.supplier ?? "",
      quantityTotal: String(l.quantityTotal ?? ""),
      validFrom: l.validFrom?.slice(0, 10) ?? ""
    });
    setImages(l.images ?? []);
    setVideoUrl(l.videoUrl ?? "");
    setGeo(l.geo ?? null);
    setAttrs(l.attributes ?? {});
  }, [data, isDirty]);

  /**
   * §13: ask before unsaved changes — or a video on its way — are left
   * behind, by closing the tab or by moving on inside the panel.
   */
  const letGo = useLeaveGuard({ dirty, uploading: videoBusy });

  const v = form.vertical;
  const isProperty = v === "PROPERTY";
  // Buses and flights are routes of a travel agency, on a timetable.
  const isRoute = v === "BUS" || v === "FLIGHT";

  const body = () => ({
    vertical: v,
    title,
    city: form.city,
    description,
    // An id from the Suppliers list; blank clears it.
    supplier: form.supplier,
    // USD minor units on the wire; the server works out CDF and EUR.
    costPrice: formToMoney(costPrice),
    sellPrice: formToMoney(sellPrice),
    ...(isRoute
      ? Object.fromEntries(
          Object.entries(fares).map(([key, value]) => [key, formToMoney(value)])
        )
      : {}),
    quantityTotal: isRoute ? 0 : Number(form.quantityTotal) || 0,
    // null, not left out: a date cleared here is cleared on the server.
    validFrom: form.validFrom || null,
    // Retired field: a record from before may still carry a date the panel can
    // no longer show, so a save clears it rather than leaving it to expire.
    validUntil: null,
    images,
    // Sent even when blank: "" is what removes a video on the server.
    videoUrl,
    geo,
    attributes: attrs
  });

  /** A refusal with a sentence to show. */
  const refused = (fallback: string) => (e: unknown) =>
    toast.error(
      (e as AxiosError<{ message?: string }>).response?.data?.message ?? fallback
    );

  /** For a save that has landed: "Saved", or the truth if typing went on meanwhile. */
  const SAVED_BEHIND = "Saved — what you typed since is not saved yet";

  // Publish and deactivate use `refused` directly: this one reads a 409 as the
  // price guard and would offer to save the form instead.
  const onError = (e: unknown) => {
    const err = e as AxiosError<{ message?: string }>;
    if (err.response?.status === 409) {
      // §5.1 price-change guard.
      if (window.confirm(`${err.response.data?.message}\n\nProceed anyway?`)) {
        const unchanged = mark();
        updateListing(id, { ...body(), confirmPriceChange: true })
          .then(() => {
            const saved = unchanged();
            if (saved) setDirty(false);
            queryClient.invalidateQueries({ queryKey: ["listing", id] });
            toast.success(saved ? "Saved" : SAVED_BEHIND);
          })
          // The second attempt can be refused as well: say so.
          .catch(refused("Could not save"));
      }
      return;
    }
    toast.error(err.response?.data?.message ?? "Could not save");
  };

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      const unchanged = mark();
      const r = await (isNew ? createListing(body()) : updateListing(id, body()));
      // Asked the moment the answer is back: was anything typed meanwhile?
      return { ...r, saved: unchanged() };
    },
    meta: { showToast: false },
    onSuccess: (r) => {
      // Still dirty if typing went on while this was in flight: that text was
      // not sent, and Publish must stay off until it is.
      if (r.saved) setDirty(false);
      if (isNew) {
        toast.success(
          r.saved
            ? "Created — inactive until you publish it"
            : "Created — what you typed while it was saving was not included"
        );
        letGo();
        router.replace(`/inventory/listing/${r.listing.id}`);
      } else {
        toast.success(r.saved ? "Saved" : SAVED_BEHIND);
        queryClient.invalidateQueries({ queryKey: ["listing", id] });
      }
    },
    onError
  });

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

  /** The calendar for a day, or a day and a time; nothing for any other kind of field. */
  const dateControl = (
    type: string,
    label: string,
    value: unknown,
    onText: (raw: string) => void
  ) =>
    type === "date" ? (
      <DateField
        disabled={!canWrite}
        aria-label={label}
        value={String(shown(type, value))}
        onChange={onText}
      />
    ) : null;

  const attrField = (key: string, label: string, type = "text") => (
    <div key={key}>
      <Label className="text-xs">{label}</Label>
      {dateControl(type, label, attrs[key], (raw) =>
        setAttr(key, stored(type, raw))
      ) ?? (
        <Input
          disabled={!canWrite}
          type={type === "money" ? "number" : type}
          min={type === "money" ? 0 : undefined}
          step={type === "money" ? "0.01" : undefined}
          value={shown(type, attrs[key])}
          onChange={(e) => setAttr(key, stored(type, e.target.value))}
        />
      )}
    </div>
  );

  const setFare = (key: FareKey, value: Record<string, string>) => {
    setFares((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  /** The live serviced places, for a route's two ends. */
  const places = (locationOptions?.items ?? []).filter((l) => l.isActive);

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

  // Not an empty, editable form while the record is on its way — a save from
  // it would wipe fields that simply had not arrived. Not one filled from the
  // cache either: see `opened` above. And when the record does not arrive, an
  // error with a way to try again, never a form that passes for the record.
  if (!isNew && !opened) {
    return (
      <AdminLayout title="Listing">
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
          {/* Up here, not beside Save: that row is inventory:write and this
              is not. Only for a listing that exists. */}
          {data?.listing ? (
            <DeleteButton
              permission="inventory:delete"
              label="Delete"
              className="ml-auto"
              what={`“${data.listing.displayTitle}”`}
              consequence="Bookings already made keep their own details."
              onDelete={(confirmed) => deleteListing(id, confirmed)}
              onDeleted={() => {
                queryClient.invalidateQueries({ queryKey: ["listings"] });
                // Nothing typed here is left to save.
                letGo();
                router.replace(`/inventory?group=${data.listing.vertical}`);
              }}
            />
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
              <Label className="text-xs">{isRoute ? "From (departure point) *" : "City *"}</Label>
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
            {isRoute ? (
              <div>
                <Label className="text-xs">To (destination) *</Label>
                <select
                  disabled={!canWrite}
                  aria-label="To (destination)"
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                  value={String(attrs.destination ?? "")}
                  onChange={(e) => setAttr("destination", e.target.value || undefined)}
                >
                  <option value="">Select a location…</option>
                  {places
                    .filter((l) => l.name !== form.city)
                    .map((l) => (
                      <option key={l.id} value={l.name}>
                        {l.name}
                        {l.province ? ` · ${l.province}` : ""}
                      </option>
                    ))}
                </select>
              </div>
            ) : null}
            <SupplierSelect
              disabled={!canWrite}
              label={isRoute ? "Travel agency" : "Supplier"}
              required={isRoute}
              value={form.supplier}
              onChange={(id) => set("supplier", id)}
            />
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
            <VideoField
              onBusy={setVideoBusy}
              saving={isPending}
              disabled={!canWrite}
              value={videoUrl}
              onChange={(val) => {
                setVideoUrl(val);
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

        {isRoute ? (
          <Card className="gap-0 p-5">
            <h2 className="mb-1 text-sm font-medium">Fares</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              In USD; CDF and EUR are worked out from the exchange rates in Settings. The cost is
              what the agency charges you — never shown to customers. Seats are not counted: the
              agency confirms each booking.
            </p>
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-[10rem_1fr_1fr]">
              {(
                [
                  ["Adult (12 and over)", null],
                  ["Child (2 to 12)", "child"],
                  ["Baby (under 2)", "infant"]
                ] as const
              ).map(([who, key]) => (
                <div key={who} className="contents">
                  <p className="self-center text-sm font-medium">{who}</p>
                  <MoneyInput
                    disabled={!canWrite}
                    label="Cost"
                    requireBase={key !== "infant"}
                    hint={key === "infant" ? "0 if nothing" : " "}
                    value={key ? fares[`${key}CostPrice`] : costPrice}
                    onChange={(val) => {
                      if (key) setFare(`${key}CostPrice`, val);
                      else {
                        setCostPrice(val);
                        setDirty(true);
                      }
                    }}
                  />
                  <MoneyInput
                    disabled={!canWrite}
                    label="Fare — what they pay"
                    requireBase={key !== "infant"}
                    hint={key === "infant" ? "0 if babies travel free" : " "}
                    value={key ? fares[`${key}SellPrice`] : sellPrice}
                    onChange={(val) => {
                      if (key) setFare(`${key}SellPrice`, val);
                      else {
                        setSellPrice(val);
                        setDirty(true);
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </Card>
        ) : (
        <Card className="gap-0 p-5">
          <h2 className="mb-1 text-sm font-medium">
            {isProperty ? "Price" : "Price & availability"}
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {isProperty
              ? "Properties carry no quantity and no checkout."
              : "In USD; CDF and EUR are worked out from the exchange rates in Settings."}
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
              <DateField
                disabled={!canWrite}
                aria-label="Valid from"
                value={form.validFrom}
                onChange={(day) => set("validFrom", day)}
              />
            </div>
          </div>
        </Card>
        )}

        <Card className="gap-0 p-5">
          <h2 className="mb-4 text-sm font-medium">{VERTICAL_LABELS[v]} details</h2>
          {v === "BUS" ? (
            <div className="mb-5">
              <p className="mb-1 text-xs font-medium">Departure times *</p>
              <p className="mb-3 text-xs text-muted-foreground">
                The bus leaves at these times every day. The customer picks the date and one of
                these times when they book.
              </p>
              <TimesEditor
                disabled={!canWrite}
                times={(attrs.dailyTimes as string[] | undefined) ?? []}
                onChange={(times) => setAttr("dailyTimes", times)}
              />
            </div>
          ) : null}
          {v === "FLIGHT" ? (
            <div className="mb-5">
              <p className="mb-1 text-xs font-medium">Weekly timetable *</p>
              <p className="mb-3 text-xs text-muted-foreground">
                The flights of each day of the week. The customer picks a date and one of that
                day&rsquo;s flights when they book.
              </p>
              <WeeklyEditor
                disabled={!canWrite}
                week={(attrs.weeklyTimes as WeeklyTime[] | undefined) ?? []}
                onChange={(week) => setAttr("weeklyTimes", week)}
              />
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {v === "FLIGHT" &&
              [
                attrField("durationMinutes", "Flight time (minutes)", "number"),
                attrField("cabin", "Cabin (ECONOMY / BUSINESS)"),
                attrField("baggage", "Baggage allowance"),
                attrField("fareRules", "Fare rules")
              ]}
            {v === "BUS" &&
              [
                attrField("durationMinutes", "Journey time (minutes)", "number"),
                attrField("vehicleClass", "Vehicle class")
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
            <Button
              onClick={() => save()}
              disabled={
                isPending || videoBusy || !title.fr || !form.city || (isRoute && !attrs.destination)
              }
            >
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

type FareKey = "childCostPrice" | "childSellPrice" | "infantCostPrice" | "infantSellPrice";

/** Monday first, as a timetable is read; the stored day is 0 = Sunday … 6 = Saturday. */
const WEEK = [
  { day: 1, label: "Monday" },
  { day: 2, label: "Tuesday" },
  { day: 3, label: "Wednesday" },
  { day: 4, label: "Thursday" },
  { day: 5, label: "Friday" },
  { day: 6, label: "Saturday" },
  { day: 0, label: "Sunday" }
];

/** Times of day, "HH:MM", in order. A blank row is dropped by the server. */
function TimesEditor({
  times,
  onChange,
  disabled
}: {
  times: string[];
  onChange: (times: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {times.map((time, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            type="time"
            aria-label={`Departure ${i + 1}`}
            className="w-28"
            disabled={disabled}
            value={time}
            onChange={(e) => onChange(times.map((t, n) => (n === i ? e.target.value : t)))}
          />
          {disabled ? null : (
            <Button
              variant="ghost"
              size="icon"
              title="Remove this time"
              onClick={() => onChange(times.filter((_t, n) => n !== i))}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      ))}
      {disabled ? null : (
        <Button variant="outline" size="sm" className="gap-1" onClick={() => onChange([...times, ""])}>
          <Plus className="size-3.5" />
          Add a time
        </Button>
      )}
      {!times.length && disabled ? (
        <span className="text-xs text-muted-foreground">No departure times.</span>
      ) : null}
    </div>
  );
}

/** A flight's week: each day's departure times. */
function WeeklyEditor({
  week,
  onChange,
  disabled
}: {
  week: WeeklyTime[];
  onChange: (week: WeeklyTime[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="divide-y rounded-md border">
      {WEEK.map(({ day, label }) => {
        const times = week.filter((w) => w.day === day).map((w) => w.time);
        return (
          <div key={day} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <p className="w-24 text-sm">{label}</p>
            <TimesEditor
              disabled={disabled}
              times={times}
              onChange={(next) =>
                onChange([
                  ...week.filter((w) => w.day !== day),
                  ...next.map((time) => ({ day, time }))
                ])
              }
            />
          </div>
        );
      })}
    </div>
  );
}
