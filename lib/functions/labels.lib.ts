/**
 * Human words for the codes the API speaks. One place, so a status is named
 * once and never reaches a screen as DOCUMENTS_PENDING again. `label()` falls
 * back to a title-cased code, so an unknown value is still readable.
 */

const titleCase = (code: string) =>
  code
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

export const humanize = (code?: string | null) => (code ? titleCase(code) : "—");

export const label = (map: Record<string, string>, code?: string | null) =>
  code ? (map[code] ?? titleCase(code)) : "—";

export const ORDER_STATUS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Awaiting confirmation",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled"
};

export const PAYMENT_STATUS: Record<string, string> = {
  UNPAID: "Unpaid",
  PENDING: "Payment pending",
  PAID: "Paid",
  FAILED: "Payment failed",
  REVERSED: "Payment reversed"
};

export const FULFILMENT_STATUS: Record<string, string> = {
  NOT_STARTED: "Not started",
  DOCUMENTS_PENDING: "Documents pending",
  DOCUMENTS_ISSUED: "Documents issued",
  DELIVERED: "Delivered"
};

export const PAYMENT_METHOD: Record<string, string> = {
  CASH: "Cash",
  ONLINE: "Online"
};

export const CHANNEL: Record<string, string> = {
  WEB: "Website",
  IOS: "iPhone app",
  ANDROID: "Android app",
  ADMIN: "Admin panel"
};

export const DOCUMENT_KIND: Record<string, string> = {
  ETICKET: "E-ticket",
  VOUCHER: "Voucher",
  INVOICE: "Invoice"
};

export const TIMELINE_EVENT: Record<string, string> = {
  ORDER_CREATED: "Booking created",
  PAYMENT_STARTED: "Payment started",
  PAYMENT_RECEIVED: "Payment received",
  PAYMENT_FAILED: "Payment failed",
  PAYMENT_METHOD_CHANGED: "Payment method changed",
  CASH_RECEIVED: "Cash received at the office",
  STATUS_CONFIRMED: "Booking confirmed",
  STATUS_COMPLETED: "Booking completed",
  STATUS_CANCELLED: "Booking cancelled",
  AUTO_CANCELLED: "Cancelled automatically — cash deadline passed",
  INVENTORY_RELEASED: "Stock released back for sale",
  DOCUMENTS_ISSUED: "Documents issued",
  DOCUMENT_REMOVED: "Document removed",
  NOTE_ADDED: "Internal note added"
};

export const CANCELLATION_REASON: Record<string, string> = {
  CASH_DEADLINE_EXPIRED: "Cash deadline expired",
  CUSTOMER_REQUEST: "Customer request",
  CANNOT_DELIVER: "We cannot deliver",
  FRAUD_OR_DUPLICATE: "Fraud or duplicate",
  OTHER: "Other"
};

export const VERTICAL: Record<string, string> = {
  HOTEL: "Hotels",
  FLIGHT: "Flights",
  BUS: "Bus",
  CAR: "Car hire",
  ACTIVITY: "Activities",
  PROPERTY: "Property",
  RESTAURANT: "Restaurants"
};

export const LISTING_STATUS: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  PAUSED: "Paused",
  EXPIRED: "Expired",
  SOLD_OUT: "Sold out",
  ARCHIVED: "Archived"
};

export const NOTIFICATION_EVENT: Record<string, string> = {
  ORDER_CREATED: "Booking created",
  ORDER_CONFIRMED: "Booking confirmed",
  ORDER_CANCELLED: "Booking cancelled",
  PAYMENT_RECEIVED: "Payment received",
  CASH_DEADLINE_REMINDER: "Cash deadline reminder",
  DOCUMENTS_ISSUED: "Documents ready",
  ENQUIRY_RECEIVED: "Enquiry received",
  QUOTE_SENT: "Quote sent"
};

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
