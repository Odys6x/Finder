/**
 * Google Maps directions. Two levels:
 * - `directionsLink`: opens Google Maps (app or web) with directions. Free, no key.
 * - `directionsEmbedUrl`: Maps Embed API iframe showing the route in-page. Needs
 *   NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY (restrict it to your domain + the Maps Embed API).
 * Google route content is shown on Google's own map only, per Google's terms.
 */
import type { LatLng } from "./geo";

export type TravelMode = "transit" | "walking" | "driving" | "bicycling";

export const TRAVEL_MODES: { v: TravelMode; label: string }[] = [
  { v: "transit", label: "MRT / bus" },
  { v: "walking", label: "Walk" },
  { v: "driving", label: "Car" },
];

export interface Destination {
  name: string;
  postalCode: string;
  lat: number | null;
  lng: number | null;
}

/** Name + postal code makes Google pin the school itself, not just the coordinate. */
function destQuery(d: Destination) {
  return `${d.name}, Singapore ${d.postalCode}`;
}

export function directionsLink(origin: LatLng, dest: Destination, mode: TravelMode = "transit") {
  const p = new URLSearchParams({
    api: "1",
    origin: `${origin.lat},${origin.lng}`,
    destination: destQuery(dest),
    travelmode: mode,
  });
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

export function directionsEmbedUrl(key: string, origin: LatLng, dest: Destination, mode: TravelMode = "transit") {
  const p = new URLSearchParams({
    key,
    origin: `${origin.lat},${origin.lng}`,
    destination: destQuery(dest),
    mode,
    region: "sg",
  });
  return `https://www.google.com/maps/embed/v1/directions?${p.toString()}`;
}

export const EMBED_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ?? "";
