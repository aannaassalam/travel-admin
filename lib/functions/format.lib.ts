/**
 * §13 Clarity: money always renders with an explicit currency code, dates as
 * DD/MM/YYYY. Prices arrive from the API as integer minor units in USD base.
 */

export const formatMoney = (minorUnits?: number | null, currency = "USD") => {
  if (minorUnits === null || minorUnits === undefined) return "—";
  return `${currency} ${(minorUnits / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
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

export const addDays = (d: Date, n: number) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
};
