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
  PAYMENT_RETURNED: "Customer came back from the payment page",
  PAYMENT_NOTIFIED: "MaxiCash notice not understood",
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
  RESTAURANT: "Restaurants",
  TRANSFER: "Transfers"
};

/**
 * INACTIVE and PUBLISHED are the two the office chooses between. The rest are
 * outcomes: a departure that has passed, stock that has run out, an archive.
 */
export const LISTING_STATUS: Record<string, string> = {
  INACTIVE: "Inactive",
  PUBLISHED: "Published",
  EXPIRED: "Expired",
  SOLD_OUT: "Sold out",
  ARCHIVED: "Archived"
};

/** What taking something down means, asked before it happens. */
export const deactivatePrompt = (name: string) =>
  `Deactivate “${name}”?\n\nIt can no longer be booked from this moment, and disappears from the website within a few minutes. Existing bookings are not affected, and you can publish it again whenever you like.`;

export const NOTIFICATION_EVENT: Record<string, string> = {
  ORDER_CREATED: "Booking created",
  ORDER_CONFIRMED: "Booking confirmed",
  ORDER_COMPLETED: "Booking completed",
  ORDER_CANCELLED: "Booking cancelled",
  PAYMENT_RECEIVED: "Payment received",
  CASH_DEADLINE_REMINDER: "Cash deadline reminder",
  DOCUMENTS_ISSUED: "Documents ready",
  ENQUIRY_RECEIVED: "Enquiry received",
  QUOTE_SENT: "Quote sent",
  // Transfers: to the customer, to the driver, and the alert to the office.
  TRANSFER_BOOKED: "Transfer: ride booked (cash to the driver)",
  TRANSFER_ASSIGNED: "Transfer: driver assigned",
  TRANSFER_STARTED: "Transfer: ride started",
  TRANSFER_COMPLETED: "Transfer: ride completed",
  DRIVER_RIDE_ASSIGNED: "Driver: new ride",
  DRIVER_RIDE_REMOVED: "Driver: ride taken off them",
  DRIVER_WELCOME: "Driver: welcome",
  TRANSFER_ALERT: "Transfer: security alert (to the office)",
  // The office's own e-mail at each stage of a booking: in the delivery log
  // only, written by the server (no template).
  OFFICE_NEW: "Office e-mail: new booking",
  OFFICE_NEW_PAID: "Office e-mail: new booking, paid online",
  OFFICE_PAID: "Office e-mail: payment received",
  OFFICE_CONFIRMED: "Office e-mail: booking confirmed",
  OFFICE_DOCUMENTS: "Office e-mail: documents attached",
  OFFICE_COMPLETED: "Office e-mail: booking completed"
};

const APP_ONLY = "App only — not texted";
const TO_DRIVER = "Texted (drivers have no app)";

/**
 * How each event's message travels, shown under its templates. A customer
 * with the app is pushed first; a text goes only where these say so.
 */
export const NOTIFICATION_ROUTE: Record<string, string> = {
  ORDER_CONFIRMED: "Texted when a cash booking is made · app only when the office confirms",
  PAYMENT_RECEIVED: "Texted when an online payment completes a new booking · app only otherwise",
  TRANSFER_BOOKED: "Texted when a cash ride is booked · app only when the office confirms",
  ORDER_COMPLETED: "Texted and sent to the app · app only for a ride that has already ended",
  TRANSFER_COMPLETED: "Texted and sent to the app",
  DOCUMENTS_ISSUED: APP_ONLY,
  ORDER_CANCELLED: APP_ONLY,
  CASH_DEADLINE_REMINDER: APP_ONLY,
  TRANSFER_ASSIGNED: APP_ONLY,
  TRANSFER_STARTED: APP_ONLY,
  ENQUIRY_RECEIVED: APP_ONLY,
  QUOTE_SENT: APP_ONLY,
  DRIVER_RIDE_ASSIGNED: TO_DRIVER,
  DRIVER_RIDE_REMOVED: TO_DRIVER,
  DRIVER_WELCOME: TO_DRIVER,
  TRANSFER_ALERT: "Texted (safety)"
};

/** A delivery-log row's outcome; the others read fine title-cased (Sent, Failed). */
export const DELIVERY_STATUS: Record<string, string> = {
  // Deliberately not texted, and no app to push to: not a failure.
  SKIPPED: "Not sent"
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
