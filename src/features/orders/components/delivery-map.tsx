"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useOrderTracking } from "@/shared/hooks/use-socket";

/**
 * Leaflet's default marker image paths resolve relative to the page, which
 * breaks under any bundler (Next's Turbopack included) — pointed at the
 * package's own CDN copy instead of vendoring the image files.
 */
const driverIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

type LatLng = { lat: number; lng: number };

/** Live driver position for one order — OpenStreetMap tiles, no API key. */
export function DeliveryMap({ orderId, destination }: { orderId: string; destination: LatLng | null }) {
  const { location, connected } = useOrderTracking(orderId);
  const center = location ?? destination;

  if (!center) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-zinc-300 text-sm text-zinc-500 dark:border-zinc-800">
        {connected ? "Waiting for the driver's location…" : "Connecting…"}
      </div>
    );
  }

  return (
    <div>
      <div className="h-64 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <MapContainer center={[center.lat, center.lng]} zoom={14} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {destination && <Marker position={[destination.lat, destination.lng]} />}
          {location && <Marker position={[location.lat, location.lng]} icon={driverIcon} />}
          <RecenterOnMove position={location} />
        </MapContainer>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {location ? `Driver location updated ${new Date(location.at).toLocaleTimeString()}` : "Showing the delivery address — waiting for the driver."}
      </p>
    </div>
  );
}

/** Pans to follow the driver marker — `MapContainer`'s `center` prop is only the initial view. */
function RecenterOnMove({ position }: { position: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView([position.lat, position.lng]);
  }, [position, map]);
  return null;
}
