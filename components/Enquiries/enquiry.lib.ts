import type { Enquiry } from "@/api/functions/admin.api";
import { relativeTime } from "@/lib/functions/format.lib";

/** Pipeline order: NEW → CONTACTED → QUALIFIED → QUOTED → WON | LOST. */
export const STAGES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "QUOTED",
  "WON",
  "LOST"
] as const;

export const STAGE_LABELS: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  QUOTED: "Quoted",
  WON: "Won",
  LOST: "Lost"
};

export const STAGE_STYLES: Record<string, string> = {
  NEW: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  CONTACTED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  QUALIFIED:
    "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  QUOTED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  WON: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  LOST: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
};

export const NEXT_STAGE: Record<string, string> = {
  NEW: "CONTACTED",
  CONTACTED: "QUALIFIED",
  QUALIFIED: "QUOTED",
  QUOTED: "WON"
};

export const KIND_LABELS: Record<string, string> = {
  PROPERTY: "Property",
  REQUEST_TO_BOOK: "Request to book"
};

export const LOSS_REASONS = [
  ["PRICE", "Too expensive"],
  ["NO_AVAILABILITY", "No availability"],
  ["UNRESPONSIVE", "Stopped responding"],
  ["CHOSE_COMPETITOR", "Chose a competitor"],
  ["NOT_SERIOUS", "Not a serious enquiry"],
  ["OTHER", "Other"]
] as const;

export const lossLabel = (code?: string) =>
  LOSS_REASONS.find(([k]) => k === code)?.[1] ?? code ?? "";

/** What the customer asked about, in one short line. */
export const aboutLine = (e: Enquiry) =>
  e.listingLabel ||
  (e.vertical
    ? e.vertical.charAt(0) + e.vertical.slice(1).toLowerCase()
    : "General");

export const telHref = (phone?: string) => `tel:${phone ?? ""}`;
export const waHref = (phone?: string) =>
  `https://wa.me/${(phone ?? "").replace(/\D/g, "")}`;

const hm = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** "in 25m" below an hour, otherwise relativeTime's "in 2h" / "3h ago". */
const span = (ms: number) => {
  const abs = Math.abs(ms);
  if (abs < 3600000) return `${Math.max(1, Math.round(abs / 60000))}m`;
  const h = Math.round(abs / 3600000);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
};

/**
 * One plain-English line about time, the thing an operator scans for:
 * "Reply by 14:30 (in 2h)" · "Overdue by 3h" · "Contacted 2d ago".
 */
export const timeLine = (
  e: Enquiry
): { text: string; tone: "overdue" | "soon" | "ok" } => {
  if (e.firstContactAt) {
    return { text: `Contacted ${relativeTime(e.firstContactAt)}`, tone: "ok" };
  }
  const left = new Date(e.slaDeadline).getTime() - Date.now();
  if (left < 0) return { text: `Overdue by ${span(left)}`, tone: "overdue" };
  return {
    text: `Reply by ${hm(new Date(e.slaDeadline))} (in ${span(left)})`,
    tone: left < 3600000 ? "soon" : "ok"
  };
};

/** Board order: overdue first, then the oldest, so nothing hides at the bottom. */
export const byUrgency = (a: Enquiry, b: Enquiry) =>
  Number(b.slaBreached) - Number(a.slaBreached) ||
  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
