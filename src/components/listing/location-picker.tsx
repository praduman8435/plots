"use client";

import "leaflet/dist/leaflet.css";
import { Loader2, LocateFixed, MapPin, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Coords = { lat: number; lng: number };
type Place = { label: string; lat: number; lng: number };

/**
 * Seller-side pin picker: search a place, tap the map, drag the pin, or use
 * the phone's location. Buyers never see this exact point — public pages
 * show an approximate circle only.
 */
export function LocationPicker({
  value,
  onChange,
  center,
  areaHint,
}: {
  value: Coords | null;
  onChange: (c: Coords | null) => void;
  center: Coords;
  /** Appended to searches, e.g. "Chandigarh, Chandigarh". */
  areaHint?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState<"search" | "gps" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current || mapRef.current) return;
      const start = value ?? center;
      const map = L.map(el.current, { center: [start.lat, start.lng], zoom: value ? 15 : 5, scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      map.on("click", (e) => onChangeRef.current({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }));
      mapRef.current = map;
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- map is created once; value/center sync below
  }, []);

  // When the city/state changes (and no pin yet), move the map there so the seller starts in the right place.
  useEffect(() => {
    if (!areaHint || value) return;
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ format: "jsonv2", countrycodes: "in", limit: "1", q: areaHint });
        const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "Accept-Language": "en" } });
        const [hit] = (await res.json()) as { lat: string; lon: string }[];
        if (hit && !value) mapRef.current?.setView([Number(hit.lat), Number(hit.lon)], areaHint.includes(",") ? 12 : 7);
      } catch {}
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the typed place should retrigger
  }, [areaHint]);

  // Keep the pin in sync with `value`.
  useEffect(() => {
    import("leaflet").then((L) => {
      const map = mapRef.current;
      if (!map) return;
      if (!value) {
        markerRef.current?.remove();
        markerRef.current = null;
        return;
      }
      if (!markerRef.current) {
        const icon = L.divIcon({
          className: "",
          html: '<div style="width:34px;height:34px;transform:translate(-50%,-100%);"><svg viewBox="0 0 24 24" width="34" height="34"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" fill="#0b7d4c" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="10" r="2.6" fill="#fff"/></svg></div>',
          iconSize: [0, 0],
        });
        markerRef.current = L.marker([value.lat, value.lng], { draggable: true, icon }).addTo(map);
        markerRef.current.on("dragend", () => {
          const p = markerRef.current!.getLatLng();
          onChangeRef.current({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) });
        });
      } else {
        markerRef.current.setLatLng([value.lat, value.lng]);
      }
    });
  }, [value]);

  async function search() {
    const q = query.trim();
    if (q.length < 2) return;
    setBusy("search");
    setNote(null);
    try {
      const params = new URLSearchParams({ format: "jsonv2", countrycodes: "in", limit: "5", q: areaHint ? `${q}, ${areaHint}` : q });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "Accept-Language": "en" } });
      const data = (await res.json()) as { display_name: string; lat: string; lon: string }[];
      setResults(data.map((d) => ({ label: d.display_name.split(",").slice(0, 3).join(","), lat: +d.lat, lng: +d.lon })));
      if (data.length === 0) setNote("No place found — try a nearby village or town, or tap on the map.");
    } catch {
      setNote("Search isn't working right now — tap on the map instead.");
    } finally {
      setBusy(null);
    }
  }

  function pick(p: Place) {
    setResults(null);
    setQuery(p.label.split(",")[0]);
    mapRef.current?.setView([p.lat, p.lng], 15);
    setNote("Now tap the exact spot of your land on the map.");
  }

  function gps() {
    if (!("geolocation" in navigator)) return setNote("This phone can't share location.");
    setBusy("gps");
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) };
        onChange(c);
        mapRef.current?.setView([c.lat, c.lng], 16);
        setBusy(null);
      },
      (err) => {
        setBusy(null);
        setNote(err.code === err.PERMISSION_DENIED ? "Location permission was denied — search or tap on the map instead." : "Couldn't get your location — search or tap on the map instead.");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Not a <form>: this sits inside the listing form, and forms can't nest. */}
      <div className="relative" role="search">
        <div className="flex gap-2">
          <label className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line-strong bg-white px-3.5 shadow-soft focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
            <Search className="size-4 shrink-0 text-muted" aria-hidden />
            <span className="sr-only">Search a village or place</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  search();
                }
              }}
              placeholder="Search village or place"
              className="w-full min-w-0 bg-transparent text-[16px] placeholder:text-faint focus:outline-none"
              enterKeyHint="search"
            />
          </label>
          <Button type="button" variant="secondary" className="h-12 rounded-xl px-4" onClick={() => search()} disabled={busy === "search"}>
            {busy === "search" ? <Loader2 className="animate-spin" /> : "Find"}
          </Button>
        </div>
        {results && results.length > 0 && (
          <ul className="absolute inset-x-0 top-14 z-[500] overflow-hidden rounded-xl border border-line bg-white shadow-lift">
            {results.map((r) => (
              <li key={`${r.lat},${r.lng}`}>
                <button type="button" onClick={() => pick(r)} className="flex w-full items-start gap-2 px-3.5 py-3 text-left text-sm hover:bg-mist">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="relative z-0 h-60 overflow-hidden rounded-2xl ring-1 ring-line sm:h-72">
        <div ref={el} className="h-full w-full" role="application" aria-label="Map — tap to place a pin on your land" />
        {!value && (
          <p className="pointer-events-none absolute inset-x-3 bottom-3 z-[400] rounded-xl bg-white/95 px-3 py-2 text-center text-xs font-semibold text-ink-soft shadow-soft">
            Tap on the map to drop a pin on your land
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={gps} disabled={busy === "gps"}>
          {busy === "gps" ? <Loader2 className="animate-spin" /> : <LocateFixed className="text-brand-600" />}
          {busy === "gps" ? "Finding you…" : "I'm at the land — use my location"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            <X /> Remove pin
          </Button>
        )}
      </div>
      <p className="text-sm text-muted">{note ?? "Buyers only see the approximate area, never your exact pin."}</p>
    </div>
  );
}
