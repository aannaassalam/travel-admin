import {
  createListing,
  deactivateListing,
  deleteListing,
  getListing,
  publishListing,
  updateListing,
  listLocations,
  type Listing
} from "@/api/functions/admin.api";
import DateField from "@/components/DateField";
import DeleteButton from "@/components/DeleteButton";
import ImageUploader from "@/components/Form/ImageUploader";
import LocationPicker, { type Geo } from "@/components/Form/LocationPicker";
import { OptionSelect } from "@/components/Form/OptionSelect";
import SupplierSelect from "@/components/Form/SupplierSelect";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import TagTranslations from "@/components/Form/TagTranslations";
import PromotionFields, {
  onePrice,
  promotionBody,
  type PromotionDraft
} from "@/components/Form/PromotionFields";
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
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/functions/format.lib";
import { toLocalized } from "@/lib/functions/localized.lib";
import {
  deactivatePrompt,
  label,
  LISTING_STATUS
} from "@/lib/functions/labels.lib";
import { useLeaveGuard, useUnsaved } from "@/hooks/useUnsaved";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
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

/** Texts customers read, one per language. An older record's plain string is the French. */
const LOCALIZED_ATTRS = [
  "meetingPoint",
  "mileageLimit",
  "insuranceTerms",
  "baggage",
  "fareRules",
  "titleDeedStatus"
] as const;

/**
 * A stored attribute as its input shows it, and the input's text as it is
 * stored again. The API returns full ISO instants, which a date box cannot
 * display — left as they came, a saved departure showed as an empty field.
 */
const shown = (type: string, value: unknown) => {
  if (value === undefined || value === null) return "";
  if (type === "datetime-local") return String(value).slice(0, 16);
  if (type === "date") return String(value).slice(0, 10);
  // Whole francs, on the record and in the box, like every other amount.
  // A number, not text: React leaves a half-typed value alone that way.
  if (type === "money") return Number(value);
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
  if (type === "money") return Math.round(Number(raw));
  return type === "number" ? Number(raw) : raw;
};
/** Each vertical's name, its "New …" title and its details heading. */
const VERTICAL_LABELS: Record<
  string,
  { name: TranslationKey; create: TranslationKey; details: TranslationKey }
> = {
  FLIGHT: {
    name: "inv.listing.vertical.flight",
    create: "inv.listing.new.flight",
    details: "inv.listing.details.flight"
  },
  BUS: {
    name: "inv.listing.vertical.bus",
    create: "inv.listing.new.bus",
    details: "inv.listing.details.bus"
  },
  CAR: {
    name: "inv.listing.vertical.car",
    create: "inv.listing.new.car",
    details: "inv.listing.details.car"
  },
  ACTIVITY: {
    name: "inv.listing.vertical.activity",
    create: "inv.listing.new.activity",
    details: "inv.listing.details.activity"
  },
  PROPERTY: {
    name: "inv.listing.vertical.property",
    create: "inv.listing.new.property",
    details: "inv.listing.details.property"
  }
};

/** A bus or flight's other two fares: a child of 2 to 12, a baby under 2. */
const ROUTE_FARES = ["childCostPrice", "childSellPrice", "infantCostPrice", "infantSellPrice"] as const;
/** A car's shorter rentals. Its 24 hours are the listing's own cost and sell price. */
const CAR_FARES = [
  "hourlyCostPrice",
  "hourlySellPrice",
  "sixHourCostPrice",
  "sixHourSellPrice",
  "twelveHourCostPrice",
  "twelveHourSellPrice"
] as const;
type FareKey = (typeof ROUTE_FARES)[number] | (typeof CAR_FARES)[number];
/** §4: each price's own old price (display only); one end date, `promoEndsAt`, for them all. */
const PROMO_FIELDS = [
  "promoCompareAtPrice",
  "childPromoCompareAtPrice",
  "infantPromoCompareAtPrice",
  "hourlyPromoCompareAtPrice",
  "sixHourPromoCompareAtPrice",
  "twelveHourPromoCompareAtPrice"
] as const;

/**
 * Land has one size, its plot, kept in `areaSqm` — the box the office always
 * typed it in. A plot size only goes with a house, beside its built area: on
 * land, one copied or imported moves into that box when it is empty, and goes.
 */
const isLandType = (type: unknown) => type === "LAND_SALE" || type === "LAND_RENT";
const asLand = (a: Attrs): Attrs => ({ ...a, areaSqm: a.areaSqm ?? a.plotSizeSqm, plotSizeSqm: undefined });

/** A listing's prices besides its own pair, as their boxes show them. */
const faresOf = (l?: Listing) =>
  Object.fromEntries([
    ...ROUTE_FARES.map((key) => [key, moneyToForm(l?.[key])]),
    // A car rate never set reads back as 0, which is "not rented for that
    // length": a blank box, as the card asks for, not a price of 0. One still
    // in dollars goes whole, for the box to keep it (see moneyToForm).
    ...CAR_FARES.map((key) => [
      key,
      moneyToForm(l?.[key]?.CDF || typeof l?.[key]?.USD === "number" ? l?.[key] : undefined)
    ])
  ]) as Record<FareKey, Record<string, string>>;

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
  const { t, locale } = useT();
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
  // Charged once per booking, whatever the quantity. Not on properties.
  const [processingFee, setProcessingFee] = useState<Record<string, string>>({});
  // A route's child and baby fares, a car's shorter rentals.
  const [fares, setFares] = useState(() => faresOf());
  // §4: display-only old prices and their last day. Sent only once changed
  // here: a promotion that has ended must not block saving anything else.
  const [promo, setPromo] = useState<PromotionDraft & { touched?: boolean }>({
    old: {},
    ends: ""
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
  // The words of the lists in other languages, and each list's box as typed
  // (a list never edited here is sent back exactly as it came).
  const [tags, setTags] = useState<Record<string, Localized>>({});
  const [listText, setListText] = useState<Record<string, string>>({});

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

  // A car the conversion to francs has not reached yet keeps its deposit in US
  // cents, like its prices: never shown as francs, and sent back untouched for
  // the conversion — which converts it only while the sell price is dollars.
  const loadedDeposit = data?.listing?.attributes?.deposit;
  const centsDeposit =
    typeof data?.listing?.sellPrice?.USD === "number" &&
    typeof loadedDeposit === "number" &&
    attrs.deposit === loadedDeposit
      ? loadedDeposit
      : undefined;

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
    setProcessingFee(moneyToForm(l.processingFee));
    setFares(faresOf(l));
    setPromo({
      // 0 is no promotion, like a car rate never set.
      old: Object.fromEntries(
        PROMO_FIELDS.map((key) => [key, moneyToForm(l[key]?.CDF ? l[key] : undefined)])
      ),
      ends: l.promoEndsAt?.slice(0, 10) ?? ""
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
    const at = { ...l.attributes };
    for (const k of LOCALIZED_ATTRS) if (at[k] != null) at[k] = toLocalized(at[k]);
    // Land imported with its size as a plot size shows it in its one box.
    setAttrs(isLandType(at.propertyType) ? asLand(at) : at);
    setTags(l.tagTranslations ?? {});
    setListText({});
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
  const isCar = v === "CAR";
  const isLand = isLandType(attrs.propertyType);
  const isHouse = attrs.propertyType === "HOUSE_SALE" || attrs.propertyType === "HOUSE_RENT";
  // Only this vertical's: the server would store another's fares as sent.
  const extraFares: readonly FareKey[] = isRoute ? ROUTE_FARES : isCar ? CAR_FARES : [];
  // §4: an old price for each price on sale. A car's shorter rates and a baby
  // fare are on sale only at a price above 0.
  const promoRow = (
    pre: "" | "child" | "infant" | "hourly" | "sixHour" | "twelveHour",
    name: TranslationKey
  ) => ({
    key: pre ? `${pre}PromoCompareAtPrice` : "promoCompareAtPrice",
    label: t("inv.listing.promo.oldPrice", { name: t(name) }),
    sell: Number((pre ? fares[`${pre}SellPrice`] : sellPrice).CDF) || 0
  });
  const promoRows = isCar
    ? [
        ...[
          promoRow("hourly", "inv.listing.rate.hourly"),
          promoRow("sixHour", "inv.listing.rate.sixHour"),
          promoRow("twelveHour", "inv.listing.rate.twelveHour")
        ].filter((r) => r.sell > 0),
        promoRow("", "inv.listing.rate.day")
      ]
    : isRoute
      ? [
          promoRow("", "inv.listing.fare.adult"),
          promoRow("child", "inv.listing.fare.child"),
          ...[promoRow("infant", "inv.listing.fare.infant")].filter((r) => r.sell > 0)
        ]
      : onePrice(Number(sellPrice.CDF) || 0, t);

  const processingFeeInput = (
    <MoneyInput
      disabled={!canWrite}
      label={t("inv.processingFee")}
      hint={t("inv.processingFeeHint")}
      value={processingFee}
      onChange={(val) => {
        setProcessingFee(val);
        setDirty(true);
      }}
    />
  );

  const body = () => ({
    vertical: v,
    title,
    city: form.city,
    description,
    // An id from the Suppliers list; blank clears it.
    supplier: form.supplier,
    // Whole francs on the wire; the server works out USD and EUR.
    costPrice: formToMoney(costPrice),
    sellPrice: formToMoney(sellPrice),
    ...(isProperty ? {} : { processingFee: formToMoney(processingFee) }),
    ...Object.fromEntries(extraFares.map((key) => [key, formToMoney(fares[key])])),
    // A blank box ({}) and null clear the promotion. Only the prices on sale:
    // the server clears the old price of one taken off sale.
    ...(promo.touched ? promotionBody(promo, promoRows.map((r) => r.key)) : {}),
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
    // Land saves without a plot size: copied onto land, one was shown as its
    // size with no box to correct it in. (A house switched to land keeps its
    // plot as the size when it had no built area.)
    attributes: isLand ? asLand(attrs) : attrs,
    tagTranslations: tags
  });

  /** A refusal with a sentence to show. */
  const refused = (fallback: string) => (e: unknown) =>
    toast.error(
      (e as AxiosError<{ message?: string }>).response?.data?.message ?? fallback
    );

  /** For a save that has landed: "Saved", or the truth if typing went on meanwhile. */
  const SAVED_BEHIND = t("inv.listing.savedBehind");

  // Publish and deactivate use `refused` directly: this one reads a 409 as the
  // price guard and would offer to save the form instead.
  const onError = (e: unknown) => {
    const err = e as AxiosError<{ message?: string }>;
    if (err.response?.status === 409) {
      // §5.1 price-change guard.
      if (window.confirm(`${err.response.data?.message}\n\n${t("inv.listing.proceedAnyway")}`)) {
        const unchanged = mark();
        updateListing(id, { ...body(), confirmPriceChange: true })
          .then(() => {
            const saved = unchanged();
            if (saved) setDirty(false);
            queryClient.invalidateQueries({ queryKey: ["listing", id] });
            toast.success(saved ? t("inv.listing.saved") : SAVED_BEHIND);
          })
          // The second attempt can be refused as well: say so.
          .catch(refused(t("inv.listing.err.save")));
      }
      return;
    }
    toast.error(err.response?.data?.message ?? t("inv.listing.err.save"));
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
            ? t("inv.listing.created")
            : t("inv.listing.createdBehind")
        );
        letGo();
        router.replace(`/inventory/listing/${r.listing.id}`);
      } else {
        toast.success(r.saved ? t("inv.listing.saved") : SAVED_BEHIND);
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
      toast.success(t("inv.listing.published"));
    },
    onError: refused(t("inv.listing.err.publish"))
  });

  const { mutate: deactivate, isPending: deactivating } = useMutation({
    mutationFn: () => deactivateListing(id),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listing", id] });
      toast.success(t("inv.listing.deactivated"));
    },
    onError: refused(t("inv.listing.err.deactivate"))
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
          step={type === "money" ? "1" : undefined}
          value={key === "deposit" && centsDeposit !== undefined ? "" : shown(type, attrs[key])}
          onChange={(e) => setAttr(key, stored(type, e.target.value))}
        />
      )}
      {key === "deposit" && centsDeposit !== undefined ? (
        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
          {t("inv.listing.depositNotConverted", {
            amount: formatMoney(centsDeposit, "USD", locale)
          })}
        </p>
      ) : null}
    </div>
  );

  /** A text customers read: a box per language. */
  const attrLocalized = (key: string, label: string, multiline?: boolean) => (
    <LocalizedInput
      key={key}
      disabled={!canWrite}
      label={label}
      multiline={multiline}
      rows={multiline ? 2 : undefined}
      value={toLocalized(attrs[key])}
      onChange={(val) => setAttr(key, val)}
    />
  );

  const setTagMap = (next: Record<string, Localized>) => {
    setTags(next);
    setDirty(true);
  };

  /** A list of words, one per line, with the words' other languages under it. */
  const attrList = (key: string, label: string, placeholder: string) => {
    const words = (attrs[key] as string[] | undefined) ?? [];
    return (
      <div key={key}>
        <Label className="text-xs">{label}</Label>
        <Textarea
          disabled={!canWrite}
          rows={3}
          placeholder={placeholder}
          value={listText[key] ?? words.join("\n")}
          onChange={(e) => {
            const raw = e.target.value;
            setListText((x) => ({ ...x, [key]: raw }));
            setAttr(key, raw.split("\n").map((w) => w.trim()).filter(Boolean));
          }}
        />
        <TagTranslations disabled={!canWrite} words={words} value={tags} onChange={setTagMap} />
      </div>
    );
  };

  /**
   * A fixed code, picked from its list: typed by hand, the server refused it.
   * A code can be a yes/no, stored as one. A value from before the list (a
   * car type typed as text) stays on offer as "current: …" until it is
   * changed, so opening and saving a record never changes it.
   */
  const attrSelect = (
    key: string,
    label: string,
    options: [code: string | boolean, text: string][]
  ) => {
    const value = attrs[key];
    const listed = value == null || value === "" || options.some(([code]) => code === value);
    return (
      <div key={key}>
        <Label className="text-xs">{label}</Label>
        <OptionSelect
          disabled={!canWrite}
          aria-label={label}
          value={String(value ?? "")}
          onChange={(v) =>
            setAttr(key, options.find(([code]) => String(code) === v)?.[0] ?? (v || undefined))
          }
          options={[
            { value: "", label: "—" },
            ...(listed
              ? []
              : [{ value: String(value), label: t("inv.listing.current", { value: String(value) }) }]),
            ...options.map(([code, text]) => ({ value: String(code), label: text }))
          ]}
        />
      </div>
    );
  };

  const setFare = (key: FareKey, value: Record<string, string>) => {
    setFares((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  /** The live serviced places, for a route's two ends. */
  const places = (locationOptions?.items ?? []).filter((l) => l.isActive);

  const setPromoPart = (patch: Partial<PromotionDraft>) => {
    setPromo((p) => ({ ...p, ...patch, touched: true }));
    setDirty(true);
  };
  /** §4: display only — what customers pay stays the sell price. */
  const promotionBlock = (
    <PromotionFields
      value={promo}
      rows={promoRows}
      disabled={!canWrite}
      onChange={setPromoPart}
    />
  );

  // The list hides "New …" without inventory:write; this covers the URL.
  if (id === "new" && !canWrite) {
    return (
      <AdminLayout title={t(VERTICAL_LABELS[v]?.create)}>
        <p className="text-sm text-muted-foreground">
          {t("inv.listing.cannotAdd")}
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
      <AdminLayout title={t("inv.listing.listing")}>
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
      title={
        isNew
          ? t(VERTICAL_LABELS[v]?.create)
          : title.fr || title.en || t("inv.listing.listing")
      }
      description={t(VERTICAL_LABELS[v]?.name)}
    >
      <div className="flex max-w-4xl flex-col gap-5">
        <div className="flex items-center gap-2">
          <Link href={`/inventory?group=${v}`}>
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="size-4 rtl:-scale-x-100" />
              {t("common.back")}
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
              label={t("inv.listing.delete")}
              className="ms-auto"
              what={t("inv.listing.deleteWhat", { name: data.listing.displayTitle })}
              consequence={t("inv.listing.deleteConsequence")}
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
              <p className="font-medium">{t("inv.listing.cannotPublish")}</p>
              <ul className="mt-1 list-inside list-disc">
                {data.publishBlockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <Card className="gap-0 p-5">
          <h2 className="mb-4 text-sm font-medium">{t("inv.listing.basics")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <LocalizedInput
                disabled={!canWrite}
                label={t("inv.listing.title")}
                required
                value={title}
                onChange={(v) => {
                  setTitle(v);
                  setDirty(true);
                }}
              />
            </div>
            <div>
              <Label className="text-xs">
                {isRoute ? t("inv.listing.from") : t("inv.listing.city")}
              </Label>
              <>
                {/* A select, not free text. `city` used to be typed by hand, so
                    one mistake invented a permanent new city in the public
                    filter facets — and the server now refuses anything not on
                    the serviced list, so offering a text box would only produce
                    a save that fails. */}
                <OptionSelect
                  disabled={!canWrite}
                  value={form.city ?? ""}
                  onChange={(v) => set("city", v)}
                  options={[
                    { value: "", label: t("inv.listing.selectLocation") },
                    ...(locationOptions?.items ?? [])
                      .filter((l) => l.isActive)
                      .map((l) => ({
                        value: l.name,
                        label: `${l.name}${l.province ? ` · ${l.province}` : ""}`
                      }))
                  ]}
                />
                {form.city &&
                  !(locationOptions?.items ?? []).some(
                    (l) => l.isActive && l.name === form.city
                  ) && (
                    <p className="mt-1 text-xs text-amber-600">
                      {t("inv.listing.notLive", { city: form.city })}
                    </p>
                  )}
              </>
            </div>
            {isRoute ? (
              <div>
                <Label className="text-xs">{t("inv.listing.to")}</Label>
                <OptionSelect
                  disabled={!canWrite}
                  aria-label={t("inv.listing.toAria")}
                  value={String(attrs.destination ?? "")}
                  onChange={(v) => setAttr("destination", v || undefined)}
                  options={[
                    { value: "", label: t("inv.listing.selectLocation") },
                    ...places
                      .filter((l) => l.name !== form.city)
                      .map((l) => ({
                        value: l.name,
                        label: `${l.name}${l.province ? ` · ${l.province}` : ""}`
                      }))
                  ]}
                />
              </div>
            ) : null}
            <SupplierSelect
              disabled={!canWrite}
              label={isRoute ? t("inv.listing.agency") : t("inv.supplier")}
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
              label={t("inv.listing.gallery")}
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
              label={t("inv.listing.description")}
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
            <h2 className="mb-1 text-sm font-medium">{t("inv.listing.fares")}</h2>
            <p className="mb-4 text-xs text-muted-foreground">{t("inv.listing.faresHint")}</p>
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-[10rem_1fr_1fr]">
              {(
                [
                  ["inv.listing.who.adult", null],
                  ["inv.listing.who.child", "child"],
                  ["inv.listing.who.infant", "infant"]
                ] as const
              ).map(([who, key]) => (
                <div key={who} className="contents">
                  <p className="self-center text-sm font-medium">{t(who)}</p>
                  <MoneyInput
                    disabled={!canWrite}
                    label={t("inv.listing.cost")}
                    requireBase={key !== "infant"}
                    hint={key === "infant" ? t("inv.listing.zeroIfNothing") : " "}
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
                    label={t("inv.listing.farePaid")}
                    requireBase={key !== "infant"}
                    hint={key === "infant" ? t("inv.listing.babiesFree") : " "}
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
              <div className="sm:col-start-3">{processingFeeInput}</div>
            </div>
            {promotionBlock}
          </Card>
        ) : (
        <Card className="gap-0 p-5">
          <h2 className="mb-1 text-sm font-medium">
            {isProperty
              ? t("inv.listing.price")
              : isCar
                ? t("inv.listing.rentalPrices")
                : t("inv.listing.priceAvailability")}
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {isProperty
              ? t("inv.listing.propertyNoQty")
              : t("inv.listing.inFrancs")}
            {isCar ? ` ${t("inv.listing.carHint")}` : null}
          </p>
          {isCar ? (
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-[10rem_1fr_1fr]">
              {(
                [
                  ["inv.listing.len.hourly", "hourly"],
                  ["inv.listing.len.sixHour", "sixHour"],
                  ["inv.listing.len.twelveHour", "twelveHour"],
                  ["inv.listing.len.day", null]
                ] as const
              ).map(([length, key]) => (
                <div key={length} className="contents">
                  <p className="self-center text-sm font-medium">{t(length)}</p>
                  <MoneyInput
                    disabled={!canWrite}
                    label={t("inv.listing.costYouPay")}
                    requireBase={!key}
                    hint=" "
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
                    label={t("inv.listing.priceCustomerPays")}
                    requireBase={!key}
                    hint=" "
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
              <div className="sm:col-start-3">{processingFeeInput}</div>
            </div>
          ) : (
          <div className="flex flex-col gap-4">
            {!isProperty ? (
              <MoneyInput
                disabled={!canWrite}
                label={t("inv.listing.costPrice")}
                requireBase
                value={costPrice}
                hint={t("inv.listing.costPriceHint")}
                onChange={(v) => {
                  setCostPrice(v);
                  setDirty(true);
                }}
              />
            ) : null}
            <MoneyInput
              disabled={!canWrite}
              label={t("inv.listing.sellPrice")}
              requireBase
              value={sellPrice}
              onChange={(v) => {
                setSellPrice(v);
                setDirty(true);
              }}
            />
            {!isProperty ? processingFeeInput : null}
          </div>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {!isProperty ? (
              <div>
                <Label className="text-xs">{t("inv.listing.quantity")}</Label>
                <Input
                  disabled={!canWrite}
                  type="number"
                  value={form.quantityTotal}
                  onChange={(e) => set("quantityTotal", e.target.value)}
                />
              </div>
            ) : null}
            <div>
              <Label className="text-xs">{t("inv.listing.validFrom")}</Label>
              <DateField
                disabled={!canWrite}
                aria-label={t("inv.listing.validFrom")}
                value={form.validFrom}
                onChange={(day) => set("validFrom", day)}
              />
            </div>
          </div>
          {promotionBlock}
        </Card>
        )}

        <Card className="gap-0 p-5">
          <h2 className="mb-4 text-sm font-medium">{t(VERTICAL_LABELS[v]?.details)}</h2>
          {v === "BUS" ? (
            <div className="mb-5">
              <p className="mb-1 text-xs font-medium">{t("inv.listing.departureTimes")}</p>
              <p className="mb-3 text-xs text-muted-foreground">{t("inv.listing.busTimesHint")}</p>
              <TimesEditor
                disabled={!canWrite}
                times={(attrs.dailyTimes as string[] | undefined) ?? []}
                onChange={(times) => setAttr("dailyTimes", times)}
              />
            </div>
          ) : null}
          {v === "FLIGHT" ? (
            <div className="mb-5">
              <p className="mb-1 text-xs font-medium">{t("inv.listing.weekly")}</p>
              <p className="mb-3 text-xs text-muted-foreground">{t("inv.listing.weeklyHint")}</p>
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
                attrField("durationMinutes", t("inv.listing.attr.flightTime"), "number"),
                attrSelect("cabin", t("inv.listing.attr.cabin"), [
                  ["ECONOMY", t("inv.listing.cabin.economy")],
                  ["PREMIUM", t("inv.listing.cabin.premium")],
                  ["BUSINESS", t("inv.listing.cabin.business")],
                  ["FIRST", t("inv.listing.cabin.first")]
                ]),
                attrLocalized("baggage", t("inv.listing.attr.baggage")),
                attrLocalized("fareRules", t("inv.listing.attr.fareRules"))
              ]}
            {v === "BUS" &&
              [
                attrField("durationMinutes", t("inv.listing.attr.journeyTime"), "number"),
                attrField("vehicleClass", t("inv.listing.attr.vehicleClass"))
              ]}
            {v === "CAR" &&
              [
                attrField("make", t("inv.listing.attr.make")),
                attrField("model", t("inv.listing.attr.model")),
                attrField("year", t("inv.listing.attr.year"), "number"),
                attrSelect("category", t("inv.listing.attr.carType"), [
                  ["SUV", t("inv.listing.car.suv")],
                  ["BERLINE", t("inv.listing.car.sedan")],
                  ["BUS", t("inv.listing.car.bus")],
                  ["PICKUP", t("inv.listing.car.pickup")],
                  ["MINIBUS", t("inv.listing.car.minibus")],
                  ["TRUCK", t("inv.listing.car.truck")],
                  ["LUXE", t("inv.listing.car.luxury")],
                  ["MINIVAN", t("inv.listing.car.minivan")],
                  ["VAN", t("inv.listing.car.van")],
                  ["COUPE", t("inv.listing.car.coupe")],
                  ["ROADSTER", t("inv.listing.car.roadster")],
                  ["LIMOUSINE", t("inv.listing.car.limousine")],
                  ["MICROCAR", t("inv.listing.car.microcar")]
                ]),
                attrSelect("transmission", t("inv.listing.attr.transmission"), [
                  ["MANUAL", t("inv.listing.gear.manual")],
                  ["AUTOMATIC", t("inv.listing.gear.automatic")]
                ]),
                // "—" is not said: the website then says nothing about a driver.
                attrSelect("withDriver", t("inv.listing.attr.driver"), [
                  [true, t("inv.listing.driver.with")],
                  [false, t("inv.listing.driver.self")]
                ]),
                attrField("deposit", t("inv.listing.attr.deposit"), "money"),
                attrLocalized("mileageLimit", t("inv.listing.attr.mileage")),
                attrLocalized("insuranceTerms", t("inv.listing.attr.insurance"), true)
              ]}
            {v === "ACTIVITY" &&
              [
                attrField("durationMinutes", t("inv.listing.attr.duration"), "number"),
                attrField("minParticipants", t("inv.listing.attr.minParticipants"), "number"),
                attrField("maxParticipants", t("inv.listing.attr.maxParticipants"), "number"),
                attrLocalized("meetingPoint", t("inv.listing.attr.meetingPoint")),
                attrField("advanceNoticeHours", t("inv.listing.attr.advanceNotice"), "number")
              ]}
            {v === "PROPERTY" &&
              [
                attrSelect("propertyType", t("inv.listing.attr.propertyType"), [
                  ["HOUSE_SALE", t("inv.listing.prop.houseSale")],
                  ["LAND_SALE", t("inv.listing.prop.landSale")],
                  ["APARTMENT_RENT", t("inv.listing.prop.apartmentRent")],
                  ["HOUSE_RENT", t("inv.listing.prop.houseRent")],
                  ["LAND_RENT", t("inv.listing.prop.landRent")]
                ]),
                attrSelect("priceBasis", t("inv.listing.attr.priceBasis"), [
                  ["TOTAL", t("inv.listing.basis.total")],
                  ["PER_MONTH", t("inv.listing.basis.perMonth")]
                ]),
                // The sizes the website shows for this type: land its plot, a
                // house its built area and plot, an apartment its area.
                attrField(
                  "areaSqm",
                  isLand
                    ? t("inv.listing.attr.plotSize")
                    : isHouse
                      ? t("inv.listing.attr.builtArea")
                      : t("inv.listing.attr.area"),
                  "number"
                ),
                isHouse && attrField("plotSizeSqm", t("inv.listing.attr.plotSize"), "number"),
                !isLand && attrField("bedrooms", t("inv.listing.attr.bedrooms"), "number"),
                !isLand && attrField("bathrooms", t("inv.listing.attr.bathrooms"), "number"),
                attrLocalized("titleDeedStatus", t("inv.listing.attr.titleDeed"))
              ]}
          </div>
          {v === "BUS" ? (
            <TagTranslations
              disabled={!canWrite}
              words={[String(attrs.vehicleClass ?? "")]}
              value={tags}
              onChange={setTagMap}
            />
          ) : null}
          {/* Full width: each word's six other languages sit beside it. */}
          {["CAR", "ACTIVITY", "PROPERTY"].includes(v) ? (
            <div className="mt-4 grid gap-4">
              {v === "CAR" &&
                attrList(
                  "pickupLocations",
                  t("inv.listing.attr.pickupLocations"),
                  "Aéroport de Ndjili\nCentre-ville"
                )}
              {v === "ACTIVITY" && [
                attrList("languages", t("inv.listing.attr.languages"), "Français\nAnglais"),
                attrList("inclusions", t("inv.listing.attr.inclusions"), "Guide\nBoissons"),
                attrList("exclusions", t("inv.listing.attr.exclusions"), "Pourboires\nTransport")
              ]}
              {v === "PROPERTY" &&
                attrList(
                  "features",
                  t("inv.listing.attr.features"),
                  "Parking\nGroupe électrogène\nForage"
                )}
            </div>
          ) : null}
        </Card>

        {canWrite ? (
          <div className="flex items-center gap-3">
            <Button
              onClick={() =>
                // A sell price typed in francs takes the listing out of the
                // conversion, which would then leave its deposit in cents.
                centsDeposit !== undefined && formToMoney(sellPrice) !== undefined
                  ? toast.error(
                      t("inv.listing.depositStillUsd", {
                        amount: formatMoney(centsDeposit, "USD", locale)
                      })
                    )
                  : save()
              }
              disabled={
                isPending || videoBusy || !title.fr || !form.city || (isRoute && !attrs.destination)
              }
            >
              {isNew ? t("common.create") : t("common.save")}
            </Button>
            {!isNew && data?.listing.status !== "PUBLISHED" ? (
              <Button
                variant="outline"
                // Unsaved edits first: the website would get the version that
                // was saved, not the one on screen.
                disabled={Boolean(data?.publishBlockers?.length) || publishing || dirty}
                onClick={() => publish()}
              >
                {t("common.publish")}
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
                    deactivatePrompt(data?.listing.displayTitle ?? t("inv.listing.thisListing"))
                  ) && deactivate()
                }
              >
                {t("inv.listing.deactivate")}
              </Button>
            ) : null}
            {dirty ? (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                {isNew ? t("inv.listing.unsaved") : t("inv.listing.unsavedPublish")}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}

/** Monday first, as a timetable is read; the stored day is 0 = Sunday … 6 = Saturday. */
const WEEK: { day: number; label: TranslationKey }[] = [
  { day: 1, label: "inv.listing.day.mon" },
  { day: 2, label: "inv.listing.day.tue" },
  { day: 3, label: "inv.listing.day.wed" },
  { day: 4, label: "inv.listing.day.thu" },
  { day: 5, label: "inv.listing.day.fri" },
  { day: 6, label: "inv.listing.day.sat" },
  { day: 0, label: "inv.listing.day.sun" }
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
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {times.map((time, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            type="time"
            aria-label={t("inv.listing.departureN", { n: i + 1 })}
            className="w-28"
            disabled={disabled}
            value={time}
            onChange={(e) => onChange(times.map((old, n) => (n === i ? e.target.value : old)))}
          />
          {disabled ? null : (
            <Button
              variant="ghost"
              size="icon"
              title={t("inv.listing.removeTime")}
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
          {t("inv.listing.addTime")}
        </Button>
      )}
      {!times.length && disabled ? (
        <span className="text-xs text-muted-foreground">{t("inv.listing.noTimes")}</span>
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
  const { t } = useT();
  return (
    <div className="divide-y rounded-md border">
      {WEEK.map(({ day, label }) => {
        const times = week.filter((w) => w.day === day).map((w) => w.time);
        return (
          <div key={day} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <p className="w-24 text-sm">{t(label)}</p>
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
