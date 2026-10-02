import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { LatLng } from "./LocationMap";

/**
 * Where an item sits on the map, as the public site will show it.
 *
 * Coordinates can be typed, or the pin dropped by clicking the map and dragged
 * into place. `null` is a real value — "no pin" — and the forms send it so a
 * cleared location is cleared on the server too.
 *
 * The map is client-only: Leaflet touches `window` at import time, so the
 * canvas loads with `ssr: false` and a plain box stands in until it does.
 */

export type Geo = LatLng | null;

const Map = dynamic(() => import("./LocationMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-muted/40" />
});

/** Serviced city centres — where the map opens when there is no pin yet. */
const CITY_CENTRES: Record<string, LatLng> = {
  kinshasa: { lat: -4.4419, lng: 15.2663 },
  lubumbashi: { lat: -11.6876, lng: 27.5026 },
  goma: { lat: -1.6585, lng: 29.2206 },
  bukavu: { lat: -2.5083, lng: 28.8608 },
  matadi: { lat: -5.8167, lng: 13.45 },
  kisangani: { lat: 0.5153, lng: 25.19 },
  "mbuji-mayi": { lat: -6.136, lng: 23.5898 },
  kananga: { lat: -5.896, lng: 22.4166 }
};

/** The whole country, when neither a pin nor a known city is available. */
const DRC: LatLng = { lat: -2.9, lng: 23.6 };

const toText = (n?: number) => (typeof n === "number" ? String(n) : "");

export default function LocationPicker({
  value,
  onChange,
  city,
  disabled,
  compact,
  label = "Location on the map (shown to customers)"
}: {
  value: Geo;
  onChange: (next: Geo) => void;
  /** Centres the empty map on this city when it is one we know. */
  city?: string;
  /** Read-only: boxes disabled, the map can be looked at but not clicked. */
  disabled?: boolean;
  /** Boxes only, with the map behind a disclosure — for lists of these. */
  compact?: boolean;
  label?: string;
}) {
  // The boxes hold text so a half-typed "-4." survives; the parent only hears
  // about complete pairs (or both boxes empty, which is "no pin").
  const [lat, setLat] = useState(toText(value?.lat));
  const [lng, setLng] = useState(toText(value?.lng));

  // The map, Clear or a loaded record moved the pin: reflect it, without
  // reformatting text that already means the same number.
  useEffect(() => {
    setLat((t) => (t !== "" && Number(t) === value?.lat ? t : toText(value?.lat)));
    setLng((t) => (t !== "" && Number(t) === value?.lng ? t : toText(value?.lng)));
  }, [value]);

  // One box filled, or text that is not a number: nothing is sent, and that
  // has to be said, or a save quietly keeps the old pin (or none).
  const [incomplete, setIncomplete] = useState(false);
  const emit = (latText: string, lngText: string) => {
    const a = latText.trim();
    const b = lngText.trim();
    if (!a && !b) {
      setIncomplete(false);
      return onChange(null);
    }
    // Range is the server's call — it answers 400 with a message the form shows.
    const whole = Boolean(a && b && Number.isFinite(Number(a)) && Number.isFinite(Number(b)));
    setIncomplete(!whole);
    if (whole) onChange({ lat: Number(a), lng: Number(b) });
  };

  const cityCentre = city ? CITY_CENTRES[city.trim().toLowerCase()] : undefined;
  const map = (
    // `isolate` keeps Leaflet's own z-indexes (panes 400, controls 1000) from
    // painting over the sticky page header.
    <div
      className={cn(
        "relative isolate z-0 overflow-hidden rounded-md border",
        compact ? "h-44" : "h-64"
      )}
    >
      <Map
        value={value}
        center={cityCentre ?? DRC}
        // 17 with a pin: the same zoom the website and the app show it at.
        zoom={value ? 17 : cityCentre ? 11 : 5}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <Label className="text-xs">{label}</Label>
        {!disabled && value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-xs"
            onClick={() => onChange(null)}
          >
            Clear
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          step="any"
          min={-90}
          max={90}
          placeholder="Latitude"
          disabled={disabled}
          value={lat}
          onChange={(e) => {
            setLat(e.target.value);
            emit(e.target.value, lng);
          }}
        />
        <Input
          type="number"
          step="any"
          min={-180}
          max={180}
          placeholder="Longitude"
          disabled={disabled}
          value={lng}
          onChange={(e) => {
            setLng(e.target.value);
            emit(lat, e.target.value);
          }}
        />
      </div>
      {incomplete ? (
        <p className="text-xs text-destructive" role="alert">
          Enter both latitude and longitude as numbers, or leave both empty.
        </p>
      ) : null}
      {compact ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            {value ? "Show on the map" : "Pick on the map"}
          </summary>
          <div className="pt-2">{map}</div>
        </details>
      ) : (
        <div className="mt-2">{map}</div>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        {disabled ? "" : "Click the map to drop the pin, then drag it into place. "}
        Without a pin the public site shows the city only.
      </p>
    </div>
  );
}
