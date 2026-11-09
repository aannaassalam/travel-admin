import axiosInstance from "@/api/axiosInstance";
import type { Localized, Money } from "@/api/functions/admin.api";

/**
 * Duty Free: shop categories, shops, their products, and the delivery points
 * an order is brought to. inventory:read / write / delete, like restaurants.
 * Mirrors the "Admin API" of the Duty Free spec (/duty-free/*).
 */

export type DutyFreeStatusAction = "publish" | "deactivate";

/** "Parfums", "Alcools", "Électronique"… — what the website lists, instead of shops. */
export interface DutyFreeCategory {
  id: string;
  name: Localized;
  slug: string;
  /** The cover of the category's tile on the website. */
  image?: string;
  sortOrder: number;
  isActive: boolean;
  /** Shops filed under it, all of them. */
  shopCount?: number;
}

export interface DutyFreeShop {
  id: string;
  name: Localized;
  description: Localized;
  slug: string;
  /** A category id, or the category filled in. */
  category: string | DutyFreeCategory;
  city: string;
  address: string;
  phone?: string;
  /** Logo or photos of the shop. */
  images: string[];
  /** Charged once per shop in an order, whatever the quantity; 0 = none. Whole francs. */
  processingFee?: Money;
  status: string;
  publishBlockers?: string[];
  productCount?: number;
  version?: number;
  updatedAt: string;
}

export interface DutyFreeProduct {
  id: string;
  name: Localized;
  description: Localized;
  /** Admin-only, as on dishes: margin reporting depends on it. */
  costPrice: Money;
  sellPrice: Money;
  marginBase?: number;
  promoCompareAtPrice?: Money;
  promoEndsAt?: string | null;
  images: string[];
  videoUrl?: string;
  /** The "in stock" switch: apart from the status, like a dish's Available. */
  isAvailable: boolean;
  sortOrder: number;
  status: string;
  version: number;
}

export const POINT_KINDS = [
  "OFFICE",
  "AIRPORT",
  "BUS_TERMINAL",
  "HOTEL",
  "RESTAURANT",
  "OTHER"
] as const;
export type PointKind = (typeof POINT_KINDS)[number];

/** Every kind but the office asks the customer for an address (which terminal, which hotel…). */
export const needsAddress = (kind: string) => kind !== "OFFICE";

/** Where an order is brought: the office, the airport, a hotel… one list per town. */
export interface DutyFreePoint {
  id: string;
  name: Localized;
  city: string;
  kind: PointKind;
  /** The office's own address, shown to the customer; other kinds ask the customer for one. */
  address?: string;
  /** 0 = free. For OTHER: the default cost, whatever the address. */
  fee: Money;
  etaMinutes?: number;
  isActive: boolean;
  sortOrder: number;
}

/** `{ shop }`, `{ item }` or the record itself: the record. */
const one = <T>(data: unknown, key: string): T => {
  const d = data as Record<string, unknown>;
  return (d?.[key] ?? d?.item ?? d) as T;
};

/** Blank filters left out, so the URL says only what was chosen. */
const query = (params: object) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""));

/** `confirmed` answers the server's one refusal over bookings in progress (409 OPEN_BOOKINGS). */
const remove = async (path: string, confirmed = false) => {
  await axiosInstance.delete(`${path}${confirmed ? "?confirm=1" : ""}`, { timeout: 30_000 });
};

// --- Categories and delivery points: plain lists -----------------------------

export type DutyFreeListKind = "categories" | "points";
type ListEntry = { categories: DutyFreeCategory; points: DutyFreePoint };

// ponytail: one call of the server's largest page (100) holds the whole list; page it past that.
export const listDutyFree = async <K extends DutyFreeListKind>(kind: K) =>
  (
    await axiosInstance.get<{ items: ListEntry[K][] }>(`/duty-free/${kind}`, {
      params: { limit: 100 }
    })
  ).data;

export const saveDutyFreeEntry = async (
  kind: DutyFreeListKind,
  id: string | undefined,
  body: Record<string, unknown>
) =>
  (id
    ? await axiosInstance.patch(`/duty-free/${kind}/${id}`, body)
    : await axiosInstance.post(`/duty-free/${kind}`, body)
  ).data;

/** A category is refused while a shop uses it; the server's message says so. */
export const deleteDutyFreeEntry = (kind: DutyFreeListKind, id: string) =>
  remove(`/duty-free/${kind}/${id}`);

// --- Shops ----------------------------------------------------------------------

export const listShops = async (
  params: { q?: string; status?: string; category?: string } = {}
) =>
  (
    await axiosInstance.get<{ items: DutyFreeShop[] }>("/duty-free/shops", {
      params: query({ ...params, limit: 100 })
    })
  ).data;

export const getShop = async (id: string) => {
  const d = (await axiosInstance.get(`/duty-free/shops/${id}`)).data;
  return { shop: one<DutyFreeShop>(d, "shop"), products: (d?.products ?? []) as DutyFreeProduct[] };
};

export const saveShop = async (id: string | undefined, body: Record<string, unknown>) =>
  one<DutyFreeShop>(
    (id
      ? await axiosInstance.patch(`/duty-free/shops/${id}`, body)
      : await axiosInstance.post("/duty-free/shops", body)
    ).data,
    "shop"
  );

export const setShopStatus = async (id: string, action: DutyFreeStatusAction) =>
  (await axiosInstance.post(`/duty-free/shops/${id}/${action}`, {})).data;

/** With its products. */
export const deleteShop = (id: string, confirmed?: boolean) =>
  remove(`/duty-free/shops/${id}`, confirmed);

// --- Products, under their shop ---------------------------------------------

export const createProduct = async (shopId: string, body: Record<string, unknown>) =>
  one<DutyFreeProduct>(
    (await axiosInstance.post(`/duty-free/shops/${shopId}/products`, body)).data,
    "product"
  );

export const updateProduct = async (
  shopId: string,
  productId: string,
  body: Record<string, unknown>
) =>
  one<DutyFreeProduct>(
    (await axiosInstance.patch(`/duty-free/shops/${shopId}/products/${productId}`, body)).data,
    "product"
  );

/** Status only through these, never an edit — as dishes. */
export const setProductStatus = async (
  shopId: string,
  productId: string,
  action: DutyFreeStatusAction
) =>
  (await axiosInstance.post(`/duty-free/shops/${shopId}/products/${productId}/${action}`, {}))
    .data;

export const deleteProduct = (shopId: string, productId: string, confirmed?: boolean) =>
  remove(`/duty-free/shops/${shopId}/products/${productId}`, confirmed);
