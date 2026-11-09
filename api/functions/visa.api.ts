import axiosInstance from "@/api/axiosInstance";
import type { Localized, LocalizedText, Money, PageParams, Paged } from "@/api/functions/admin.api";

/**
 * E-Visa: the configuration (visa types, person types, countries with their
 * towns and offers) and the applications the office moves through their steps.
 * Mirrors round 9's VISA.md "Admin API" (routes/admin/v1/visaRoutes.ts).
 * Configuration is inventory:*, applications orders:*.
 */

// --- Configuration -------------------------------------------------------------

export interface VisaType {
  id: string;
  name: Localized;
  description: Localized;
  sortOrder: number;
  isActive: boolean;
  /** How many countries or applications use it: deleting is refused while > 0. */
  usage?: number;
}

export interface VisaPersonType {
  id: string;
  name: Localized;
  description: Localized;
  /** What else this traveller brings, e.g. a minor's parental consent. */
  extraDocuments: Localized;
  isMinor: boolean;
  sortOrder: number;
  isActive: boolean;
  /** How many countries or applications use it: deleting is refused while > 0. */
  usage?: number;
}

export interface VisaTown {
  id?: string;
  _id?: string;
  name: Localized;
  isActive: boolean;
}

export type VisaEntries = "SINGLE" | "MULTIPLE";

export interface VisaOffer {
  id?: string;
  _id?: string;
  /** A VisaType id, or the type filled in. */
  visaType: string | VisaType;
  /** The type's name, sent with the countries list. */
  visaTypeName?: Localized;
  /** Whole francs: what the office charges. */
  serviceFee: Money;
  /** Indicative only: shown to the customer, never charged. */
  embassyFee?: Money;
  processingDays: number;
  validityDays: number;
  entries: VisaEntries;
  requiredDocuments: Localized;
  isActive: boolean;
}

export interface VisaCountry {
  id: string;
  /** ISO 3166-1 alpha-2, upper case. */
  code: string;
  name: Localized;
  notes: Localized;
  /** The passport must stay valid this long after the stay; 0 = no rule. */
  passportValidityMonths: number;
  isActive: boolean;
  sortOrder: number;
  towns: VisaTown[];
  offers: VisaOffer[];
  /** Why it cannot go live yet, in the server's words. */
  publishBlockers?: string[];
  /** Applications made for it: one used cannot be deleted, only taken off the website. */
  applicationCount?: number;
  updatedAt?: string;
}

export type VisaConfigKind = "types" | "person-types";
type ConfigEntry = { types: VisaType; "person-types": VisaPersonType };

/** `{ country }`, `{ item }` or the record itself: the record. */
const one = <T>(data: unknown, key: string): T => {
  const d = data as Record<string, unknown>;
  return (d?.[key] ?? d?.item ?? d) as T;
};

// ponytail: one call of the server's largest page (100) holds each list; page it past that.
export const listVisaConfig = async <K extends VisaConfigKind>(kind: K) =>
  (
    await axiosInstance.get<{ items: ConfigEntry[K][] }>(`/visa/${kind}`, {
      params: { limit: 100 }
    })
  ).data;

export const saveVisaConfig = async (
  kind: VisaConfigKind,
  id: string | undefined,
  body: Record<string, unknown>
) =>
  (id
    ? await axiosInstance.patch(`/visa/${kind}/${id}`, body)
    : await axiosInstance.post(`/visa/${kind}`, body)
  ).data;

/** Step-up gated (DeleteButton asks for the password). */
export const deleteVisaConfig = async (kind: VisaConfigKind | "countries", id: string) => {
  await axiosInstance.delete(`/visa/${kind}/${id}`, { timeout: 30_000 });
};

export const listVisaCountries = async () =>
  (
    await axiosInstance.get<{ items: VisaCountry[] }>("/visa/countries", {
      params: { limit: 100 }
    })
  ).data;

export const getVisaCountry = async (id: string) =>
  one<VisaCountry>((await axiosInstance.get(`/visa/countries/${id}`)).data, "country");

/** Towns and offers travel with the country and are replaced whole. */
export const saveVisaCountry = async (id: string | undefined, body: Record<string, unknown>) =>
  one<VisaCountry>(
    (id
      ? await axiosInstance.patch(`/visa/countries/${id}`, body)
      : await axiosInstance.post("/visa/countries", body)
    ).data,
    "country"
  );

/** Refused with the publish blockers; deactivating is always allowed. */
export const setVisaCountryLive = async (id: string, action: "publish" | "deactivate") =>
  (await axiosInstance.post(`/visa/countries/${id}/${action}`, {})).data;

// --- Applications --------------------------------------------------------------

export type VisaStatus =
  | "SUBMITTED"
  | "IN_REVIEW"
  | "INFO_REQUESTED"
  | "LODGED"
  | "APPOINTMENT"
  | "APPROVED"
  | "REFUSED"
  | "COMPLETED"
  | "CANCELLED";

export type VisaDocumentKind = "PASSPORT" | "HOTEL" | "INVITATION" | "PHOTO" | "OTHER" | "VISA";

export type VisaCancelReason = "CUSTOMER_REQUEST" | "NOT_PAID" | "INCOMPLETE" | "DUPLICATE" | "OTHER";

export interface VisaDocument {
  id: string;
  kind: VisaDocumentKind;
  fileName: string;
  uploadedAt: string;
  /** Attached by the office (the issued visa, say), not by the customer. */
  fromOffice?: boolean;
  uploadedBy?: string;
  mimeType?: string;
  size?: number;
}

export interface VisaTimelineEvent {
  at: string;
  event: string;
  detail?: string;
  reason?: string;
  actorEmail?: string;
}

/** The admin detail DTO; list rows carry the same fields, some left out. */
export interface VisaApplication {
  id: string;
  reference: string;
  status: VisaStatus;
  paymentStatus: "UNPAID" | "PAID";
  paidAt?: string;
  paymentMethod?: string;
  /** What the customer pays, in their currency, and the same in francs. */
  fee?: { chargedTotal?: number; chargedCurrency?: string; CDF?: number } | number;
  fxRate?: number;
  /** Indicative, never charged. */
  embassyFee?: Money;
  country?: { code: string; name: LocalizedText };
  townName?: LocalizedText;
  visaTypeName?: LocalizedText;
  personTypeName?: LocalizedText;
  departureDate?: string;
  returnDate?: string;
  stayFrom?: string;
  stayTo?: string;
  purpose?: string;
  stayAddress?: string;
  invitationLetter?: boolean;
  bookingReference?: string;
  /** The booking behind `bookingReference`, when it is one of this customer's. */
  bookingOrderId?: string;
  /** Where the office may move it now (the server checks again). */
  allowedTransitions?: VisaStatus[];
  traveller?: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    nationality?: string;
    passportNumberMasked?: string;
    passportExpiry?: string;
  };
  /** The country's rule when the server sends it; 6 months otherwise. */
  passportValidityMonths?: number;
  documents?: VisaDocument[];
  infoRequest?: { message: string; at?: string; by?: string };
  appointment?: { at: string; place?: string };
  decision?: {
    outcome: "APPROVED" | "REFUSED";
    at?: string;
    reason?: string;
    visaNumber?: string;
    validFrom?: string;
    validTo?: string;
  };
  cancellation?: { reasonCode: VisaCancelReason | string; note?: string; at?: string; by?: string };
  rush?: boolean;
  minor?: boolean;
  processingDays?: number;
  customer?: { id?: string; name?: string; phone?: string; email?: string };
  /** The contact as the application kept it, beside the account's. */
  contact?: { name?: string; phone?: string; email?: string };
  internalNotes?: string;
  documentsPurgedAt?: string;
  consent?: { textShown?: string; locale?: string; acceptedAt?: string; ip?: string };
  timeline?: VisaTimelineEvent[];
  createdAt: string;
}

export const listVisaApplications = async (
  queue: string,
  q?: string,
  paging: PageParams = {}
) =>
  (
    await axiosInstance.get<Paged<VisaApplication>>("/visa/applications", {
      params: { queue, q: q || undefined, ...paging, sort: paging.sort || undefined }
    })
  ).data;

export const getVisaQueueCounts = async () =>
  (await axiosInstance.get<Record<string, number>>("/visa/applications/queue-counts")).data;

export const getVisaApplication = async (id: string) =>
  one<VisaApplication>(
    (await axiosInstance.get(`/visa/applications/${id}`)).data,
    "application"
  );

export interface VisaTransition {
  to: VisaStatus;
  note?: string;
  infoMessage?: string;
  /** ISO date-time. */
  appointmentAt?: string;
  appointmentPlace?: string;
  refusalReason?: string;
  visaNumber?: string;
  /** YYYY-MM-DD */
  validFrom?: string;
  validTo?: string;
  confirmHandedOver?: boolean;
  cancelReasonCode?: VisaCancelReason;
  cancelNote?: string;
}

/** The server allow-lists every move (VISA.md "Status machine"). */
export const transitionVisa = async (id: string, body: VisaTransition) =>
  (await axiosInstance.post(`/visa/applications/${id}/transition`, body)).data;

/** Cash at the office or mobile money. Idempotent. */
export const confirmVisaPayment = async (id: string) =>
  (await axiosInstance.post(`/visa/applications/${id}/payment`, {})).data;

/** At most this many files in one upload, each at most VISA_MAX_FILE_BYTES. */
export const VISA_MAX_FILES = 5;
export const VISA_MAX_FILE_BYTES = 10 * 1024 * 1024;

export const attachVisaDocuments = async (
  id: string,
  items: { file: File; kind: VisaDocumentKind }[]
) => {
  const fd = new FormData();
  // Aligned by position with the files.
  fd.append("kinds", JSON.stringify(items.map((i) => i.kind)));
  items.forEach((i) => fd.append("files", i.file));
  return (
    await axiosInstance.post(`/visa/applications/${id}/documents`, fd, {
      headers: { "Content-Type": undefined }
    })
  ).data;
};

/** Only a file the office attached. */
export const removeVisaDocument = async (id: string, documentId: string) =>
  (await axiosInstance.delete(`/visa/applications/${id}/documents/${documentId}`)).data;

/** A private file's link, for 15 minutes; the server records who opened it. */
export const getVisaDocumentLink = async (id: string, documentId: string) =>
  (
    await axiosInstance.post<{ url: string }>(
      `/visa/applications/${id}/documents/${documentId}/link`,
      {}
    )
  ).data;

export const saveVisaNote = async (id: string, note: string) =>
  (await axiosInstance.post(`/visa/applications/${id}/notes`, { note })).data;

/** orders:write; no password or reason (the office lodges every application with it). Logged. */
export const unmaskVisaPassport = async (id: string) =>
  (
    await axiosInstance.post<{ passportNumber: string }>(
      `/visa/applications/${id}/unmask-passport`,
      {}
    )
  ).data;
