import { DEFAULT_LOCALE } from "@/lib/i18n/dictionaries";

/**
 * §13 Clarity: money always renders with its currency, dates as DD/MM/YYYY.
 * Prices, totals and figures arrive from the API in whole francs: CDF is the
 * base, and has no minor unit.
 */

export const CURRENCIES = ["CDF", "USD", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const BASE_CURRENCY: Currency = "CDF";

const NUMBER_LOCALE: Record<string, string> = { fr: "fr-FR", en: "en-US" };

/**
 * Francs as people read them, on the website and the app too: "28 500 FC" in
 * French, "28,500 FC" in English — the panel's language, a no-break space, FC.
 * `decimals` is for a rate (francs per dollar), never for a price.
 */
export const formatFrancs = (francs: number, locale: string = DEFAULT_LOCALE, decimals = 0) =>
  `${francs.toLocaleString(NUMBER_LOCALE[locale] ?? NUMBER_LOCALE[DEFAULT_LOCALE], {
    maximumFractionDigits: decimals
  })}\u00a0FC`;

/**
 * An amount in its own currency's minor units: whole francs for CDF ("28 500
 * FC"), cents for USD and EUR, which keep the code first ("USD 60.00").
 */
export const formatMoney = (
  minor?: number | null,
  currency: string = BASE_CURRENCY,
  locale: string = DEFAULT_LOCALE
) => {
  if (minor === null || minor === undefined) return "—";
  if (currency === "CDF") return formatFrancs(minor, locale);
  return `${currency} ${(minor / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

/**
 * An order (or one of its amounts) as the office reads it: what the customer
 * was charged, with the base beside it when that was another currency —
 * "USD 60.00 (171 000 FC)". Never in the currency the viewer happens to pick.
 * `currency` is the unit of `total`: francs, or US cents on an order from
 * before francs that the conversion (migrate:cdf) has not reached yet.
 */
export const formatOrderTotal = (
  o: { total: number; currency?: string; chargedTotal?: number; chargedCurrency?: string },
  locale?: string
) => {
  const base = formatMoney(o.total, o.currency || BASE_CURRENCY, locale);
  if (!o.chargedCurrency || !o.chargedTotal || o.chargedCurrency === (o.currency || BASE_CURRENCY)) {
    return base;
  }
  return `${formatMoney(o.chargedTotal, o.chargedCurrency, locale)} (${base})`;
};

/**
 * Francs in another currency's cents, at `rates` (francs per 1 USD, per 1 EUR):
 * the API's own conversion (travel-backend fx.service `convert`). Rounded UP to
 * the cent so the office is never short; toFixed(6) first, so float noise
 * (399 FC at 2850 comes out 14.000000000000002) does not cost a cent.
 * Undefined when that currency has no rate.
 */
export const fromBase = (
  cdf: number,
  to: string,
  rates: Partial<Record<string, number | null>>
) => {
  if (to === BASE_CURRENCY) return cdf;
  const rate = rates[to];
  if (!rate || rate < 0) return undefined;
  return Math.ceil(Number((cdf / rate * 100).toFixed(6)));
};

export const formatPercent = (value?: number | null) =>
  value === null || value === undefined ? "—" : `${value.toFixed(1)}%`;

export const formatDate = (value?: string | Date | null) => {
  if (!value) return "—";
  const d = new Date(value);
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1
  ).padStart(2, "0")}/${d.getFullYear()}`;
};

export const formatDateTime = (value?: string | Date | null) => {
  if (!value) return "—";
  const d = new Date(value);
  // §13: times carry their timezone.
  return `${formatDate(d)} ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  })}`;
};

/** "in 18h" / "2h ago" — the cash-deadline chase list reads better this way. */
export const relativeTime = (value?: string | Date | null) => {
  if (!value) return "—";
  const diff = new Date(value).getTime() - Date.now();
  const hours = Math.round(Math.abs(diff) / 3600000);
  const label = hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
  return diff >= 0 ? `in ${label}` : `${label} ago`;
};

export const toISODate = (d: Date) => d.toISOString().slice(0, 10);

/** A file's size: "350 KB", "1.2 MB". */
export const formatBytes = (bytes: number) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;

export const addDays = (d: Date, n: number) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
};
