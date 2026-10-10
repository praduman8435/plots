"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

/**
 * Shows an approximate area (≈500 m circle), never an exact pin: sellers
 * keep control of the exact plot until they've talked to a buyer. The page
 * passes an already-approximated centre (src/lib/approximate-location.ts);
 * the real point never reaches the browser.
 *
 * Leaflet (~60 KB) and the map tiles load only when the map comes near the
 * screen, so they never compete with the photos at the top of the page.
 */
export function ApproxMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    const node = el.current;
    if (!node) return;
    const load = () => import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      const center: [number, number] = [lat, lng];
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
  }, [lat, lng]);

  return <div ref={el} role="img" aria-label={`Approximate location: ${label}`} className="h-full w-full" />;
}
