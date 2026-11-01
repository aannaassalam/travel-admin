import { listLocations, type Localized } from "@/api/functions/admin.api";
import type { RideMode, RidePoint, RideStatus } from "@/api/functions/transfers.api";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { humanize } from "@/lib/functions/labels.lib";
import { numberLocale } from "@/lib/i18n/dictionaries";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Star } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** The words, chips and small helpers the Transfers pages share. */

/** The `t` of useT(), for the helpers here that return words. */
export type Translate = ReturnType<typeof useT>["t"];

/** A code's words from a key map; a code it lacks reads title-cased, as label() does. */
export const named = (t: Translate, map: Record<string, TranslationKey>, code?: string | null) =>
  code && map[code] ? t(map[code]) : humanize(code);

/** Whether `n` takes the ".one" phrase in this language (French: 0 and 1), else ".other". */
export const isOne = (locale: string, n: number) =>
  new Intl.PluralRules(locale).select(n) === "one";

/** A translated sentence with a link where it says {link}: word order stays the language's. */
export const linked = (text: string, link: ReactNode) => {
  const [before, after = ""] = text.split("{link}");
  return (
    <>
      {before}
      {link}
      {after}
    </>
  );
};

/** SPEC4's vocabulary: every status is a plain sentence. */
export const RIDE_STATUS: Record<RideStatus, TranslationKey> = {
  PENDING: "tr.status.PENDING",
  ASSIGNED: "tr.status.ASSIGNED",
  STARTED: "tr.status.STARTED",
  COMPLETED: "tr.status.COMPLETED",
  CANCELLED: "tr.status.CANCELLED"
};

export const RIDE_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  ASSIGNED: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  STARTED: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  CANCELLED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
};

export const RIDE_MODE: Record<RideMode, TranslationKey> = {
  DISTANCE: "tr.mode.DISTANCE",
  HOURLY: "tr.mode.HOURLY"
};

export const PLACE_KIND: Record<string, TranslationKey> = {
  AIRPORT: "tr.kind.AIRPORT",
  HOTEL: "tr.kind.HOTEL",
  STATION: "tr.kind.STATION",
  PORT: "tr.kind.PORT",
  LANDMARK: "tr.kind.LANDMARK",
  OTHER: "tr.kind.OTHER"
};

export const RIDE_ACTOR: Record<string, TranslationKey> = {
  CUSTOMER: "tr.actor.CUSTOMER",
  DRIVER: "tr.actor.DRIVER",
  OFFICE: "tr.actor.OFFICE",
  SYSTEM: "tr.actor.SYSTEM"
};

export const message = (e: unknown, fallback: string) =>
  (e as AxiosError<{ message?: string }>).response?.data?.message ?? fallback;

/** One city however it was typed — as the server compares them (case, outer spaces). */
export const sameCity = (a?: string, b?: string) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * A form after a 409: each box changed here keeps what was typed, the others
 * take the record as saved meanwhile — so saving again does not undo that
 * change (a Switch off on its row, say).
 */
export const rebase = <T extends object>(draft: T, opened: T, now: T): T => {
  const next = { ...draft };
  for (const k of Object.keys(draft) as (keyof T)[]) {
    if (draft[k] === opened[k]) next[k] = now[k];
  }
  return next;
};

/** A localised name as the panel reads it: French first, then whatever is filled. */
export const localName = (l?: Localized) =>
  l?.fr || l?.en || Object.values(l ?? {}).find(Boolean) || "";

/**
 * The pick-up time: a wall-clock time stored as written, with no zone — so it
 * is read in UTC, never moved by this computer's zone.
 */
export const rideWhen = (iso: string | undefined, locale: string) =>
  iso ? `${rideDay(iso, locale)}, ${iso.slice(11, 16)}` : "—";

/** Its day alone, "Tue, 3 Nov 2026" — read in UTC the same way. */
export const rideDay = (iso: string, locale: string) =>
  new Date(iso).toLocaleDateString(
    // English as it always read ("Tue, 3 Nov 2026"); the others as the panel writes numbers.
    locale === "en" ? "en-GB" : numberLocale(locale),
    { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" }
  );

/** "Aéroport de Ndjili → Hôtel Memling", or "By the hour · 3 h · from Hôtel Memling". */
export const routeText = (
  t: Translate,
  r: {
    mode: RideMode;
    pickup: RidePoint;
    dropoff?: RidePoint | null;
    hours?: number;
  }
) =>
  r.mode === "HOURLY"
    ? t("tr.route.hourly", { hours: r.hours ?? "?", from: r.pickup.label })
    : t("tr.route.journey", { from: r.pickup.label, to: r.dropoff?.label ?? "?" });

/** "12.4 km · 35 min", with how the figure was reached when it was a guess. */
export const distanceText = (
  t: Translate,
  r: {
    distanceKm: number;
    durationMinutes: number;
    routeSource: string;
  }
) =>
  t(r.routeSource === "ESTIMATE" ? "tr.route.distanceEstimated" : "tr.route.distance", {
    km: r.distanceKm,
    min: r.durationMinutes
  });

/** Opens the point in the phone's maps app — for the office and in the alert SMS alike. */
export const mapsLink = (lat: number, lng: number) =>
  `https://maps.google.com/?q=${lat},${lng}`;

export function RideStatusBadge({ status }: { status: string }) {
  const { t } = useT();
  return (
    <Badge variant="secondary" className={RIDE_STATUS_STYLES[status]}>
      {named(t, RIDE_STATUS, status)}
    </Badge>
  );
}

export function Stars({ n }: { n: number }) {
  const { t } = useT();
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={t("tr.stars.aria", { n })}>
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
 * a place agree on the spelling and match the rides of that city. In a form,
 * cities only (no airport or station: rides are matched on the city), with a
 * warning while it does not sell transfers. As a filter (`any`), the first
 * choice is every city.
 */
export function CitySelect({
  value,
  onChange,
  label,
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
  const { t } = useT();
  const text = label ?? t("common.city");
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
  const options = (data?.items ?? []).filter(
    (l) => (l.isActive && (any || l.kind === "CITY")) || sameCity(l.name, value)
  );
  // Matched as the server matches (case, outer spaces): "matadi" is Matadi.
  const chosen = any ? undefined : options.find((l) => sameCity(l.name, value));
  // What keeps rides from the chosen city, as its Locations row puts it right.
  const off = chosen ? !chosen.isActive : false;
  const unticked = chosen ? !chosen.servesVerticals.includes("TRANSFER") : false;
  const todo = off
    ? t(unticked ? "tr.city.todoBoth" : "tr.city.todoActivate")
    : unticked
      ? t("tr.city.todoTick")
      : "";
  const select = (
    <select
      disabled={disabled}
      aria-label={text}
      className={cn(
        "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm",
        any ? "min-w-40" : "w-full",
        className
      )}
      value={chosen?.name ?? value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{any ? t("tr.city.all") : t("tr.city.choose")}</option>
      {options.map((l) => (
        <option key={l.id} value={l.name}>
          {l.isActive ? l.name : t("tr.city.switchedOff", { name: l.name })}
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
      {chosen && todo ? (
        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
          {linked(
            t("tr.city.notOffered", { city: chosen.name, todo }),
            <Link href="/locations" className="underline underline-offset-2">
              {t("nav.locations")}
            </Link>
          )}
        </p>
      ) : null}
      <p className="mt-1 text-[11px] text-muted-foreground">
        {isError ? t("tr.city.loadFailed") : null}
        {linked(
          t("tr.city.notInList"),
          <Link href="/locations" className="underline underline-offset-2">
            {t("tr.city.addUnder")}
          </Link>
        )}
      </p>
    </div>
  );
}
