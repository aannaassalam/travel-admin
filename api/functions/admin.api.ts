import axiosInstance from "@/api/axiosInstance";

/** Shared response shapes for the /admin/v1 surface. */

export interface Paged<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Dashboard {
  currency: string;
  dataAsOf: string;
  periodDays: number;
  headline: {
    netRevenue: number;
    grossMargin: number;
    marginPercent: number | null;
    orders: number;
    conversionRate: number | null;
    cashOutstanding: number;
  };
  inventory: {
    atRiskValue: number;
    atRiskWindowDays: number;
    spoilageValue: number;
    sellThroughRate: number | null;
  };
  actions: Record<string, number>;
}

export const getDashboard = async (days = 30) =>
  (await axiosInstance.get<Dashboard>(`/dashboard?days=${days}`)).data;

// --- Inventory --------------------------------------------------------------

/** Localised text: one entry per locale. */
export type Localized = Partial<Record<string, string>>;
/** Per-currency prices in integer minor units. USD is the reporting base. */
export type Money = Partial<Record<"USD" | "CDF" | "EUR", number>>;

export interface Hotel {
  id: string;
  name: Localized;
  /** Resolved for lists and headings — falls back through the locales. */
  displayName: string;
  city: string;
  status: string;
  stars: number;
  supplier?: string;
  images: string[];
  description: Record<string, string>;
  translations: Record<string, boolean>;
  version: number;
  updatedAt: string;
}

export interface RoomType {
  id: string;
  name: Localized;
  displayName: string;
  maxAdults: number;
  maxChildren: number;
  beds: string;
  status: string;
}

export interface CalendarCell {
  id: string;
  roomTypeId: string;
  date: string;
  costPrice: Money;
  sellPrice: Money;
  /** Base-currency amounts — what the grid and all reporting show. */
  costPriceBase: number;
  sellPriceBase: number;
  /** Currencies this night is actually sellable in. */
  currencies: string[];
  allotment: number;
  sold: number;
  held: number;
  available: number;
  margin: number;
  blocked: boolean;
}

export const listHotels = async (params: { q?: string; status?: string } = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][]
  );
  return (await axiosInstance.get<Paged<Hotel>>(`/hotels?${qs}`)).data;
};

export const getHotel = async (id: string) =>
  (
    await axiosInstance.get<{ hotel: Hotel; roomTypes: RoomType[] }>(
      `/hotels/${id}`
    )
  ).data;

export const createHotel = async (body: Record<string, unknown>) =>
  (await axiosInstance.post<{ hotel: Hotel }>("/hotels", body)).data;

export const updateHotel = async (id: string, body: Record<string, unknown>) =>
  (await axiosInstance.patch<{ hotel: Hotel }>(`/hotels/${id}`, body)).data;

export const publishHotel = async (id: string) =>
  (await axiosInstance.post<{ hotel: Hotel }>(`/hotels/${id}/publish`, {})).data;

export const duplicateHotel = async (id: string) =>
  (await axiosInstance.post<{ hotel: Hotel }>(`/hotels/${id}/duplicate`, {})).data;

/**
 * Archive, which is what "delete" means for inventory here.
 *
 * The server sets `status: ARCHIVED` rather than removing the document, and
 * records it in the audit log as a DELETE. That is deliberate: orders point at
 * the inventory they sold, so a hard delete would orphan booking history and
 * leave the office with revenue it cannot attribute. An archived item leaves
 * the catalogue and stays reportable.
 */
export const archiveHotel = async (id: string, reason?: string) =>
  (await axiosInstance.post<{ hotel: Hotel }>(`/hotels/${id}/archive`, { reason })).data;

export const getCalendar = async (id: string, from: string, to: string) =>
  (
    await axiosInstance.get<{ roomTypes: RoomType[]; cells: CalendarCell[] }>(
      `/hotels/${id}/calendar?from=${from}&to=${to}`
    )
  ).data;

export interface CalendarBulkPayload {
  roomTypeId: string;
  from: string;
  to: string;
  costPrice?: Money;
  sellPrice?: Money;
  allotment?: number;
  blocked?: boolean;
  /** §5.1 price-change guard: set after the typed confirmation. */
  confirmPriceChange?: boolean;
}

export const bulkUpdateCalendar = async (
  id: string,
  body: CalendarBulkPayload
) =>
  (await axiosInstance.post<{ cells: CalendarCell[] }>(`/hotels/${id}/calendar`, body))
    .data;

// --- Bookings ---------------------------------------------------------------

export interface OrderRow {
  id: string;
  reference: string;
  status: string;
  paymentStatus: string;
  fulfilmentStatus: string;
  total: number;
  currency: string;
  paymentMethod: string;
  cashDeadline?: string;
  travelDate?: string;
  customer?: { id: string; fullName: string; phoneMasked?: string };
  createdAt: string;
}

export const listOrders = async (queue: string, q?: string) =>
  (
    await axiosInstance.get<Paged<OrderRow>>(
      `/orders?queue=${queue}${q ? `&q=${encodeURIComponent(q)}` : ""}`
    )
  ).data;

export const getQueueCounts = async () =>
  (await axiosInstance.get<Record<string, number>>("/orders/queue-counts")).data;

/** Mirrors the backend's orderDetailFields allow-list (dto/admin/order.dto.ts). */
export interface OrderItem {
  id: string;
  vertical: string;
  listingLabel: string;
  startDate?: string;
  endDate?: string;
  quantity: number;
  unitSellPrice: number;
  /** Admin surface only — cost and margin never reach the public API. */
  unitCostPrice: number;
  margin: number;
  lineTotal: number;
}

export interface Traveller {
  id: string;
  firstName?: string;
  lastName?: string;
  documentType?: string;
  /** §6.2: masked by default; unmasking is step-up gated and logged. */
  documentNumberMasked?: string;
}

export interface TimelineEvent {
  at: string;
  event: string;
  detail?: string;
  reason?: string;
  actorEmail?: string;
}

export interface OrderDocument {
  id: string;
  kind: string;
  fileName: string;
  version: number;
  uploadedAt: string;
}

export interface OrderDetail extends Omit<OrderRow, "customer"> {
  channel?: string;
  customer?: { id: string; fullName: string; phone?: string; email?: string };
  items: OrderItem[];
  travellers: Traveller[];
  /** Restaurant orders only — what a dispatcher needs to send a driver. */
  delivery?: {
    address: string;
    zoneId?: string;
    zoneName?: string;
    fee: number;
    feeCharged: number;
    etaMinutes?: number;
    notes?: string;
  };
  timeline: TimelineEvent[];
  documents: OrderDocument[];
  consent?: {
    policyVersionLabel: string;
    locale: string;
    acceptedAt: string;
    ip: string;
    textShown: string;
  };
  internalNotes?: string;
  version: number;
}

export const getOrder = async (id: string) =>
  (await axiosInstance.get<{ order: OrderDetail }>(`/orders/${id}`)).data.order;

export const transitionOrder = async (
  id: string,
  body: { to: string; reason: string; cancellationReason?: string }
) => (await axiosInstance.post(`/orders/${id}/transition`, body)).data;

export const markCashReceived = async (id: string, reason: string) =>
  (await axiosInstance.post(`/orders/${id}/cash-received`, { reason })).data;

// --- Customers --------------------------------------------------------------

export interface CustomerRow {
  id: string;
  fullName: string;
  /** §8: masked in list views. A screenshot must not be a customer database. */
  phoneMasked: string;
  city?: string;
  isBlocked: boolean;
  noShowCount: number;
  createdAt: string;
}

export const listCustomers = async (q?: string) =>
  (
    await axiosInstance.get<Paged<CustomerRow>>(
      `/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`
    )
  ).data;

export interface CustomerDetail extends CustomerRow {
  firstName: string;
  lastName: string;
  /** Full number — the detail screen is where it is legitimately revealed. */
  phone: string;
  email?: string;
  locale: string;
  internalNotes: string;
  version: number;
}

export const getCustomer = async (id: string) =>
  (
    await axiosInstance.get<{
      customer: CustomerDetail;
      orders: OrderRow[];
      lifetimeValue: number;
    }>(`/customers/${id}`)
  ).data;

export const updateCustomer = async (
  id: string,
  body: Record<string, unknown>
) =>
  (await axiosInstance.patch<{ customer: CustomerDetail }>(`/customers/${id}`, body))
    .data;

// --- Audit log --------------------------------------------------------------

export interface AuditLogRow {
  id: string;
  actorEmail: string;
  action: string;
  entityType?: string;
  entityId?: string;
  reason?: string;
  ip: string;
  createdAt: string;
}

export const listAuditLogs = async (params: Record<string, string> = {}) =>
  (
    await axiosInstance.get<Paged<AuditLogRow>>(
      `/audit-logs?${new URLSearchParams(params)}`
    )
  ).data;

// --- Enquiries (§7) ---------------------------------------------------------

export interface Enquiry {
  id: string;
  reference: string;
  kind: string;
  stage: string;
  customerName: string;
  phone: string;
  email?: string;
  message: string;
  listingLabel?: string;
  quotedAmount?: number;
  lossReason?: string;
  /** Server-computed so every client agrees on what "breached" means. */
  slaBreached: boolean;
  hoursWaiting: number | null;
  slaDeadline: string;
  createdAt: string;
}

export const listEnquiries = async (stage?: string) =>
  (
    await axiosInstance.get<Paged<Enquiry> & { slaHours: number }>(
      `/enquiries${stage ? `?stage=${stage}` : ""}`
    )
  ).data;

export const setEnquiryStage = async (
  id: string,
  body: { stage: string; lossReason?: string; detail?: string }
) => (await axiosInstance.post(`/enquiries/${id}/stage`, body)).data;

// --- Payments (§9.1) --------------------------------------------------------

export interface Payment {
  id: string;
  reference: string;
  customerName: string;
  method: string;
  status: string;
  amount: number;
  currency: string;
  paidAt?: string;
  createdAt: string;
}

export const listPayments = async () =>
  (await axiosInstance.get<Paged<Payment>>("/payments")).data;

// --- Content: policies (§10) ------------------------------------------------

export interface PolicyVersion {
  id: string;
  kind: string;
  locale: string;
  label: string;
  body: string;
  isLive: boolean;
  createdAt: string;
}

export const listPolicies = async () =>
  (await axiosInstance.get<{ items: PolicyVersion[] }>("/policies")).data;

export const createPolicyVersion = async (body: {
  kind: string;
  locale: string;
  label: string;
  body: string;
}) => (await axiosInstance.post("/policies", body)).data;

export const setPolicyLive = async (id: string) =>
  (await axiosInstance.post(`/policies/${id}/publish`, {})).data;

// --- Settings (§12) ---------------------------------------------------------

export interface Settings {
  companyName: string;
  supportEmail: string;
  supportPhone: string;
  whatsappNumber: string;
  streetAddress: string;
  city: string;
  country: string;
  officeHours: string;
  defaultLocale: string;
  baseCurrency: string;
  priceChangeGuardPercent: number;
  holdTtlOnlineMinutes: number;
  holdTtlCashHours: number;
  maxConcurrentCashHolds: number;
  customerExportRowCap: number;
  exceptionRateAlertPercent: number;
  atRiskWindowDays: number;
  enquirySlaHours: number;
  passportRetentionDays: number;
  maintenanceMode: boolean;
  updatedAt: string;
}

export const getSettings = async () =>
  (await axiosInstance.get<{ settings: Settings }>("/settings")).data.settings;

/** §1.3: step-up gated — a 403 here means re-authentication is required. */
export const updateSettings = async (body: Partial<Settings> & { reason?: string }) =>
  (await axiosInstance.patch<{ settings: Settings }>("/settings", body)).data;

export const stepUp = async (password: string) =>
  (await axiosInstance.post("/auth/step-up", { password })).data;

// --- Security (§14) ---------------------------------------------------------

export interface SecurityOverview {
  currentSessionId: string;
  sessions: {
    id: string;
    deviceLabel: string;
    ip: string;
    createdAt: string;
    lastSeenAt: string;
  }[];
  exportLog: {
    id: string;
    action: string;
    actorEmail: string;
    ip: string;
    rows?: number;
    createdAt: string;
  }[];
  recentFailedLogins: {
    id: string;
    actorEmail: string;
    ip: string;
    reason?: string;
    createdAt: string;
  }[];
  alertChannelConfigured: boolean;
}

export const getSecurity = async () =>
  (await axiosInstance.get<SecurityOverview>("/security")).data;

export const revokeOtherSessions = async () =>
  (await axiosInstance.delete("/auth/sessions/others")).data;

// --- Listings: flights, bus, cars, activities, properties (§5.2) ------------

export interface Listing {
  id: string;
  vertical: string;
  title: Localized;
  displayTitle: string;
  status: string;
  city: string;
  images: string[];
  supplier?: string;
  costPrice: Money;
  sellPrice: Money;
  costPriceBase: number;
  sellPriceBase: number;
  currencies: string[];
  margin: number;
  quantityTotal: number;
  quantitySold: number;
  available: number;
  validFrom?: string;
  validUntil?: string;
  attributes: Record<string, unknown>;
  translations: Record<string, boolean>;
  version: number;
  updatedAt: string;
}

export const listListings = async (
  params: { vertical?: string; q?: string; status?: string } = {}
) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][]
  );
  return (await axiosInstance.get<Paged<Listing>>(`/listings?${qs}`)).data;
};

export const getListing = async (id: string) =>
  (
    await axiosInstance.get<{ listing: Listing; publishBlockers: string[] }>(
      `/listings/${id}`
    )
  ).data;

export const createListing = async (body: Record<string, unknown>) =>
  (await axiosInstance.post<{ listing: Listing }>("/listings", body)).data;

export const updateListing = async (id: string, body: Record<string, unknown>) =>
  (await axiosInstance.patch<{ listing: Listing }>(`/listings/${id}`, body)).data;

export const publishListing = async (id: string) =>
  (await axiosInstance.post(`/listings/${id}/publish`, {})).data;

export const duplicateListing = async (id: string, body: Record<string, unknown> = {}) =>
  (await axiosInstance.post(`/listings/${id}/duplicate`, body)).data;

/** Soft delete — see `archiveHotel` for why inventory is never hard-deleted. */
export const archiveListing = async (id: string, reason?: string) =>
  (await axiosInstance.post(`/listings/${id}/archive`, { reason })).data;

export const expandRecurrence = async (
  id: string,
  body: { frequency: string; daysOfWeek?: number[]; until: string }
) => (await axiosInstance.post(`/listings/${id}/expand-recurrence`, body)).data;

/** §2.2: dry-run by default; commit only after a clean report. */
export interface ImportReport {
  dryRun?: boolean;
  rows: number;
  validRows: number;
  errors: { row: number; field: string; message: string }[];
  canCommit: boolean;
  created?: number;
}

export const importListingsCsv = async (body: {
  vertical: string;
  csv: string;
  commit?: boolean;
}) => (await axiosInstance.post<ImportReport>("/listings/import", body)).data;

// --- Hotels: create / room types --------------------------------------------

export const createHotelFull = async (body: Record<string, unknown>) =>
  (await axiosInstance.post<{ hotel: Hotel }>("/hotels", body)).data;

export const createRoomType = async (hotelId: string, body: Record<string, unknown>) =>
  (await axiosInstance.post(`/hotels/${hotelId}/room-types`, body)).data;

export const updateRoomType = async (
  hotelId: string,
  roomTypeId: string,
  body: Record<string, unknown>
) => (await axiosInstance.patch(`/hotels/${hotelId}/room-types/${roomTypeId}`, body)).data;

// --- Notifications (§11) ----------------------------------------------------

export interface NotificationTemplate {
  id: string;
  event: string;
  channel: string;
  subject: string;
  body: string;
  isActive: boolean;
  updatedAt: string;
}

export const listTemplates = async () =>
  (
    await axiosInstance.get<{
      items: NotificationTemplate[];
      variables: string[];
      events: string[];
      deliveryLog: {
        id: string;
        event: string;
        channel: string;
        recipient: string;
        status: string;
        /** Exactly what was sent - support gets asked what the customer read. */
        body?: string;
        /** Provider reference, or the reason it failed. */
        providerMessage?: string;
        createdAt: string;
      }[];
      smsCostMinor: number;
    }>("/notifications/templates")
  ).data;

export const saveTemplate = async (body: {
  event: string;
  channel: string;
  subject?: string;
  body: string;
}) => (await axiosInstance.put("/notifications/templates", body)).data;

export const sendTestNotification = async (body: {
  event: string;
  channel: string;
  body: string;
  /** Overrides the admin's own number for this send. */
  to?: string;
}) =>
  (await axiosInstance.post<{ preview: string; delivered: boolean }>(
    "/notifications/test",
    body
  )).data;

// --- File uploads -----------------------------------------------------------

export interface StoredFile {
  key: string;
  /** Present for public files only. Private ones must use a signed link. */
  url?: string;
  originalName: string;
  mimeType: string;
  size: number;
  visibility: "public" | "private";
}

/**
 * Uploads through the backend's storage adapter. The response carries whatever
 * URL that adapter produced, so switching local disk → S3 needs no change here.
 */
export const uploadFiles = async (
  files: File[],
  opts: { folder: string; visibility?: "public" | "private" }
) => {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  fd.append("folder", opts.folder);
  fd.append("visibility", opts.visibility ?? "public");
  return (
    await axiosInstance.post<{ files: StoredFile[] }>("/uploads", fd, {
      // Let the browser set the multipart boundary itself.
      headers: { "Content-Type": undefined }
    })
  ).data;
};

/** §6.5: private documents are only ever reachable via a short-lived link. */
export const getSignedFileUrl = async (key: string) =>
  (
    await axiosInstance.post<{ url: string; expiresInSeconds: number }>(
      "/uploads/signed-link",
      { key }
    )
  ).data;

/* -------------------------------------------------------------- locations */

export interface ServiceLocation {
  id: string;
  name: string;
  slug: string;
  country: string;
  province?: string;
  kind: "CITY" | "AIRPORT" | "STATION";
  iata?: string;
  aliases: string[];
  servesVerticals: string[];
  isActive: boolean;
  sortOrder: number;
  image?: string;
  /** Published listings naming this place — check before switching one off. */
  listingCount: number;
}

export const listLocations = async () =>
  (await axiosInstance.get<{ items: ServiceLocation[] }>("/locations")).data;

export const createLocation = async (body: Partial<ServiceLocation>) =>
  (await axiosInstance.post<{ location: ServiceLocation }>("/locations", body)).data;

export const updateLocation = async (id: string, body: Partial<ServiceLocation>) =>
  (await axiosInstance.patch<{ location: ServiceLocation }>(`/locations/${id}`, body)).data;

export interface ServicedRoute {
  id: string;
  vertical: string;
  origin: ServiceLocation | null;
  destination: ServiceLocation | null;
  isActive: boolean;
}

export const listRoutes = async (vertical?: string) =>
  (
    await axiosInstance.get<{ items: ServicedRoute[] }>(
      `/routes${vertical ? `?vertical=${vertical}` : ""}`
    )
  ).data;

export const createRoute = async (body: {
  vertical: string;
  originId: string;
  destinationId: string;
}) => (await axiosInstance.post<{ route: ServicedRoute }>("/routes", body)).data;

export const updateRoute = async (id: string, body: { isActive: boolean }) =>
  (await axiosInstance.patch<{ route: ServicedRoute }>(`/routes/${id}`, body)).data;

// --- Restaurants and menus ---------------------------------------------------

export interface DeliveryZone {
  id?: string;
  name: string;
  fee: Money;
  minOrder?: Money;
  etaMinutes: number;
  isActive: boolean;
}

export interface Restaurant {
  id: string;
  name: Localized;
  displayName: string;
  slug: string;
  description: Localized;
  status: string;
  cuisines: string[];
  address: string;
  city: string;
  country: string;
  images: string[];
  openingHours: string;
  prepTimeMinutes: number;
  phone?: string;
  rating?: number;
  reviewCount?: number;
  deliveryZones: DeliveryZone[];
  translations: Record<string, boolean>;
  /** Why the publish button is refusing, straight from the server check. */
  publishBlockers: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MenuItem {
  id: string;
  restaurantId: string;
  section: string;
  name: Localized;
  displayName: string;
  description: Localized;
  /** Admin-only, and required — margin reporting depends on it (§5). */
  costPrice: Money;
  sellPrice: Money;
  marginBase: number;
  images: string[];
  isAvailable: boolean;
  sortOrder: number;
  status: string;
  version: number;
}

export const listRestaurants = async (params: { q?: string; status?: string } = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][]
  );
  return (await axiosInstance.get<Paged<Restaurant>>(`/restaurants?${qs}`)).data;
};

export const getRestaurant = async (id: string) =>
  (
    await axiosInstance.get<{ restaurant: Restaurant; menu: MenuItem[] }>(
      `/restaurants/${id}`
    )
  ).data;

export const createRestaurant = async (body: Record<string, unknown>) =>
  (await axiosInstance.post<{ restaurant: Restaurant }>("/restaurants", body)).data;

export const updateRestaurant = async (id: string, body: Record<string, unknown>) =>
  (await axiosInstance.patch<{ restaurant: Restaurant }>(`/restaurants/${id}`, body)).data;

export const publishRestaurant = async (id: string) =>
  (await axiosInstance.post<{ restaurant: Restaurant }>(`/restaurants/${id}/publish`, {}))
    .data;

/** Soft delete — see `archiveHotel` for why inventory is never hard-deleted. */
export const archiveRestaurant = async (id: string, reason?: string) =>
  (await axiosInstance.post<{ restaurant: Restaurant }>(`/restaurants/${id}/archive`, { reason }))
    .data;

export const createMenuItem = async (id: string, body: Record<string, unknown>) =>
  (await axiosInstance.post<{ item: MenuItem }>(`/restaurants/${id}/menu`, body)).data;

export const updateMenuItem = async (
  id: string,
  menuItemId: string,
  body: Record<string, unknown>
) =>
  (await axiosInstance.patch<{ item: MenuItem }>(`/restaurants/${id}/menu/${menuItemId}`, body))
    .data;

export const archiveMenuItem = async (id: string, menuItemId: string) =>
  (
    await axiosInstance.post<{ item: MenuItem }>(
      `/restaurants/${id}/menu/${menuItemId}/archive`,
      {}
    )
  ).data;
