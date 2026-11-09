import type { VisaApplication, VisaStatus } from "@/api/functions/visa.api";
import { Badge } from "@/components/ui/badge";
import { formatOrderTotal } from "@/lib/functions/format.lib";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import type { AxiosError } from "axios";

/** The words, chips and small helpers the E-Visa screens share. */

/** The office's queues, in the order of the work. `new` is where a visit starts. */
export const VISA_QUEUES: { key: string; label: TranslationKey }[] = [
  { key: "new", label: "visa.queue.new" },
  { key: "in-review", label: "visa.queue.inReview" },
  { key: "info-requested", label: "visa.queue.infoRequested" },
  { key: "awaiting-payment", label: "visa.queue.awaitingPayment" },
  { key: "lodged", label: "visa.queue.lodged" },
  { key: "decided", label: "visa.queue.decided" },
  { key: "completed", label: "visa.queue.completed" },
  { key: "cancelled", label: "visa.queue.cancelled" },
  { key: "all", label: "visa.queue.all" }
];

/** Waiting on the office: amber. On the customer: sky. At the embassy: violet. */
const STATUS_STYLES: Record<VisaStatus, string> = {
  SUBMITTED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  IN_REVIEW: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  INFO_REQUESTED: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  LODGED: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  APPOINTMENT: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  REFUSED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  CANCELLED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
};

export function VisaStatusBadge({ status, className }: { status: VisaStatus; className?: string }) {
  const { t } = useT();
  return (
    <Badge variant="secondary" className={cn("whitespace-normal", STATUS_STYLES[status], className)}>
      {t(`visa.status.${status}` as TranslationKey)}
    </Badge>
  );
}

export function VisaPaymentBadge({ paid }: { paid: boolean }) {
  const { t } = useT();
  return (
    <Badge
      variant="secondary"
      className={
        paid
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
      }
    >
      {paid ? t("visa.payment.PAID") : t("visa.payment.UNPAID")}
    </Badge>
  );
}

export function RushBadge() {
  const { t } = useT();
  return (
    <Badge variant="secondary" className="bg-red-600 text-white dark:bg-red-700">
      {t("visa.rush")}
    </Badge>
  );
}

/** The service fee as charged, with its francs when that was dollars or euros. */
export const visaFee = (a: Pick<VisaApplication, "fee">, locale?: string) => {
  const f = typeof a.fee === "number" ? { CDF: a.fee } : (a.fee ?? {});
  if (f.CDF === undefined && f.chargedTotal === undefined) return "—";
  return formatOrderTotal(
    {
      total: f.CDF ?? f.chargedTotal ?? 0,
      currency: f.CDF === undefined ? f.chargedCurrency : "CDF",
      chargedTotal: f.chargedTotal,
      chargedCurrency: f.chargedCurrency
    },
    locale
  );
};

/**
 * A calendar day as DD/MM/YYYY, read from its YYYY-MM-DD part: a stay or a
 * birthday is a day, not an instant, and must not move with this computer's zone.
 */
export const day = (v?: string | null) =>
  v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10).split("-").reverse().join("/") : "—";

/**
 * An embassy appointment as typed: the day and the time of day, stored as
 * "wall clock" in UTC (the server's parseWallClock) — read back the same way,
 * never moved by this computer's zone.
 */
export const wallClock = (v?: string | null) => (v ? `${day(v)} ${v.slice(11, 16)}` : "—");

/** A country's name from its ISO code, in the panel's language. */
export const regionName = (code: string | undefined, locale: string) => {
  if (!code) return "—";
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
};

/** The refusals the office may meet, in its own words (visa.error.*); anything else in the server's. */
const KNOWN_ERRORS = [
  "VISA_UNPAID",
  "VISA_DOCUMENT_REQUIRED",
  "TRANSITION_NOT_ALLOWED",
  "VISA_CLOSED",
  "FILE_TYPE_NOT_ALLOWED",
  "FILE_TOO_LARGE"
];
type ApiError = AxiosError<{ message?: string; code?: string }>;
export const errorCode = (err: unknown) => (err as ApiError)?.response?.data?.code;
export const visaError = (err: unknown, t: ReturnType<typeof useT>["t"], fallback: string) => {
  const code = errorCode(err);
  return code && KNOWN_ERRORS.includes(code)
    ? t(`visa.error.${code}` as TranslationKey)
    : ((err as ApiError)?.response?.data?.message ?? fallback);
};

export const travellerName = (a: Pick<VisaApplication, "traveller">) =>
  [a.traveller?.firstName, a.traveller?.lastName].filter(Boolean).join(" ") || "—";
