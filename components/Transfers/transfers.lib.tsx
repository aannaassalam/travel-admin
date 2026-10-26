import { listLocations, type Localized } from "@/api/functions/admin.api";
import type { RideMode, RidePoint, RideStatus } from "@/api/functions/transfers.api";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { label } from "@/lib/functions/labels.lib";
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Star } from "lucide-react";
import Link from "next/link";

/** The words, chips and small helpers the Transfers pages share. */

/** SPEC4's vocabulary: every status is a plain sentence. */
export const RIDE_STATUS: Record<RideStatus, string> = {
  PENDING: "Awaiting a driver",
  ASSIGNED: "Driver assigned",
  STARTED: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled"
};

export const RIDE_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  ASSIGNED: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  STARTED: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  CANCELLED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
};

export const RIDE_MODE: Record<RideMode, string> = {
  DISTANCE: "Journey (A → B)",
  HOURLY: "By the hour"
};

export const PLACE_KIND: Record<string, string> = {
  AIRPORT: "Airport",
  HOTEL: "Hotel",
  STATION: "Station",
  PORT: "Port",
  LANDMARK: "Landmark",
  OTHER: "Other"
};

export const RIDE_ACTOR: Record<string, string> = {
  CUSTOMER: "Customer",
  DRIVER: "Driver",
  OFFICE: "Office",
  SYSTEM: "System"
};

export const message = (e: unknown, fallback: string) =>
  (e as AxiosError<{ message?: string }>).response?.data?.message ?? fallback;

/** A localised name as the panel reads it: French first, then whatever is filled. */
export const localName = (l?: Localized) =>
  l?.fr || l?.en || Object.values(l ?? {}).find(Boolean) || "";

/**
 * The pick-up time: a wall-clock time stored as written, with no zone — so it
 * is read in UTC, never moved by this computer's zone.
 */
export const rideWhen = (iso?: string) =>
  iso ? `${rideDay(iso)}, ${iso.slice(11, 16)}` : "—";

/** Its day alone, "Tue, 3 Nov 2026" — read in UTC the same way. */
export const rideDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });

/** "Aéroport de Ndjili → Hôtel Memling", or "By the hour · 3 h · from Hôtel Memling". */
export const routeText = (r: {
  mode: RideMode;
  pickup: RidePoint;
  dropoff?: RidePoint | null;
  hours?: number;
}) =>
  r.mode === "HOURLY"
    ? `By the hour · ${r.hours ?? "?"} h · from ${r.pickup.label}`
    : `${r.pickup.label} → ${r.dropoff?.label ?? "?"}`;

/** "12.4 km · 35 min", with how the figure was reached when it was a guess. */
export const distanceText = (r: {
  distanceKm: number;
  durationMinutes: number;
  routeSource: string;
}) =>
  `${r.distanceKm} km · ${r.durationMinutes} min${
    r.routeSource === "ESTIMATE" ? " (estimated)" : ""
  }`;

/** Opens the point in the phone's maps app — for the office and in the alert SMS alike. */
export const mapsLink = (lat: number, lng: number) =>
  `https://maps.google.com/?q=${lat},${lng}`;

export function RideStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={RIDE_STATUS_STYLES[status]}>
      {label(RIDE_STATUS, status)}
    </Badge>
  );
}

export function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={cn(
            "size-3.5",
            i <= Math.round(n) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
          )}
        />
      ))}
    </span>
  );
}

/**
 * A city from the serviced locations — never typed, so a driver, a vehicle and
 * a place agree on the spelling and match the rides of that city. As a filter
 * (`any`), the first choice is every city.
 */
export function CitySelect({
  value,
  onChange,
  label: text = "City",
  any,
  required,
  disabled,
  className
}: {
  value: string;
  onChange: (city: string) => void;
  label?: string;
  any?: boolean;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  // The locations are inventory. On the rides board (orders:read) an admin
  // without inventory:read would only get a 403 and an empty list: no filter
  // for them rather than one that can never narrow anything.
  const { can } = useCan();
  const allowed = can("inventory:read");
  const { data, isError } = useQuery({
    queryKey: ["locations"],
    queryFn: listLocations,
    staleTime: 5 * 60 * 1000,
    enabled: allowed
  });
  if (any && !allowed) return null;
  // Switched-off cities are not offered, except the one already chosen.
  const options = (data?.items ?? []).filter((l) => l.isActive || l.name === value);
  const select = (
    <select
      disabled={disabled}
      aria-label={text}
      className={cn(
        "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm",
        any ? "min-w-40" : "w-full",
        className
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{any ? "All cities" : "Choose a city…"}</option>
      {options.map((l) => (
        <option key={l.id} value={l.name}>
          {l.name}
          {l.isActive ? "" : " (switched off)"}
        </option>
      ))}
    </select>
  );
  if (any) return select;
  return (
    <div>
      <Label className="text-xs">
        {text}
        {required ? " *" : ""}
      </Label>
      {select}
      <p className="mt-1 text-[11px] text-muted-foreground">
        {isError ? "Could not load the locations. " : null}
        Not in the list?{" "}
        <Link href="/locations" className="underline underline-offset-2">
          Add it under Locations
        </Link>
        .
      </p>
    </div>
  );
}
