import axiosInstance from "@/api/axiosInstance";
import type {
  Localized,
  Money,
  PageParams,
  Paged,
  StoredFile
} from "@/api/functions/admin.api";

/**
 * Transfers: rides with a driver. A ride is booked as an ordinary order
 * (vertical TRANSFER) whose one line points at the Ride, so payment, the cash
 * deadline and the Bookings page come for free; the ride itself holds the two
 * points, the route, the driver and the status timeline. The fleet — vehicle
 * categories, vehicles, drivers and the office's saved places — lives here too.
 *
 * Fleet = inventory:*; rides = orders:*. Mirrors SPEC4's admin API.
 */

export type RideStatus =
  | "PENDING"
  | "ASSIGNED"
  | "STARTED"
  | "COMPLETED"
  | "CANCELLED";
/** A→B priced per km, or a driver at disposal priced per hour. */
export type RideMode = "DISTANCE" | "HOURLY";
export type PlaceKind =
  | "AIRPORT"
  | "HOTEL"
  | "STATION"
  | "PORT"
  | "LANDMARK"
  | "OTHER";

/** Blank filters left out, so the URL says only what was chosen. */
const query = (params: object) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
  );

/** The question stays on screen until this answers: a hung request must give up. */
const remove = async (path: string) => {
  await axiosInstance.delete(path, { timeout: 30_000 });
};

// --- Vehicle categories -----------------------------------------------------

export interface VehicleCategory {
  id: string;
  name: Localized;
  description: Localized;
  image?: string;
  /** Most passengers it takes. */
  seats: number;
  luggage?: string;
  /** Whole francs. A category is sold by the km, by the hour, or both. */
  pricePerKm: Money;
  pricePerHour: Money;
  minimumFare: Money;
  /** What the office pays the driver — never shown to customers. */
  costPerKm: Money;
  costPerHour: Money;
  sortOrder: number;
  isActive: boolean;
  /** How many vehicles are of it — one in use cannot be deleted (409 CATEGORY_IN_USE). */
  vehicleCount?: number;
  version: number;
  updatedAt: string;
}

export type VehicleCategoryInput = Partial<
  Omit<VehicleCategory, "id" | "vehicleCount" | "version" | "updatedAt">
> & { version?: number };

export const listCategories = async () =>
  (await axiosInstance.get<{ items: VehicleCategory[] }>("/transfers/categories"))
    .data;

export const createCategory = async (body: VehicleCategoryInput) =>
  (await axiosInstance.post("/transfers/categories", body)).data;

export const updateCategory = async (id: string, body: VehicleCategoryInput) =>
  (await axiosInstance.patch(`/transfers/categories/${id}`, body)).data;

/** Only one no vehicle is of; otherwise 409 CATEGORY_IN_USE. */
export const deleteCategory = (id: string) => remove(`/transfers/categories/${id}`);

// --- Vehicles ---------------------------------------------------------------

export interface Vehicle {
  id: string;
  /** A serviced location's name, like a listing's city. */
  city: string;
  /** The category, filled in by the server; `categoryId` is what the form sends back. */
  category?: { id: string; name: Localized; seats: number };
  categoryId: string;
  make: string;
  model: string;
  year?: number | null;
  color?: string;
  /** Upper-cased by the server; unique per city. */
  plate: string;
  /** Overrides the category's seats when set; null once cleared. */
  seats?: number | null;
  image?: string;
  isActive: boolean;
  version: number;
  updatedAt: string;
}

export type VehicleInput = Partial<
  Omit<Vehicle, "id" | "category" | "categoryId" | "version" | "updatedAt" | "year" | "seats">
> & {
  /** The category's id. */
  category?: string;
  /** null clears it (seats: back to the category's). */
  year?: number | null;
  seats?: number | null;
  version?: number;
};

export const listVehicles = async (params: { city?: string; category?: string } = {}) =>
  (
    await axiosInstance.get<{ items: Vehicle[] }>("/transfers/vehicles", {
      params: query(params)
    })
  ).data;

export const createVehicle = async (body: VehicleInput) =>
  (await axiosInstance.post("/transfers/vehicles", body)).data;

export const updateVehicle = async (id: string, body: VehicleInput) =>
  (await axiosInstance.patch(`/transfers/vehicles/${id}`, body)).data;

/** Refused while a ride is booked on it (409 VEHICLE_IN_USE); its drivers are unlinked. */
export const deleteVehicle = (id: string) => remove(`/transfers/vehicles/${id}`);

/** A vehicle as it rides along on a driver or a ride. */
export interface VehicleRef {
  id: string;
  plate: string;
  make?: string;
  model?: string;
  color?: string;
  seats?: number;
}

/** "1234 AB 05 · Toyota Corolla" */
export const vehicleText = (v?: VehicleRef | null) =>
  v ? `${v.plate} · ${[v.make, v.model].filter(Boolean).join(" ")}`.trim() : undefined;

// --- Drivers ----------------------------------------------------------------

export interface Driver {
  id: string;
  name: string;
  /** E.164 — what they sign in to the driver portal with. */
  phone: string;
  city: string;
  photo?: string;
  licenceNumber?: string;
  /** The vehicle they drive, filled in by the server; `vehicleId` is what the form sends back. */
  vehicle?: VehicleRef | null;
  vehicleId?: string;
  isActive: boolean;
  ratingStats: { rating: number; count: number };
  /** On a STARTED ride right now. */
  onRideNow?: boolean;
  /** Set by the office; never sent by SMS. */
  hasPassword?: boolean;
  lastSeenAt?: string;
  version: number;
  updatedAt: string;
}

export type DriverInput = Partial<
  Pick<Driver, "name" | "phone" | "city" | "photo" | "licenceNumber" | "isActive">
> & {
  /** The vehicle's id; null takes it away. */
  vehicle?: string | null;
  version?: number;
};

/** A driver of the ride's city, with whether the ride's time is free. */
export interface AvailableDriver extends Driver {
  /** The reference of the ride that overlaps, when there is one. */
  busy?: string;
  onRideNow: boolean;
}

export const listDrivers = async (params: { city?: string; active?: boolean } = {}) =>
  (
    await axiosInstance.get<{ items: Driver[] }>("/transfers/drivers", {
      params: query(params)
    })
  ).data;

/** The new driver gets the portal link by SMS; the office then sets their password. */
export const createDriver = async (body: DriverInput) =>
  (await axiosInstance.post<{ driver?: Driver }>("/transfers/drivers", body)).data;

export const updateDriver = async (id: string, body: DriverInput) =>
  (await axiosInstance.patch(`/transfers/drivers/${id}`, body)).data;

/** Refused while a ride is assigned to them (409 DRIVER_IN_USE). */
export const deleteDriver = (id: string) => remove(`/transfers/drivers/${id}`);

/** Sets or resets the portal password. Audited; the office tells the driver. */
export const setDriverPassword = async (id: string, password: string) =>
  (await axiosInstance.post(`/transfers/drivers/${id}/password`, { password })).data;

export const availableDrivers = async (params: {
  city: string;
  /** The ride's pick-up time, as the ride carries it. */
  at: string;
  minutes: number;
  /** The ride being assigned, so it does not count as its own conflict. */
  except?: string;
}) =>
  (
    await axiosInstance.get<{ items: AvailableDriver[] }>(
      "/transfers/drivers/available",
      { params }
    )
  ).data;

// --- Places -----------------------------------------------------------------

/** A pick-up or drop-off point the office saved: offered as a suggestion. */
export interface TransferPlace {
  id: string;
  city: string;
  name: Localized;
  kind: PlaceKind;
  lat: number;
  lng: number;
  isActive: boolean;
  sortOrder: number;
  version: number;
  updatedAt: string;
}

export type TransferPlaceInput = Partial<
  Omit<TransferPlace, "id" | "version" | "updatedAt">
> & { version?: number };

export const listPlaces = async (params: { city?: string } = {}) =>
  (
    await axiosInstance.get<{ items: TransferPlace[] }>("/transfers/places", {
      params: query(params)
    })
  ).data;

export const createPlace = async (body: TransferPlaceInput) =>
  (await axiosInstance.post("/transfers/places", body)).data;

export const updatePlace = async (id: string, body: TransferPlaceInput) =>
  (await axiosInstance.patch(`/transfers/places/${id}`, body)).data;

export const deletePlace = (id: string) => remove(`/transfers/places/${id}`);

// --- Setup ------------------------------------------------------------------

/** §9: what each city has, and lacks, for rides to be sold and driven. */
export interface TransferSetup {
  /** Active categories, and how many of them have a price per km / per hour. */
  categories: { active: number; perKm: number; perHour: number };
  /** Every city with fleet records or that sells transfers. */
  cities: {
    name: string;
    servesTransfer: boolean;
    vehicles: number;
    activeVehicles: number;
    drivers: number;
    driversWithVehicle: number;
    places: number;
  }[];
}

export const getTransferSetup = async () =>
  (await axiosInstance.get<TransferSetup>("/transfers/setup")).data;

// --- Images -----------------------------------------------------------------

/**
 * Pictures of categories, vehicles and drivers: the shared upload handler,
 * pinned to the public 'transfers' folder (inventory:write).
 */
export const uploadTransferImage = async (files: File[]) => {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  return (
    await axiosInstance.post<{ files: StoredFile[] }>("/transfers/uploads", fd, {
      // Let the browser set the multipart boundary itself.
      headers: { "Content-Type": undefined }
    })
  ).data;
};

// --- Rides ------------------------------------------------------------------

export interface RidePoint {
  label: string;
  lat: number;
  lng: number;
  placeId?: string;
}

export interface RideDriver {
  id: string;
  name: string;
  phone?: string;
  photo?: string;
  city?: string;
  isActive?: boolean;
  ratingStats?: { rating: number; count: number };
}

export interface RideRow {
  id: string;
  /** The order's reference, once the order exists. */
  reference: string;
  status: RideStatus;
  mode: RideMode;
  city: string;
  pickup: RidePoint;
  /** Absent on a ride by the hour. */
  dropoff?: RidePoint | null;
  /** The pick-up time, wall-clock as written: read it in UTC. */
  at: string;
  /** By the hour: 1–12. */
  hours?: number;
  passengers: number;
  distanceKm: number;
  durationMinutes: number;
  /** `name` is the snapshot taken when booked. */
  category: { id: string; name: string };
  customer: { id: string; name: string; phone?: string };
  driver?: RideDriver | null;
  vehicle?: VehicleRef | null;
  /** What the customer pays and what the office pays out — whole francs, snapshots. */
  price: number;
  cost: number;
  alertsCount: number;
  /** The booking, as much as a row needs: the payment chip. */
  order?: Pick<RideOrder, "id" | "reference" | "status" | "paymentStatus" | "paymentMethod">;
  createdAt: string;
}

export interface RideTimelineEvent {
  at: string;
  event: string;
  actor: "CUSTOMER" | "DRIVER" | "OFFICE" | "SYSTEM";
  detail?: string;
}

export interface RideAlert {
  at: string;
  by: "CUSTOMER" | "DRIVER";
  lat?: number;
  lng?: number;
  note?: string;
  smsSent: boolean;
  /** A Google Maps link to the position, when one was shared. */
  mapsLink?: string;
}

/** The booking the ride belongs to, as much as the ride page needs. */
export interface RideOrder {
  id: string;
  reference: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  /** Whole francs. */
  total: number;
  chargedTotal?: number;
  chargedCurrency?: string;
  cashDeadline?: string;
  customer?: { id?: string; fullName: string; phone?: string; email?: string };
}

export interface Ride extends RideRow {
  /** ESTIMATE: the routing service was down, straight line × the detour factor. */
  routeSource: "ROUTING" | "ESTIMATE";
  /** [lng, lat] pairs, as the routing service gives them; ≤ 500. */
  route?: [number, number][];
  /** The customer's note: flight number, luggage… */
  notes?: string;
  assignedAt?: string;
  startedAt?: string;
  endedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  timeline: RideTimelineEvent[];
  rating?: { score: number; comment?: string; at: string };
  alerts: RideAlert[];
  order?: RideOrder;
}

export interface RidesPage extends Paged<RideRow> {
  counts: Record<RideStatus, number>;
}

export const listRides = async (
  params: {
    status?: string;
    city?: string;
    driver?: string;
    /** YYYY-MM-DD, pick-up days, both inclusive. */
    from?: string;
    to?: string;
    /** Reference or customer. */
    q?: string;
  } & PageParams = {}
) =>
  (await axiosInstance.get<RidesPage>("/transfers/rides", { params: query(params) }))
    .data;

export const getRide = async (id: string) =>
  (await axiosInstance.get<{ ride: Ride }>(`/transfers/rides/${id}`)).data.ride;

/**
 * The vehicle defaults to the driver's. A driver with an overlapping ride is
 * refused with 409 DRIVER_BUSY (the message names the ride) unless `force`.
 */
export const assignRide = async (
  id: string,
  body: { driverId: string; vehicleId?: string; force?: boolean }
) => (await axiosInstance.post(`/transfers/rides/${id}/assign`, body)).data;

export const unassignRide = async (id: string) =>
  (await axiosInstance.post(`/transfers/rides/${id}/unassign`, {})).data;

/** The office doing it for the driver: the timeline says OFFICE. */
export const startRide = async (id: string) =>
  (await axiosInstance.post(`/transfers/rides/${id}/start`, {})).data;

export const endRide = async (id: string) =>
  (await axiosInstance.post(`/transfers/rides/${id}/end`, {})).data;

/** Cancels the ride AND its booking, the way the Bookings page cancels an order. */
export const cancelRide = async (id: string, body: { reason: string; note?: string }) =>
  (await axiosInstance.post(`/transfers/rides/${id}/cancel`, body)).data;
