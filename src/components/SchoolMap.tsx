"use client";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export interface MapPoint {
  code: string;
  name: string;
  lat: number;
  lng: number;
  sub?: string;
  color?: string;
}

/**
 * OneMap basemap via Leaflet. Leaflet is loaded lazily so the list view stays light
 * (Lighthouse). OneMap attribution is required by its terms.
 */
export default function SchoolMap({
  points,
  home,
  height = 420,
}: {
  points: MapPoint[];
  home?: { lat: number; lng: number } | null;
  height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !el.current) return;
      if (!mapRef.current) {
        const map = L.map(el.current, {
          center: [1.3521, 103.8198],
          zoom: 11,
          minZoom: 11,
          maxZoom: 18,
          maxBounds: [
            [1.144, 103.535],
            [1.494, 104.1147],
          ],
        });
        L.tileLayer("https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png", {
          detectRetina: true,
          maxZoom: 19,
          minZoom: 11,
          attribution:
            '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;display:inline"/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>',
        }).addTo(map);
        mapRef.current = map;
        layerRef.current = L.layerGroup().addTo(map);
      }
      const layer = layerRef.current!;
      layer.clearLayers();
      const bounds: [number, number][] = [];
      for (const p of points) {
        const m = L.circleMarker([p.lat, p.lng], {
          radius: 7,
          color: "#fff",
          weight: 2,
          fillColor: p.color ?? "#0f6e6a",
          fillOpacity: 0.95,
        });
        const a = document.createElement("a");
        a.href = `/schools/${p.code}`;
        a.textContent = p.name;
        a.style.fontWeight = "600";
        const wrap = document.createElement("div");
        wrap.appendChild(a);
        if (p.sub) {
          const s = document.createElement("div");
          s.textContent = p.sub;
          s.style.color = "#5b6b79";
          wrap.appendChild(s);
        }
        m.bindPopup(wrap);
        m.addTo(layer);
        bounds.push([p.lat, p.lng]);
      }
      if (home) {
        L.circleMarker([home.lat, home.lng], { radius: 8, color: "#13212e", weight: 3, fillColor: "#fff", fillOpacity: 1 })
          .bindPopup("Home")
          .addTo(layer);
        bounds.push([home.lat, home.lng]);
      }
      if (bounds.length > 1) mapRef.current!.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      else if (bounds.length === 1) mapRef.current!.setView(bounds[0], 15);
    })();
    return () => {
      cancelled = true;
    };
  }, [points, home]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  return <div ref={el} style={{ height }} className="z-0 w-full overflow-hidden rounded-2xl border border-line" />;
}
