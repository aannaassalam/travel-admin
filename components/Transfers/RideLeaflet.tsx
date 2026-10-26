import { formatDateTime } from "@/lib/functions/format.lib";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap
} from "react-leaflet";

/**
 * A ride on the map: the pick-up (A), the drop-off (B), the road between them
 * and where any security alert was raised. Split out so the page can
 * `dynamic(..., { ssr: false })` it, as LocationPicker does with LocationMap:
 * Leaflet reads `window` at import time, so even importing this server-side
 * throws.
 */

export interface RideMapProps {
  pickup: { lat: number; lng: number; label: string };
  dropoff?: { lat: number; lng: number; label: string } | null;
  /** [lng, lat] pairs, as the routing service gives them. */
  route?: [number, number][];
  alerts?: { lat?: number; lng?: number; at: string }[];
}

type Pair = [number, number];

/** Leaflet's default marker is a PNG that 404s under a bundler: an inline SVG pin, lettered. */
const pin = (letter: string, fill: string) =>
  L.divIcon({
    className: "",
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="${fill}" stroke="#ffffff" stroke-width="1.5" style="filter: drop-shadow(0 2px 4px rgb(20 22 26 / 0.35))"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><text x="12" y="13.5" text-anchor="middle" font-family="system-ui, sans-serif" font-size="9" font-weight="700" fill="#ffffff" stroke="none">${letter}</text></svg>`,
    iconSize: [34, 34],
    // Anchor at the point of the pin, not its centre, or the marker sits low.
    iconAnchor: [17, 32]
  });
const PICKUP = pin("A", "#059669");
const DROPOFF = pin("B", "#dc2626");
/** Where an alert was raised: a red dot, so it is not read as a stop. */
const ALERT = L.divIcon({
  className: "",
  html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:#dc2626;border:2px solid #fff;box-shadow:0 0 0 4px rgb(220 38 38 / 0.3)"></span>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const LINE = { color: "#0a2540", weight: 4, opacity: 0.85 };

/**
 * Leaflet measures its container once, when the map is created. Created in a
 * card that is still laying out, it measures zero and paints grey — so it is
 * measured again and fitted to the ride once the box has a size, and whenever
 * the ride's points change.
 */
function Fit({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap();
  useEffect(() => {
    const show = () => {
      const el = map.getContainer();
      if (!el.clientWidth || !el.clientHeight) return false;
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15, animate: false });
      return true;
    };
    if (show()) return;
    const observer = new ResizeObserver(() => {
      if (show()) observer.disconnect();
    });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map, bounds]);
  return null;
}

export default function RideLeaflet({ pickup, dropoff, route, alerts }: RideMapProps) {
  const line: Pair[] = (route ?? []).map(([lng, lat]) => [lat, lng]);
  const marks = (alerts ?? []).filter(
    (a): a is { lat: number; lng: number; at: string } =>
      typeof a.lat === "number" && typeof a.lng === "number"
  );
  const points: Pair[] = [
    [pickup.lat, pickup.lng],
    ...(dropoff ? [[dropoff.lat, dropoff.lng] as Pair] : []),
    ...line,
    ...marks.map((a): Pair => [a.lat, a.lng])
  ];
  // Fitted again only when the ride's points change — not on every render of
  // the page around it, which would snap back a map the admin has just moved.
  const key = points.map((p) => p.join(",")).join(";");
  const held = useRef<{ key: string; bounds: L.LatLngBounds } | null>(null);
  if (held.current?.key !== key) held.current = { key, bounds: L.latLngBounds(points) };
  const bounds = held.current.bounds;

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [28, 28], maxZoom: 15 }}
      // The map sits in a scrolling page: hijacking the wheel traps the reader.
      scrollWheelZoom={false}
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <Fit bounds={bounds} />
      {line.length ? (
        <Polyline positions={line} pathOptions={LINE} />
      ) : dropoff ? (
        // No road from the routing service (the price was estimated): the two
        // points joined by a dashed line, so the gap is legible, not a bug.
        <Polyline
          positions={[
            [pickup.lat, pickup.lng],
            [dropoff.lat, dropoff.lng]
          ]}
          pathOptions={{ ...LINE, weight: 3, dashArray: "6 8" }}
        />
      ) : null}
      <Marker position={[pickup.lat, pickup.lng]} icon={PICKUP}>
        <Tooltip direction="top" offset={[0, -30]}>
          Pick-up · {pickup.label}
        </Tooltip>
      </Marker>
      {dropoff ? (
        <Marker position={[dropoff.lat, dropoff.lng]} icon={DROPOFF}>
          <Tooltip direction="top" offset={[0, -30]}>
            Drop-off · {dropoff.label}
          </Tooltip>
        </Marker>
      ) : null}
      {marks.map((a, i) => (
        <Marker key={`${a.at}-${i}`} position={[a.lat, a.lng]} icon={ALERT}>
          <Tooltip direction="top" offset={[0, -10]}>
            Security alert · {formatDateTime(a.at)}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
