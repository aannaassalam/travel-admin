import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, type RefObject } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents
} from "react-leaflet";

/**
 * The Leaflet map behind LocationPicker, split out so it can be
 * `dynamic(..., { ssr: false })`: Leaflet reads `window` at import time, so
 * even importing this module server-side throws.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Leaflet's default marker is a PNG it resolves against the page URL, which
 * 404s under a bundler. An inline SVG pin sidesteps the asset entirely.
 */
const pin = L.divIcon({
  className: "",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="#0a2540" stroke="#ffffff" stroke-width="1.5" style="filter: drop-shadow(0 2px 4px rgb(20 22 26 / 0.35))"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5" fill="#ffffff" stroke="none"/></svg>`,
  iconSize: [32, 32],
  // Anchor at the point of the pin, not its centre, or the marker sits low.
  iconAnchor: [16, 30]
});

/** Six decimals is ~10 cm — enough, and keeps the typed boxes readable. */
const plain = (p: L.LatLng): LatLng => ({
  lat: Number(p.lat.toFixed(6)),
  lng: Number(p.lng.toFixed(6))
});

/** Close enough to tell one building from the next: past it, a click only moves the pin. */
const STREET = 16;

/** The point this map itself last produced (a click, a drag), so it is not followed. */
type Own = RefObject<LatLng | null>;

/**
 * Clicking the map places the pin — and, from far out, closes in on it a few
 * levels at a time, so each click on what is then shown is more exact. One
 * click on the whole country used to jump straight to street level at that
 * spot: an empty patch of map with no way to tell where it was.
 *
 * Not mounted when the form is read-only.
 */
function ClickToPlace({ onPick, own }: { onPick: (p: LatLng) => void; own: Own }) {
  const map = useMapEvents({
    click: (e) => {
      const at = plain(e.latlng);
      own.current = at;
      onPick(at);
      if (map.getZoom() < STREET) {
        map.setView(e.latlng, Math.min(map.getZoom() + 3, STREET));
      }
    }
  });
  return null;
}

/**
 * Follows a point typed into the boxes, loaded with the record, or a city
 * picked in the form — not one placed on this map, which is already where the
 * admin is looking. Only moves when the point is out of view or the map is
 * still zoomed out.
 */
function Follow({
  lat,
  lng,
  zoom,
  own
}: {
  lat: number;
  lng: number;
  zoom: number;
  own: Own;
}) {
  const map = useMap();
  useEffect(() => {
    if (own.current?.lat === lat && own.current.lng === lng) return;
    if (!map.getBounds().contains([lat, lng]) || map.getZoom() < zoom) {
      map.setView([lat, lng], zoom);
    }
  }, [map, lat, lng, zoom, own]);
  return null;
}

/**
 * Leaflet measures its container once, when the map is created. A map that
 * is created while hidden — inside a collapsed <details>, as on the settings
 * page — measures zero and paints grey until something resizes the window.
 * Re-measuring whenever the container's size changes covers that, and a
 * panel that merely opens.
 */
function FitContainer({ fit }: { fit?: [LatLng, LatLng] }) {
  const map = useMap();
  // The area to show (the whole country) is fitted once the box has a size —
  // and again whenever that size changes, until the admin has moved the map.
  const wanted = useRef(fit);
  wanted.current = fit;
  useEffect(() => {
    const el = map.getContainer();
    let touched = false;
    const leave = () => {
      touched = true;
    };
    map.on("zoomstart dragstart", leave);
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      const area = wanted.current;
      if (!area || touched || !el.clientWidth || !el.clientHeight) return;
      map.fitBounds(
        [
          [area[0].lat, area[0].lng],
          [area[1].lat, area[1].lng]
        ],
        { animate: false }
      );
      // Fitting is a zoom too; it is not the admin's.
      touched = false;
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      map.off("zoomstart dragstart", leave);
    };
  }, [map]);
  return null;
}

export default function LocationMap({
  value,
  center,
  zoom,
  fit,
  disabled,
  onChange
}: {
  value: LatLng | null;
  /** Where to look when there is no pin. */
  center: LatLng;
  zoom: number;
  /** An area (south-west and north-east corners) to show whole, whatever the box's shape. */
  fit?: [LatLng, LatLng];
  disabled?: boolean;
  onChange: (next: LatLng) => void;
}) {
  const focus = value ?? center;
  const own = useRef<LatLng | null>(null);
  return (
    <MapContainer
      center={[focus.lat, focus.lng]}
      zoom={zoom}
      // Scroll-wheel zoom off: the map sits inside a scrolling form, and
      // hijacking the wheel traps anyone trying to scroll past it.
      scrollWheelZoom={false}
      // A double-click is two clicks here, and each already closes in.
      doubleClickZoom={false}
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <FitContainer fit={fit} />
      <Follow lat={focus.lat} lng={focus.lng} zoom={zoom} own={own} />
      {!disabled ? <ClickToPlace onPick={onChange} own={own} /> : null}
      {value ? (
        <Marker
          position={[value.lat, value.lng]}
          icon={pin}
          draggable={!disabled}
          eventHandlers={{
            dragend: (e) => {
              const at = plain((e.target as L.Marker).getLatLng());
              own.current = at;
              onChange(at);
            }
          }}
        />
      ) : null}
    </MapContainer>
  );
}
