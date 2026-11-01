import { isRtl, numberLocale } from "@/lib/i18n/dictionaries";
import { currentLocale } from "@/lib/i18n/messages";

/**
 * §13 Clarity: money always renders with its currency, dates as DD/MM/YYYY.
 * Prices, totals and figures arrive from the API in whole francs: CDF is the
 * base, and has no minor unit. `locale` is the panel language; left out, the
 * one the panel is showing.
 */

export const CURRENCIES = ["CDF", "USD", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const BASE_CURRENCY: Currency = "CDF";

/**
 * The currency this device reads franc amounts in, and the office's rates
 * (francs per 1 unit). Set by the DisplayCurrencyProvider as it renders; francs
 * until it has rates. Never sent anywhere: another admin's panel is unaffected.
 */
let display: { currency: string; rates: Partial<Record<string, number | null>> } = {
  currency: BASE_CURRENCY,
  rates: {}
};
export const setDisplayCurrency = (currency: string, rates: Partial<Record<string, number | null>>) => {
  display = { currency, rates };
};
export const displayCurrency = () => display.currency;

const num = (n: number, locale: string, min: number, max: number) =>
  n.toLocaleString(numberLocale(locale), { minimumFractionDigits: min, maximumFractionDigits: max });

/** In Arabic an amount sits in right-to-left text: isolated left to right (invisible LRI…PDI marks), so it stays one piece. */
const isolate = (text: string, locale: string) => (isRtl(locale) ? `\u2066${text}\u2069` : text);

/** Cents of USD or EUR, code first: "USD 60.00". */
const formatCents = (cents: number, currency: string, locale: string) =>
  isolate(`${currency} ${num(cents / 100, locale, 2, 2)}`, locale);

/**
 * Francs written as francs whatever currency the panel is read in: a rate, the
 * francs a money box will save, a figure about francs themselves. "28 500 FC"
 * in French, "28,500 FC" in English — a no-break space, FC.
 */
export const formatFC = (francs: number, locale: string = currentLocale(), decimals = 0) =>
  isolate(`${num(francs, locale, 0, decimals)}\u00a0FC`, locale);

/**
 * A franc amount as this device reads it: francs, or converted at the office's
 * rate into the display currency ("USD 10.00"), exactly as fromBase converts.
 * `decimals` is for a rate (francs per dollar), never for a price, and a rate
 * stays in francs.
 */
export const formatFrancs = (francs: number, locale: string = currentLocale(), decimals = 0) => {
  const cents =
    decimals || display.currency === BASE_CURRENCY
      ? undefined
      : fromBase(francs, display.currency, display.rates);
  return cents === undefined
    ? formatFC(francs, locale, decimals)
    : formatCents(cents, display.currency, locale);
};

/**
 * An amount in its own currency's minor units: whole francs for CDF (shown in
 * the display currency, see formatFrancs), cents for USD and EUR, which stay
 * in their own currency with the code first ("USD 60.00").
 */
export const formatMoney = (
  minor?: number | null,
  currency: string = BASE_CURRENCY,
  locale: string = currentLocale()
) => {
  if (minor === null || minor === undefined) return "—";
  if (currency === "CDF") return formatFrancs(minor, locale);
  return formatCents(minor, currency, locale);
};

/**
 * An order (or one of its amounts) as the office reads it: what the customer
 * was charged, with the base beside it when that was another currency —
 * "USD 60.00 (171 000 FC)". The base follows the display currency; read in
 * the currency it was charged in, the charge alone is shown (the base turned
 * back at today's rate would only repeat it, slightly off).
 * `currency` is the unit of `total`: francs, or US cents on an order from
 * before francs that the conversion (migrate:cdf) has not reached yet.
 */
export const formatOrderTotal = (
  o: { total: number; currency?: string; chargedTotal?: number; chargedCurrency?: string },
  locale?: string
) => {
  const unit = o.currency || BASE_CURRENCY;
  const base = formatMoney(o.total, unit, locale);
  if (!o.chargedCurrency || !o.chargedTotal || o.chargedCurrency === unit) {
    return base;
  }
  const charged = formatMoney(o.chargedTotal, o.chargedCurrency, locale);
  return unit === BASE_CURRENCY && o.chargedCurrency === display.currency
    ? charged
    : `${charged} (${base})`;
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

/** Whole francs for an amount typed in another currency at `rate` francs per unit (a money box). */
export const toBase = (amount: number, rate: number) => Math.round(Number((amount * rate).toFixed(6)));

export const formatPercent = (value?: number | null, locale: string = currentLocale()) =>
  value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat(numberLocale(locale), {
        style: "percent",
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      }).format(value / 100);

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
  return `${formatDate(d)} ${d.toLocaleTimeString(numberLocale(currentLocale()), {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  })}`;
};

/**
 * "in 18h" / "2d ago" — the cash-deadline chase list reads better this way.
 * In the panel's language; English keeps its short form.
 */
export const relativeTime = (value?: string | Date | null, locale: string = currentLocale()) => {
  if (!value) return "—";
  const diff = new Date(value).getTime() - Date.now();
  const hours = Math.round(Math.abs(diff) / 3600000);
  const [n, unit] = hours < 24 ? [hours, "hour" as const] : [Math.round(hours / 24), "day" as const];
  return new Intl.RelativeTimeFormat(numberLocale(locale), {
    style: locale === "en" ? "narrow" : "short"
  }).format(diff >= 0 ? n : -n, unit);
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
