"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

/**
 * Shows an approximate area (≈500 m circle), never an exact pin: sellers
 * keep control of the exact plot until they've talked to a buyer.
 * The circle centre is shifted by a stable, per-plot offset so the real
 * point can't be read from the circle's middle.
 *
 * Leaflet (~60 KB) and the map tiles load only when the map comes near the
 * screen, so they never compete with the photos at the top of the page.
 */
export function ApproxMap({ lat, lng, seed, label }: { lat: number; lng: number; seed: string; label: string }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    const node = el.current;
    if (!node) return;
    const load = () => import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      const [dLat, dLng] = offset(seed);
      const center: [number, number] = [lat + dLat, lng + dLng];
      map = L.map(el.current, {
        center,
        zoom: 14,
        scrollWheelZoom: false,
        dragging: !L.Browser.mobile,
        zoomControl: false,
        attributionControl: true,
      });
      // No "Leaflet" prefix; OpenStreetMap's credit stays (their tile policy requires it), kept small in globals.css.
      map.attributionControl.setPrefix(false);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 17,
        attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>',
      }).addTo(map);
      L.circle(center, { radius: 550, color: "#0b7d4c", weight: 2, fillColor: "#16975d", fillOpacity: 0.16 }).addTo(map);
    });

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        load();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
      map?.remove();
    };
  }, [lat, lng, seed]);

  return <div ref={el} role="img" aria-label={`Approximate location: ${label}`} className="h-full w-full" />;
}

/** Deterministic ±~250 m offset from a string seed. */
function offset(seed: string): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const a = ((h >>> 0) % 1000) / 1000 - 0.5;
  const b = (((h >>> 10) >>> 0) % 1000) / 1000 - 0.5;
  return [a * 0.0045, b * 0.0045];
}
