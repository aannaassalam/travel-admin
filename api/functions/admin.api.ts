import axiosInstance from "@/api/axiosInstance";

/** Shared response shapes for the /admin/v1 surface. */

export interface Paged<T> {
  items: T[];
  /** Everything the filter matches, not only the rows on this page. */
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  /** For the one screen that scrolls instead of paging (the enquiries board). */
  nextCursor: string | null;
}

/** Which page of a list, and how long a page is. The server caps `limit` at 100. */
export interface PageParams {
  page?: number;
  limit?: number;
  /**
   * A column of the list's table to order by: its key for first to last,
   * "-key" for last to first; the list's own order when left out. The keys
   * are the ones each list's endpoint allows (see `sortBy` on the server).
   */
  sort?: string;
}

/** An inclusive run of whole days, as the two date pickers send it. */
export interface DateRange {
  /** YYYY-MM-DD */
  from: string;
  /** YYYY-MM-DD, counted in full. */
  to: string;
}

/** Current period value with the same-length window immediately before it. */
export interface Delta {
  value: number;
  previous: number;
}

export interface DashboardOrder {
  id: string;
  reference: string;
  customerName: string;
  services: string[];
  /** As on OrderRow: the base in `currency`, and what the customer was charged. */
  total: number;
  currency?: string;
  chargedTotal?: number;
  chargedCurrency?: string;
  paymentStatus: string;
  paymentMethod: string;
  status: string;
  createdAt: string;
}

/** Money is whole francs (CDF). Mirrors controllers/admin/dashboardController. */
export interface Dashboard {
  currency: string;
  /** Francs per 1 USD and per 1 EUR today, for each currency that has a rate. */
  rates: { USD?: number; EUR?: number };
  dataAsOf: string;
  /** `days` is the inclusive length of the chosen range. */
  period: { days: number; from: string; to: string };
  headline: {
    revenue: Delta;
    bookings: Delta;
    averageBooking: Delta;
    grossMargin: Delta;
    marginPercent: Delta;
    newCustomers: Delta;
    enquiriesWon: Delta;
  };
  cash: {
    outstanding: { amount: number; count: number };
    expiring24h: number;
    collectedInPeriod: number;
  };
  series: { date: string; revenue: number; bookings: number }[];
  byVertical: {
    vertical: string;
    bookings: number;
    revenue: number;
    margin: number;
  }[];
  topListings: {
    listingLabel: string;
    vertical: string;
    units: number;
    revenue: number;
  }[];
  actions: {
    awaitingConfirmation: number;
    cashExpiring24h: number;
    awaitingDocuments: number;
    departingSoon: number;
    enquiriesOverdue: number;
    failedPayments24h: number;
    reversedPayments: number;
  };
  inventory: {
    published: number;
    /** Created or taken down — not on the website. */
    inactive: number;
  };
  /** Only present when the admin holds orders:read. */
  recentOrders?: DashboardOrder[];
}

export const getDashboard = async (range: DateRange) =>
  (
    await axiosInstance.get<Dashboard>("/dashboard", {
      params: { from: range.from, to: range.to }
    })
  ).data;

// --- Inventory --------------------------------------------------------------

/** Localised text: one entry per locale. */
export type Localized = Partial<Record<string, string>>;
/**
 * A price. Only CDF, in whole francs, is entered and stored; USD and EUR are
 * worked out by the server from the exchange rates in Settings. A record not
 * yet moved to francs may still carry a legacy `USD` (cents): never its price.
 */
export type Money = Partial<Record<"CDF" | "USD" | "EUR", number>>;

// --- Suppliers ----------------------------------------------------------------

/** Who the office buys from; picked on every hotel and listing. A route's travel agency. */
export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  contactName: string;
  address: string;
  notes: string;
  isActive: boolean;
  version: number;
  updatedAt: string;
  /** How many hotels and listings name it — archived ones too. */
  usedBy?: { hotels: number; listings: number };
  /** §7: contracts, licences… Private: opened through getSupplierDocumentLink. */
  documents?: SupplierDocument[];
}

export interface SupplierDocument {
  id: string;
  fileName: string;
  /** Bytes. */
  size: number;
  mimeType: string;
  uploadedAt: string;
  /** The e-mail of the admin who added it. */
  uploadedBy?: string;
}

export type SupplierInput = Partial<
  Pick<Supplier, "name" | "phone" | "email" | "contactName" | "address" | "notes" | "isActive">
>;

export const listSuppliers = async (params: { q?: string; active?: boolean } = {}) =>
  (await axiosInstance.get<{ items: Supplier[] }>(`/suppliers?${listQuery(params)}`)).data;

export const createSupplier = async (body: SupplierInput) =>
  (await axiosInstance.post<{ supplier: Supplier }>("/suppliers", body)).data;

export const updateSupplier = async (id: string, body: SupplierInput) =>
  (await axiosInstance.patch<{ supplier: Supplier }>(`/suppliers/${id}`, body)).data;

/** Only one nothing names; otherwise the server answers 409 SUPPLIER_IN_USE. */
export const deleteSupplier = async (id: string) =>
  (await axiosInstance.delete(`/suppliers/${id}`)).data;

/** PDF or pictures, up to 15 MB each and 10 at a time; stored privately. */
export const uploadSupplierDocuments = async (id: string, files: File[]) => {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  return (
    await axiosInstance.post(`/suppliers/${id}/documents`, fd, {
      // Let the browser set the multipart boundary itself.
      headers: { "Content-Type": undefined }
    })
  ).data;
};

export const deleteSupplierDocument = async (id: string, documentId: string) =>
  (await axiosInstance.delete(`/suppliers/${id}/documents/${documentId}`)).data;

/** A link to the file, good for 15 minutes. */
export const getSupplierDocumentLink = async (id: string, documentId: string) =>
  (
    await axiosInstance.get<{ url: string }>(
      `/suppliers/${id}/documents/${documentId}/link`
    )
  ).data;

export interface Hotel {
  id: string;
  name: Localized;
  /** Resolved for lists and headings — falls back through the locales. */
  displayName: string;
  city: string;
  status: string;
  stars: number;
  /** The supplier's id (see Supplier), and its name for lists. */
  supplier?: string;
  supplierName?: string;
  images: string[];
  /** The optional video: the address `uploadVideo` answered with. */
  videoUrl?: string;
  description: Record<string, string>;
  /** Pin shown on the public map; absent means the city centre is shown. */
  geo?: { lat: number; lng: number };
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
  /** The nightly price, for every future night — whole francs. */
  costPrice?: Money;
  sellPrice?: Money;
  margin?: number;
  mealPlan?: string;
  status: string;
}

/** What every inventory list can be narrowed and ordered by. */
export interface InventoryListParams extends PageParams {
  q?: string;
  status?: string;
}

const listQuery = (params: object) =>
  new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)])
  );

export const listHotels = async (params: InventoryListParams = {}) =>
  (await axiosInstance.get<Paged<Hotel>>(`/hotels?${listQuery(params)}`)).data;

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

/**
 * Takes it off the website and makes it unbookable, without archiving it: it
 * stays in the list, and publishing brings it straight back.
 */
export const deactivateHotel = async (id: string) =>
  (await axiosInstance.post<{ hotel: Hotel }>(`/hotels/${id}/deactivate`, {})).data;

export const duplicateHotel = async (id: string) =>
  (await axiosInstance.post<{ hotel: Hotel }>(`/hotels/${id}/duplicate`, {})).data;

/**
 * Archive: the server sets `status: ARCHIVED` rather than removing the
 * document (the audit log records it as a DELETE). An archived item leaves the
 * catalogue and the panel's lists and stays in the database. Removing one for
 * good is `deleteHotel` and its siblings, at the end of this file.
 */
export const archiveHotel = async (id: string, reason?: string) =>
  (await axiosInstance.post<{ hotel: Hotel }>(`/hotels/${id}/archive`, { reason })).data;

// --- Bookings ---------------------------------------------------------------

export interface OrderRow {
  id: string;
  reference: string;
  status: string;
  paymentStatus: string;
  fulfilmentStatus: string;
  /** Whole francs, the base — in US cents on an order the conversion to francs has not reached yet. */
  total: number;
  /** `total`'s currency: CDF, or USD on such an order. */
  currency: string;
  paymentMethod: string;
  /**
   * What the customer pays, in the currency they chose: CDF in whole francs,
   * USD and EUR in cents. `total` is the same in francs, for reporting.
   */
  chargedTotal?: number;
  chargedCurrency?: string;
  cashDeadline?: string;
  travelDate?: string;
  customer?: { id: string; fullName: string; phoneMasked?: string };
  createdAt: string;
}

export const listOrders = async (queue: string, q?: string, paging: PageParams = {}) =>
  (
    await axiosInstance.get<Paged<OrderRow>>(
      `/orders?${listQuery({ queue, q, ...paging })}`
    )
  ).data;

export const getQueueCounts = async () =>
  (await axiosInstance.get<Record<string, number>>("/orders/queue-counts")).data;

/** Mirrors the backend's orderDetailFields allow-list (dto/admin/order.dto.ts). */
/** Who to call about a line: its hotel's or listing's supplier. */
export interface SupplierContact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  contactName?: string;
  address?: string;
}

export interface OrderItem {
  id: string;
  vertical: string;
  listingLabel: string;
  /** For a bus or flight, the departure chosen: date and time. */
  startDate?: string;
  endDate?: string;
  quantity: number;
  /** A car booked by the hour: the hours paid for. Its start and end then carry the times. */
  rentalHours?: number;
  /** Bus and flight: the route, the seats by fare, and (flights) the bags declared. */
  origin?: string;
  destination?: string;
  passengers?: { adults: number; children: number; infants: number };
  baggage?: { cabinKg: number; checkedKg: number };
  /** A transfer: the ride this line books, for the link to it. */
  rideId?: string;
  supplier?: SupplierContact;
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
  /** Exchanged for a short-lived link with getSignedFileUrl; never a URL. */
  storageKey: string;
  version: number;
  uploadedAt: string;
  uploadedBy?: string;
}

export interface OrderDetail extends Omit<OrderRow, "customer"> {
  channel?: string;
  /** Francs per 1 unit of the charged currency when the order was made (1 for CDF). */
  fxRate?: number;
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
  cancellationReason?: string;
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

export type DocumentKind = "ETICKET" | "VOUCHER" | "INVOICE";

/** At most this many files in one upload; the server refuses more. */
export const MAX_DOCUMENTS_PER_UPLOAD = 7;

/**
 * Uploads the files and attaches them in one request, each with its own
 * kind. The server stores them privately and tells the customer once that
 * their documents are ready.
 */
export const attachOrderDocuments = async (
  id: string,
  items: { file: File; kind: DocumentKind }[]
) => {
  const fd = new FormData();
  // Aligned by position with the files below.
  fd.append("kinds", JSON.stringify(items.map((i) => i.kind)));
  items.forEach((i) => fd.append("files", i.file));
  return (
    await axiosInstance.post(`/orders/${id}/documents`, fd, {
      // Let the browser set the multipart boundary itself.
      headers: { "Content-Type": undefined }
    })
  ).data;
};

/** Takes a wrong file back. Refused once the order is completed. */
export const removeOrderDocument = async (
  id: string,
  documentId: string,
  reason?: string
) =>
  (
    await axiosInstance.delete(`/orders/${id}/documents/${documentId}`, {
      data: reason ? { reason } : undefined
    })
  ).data;

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

export const listCustomers = async (q?: string, paging: PageParams = {}) =>
  (
    await axiosInstance.get<Paged<CustomerRow>>(
      `/customers?${listQuery({ q, ...paging })}`
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
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
  ip: string;
  userAgent?: string;
  createdAt: string;
}

export interface AuditLogSummary {
  failedLogins24h: number;
  stepUpFailed7d: number;
  exports30d: number;
  passportUnmasked30d: number;
  accessChanges30d: number;
  lastFailedLogin: { actorEmail: string; ip: string; createdAt: string } | null;
  alertChannelConfigured: boolean;
  actions: string[];
  entityTypes: string[];
  actors: string[];
}

export const listAuditLogs = async (params: Record<string, string> = {}) =>
  (
    await axiosInstance.get<Paged<AuditLogRow>>(
      `/audit-logs?${new URLSearchParams(params)}`
    )
  ).data;

export const getAuditLogSummary = async () =>
  (await axiosInstance.get<AuditLogSummary>("/audit-logs/summary")).data;

// --- Enquiries (§7) ---------------------------------------------------------

export interface EnquiryLogEntry {
  at: string;
  kind: "CALL" | "NOTE" | "QUOTE" | "VIEWING";
  detail?: string;
  actorEmail?: string;
}

export interface Enquiry {
  id: string;
  reference: string;
  kind: string;
  stage: string;
  vertical?: string;
  customerName: string;
  phone: string;
  email?: string;
  message: string;
  listingId?: string;
  listingLabel?: string;
  /** A bus or flight request: the day and time asked for, as written ("YYYY-MM-DD", "HH:MM"), and who travels. */
  trip?: { date: string; time: string; adults: number; children: number; infants: number };
  source?: string;
  firstContactAt?: string;
  /** Whole francs — in US cents when `quotedCurrency` is absent (a quote not converted yet). */
  quotedAmount?: number;
  /** 'CDF' on every quote in francs. */
  quotedCurrency?: string;
  quoteExpiresAt?: string;
  lossReason?: string;
  contactLog?: EnquiryLogEntry[];
  /** Server-computed so every client agrees on what "breached" means. */
  slaBreached: boolean;
  hoursWaiting: number | null;
  slaDeadline: string;
  createdAt: string;
}

export interface EnquiryPage extends Paged<Enquiry> {
  slaHours: number;
}

export const listEnquiries = async (params: Record<string, string> = {}) =>
  (
    await axiosInstance.get<EnquiryPage>(
      `/enquiries?${new URLSearchParams(params)}`
    )
  ).data;

export interface EnquirySummary {
  byStage: Record<string, number>;
  overdue: number;
  slaHours: number;
  wonLast30d: { count: number; value: number };
}

export const getEnquirySummary = async () =>
  (await axiosInstance.get<EnquirySummary>("/enquiries/summary")).data;

export const setEnquiryStage = async (
  id: string,
  body: { stage: string; lossReason?: string; detail?: string }
) =>
  (
    await axiosInstance.post<{ enquiry: Enquiry }>(
      `/enquiries/${id}/stage`,
      body
    )
  ).data;

export const addEnquiryNote = async (
  id: string,
  body: { kind: "CALL" | "NOTE" | "VIEWING"; detail: string }
) =>
  (
    await axiosInstance.post<{ enquiry: Enquiry }>(
      `/enquiries/${id}/notes`,
      body
    )
  ).data;

export const quoteEnquiry = async (
  id: string,
  /** `amount` in whole francs. */
  body: { amount: number; expiresAt?: string; detail?: string }
) =>
  (
    await axiosInstance.post<{ enquiry: Enquiry }>(
      `/enquiries/${id}/quote`,
      body
    )
  ).data;

// --- Payments (§9.1) --------------------------------------------------------

export interface Payment {
  id: string;
  reference: string;
  customerName: string;
  method: string;
  status: string;
  /** The order's total, in `currency`: francs (see OrderRow). */
  amount: number;
  currency: string;
  /** What the customer was charged, in that currency's minor units. */
  chargedTotal?: number;
  chargedCurrency?: string;
  paidAt?: string;
  createdAt: string;
}

export interface PaymentsPage extends Paged<Payment> {
  /** Paid amounts across everything the search matches, in whole francs. */
  collected: number;
}

export const listPayments = async (params: { q?: string } & PageParams = {}) =>
  (await axiosInstance.get<PaymentsPage>(`/payments?${listQuery(params)}`)).data;

// --- Content: policies (§10) ------------------------------------------------

export interface PolicyVersion {
  id: string;
  kind: string;
  locale: string;
  label: string;
  body: string;
  isLive: boolean;
  /** It has been the published text at some time: kept for good, no bin. */
  wasLive?: boolean;
  createdAt: string;
}

export const listPolicies = async () =>
  (
    await axiosInstance.get<{
      items: PolicyVersion[];
      /** By kind, then language: what the website shows when nothing is published. */
      builtIn?: Record<string, Record<string, string>>;
      /** By kind, then language: the live text still says bookings are not refundable. */
      outdated?: Record<string, Record<string, boolean>>;
    }>("/policies")
  ).data;

export const createPolicyVersion = async (body: {
  kind: string;
  locale: string;
  label: string;
  body: string;
}) => (await axiosInstance.post<{ policy: PolicyVersion }>("/policies", body)).data;

export const setPolicyLive = async (id: string) =>
  (await axiosInstance.post(`/policies/${id}/publish`, {})).data;

// --- Content: the website's own wording and pictures ------------------------

/** One block of the About page: a heading and its paragraph. */
export interface SiteBlock {
  title: Localized;
  body: Localized;
}

export interface SiteQuestion {
  question: Localized;
  answer: Localized;
}

/** §15: one card of "Ideas worth travelling for" on the home page. */
export interface SiteIdea {
  title: Localized;
  kicker: Localized;
  body: Localized;
  /** An upload, one of the website's built-in pictures (/img/photos/…), or "" for none. */
  image: string;
  /** A page of the website (/hotels?destination=Goma) or an https:// address. */
  href: string;
}

/**
 * Everything on the public website the office edits itself. An empty image
 * means the picture built into the website.
 */
export interface SiteContent {
  home: {
    heroImage: string;
    heroTitle: Localized;
    heroSubtitle: Localized;
    ideasTitle: Localized;
    ideasSubtitle: Localized;
    ideas: SiteIdea[];
  };
  about: {
    image: string;
    title: Localized;
    intro: Localized;
    sections: SiteBlock[];
    listTitle: Localized;
    listItems: Localized[];
  };
  contact: { intro: Localized; formTitle: Localized; formIntro: Localized };
  help: {
    intro: Localized;
    faq: SiteQuestion[];
    contactTitle: Localized;
    contactText: Localized;
  };
  footer: {
    tagline: Localized;
    notice: Localized;
    noticeTitle: Localized;
    noticeShort: Localized;
    copyright: Localized;
  };
}

export type SiteSection = keyof SiteContent;

/** What a field may hold, straight from the server's own description. */
export interface SiteField {
  kind: "text" | "image" | "link" | "list";
  label: string;
  /** Characters for text; entries for a list. */
  max?: number;
  of?: SiteField | Record<string, SiteField>;
}

export interface SiteContentPayload {
  content: SiteContent;
  shape: Record<SiteSection, Record<string, SiteField>>;
  updatedAt?: string;
  /** The wording and pictures the website shipped with. */
  builtIn?: SiteContent;
  /** Texts that still say bookings are not refundable; `label` names the place for the office. */
  stale?: { section: SiteSection; label: string }[];
  /** Offers and hotels whose own texts say it too (fare rules, conditions, descriptions): the first ones, and the totals. */
  staleCatalogue?: {
    listings: { id: string; vertical: string; label: string }[];
    listingCount: number;
    hotels: { id: string; label: string }[];
    hotelCount: number;
  };
}

export const getSiteContent = async () =>
  (await axiosInstance.get<SiteContentPayload>("/site-content")).data;

/** Replaces one section; the others are left exactly as they are. */
export const saveSiteSection = async <K extends SiteSection>(
  section: K,
  body: SiteContent[K]
) =>
  (
    await axiosInstance.put<Pick<SiteContentPayload, "content" | "updatedAt">>(
      `/site-content/${section}`,
      body
    )
  ).data;

/** A picture for the website itself; returns the address to store. */
export const uploadSiteImage = async (file: File) => {
  const fd = new FormData();
  fd.append("files", file);
  const { data } = await axiosInstance.post<{ files: StoredFile[] }>(
    "/site-content/images",
    fd,
    // Let the browser set the multipart boundary itself.
    { headers: { "Content-Type": undefined } }
  );
  return data.files[0]?.url ?? "";
};

// --- Settings (§12) ---------------------------------------------------------

/**
 * One office, as the website footer lists it. Exactly one is primary: it is
 * the main contact on the public site.
 */
export interface Office {
  id: string;
  name: string;
  city: string;
  streetAddress: string;
  phone: string;
  whatsapp: string;
  email: string;
  hours: string;
  geo?: { lat: number; lng: number };
  isPrimary: boolean;
}

export interface Settings {
  companyName: string;
  supportEmail: string;
  supportPhone: string;
  defaultLocale: string;
  baseCurrency: string;
  /** Francs per 1 USD and per 1 EUR, as typed: every USD and EUR price is worked out from these. */
  exchangeRates: { USD?: number | null; EUR?: number | null };
  priceChangeGuardPercent: number;
  holdTtlOnlineMinutes: number;
  holdTtlCashHours: number;
  maxConcurrentCashHolds: number;
  customerExportRowCap: number;
  enquirySlaHours: number;
  passportRetentionDays: number;
  maintenanceMode: boolean;
  /** Where a customer's or driver's security alert goes by SMS (E.164); blank: the primary office phone. */
  transferAlertPhone?: string;
  /** Straight-line km × this = road km, when the routing service cannot be reached (1–3). */
  transferDetourFactor?: number;
  /** Sent back whole on save — the server replaces the list, at most 20. */
  offices: Office[];
  updatedAt: string;
}

export const getSettings = async () =>
  (await axiosInstance.get<{ settings: Settings }>("/settings")).data.settings;

/**
 * §1.3: step-up gated — a 403 here means re-authentication is required. A
 * big change to an exchange rate is refused with 409 RATE_CHANGE_CONFIRM until
 * it is sent again with `confirmRateChange`.
 */
export const updateSettings = async (
  body: Partial<Settings> & { reason?: string; confirmRateChange?: boolean }
) =>
  (await axiosInstance.patch<{ settings: Settings }>("/settings", body)).data;

export const stepUp = async (password: string) =>
  (await axiosInstance.post("/auth/step-up", { password })).data;

// --- Sessions (§14.1) -------------------------------------------------------

/** The signed-in admin's own devices; no permission needed, like /account. */
export interface Sessions {
  currentSessionId: string;
  sessions: {
    id: string;
    deviceLabel: string;
    ip: string;
    createdAt: string;
    lastSeenAt: string;
  }[];
}

export const listSessions = async () =>
  (await axiosInstance.get<Sessions>("/auth/sessions")).data;

export const revokeOtherSessions = async () =>
  (await axiosInstance.delete<{ revoked: number }>("/auth/sessions/others")).data;

// --- Listings: flights, bus, cars, activities, properties (§5.2) ------------

export interface Listing {
  id: string;
  vertical: string;
  title: Localized;
  displayTitle: string;
  status: string;
  city: string;
  images: string[];
  /** See `Hotel.videoUrl`. */
  videoUrl?: string;
  /** See `Hotel.supplier`. For a bus or flight, its travel agency. */
  supplier?: string;
  supplierName?: string;
  /** For a bus or flight, the adult fare (12 and over); for a car, 24 hours' rental. */
  costPrice: Money;
  sellPrice: Money;
  /** Bus and flight fares for a child of 2 to 12 and a baby under 2. */
  childCostPrice?: Money;
  childSellPrice?: Money;
  infantCostPrice?: Money;
  infantSellPrice?: Money;
  /** A car's shorter rentals: 1, 6 and 12 hours. Each is offered only when its price is above 0. */
  hourlyCostPrice?: Money;
  hourlySellPrice?: Money;
  sixHourCostPrice?: Money;
  sixHourSellPrice?: Money;
  twelveHourCostPrice?: Money;
  twelveHourSellPrice?: Money;
  /** §4: a display-only old price (FC) shown struck through; never charged. */
  promoCompareAtPrice?: Money;
  /** The promotion's last day, YYYY-MM-DD; null runs until removed. */
  promoEndsAt?: string | null;
  costPriceBase: number;
  sellPriceBase: number;
  currencies: string[];
  margin: number;
  quantityTotal: number;
  quantitySold: number;
  available: number;
  validFrom?: string;
  geo?: { lat: number; lng: number };
  attributes: Record<string, unknown>;
  translations: Record<string, boolean>;
  version: number;
  updatedAt: string;
}

export const listListings = async (
  params: InventoryListParams & { vertical?: string } = {}
) => (await axiosInstance.get<Paged<Listing>>(`/listings?${listQuery(params)}`)).data;

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

/** See `deactivateHotel`. */
export const deactivateListing = async (id: string) =>
  (await axiosInstance.post(`/listings/${id}/deactivate`, {})).data;

export const duplicateListing = async (id: string, body: Record<string, unknown> = {}) =>
  (await axiosInstance.post(`/listings/${id}/duplicate`, body)).data;

/** Archive — see `archiveHotel`. */
export const archiveListing = async (id: string, reason?: string) =>
  (await axiosInstance.post(`/listings/${id}/archive`, { reason })).data;

// --- Inventory as spreadsheets: template, export, import --------------------

/** `,` between cells for an English spreadsheet, `;` for a French one. */
export type CsvSeparator = "comma" | "semicolon";

export interface ImportColumn {
  key: string;
  label: string;
  required: boolean;
  /** In exports for reference; never read back in. */
  readOnly: boolean;
  help: string;
  example: string;
  options?: string[];
}

/** What the import panel shows: which columns, what goes in each. */
export interface ImportGuide {
  group: string;
  label: string;
  maxRows: number;
  /** What is still to do in the panel once the rows are in. */
  after: string;
  columns: ImportColumn[];
}

export const getImportGuide = async (group: string) =>
  (await axiosInstance.get<ImportGuide>(`/inventory/${group}/import-columns`)).data;

/** §2.2: dry-run by default; commit only after a clean report. */
export interface ImportReport {
  dryRun?: boolean;
  rows: number;
  validRows: number;
  /** Rows already in the system — an export read back in. */
  skipped: number;
  /** Row 1 is the header row: an error there is about the file as a whole. */
  errors: { row: number; field: string; message: string }[];
  /** What was assumed while reading the file, to check before importing. */
  notes: string[];
  /** Headers nothing reads; almost always a misspelt column. */
  ignoredColumns: string[];
  canCommit: boolean;
  created?: number;
}

export const importInventoryCsv = async (
  group: string,
  body: { csv: string; commit?: boolean }
) => (await axiosInstance.post<ImportReport>(`/inventory/${group}/import`, body)).data;

/**
 * Saves the template or an export to the user's machine.
 *
 * The request carries the session, so it cannot be a plain link: the file is
 * fetched first and then handed to the browser to save.
 */
export const downloadInventoryCsv = async (
  group: string,
  kind: "template" | "export",
  sep: CsvSeparator
) => {
  const res = await axiosInstance.get<Blob>(`/inventory/${group}/${kind}`, {
    params: { sep },
    responseType: "blob"
  });
  const name =
    /filename="([^"]+)"/.exec(String(res.headers["content-disposition"] ?? ""))?.[1] ??
    `${group.toLowerCase()}-${kind}.csv`;
  const url = URL.createObjectURL(res.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return name;
};

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

/**
 * The largest video the server takes (MAX_VIDEO_BYTES there). Checked in the
 * form first: nobody should sit through a 300 MB upload to be told no.
 */
export const MAX_VIDEO_MB = 100;

/**
 * POST /uploads/video — the optional video of a hotel, restaurant or listing.
 * One file; answers with the address the record then stores as `videoUrl`.
 */
export const uploadVideo = async (
  file: File,
  opts: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {}
) => {
  const fd = new FormData();
  // Ahead of the file, and in that order: the server passes the video
  // straight on to S3, which has to be told its length before the first byte.
  fd.append("size", String(file.size));
  fd.append("file", file);
  const { data } = await axiosInstance.post<{ files: StoredFile[] }>(
    "/uploads/video",
    fd,
    {
      // Let the browser set the multipart boundary itself.
      headers: { "Content-Type": undefined },
      signal: opts.signal,
      onUploadProgress: (e) =>
        opts.onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0)
    }
  );
  return data.files[0]?.url ?? "";
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
  /** See `Hotel.videoUrl`. */
  videoUrl?: string;
  openingHours: string;
  prepTimeMinutes: number;
  phone?: string;
  geo?: { lat: number; lng: number };
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

export const listRestaurants = async (params: InventoryListParams = {}) =>
  (await axiosInstance.get<Paged<Restaurant>>(`/restaurants?${listQuery(params)}`)).data;

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

/** See `deactivateHotel`. The menu is left exactly as it is. */
export const deactivateRestaurant = async (id: string) =>
  (await axiosInstance.post<{ restaurant: Restaurant }>(`/restaurants/${id}/deactivate`, {}))
    .data;

/** A copy with its menu and delivery zones, inactive until someone publishes it. */
export const duplicateRestaurant = async (id: string) =>
  (await axiosInstance.post<{ restaurant: Restaurant }>(`/restaurants/${id}/duplicate`, {}))
    .data;

/** Archive — see `archiveHotel`. */
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

/**
 * A dish goes on, or comes off, the menu customers see. These are their own
 * calls because the server never takes a status from an edit.
 */
export const publishMenuItem = async (id: string, menuItemId: string) =>
  (
    await axiosInstance.post<{ item: MenuItem }>(
      `/restaurants/${id}/menu/${menuItemId}/publish`,
      {}
    )
  ).data;

export const deactivateMenuItem = async (id: string, menuItemId: string) =>
  (
    await axiosInstance.post<{ item: MenuItem }>(
      `/restaurants/${id}/menu/${menuItemId}/deactivate`,
      {}
    )
  ).data;

export const archiveMenuItem = async (id: string, menuItemId: string) =>
  (
    await axiosInstance.post<{ item: MenuItem }>(
      `/restaurants/${id}/menu/${menuItemId}/archive`,
      {}
    )
  ).data;

// --- Deleting for good ------------------------------------------------------
// Each needs the area's delete permission and a recent password (step-up); see
// components/DeleteButton.tsx, which is what calls them. `confirmed` answers
// the server's one refusal over bookings in progress (409 OPEN_BOOKINGS).

const purge = async (path: string, confirmed = false) => {
  await axiosInstance.delete(`${path}${confirmed ? "?confirm=1" : ""}`, {
    // The question stays on screen, unanswerable, until this is answered: a
    // request that hangs must give up rather than hold the page for good.
    timeout: 30_000
  });
};

export const deleteEnquiry = (id: string) => purge(`/enquiries/${id}`);
export const deleteListing = (id: string, confirmed?: boolean) =>
  purge(`/listings/${id}`, confirmed);
/** With its room types and every night's price. */
export const deleteHotel = (id: string, confirmed?: boolean) =>
  purge(`/hotels/${id}`, confirmed);
export const deleteRoomType = (hotelId: string, roomTypeId: string, confirmed?: boolean) =>
  purge(`/hotels/${hotelId}/room-types/${roomTypeId}`, confirmed);
/** With its menu. */
export const deleteRestaurant = (id: string, confirmed?: boolean) =>
  purge(`/restaurants/${id}`, confirmed);
export const deleteMenuItem = (restaurantId: string, menuItemId: string, confirmed?: boolean) =>
  purge(`/restaurants/${restaurantId}/menu/${menuItemId}`, confirmed);
/** Refused (409 HAS_BOOKINGS) for an account with bookings: those are blocked instead. */
export const deleteCustomer = (id: string) => purge(`/customers/${id}`);
/** Refused for the live version, and for one a customer booked under. */
export const deletePolicyVersion = (id: string) => purge(`/policies/${id}`);
export const deleteTemplate = (id: string) => purge(`/notifications/templates/${id}`);
/** Refused for one's own account, a stronger one, and the last active super admin. */
export const deleteUser = (id: string) => purge(`/users/${id}`);
