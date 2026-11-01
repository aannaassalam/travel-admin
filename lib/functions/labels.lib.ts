/**
 * Human words for the codes the API speaks. One place, so a status is named
 * once and never reaches a screen as DOCUMENTS_PENDING again. `label()` falls
 * back to a title-cased code, so an unknown value is still readable.
 *
 * The words are in the panel's language at the moment they are read: each map
 * entry reads `label.<map>.<CODE>` from lib/i18n/dictionaries.ts. MAP[code],
 * label(MAP, code) and Object.entries(MAP) all follow a change of language,
 * as long as they run while rendering (a copy made at module level keeps the
 * words of the language the panel had when the file loaded).
 */

import { en } from "@/lib/i18n/dictionaries";
import { tr, type TranslationKey } from "@/lib/i18n/messages";

const titleCase = (code: string) =>
  code
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

export const humanize = (code?: string | null) => (code ? titleCase(code) : "—");

export const label = (map: Record<string, string>, code?: string | null) =>
  code ? (map[code] ?? titleCase(code)) : "—";

/** CODE → words: every key under `prefix.` in the dictionaries, plus `more`. */
const inLanguage = (prefix: string, more: Record<string, TranslationKey> = {}) => {
  const map: Record<string, string> = {};
  const keys = Object.keys(en).filter((k) => k.startsWith(`${prefix}.`)) as TranslationKey[];
  const codes: [string, TranslationKey][] = [
    ...keys.map((k): [string, TranslationKey] => [k.slice(prefix.length + 1), k]),
    ...Object.entries(more)
  ];
  for (const [code, key] of codes) {
    Object.defineProperty(map, code, { enumerable: true, get: () => tr(key) });
  }
  return map;
};

export const ORDER_STATUS = inLanguage("label.order");
export const PAYMENT_STATUS = inLanguage("label.payment");
export const FULFILMENT_STATUS = inLanguage("label.fulfilment");
export const PAYMENT_METHOD = inLanguage("label.method");
export const CHANNEL = inLanguage("label.channel");
export const DOCUMENT_KIND = inLanguage("label.document");
export const TIMELINE_EVENT = inLanguage("label.timeline");
export const CANCELLATION_REASON = inLanguage("label.cancel");
export const VERTICAL = inLanguage("label.vertical");

/**
 * INACTIVE and PUBLISHED are the two the office chooses between. The rest are
 * outcomes: a departure that has passed, stock that has run out, an archive.
 */
export const LISTING_STATUS = inLanguage("label.listing");

/** What taking something down means, asked before it happens. */
export const deactivatePrompt = (name: string) => tr("label.deactivatePrompt", { name });

/**
 * Every event a message goes out for: to the customer, to a driver, the
 * transfer alert to the office, and the office's own e-mails (in the delivery
 * log only, written by the server).
 */
export const NOTIFICATION_EVENT = inLanguage("label.notification");

const APP_ONLY: TranslationKey = "label.routeAppOnly";
const TO_DRIVER: TranslationKey = "label.routeToDriver";

/**
 * How each event's message travels, shown under its templates. A customer
 * with the app is pushed first; a text goes only where these say so.
 */
export const NOTIFICATION_ROUTE = inLanguage("label.route", {
  DOCUMENTS_ISSUED: APP_ONLY,
  ORDER_CANCELLED: APP_ONLY,
  CASH_DEADLINE_REMINDER: APP_ONLY,
  TRANSFER_ASSIGNED: APP_ONLY,
  TRANSFER_STARTED: APP_ONLY,
  ENQUIRY_RECEIVED: APP_ONLY,
  QUOTE_SENT: APP_ONLY,
  DRIVER_RIDE_ASSIGNED: TO_DRIVER,
  DRIVER_RIDE_REMOVED: TO_DRIVER,
  DRIVER_WELCOME: TO_DRIVER
});

/**
 * A delivery-log row's outcome; the others read fine title-cased (Sent,
 * Failed). SKIPPED: deliberately not texted, and no app to push to — not a failure.
 */
export const DELIVERY_STATUS = inLanguage("label.delivery");

/** Any status code from any of the maps above — for mixed chips. */
export const anyStatus = (code?: string | null) =>
  label(
    {
      ...ORDER_STATUS,
      ...PAYMENT_STATUS,
      ...FULFILMENT_STATUS,
      ...LISTING_STATUS
    },
    code
  );
