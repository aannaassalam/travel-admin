import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
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

/** Clicking the map places the pin. Not mounted when the form is read-only. */
function ClickToPlace({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick(plain(e.latlng)) });
  return null;
}

/**
 * Follows a point typed into the boxes or a city picked in the form. Only
 * moves when the point is out of view or the map is still zoomed out, so
 * dragging the pin around does not make the map chase it.
 */
function Follow({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map.getBounds().contains([lat, lng]) || map.getZoom() < zoom) {
      map.setView([lat, lng], zoom);
    }
  }, [map, lat, lng, zoom]);
  return null;
}

/**
 * Leaflet measures its container once, when the map is created. A map that
 * is created while hidden — inside a collapsed <details>, as on the settings
 * page — measures zero and paints grey until something resizes the window.
 * Re-measuring whenever the container's size changes covers that, and a
 * panel that merely opens.
 */
function FitContainer() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

export default function LocationMap({
  value,
  center,
  zoom,
  disabled,
  onChange
}: {
  value: LatLng | null;
  /** Where to look when there is no pin. */
  center: LatLng;
  zoom: number;
  disabled?: boolean;
  onChange: (next: LatLng) => void;
}) {
  const focus = value ?? center;
  return (
    <MapContainer
      center={[focus.lat, focus.lng]}
      zoom={zoom}
      // Scroll-wheel zoom off: the map sits inside a scrolling form, and
      // hijacking the wheel traps anyone trying to scroll past it.
      scrollWheelZoom={false}
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <FitContainer />
      <Follow lat={focus.lat} lng={focus.lng} zoom={zoom} />
      {!disabled ? <ClickToPlace onPick={onChange} /> : null}
      {value ? (
        <Marker
          position={[value.lat, value.lng]}
          icon={pin}
          draggable={!disabled}
          eventHandlers={{
            dragend: (e) => onChange(plain((e.target as L.Marker).getLatLng()))
          }}
        />
      ) : null}
    </MapContainer>
  );
}
