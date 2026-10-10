"use client";

import "leaflet/dist/leaflet.css";
import type { GeoJSON as LeafletGeoJSON, LayerGroup, Map as LeafletMap, Path } from "leaflet";
import { AlertTriangle, Info, Layers, Loader2, LocateFixed, MapPin, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { AreaGeometry, BBox } from "@/lib/land-map/geo";

type FeatureCollection = { type: "FeatureCollection"; features: { type: "Feature"; geometry: AreaGeometry; properties: Record<string, unknown> }[] };
type Coverage = { datasetId: string; name: string; attribution: string; synthetic: boolean; parcels: number; villages: string[]; bbox: BBox };
type Region = {
  district: { name: string; state: string; bbox: BBox; outline: AreaGeometry };
  tehsils: { name: string; bbox: BBox; outline: AreaGeometry }[];
  city: { name: string; bbox: BBox } | null;
};
type PlaceHit = { id: string; name: string; nameHi?: string; kind: string; context: string; center: [number, number]; bbox?: BBox };
type ParcelMatch = { id: string; parcelNumber: string | null; villageName: string | null; tehsilName: string | null; synthetic: boolean; bbox: BBox };
type VillageInfo = { id: string; name: string; center: [number, number]; bbox: BBox; code: string | null; tehsil: string | null; tehsilCode: string | null; block: string | null; kind: string | null; censusAreaHa: number | null; areaHa: number };
type Detail = {
  id: string;
  synthetic: boolean;
  parcelNumber: string | null;
  ulpin: string | null;
  villageName: string | null;
  villageCode: string | null;
  tehsilName: string | null;
  districtName: string;
  stateName: string;
  recordedArea: number | null;
  recordedAreaUnit: string | null;
  computedAreaSqm: number;
  landClass: string | null;
  qualityStatus: string;
  bbox: BBox;
  source: { datasetName: string; sourceName: string; sourceUrl: string | null; sourceReference: string | null; license: string; attribution: string; sourceRecordId: string; sourceUpdatedAt: string | null; acquiredAt: string; importedAt: string };
};

type Status =
  | { kind: "zoom-in" }
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "parcels"; count: number; truncated: boolean }
  | { kind: "error" };

const MIN_PARCEL_ZOOM = 15;
const MIN_VILLAGE_ZOOM = 11;
const LABEL_ZOOM = 13;
const INTRO_KEY = "landmap.intro.v1";
const VILLAGE_STYLE = { color: "#0a643e", weight: 1.3, opacity: 0.7, fillColor: "#16975d", fillOpacity: 0.035 };
const VILLAGE_SELECTED = { color: "#0a412b", weight: 3, opacity: 1, fillColor: "#16975d", fillOpacity: 0.12 };
const escapeHtml = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const MAX_SPAN = 0.05;
const BRAND = "#0b7d4c";
const SAMPLE = "#c2410c";

const toLatLngBounds = (b: BBox): [[number, number], [number, number]] => [
  [b.south, b.west],
  [b.north, b.east],
];
const overlaps = (a: BBox, b: BBox) => a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
const fmt = (n: number, d = 2) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: d }).format(n);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null);

/**
 * The Land Parcel Map (behind LAND_PARCEL_MAP_ENABLED). Leaflet + OSM tiles,
 * like the rest of the site. Parcels load only for the visible area at zoom
 * ≥ 15 (debounced; stale requests are aborted); below that, boxes show where
 * parcel data exists. Nothing here links to listings or sellers.
 */
export function LandMap({
  region,
  initialCoverage,
  placeAttribution,
  villageAttribution,
}: {
  region: Region;
  initialCoverage: Coverage[];
  placeAttribution: string;
  villageAttribution: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const parcelsLayer = useRef<LeafletGeoJSON | null>(null);
  const villagesLayer = useRef<LeafletGeoJSON | null>(null);
  const villageAbort = useRef<AbortController | null>(null);
  const villagesKey = useRef("");
  const labels = useRef<LayerGroup | null>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const selectedVillage = useRef<string | null>(null);
  const outlines = useRef<LayerGroup | null>(null);
  const selectedId = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [coverage] = useState(initialCoverage);
  const [status, setStatus] = useState<Status>({ kind: "zoom-in" });
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailState, setDetailState] = useState<"idle" | "loading" | "error">("idle");
  const [village, setVillage] = useState<VillageInfo | null>(null);
  const [villagesShown, setVillagesShown] = useState(false);
  const [intro, setIntro] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after mount (no localStorage on the server)
      setIntro(!localStorage.getItem(INTRO_KEY));
    } catch {}
  }, []);
  const dismissIntro = () => {
    setIntro(false);
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch {}
  };

  const villageStyle = useCallback((f?: { properties?: { id?: string } }) => (f?.properties?.id && f.properties.id === selectedVillage.current ? VILLAGE_SELECTED : VILLAGE_STYLE), []);

  /** Village names as map labels from zoom 13 (rebuilt when new villages load). */
  const refreshLabels = useCallback(() => {
    const L = leaflet.current;
    const m = map.current;
    const group = labels.current;
    if (!L || !m || !group) return;
    group.clearLayers();
    if (m.getZoom() < LABEL_ZOOM) return;
    villagesLayer.current?.eachLayer((layer) => {
      const v = (layer as unknown as { feature?: { properties?: VillageInfo } }).feature?.properties;
      if (!v?.center) return;
      L.marker([v.center[1], v.center[0]], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: "lm-village-label", html: `<span>${escapeHtml(v.name)}</span>`, iconSize: undefined }),
      }).addTo(group);
    });
  }, []);
  const [showOutlines, setShowOutlines] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false);
  const synthetic = coverage.some((c) => c.synthetic);

  const styleFor = useCallback((f?: { properties?: { id?: string; synthetic?: boolean } }) => {
    const sel = f?.properties?.id === selectedId.current;
    const sample = Boolean(f?.properties?.synthetic);
    const color = sample ? SAMPLE : BRAND;
    return { color: sel ? "#0e1a14" : color, weight: sel ? 3 : 1.2, dashArray: sample && !sel ? "4 3" : undefined, fillColor: color, fillOpacity: sel ? 0.28 : 0.07 };
  }, []);

  const select = useCallback(
    async (id: string) => {
      setVillage(null);
      selectedId.current = id;
      parcelsLayer.current?.setStyle(styleFor as never);
      setDetailState("loading");
      setDetail(null);
      try {
        const res = await fetch(`/api/land-map/parcels/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error(String(res.status));
        setDetail(((await res.json()) as { parcel: Detail }).parcel);
        setDetailState("idle");
      } catch {
        setDetailState("error");
      }
    },
    [styleFor],
  );

  const loadVillages = useCallback(async () => {
    const m = map.current;
    if (!m) return;
    const zoom = m.getZoom();
    if (zoom < MIN_VILLAGE_ZOOM) {
      villagesLayer.current?.clearLayers();
      villagesKey.current = "";
      setVillagesShown(false);
      return;
    }
    const b = m.getBounds().pad(0.25);
    const c = b.getCenter();
    const half = (v: number) => Math.min(v / 2, 0.4 - 1e-6);
    const w = half(b.getEast() - b.getWest());
    const h = half(b.getNorth() - b.getSouth());
    const qs = new URLSearchParams({ west: (c.lng - w).toFixed(4), south: (c.lat - h).toFixed(4), east: (c.lng + w).toFixed(4), north: (c.lat + h).toFixed(4), zoom: String(zoom) });
    const key = qs.toString().replace(/&zoom=\d+/, "");
    if (key === villagesKey.current) return; // same area: keep what's drawn
    villageAbort.current?.abort();
    const ctrl = new AbortController();
    villageAbort.current = ctrl;
    try {
      const res = await fetch(`/api/land-map/villages?${qs}`, { signal: ctrl.signal });
      if (!res.ok) return;
      const data = (await res.json()) as { features?: FeatureCollection["features"] };
      if (ctrl.signal.aborted) return;
      villagesLayer.current?.clearLayers();
      if (data.features?.length) villagesLayer.current?.addData({ type: "FeatureCollection", features: data.features } as FeatureCollection);
      villagesKey.current = key;
      setVillagesShown(Boolean(data.features?.length));
      refreshLabels();
    } catch {
      // Village outlines are context; the map works without them.
    }
  }, [refreshLabels]);

  const load = useCallback(async () => {
    const m = map.current;
    if (!m) return;
    void loadVillages();
    abort.current?.abort();
    const zoom = m.getZoom();
    if (zoom < MIN_PARCEL_ZOOM) {
      parcelsLayer.current?.clearLayers();
      setStatus({ kind: "zoom-in" });
      return;
    }
    const b = m.getBounds();
    // A tall/wide screen at zoom 15 can exceed the API's box; ask for the centre part.
    const c = b.getCenter();
    const halfW = Math.min((b.getEast() - b.getWest()) / 2, MAX_SPAN / 2 - 1e-6);
    const halfH = Math.min((b.getNorth() - b.getSouth()) / 2, MAX_SPAN / 2 - 1e-6);
    const view = { west: c.lng - halfW, south: c.lat - halfH, east: c.lng + halfW, north: c.lat + halfH };
    if (!coverage.some((cv) => overlaps(cv.bbox, view))) {
      parcelsLayer.current?.clearLayers();
      setStatus({ kind: "none" });
      return;
    }
    const ctrl = new AbortController();
    abort.current = ctrl;
    setStatus({ kind: "loading" });
    try {
      const qs = new URLSearchParams({ west: view.west.toFixed(6), south: view.south.toFixed(6), east: view.east.toFixed(6), north: view.north.toFixed(6), zoom: String(zoom) });
      const res = await fetch(`/api/land-map/parcels?${qs}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { mode: string; features?: FeatureCollection["features"]; truncated?: boolean };
      if (ctrl.signal.aborted) return;
      parcelsLayer.current?.clearLayers();
      const features = data.features ?? [];
      if (features.length) parcelsLayer.current?.addData({ type: "FeatureCollection", features } as FeatureCollection);
      setStatus(features.length ? { kind: "parcels", count: features.length, truncated: Boolean(data.truncated) } : { kind: "none" });
    } catch (err) {
      if ((err as Error).name !== "AbortError") setStatus({ kind: "error" });
    }
  }, [coverage, loadVillages]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 250);
  }, [load]);

  // ── Map setup (once)
  useEffect(() => {
    let cancelled = false;
    let instance: LeafletMap | undefined;
    import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      leaflet.current = L;
      const pad = 0.15;
      const d = region.district.bbox;
      instance = L.map(el.current, {
        zoomControl: false,
        minZoom: 9,
        maxZoom: 19,
        maxBounds: [
          [d.south - pad, d.west - pad],
          [d.north + pad, d.east + pad],
        ],
        maxBoundsViscosity: 0.8,
      });
      map.current = instance;
      instance.attributionControl.setPrefix(false);
      L.control.zoom({ position: "bottomright" }).addTo(instance);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: `<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · Places ${placeAttribution} (ODbL) · <a href="https://nwdp.nwic.gov.in/dataset/village-boundary" target="_blank" rel="noopener">${villageAttribution}</a>`,
      }).addTo(instance);

      const group = L.layerGroup().addTo(instance);
      for (const t of region.tehsils) L.geoJSON(t.outline as never, { interactive: false, style: { color: "#33413a", weight: 1, opacity: 0.45, fill: false, dashArray: "2 4" } }).addTo(group);
      L.geoJSON(region.district.outline as never, { interactive: false, style: { color: BRAND, weight: 2.5, opacity: 0.8, fill: false, dashArray: "8 6" } }).addTo(group);
      for (const c of coverage) {
        L.rectangle(toLatLngBounds(c.bbox), { color: c.synthetic ? SAMPLE : BRAND, weight: 1, fillOpacity: 0.12, dashArray: "3 3" })
          .bindTooltip(`${c.synthetic ? "SAMPLE data — " : ""}${c.name}: ${c.parcels} parcels. Zoom in to see them.`)
          .on("click", () => instance?.fitBounds(toLatLngBounds(c.bbox), { maxZoom: 17 }))
          .addTo(group);
      }
      outlines.current = group;

      // Official village boundaries, under the parcels.
      villagesLayer.current = L.geoJSON(undefined, {
        style: villageStyle as never,
        onEachFeature: (f, layer) => {
          const v = f.properties as VillageInfo;
          const path = layer as Path;
          layer.bindTooltip(v.name, { sticky: true, direction: "top", className: "font-semibold" });
          layer.on("mouseover", () => {
            if (selectedVillage.current !== v.id) path.setStyle({ weight: 2.2, fillOpacity: 0.08 });
          });
          layer.on("mouseout", () => path.setStyle(villageStyle(f as never) as never));
          layer.on("click", () => {
            selectedId.current = null;
            parcelsLayer.current?.setStyle(styleFor as never);
            setDetail(null);
            setDetailState("idle");
            selectedVillage.current = v.id;
            villagesLayer.current?.setStyle(villageStyle as never);
            setVillage(v);
          });
        },
      }).addTo(instance);
      labels.current = L.layerGroup().addTo(instance);

      parcelsLayer.current = L.geoJSON(undefined, {
        style: styleFor as never,
        onEachFeature: (f, layer) => {
          const p = f.properties as { id: string; parcelNumber: string | null; synthetic: boolean };
          layer.bindTooltip(`${p.synthetic ? "Sample " : ""}${p.parcelNumber ? `No. ${p.parcelNumber}` : "Parcel"}`, { sticky: true, direction: "top" });
          layer.on("click", () => select(p.id));
          (layer as Path).options.bubblingMouseEvents = false;
        },
      }).addTo(instance);

      instance.fitBounds(toLatLngBounds(d));
      instance.on("moveend", schedule);
      instance.on("zoomend", refreshLabels);
      schedule();
    });
    return () => {
      cancelled = true;
      abort.current?.abort();
      villageAbort.current?.abort();
      if (timer.current) clearTimeout(timer.current);
      instance?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is created once; handlers read refs
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = outlines.current;
    if (!m || !g) return;
    if (showOutlines) g.addTo(m);
    else g.remove();
  }, [showOutlines]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function closeDetail() {
    selectedId.current = null;
    parcelsLayer.current?.setStyle(styleFor as never);
    setDetail(null);
    setDetailState("idle");
    setVillage(null);
    selectedVillage.current = null;
    villagesLayer.current?.setStyle(villageStyle as never);
  }

  // Keep the selected area clear of the panel: right side on desktop, bottom sheet on phones.
  const panelPadding = () => {
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    return { paddingTopLeft: [40, 90] as [number, number], paddingBottomRight: (desktop ? [440, 40] : [40, Math.round(window.innerHeight * 0.6)]) as [number, number] };
  };
  const zoomToVillage = (v: VillageInfo) => map.current?.fitBounds(toLatLngBounds(v.bbox), { maxZoom: 16, ...panelPadding() });
  const quick: PlaceHit[] = [
    ...(region.city ? [{ id: "quick:city", name: region.city.name, kind: "city", context: "City", center: [0, 0] as [number, number], bbox: region.city.bbox }] : []),
    ...region.tehsils.map((t) => ({ id: `quick:${t.name}`, name: `${t.name} tehsil`, kind: "tehsil", context: "Tehsil", center: [0, 0] as [number, number], bbox: t.bbox })),
    { id: "quick:district", name: `All of ${region.district.name}`, kind: "district", context: "District", center: [0, 0], bbox: region.district.bbox },
  ];

  const resetView = () => map.current?.fitBounds(toLatLngBounds(region.district.bbox));
  const goToPlace = (p: PlaceHit) => {
    if (p.bbox) map.current?.fitBounds(toLatLngBounds(p.bbox), { maxZoom: 16 });
    else map.current?.setView([p.center[1], p.center[0]], p.kind === "village" ? 15 : 16);
  };
  const goToParcel = (p: ParcelMatch) => {
    map.current?.fitBounds(toLatLngBounds(p.bbox), { maxZoom: 18, ...panelPadding() });
    void select(p.id);
  };

  const panelOpen = detailState !== "idle" || detail !== null || village !== null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-mist">
      <div ref={el} className="lm-map absolute inset-0 z-0" role="application" aria-label={`Land parcel map of ${region.district.name}`} />

      {/* Top bar: search + controls */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex items-start gap-2 p-3 sm:p-4">
        <SearchBox onPlace={goToPlace} onParcel={goToParcel} quick={quick} />
        <div className="pointer-events-auto flex shrink-0 flex-col divide-y divide-line overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-line">
          <MapButton label="Show the whole district" onClick={resetView}>
            <LocateFixed />
          </MapButton>
          <MapButton label={showOutlines ? "Hide district outlines" : "Show district outlines"} pressed={showOutlines} onClick={() => setShowOutlines((v) => !v)}>
            <Layers />
          </MapButton>
          <MapButton label="Legend and sources" pressed={legendOpen} onClick={() => setLegendOpen((v) => !v)}>
            <Info />
          </MapButton>
        </div>
      </div>

      {synthetic && (
        <p className="absolute top-[4.25rem] right-[4.25rem] left-3 z-[400] flex items-center gap-2 rounded-xl bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-900 shadow-soft ring-1 ring-orange-200 sm:top-[4.75rem] sm:right-auto sm:left-4 sm:w-[28rem]">
          <AlertTriangle className="size-4 shrink-0" aria-hidden /> Showing SYNTHETIC sample parcels — made up for testing, not real government data.
        </p>
      )}

      {legendOpen && <Legend region={region} coverage={coverage} onClose={() => setLegendOpen(false)} />}

      {/* Status */}
      <div className={cn("pointer-events-none absolute inset-x-0 z-[400] flex justify-center px-3", panelOpen ? "bottom-[calc(58vh+0.75rem)] md:bottom-6" : "bottom-10 sm:bottom-7")}>
        <StatusPill status={status} hasCoverage={coverage.length > 0} villagesShown={villagesShown} onRetry={load} />
      </div>

      {intro && !panelOpen && (
        <div className="absolute inset-x-3 bottom-28 z-[450] rounded-2xl bg-white p-4 shadow-lift ring-1 ring-line sm:right-auto sm:bottom-6 sm:left-4 sm:w-80">
          <p className="text-[15px] font-bold text-ink">Village map of {region.district.name}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Official boundaries of every village. Search a village or sector, or zoom in and tap a village to see its details.
          </p>
          <button type="button" onClick={dismissIntro} className="mt-3 inline-flex h-9 items-center rounded-full bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
            Got it
          </button>
        </div>
      )}

      {village && !detail && detailState === "idle" && <VillagePanel village={village} attribution={villageAttribution} onClose={closeDetail} onZoom={() => zoomToVillage(village)} />}
      {(detail || detailState !== "idle") && <DetailPanel detail={detail} state={detailState} onClose={closeDetail} onRetry={() => selectedId.current && select(selectedId.current)} />}
    </div>
  );
}

function MapButton({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex size-11 items-center justify-center text-ink-soft transition hover:bg-mist hover:text-ink focus-visible:bg-mist focus-visible:outline-none [&_svg]:size-5",
        pressed && "text-brand-700",
      )}
    >
      {children}
    </button>
  );
}

function StatusPill({ status, hasCoverage, villagesShown, onRetry }: { status: Status; hasCoverage: boolean; villagesShown: boolean; onRetry: () => void }) {
  const base = "pointer-events-auto inline-flex max-w-md items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-[13px] font-medium text-ink-soft shadow-card ring-1 ring-line backdrop-blur";
  switch (status.kind) {
    case "zoom-in":
      return (
        <p className={cn(base, "text-center")}>
          {villagesShown ? (hasCoverage ? "Official village boundaries · zoom in for plot boundaries" : "Official village boundaries · tap a village for details") : "Search or zoom in to see village boundaries"}
        </p>
      );
    case "loading":
      return (
        <p className={base} role="status">
          <Loader2 className="size-4 animate-spin text-brand-600" aria-hidden /> Loading parcels…
        </p>
      );
    case "none":
      return (
        <p className={cn(base, "rounded-2xl text-center")} role="status">
          Parcel-level data is not currently available for this area.{villagesShown ? " Village boundaries are shown." : ""}
        </p>
      );
    case "parcels":
      return (
        <p className={base} role="status">
          {fmt(status.count, 0)} parcels{status.truncated ? " (zoom in for all)" : ""} · tap one for details
        </p>
      );
    case "error":
      return (
        <p className={cn(base, "text-danger")} role="alert">
          Couldn&apos;t load parcels.
          <button type="button" onClick={onRetry} className="font-semibold underline">
            Retry
          </button>
        </p>
      );
  }
}

function SearchBox({ onPlace, onParcel, quick }: { onPlace: (p: PlaceHit) => void; onParcel: (p: ParcelMatch) => void; quick: PlaceHit[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [results, setResults] = useState<{ places: PlaceHit[]; parcels: ParcelMatch[]; cadastral: boolean } | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    const query = q.trim();
    ctrl.current?.abort();
    if (!query) return; // nothing to fetch; the list only renders for a non-empty query
    const c = new AbortController();
    ctrl.current = c;
    const t = setTimeout(async () => {
      setState("loading");
      try {
        const res = await fetch(`/api/land-map/search?${new URLSearchParams({ q: query.slice(0, 60) })}`, { signal: c.signal });
        if (!res.ok) throw new Error(String(res.status));
        setResults(await res.json());
        setState("idle");
      } catch (err) {
        if ((err as Error).name !== "AbortError") setState("error");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const pickPlace = (p: PlaceHit) => {
    setOpen(false);
    setQ(p.name);
    onPlace(p);
  };
  const pickParcel = (p: ParcelMatch) => {
    setOpen(false);
    onParcel(p);
  };
  const empty = results && results.places.length === 0 && results.parcels.length === 0;

  return (
    <div className="pointer-events-auto relative min-w-0 flex-1 sm:max-w-md">
      <label className="flex h-11 items-center gap-2 rounded-xl bg-white px-3 shadow-card ring-1 ring-line focus-within:ring-2 focus-within:ring-brand-500">
        <Search className="size-5 shrink-0 text-muted" aria-hidden />
        <span className="sr-only">Search places or a Gata number</span>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value.slice(0, 60));
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results?.places[0]) pickPlace(results.places[0]);
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Sector, village, place or Gata no."
          maxLength={60}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none"
        />
        {state === "loading" && <Loader2 className="size-4 shrink-0 animate-spin text-muted" aria-hidden />}
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-mist">
            <X className="size-4" />
          </button>
        )}
      </label>

      {open && !q.trim() && (
        <div className="absolute inset-x-0 top-12 rounded-xl bg-white p-3 shadow-lift ring-1 ring-line">
          <p className="px-1 pb-2 text-[11px] font-semibold tracking-wide text-faint uppercase">Jump to</p>
          <div className="flex flex-wrap gap-2">
            {quick.map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  onPlace(p);
                }}
                className="inline-flex h-9 items-center rounded-full bg-mist px-3.5 text-sm font-medium text-ink-soft ring-1 ring-line transition hover:text-brand-800 hover:ring-brand-300"
              >
                {p.name}
              </button>
            ))}
          </div>
          <p className="mt-3 px-1 text-xs text-faint">Or type a village, sector or locality — e.g. “Bisrakh”, “Sector 62”.</p>
        </div>
      )}

      {open && q.trim() && (results || state === "error") && (
        <div className="absolute inset-x-0 top-12 max-h-[60vh] overflow-y-auto rounded-xl bg-white py-1.5 shadow-lift ring-1 ring-line">
          {state === "error" && <p className="px-4 py-3 text-sm text-danger">Search isn&apos;t working right now. Please try again.</p>}
          {results && results.parcels.length > 0 && (
            <>
              <p className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-faint uppercase">Parcels{results.parcels.length > 1 ? " — pick the right village" : ""}</p>
              {results.parcels.map((p) => (
                <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickParcel(p)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-mist">
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold", p.synthetic ? "bg-orange-50 text-orange-800" : "bg-brand-50 text-brand-800")}>#</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-ink">
                      No. {p.parcelNumber ?? "—"} {p.synthetic && <span className="text-xs font-semibold text-orange-700">(sample)</span>}
                    </span>
                    <span className="block truncate text-[13px] text-muted">{[p.villageName, p.tehsilName && `${p.tehsilName} tehsil`].filter(Boolean).join(" · ") || "Village not available"}</span>
                  </span>
                </button>
              ))}
            </>
          )}
          {results && results.cadastral && results.parcels.length === 0 && (
            <p className="px-4 py-2.5 text-[13px] text-muted">No parcel with that number in the areas we have data for.</p>
          )}
          {results && results.places.length > 0 && (
            <>
              <p className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-faint uppercase">Places</p>
              {results.places.map((p) => (
                <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickPlace(p)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-mist">
                  <MapPin className="size-4 shrink-0 text-brand-600" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium text-ink">
                      {p.name}
                      {p.nameHi && <span className="ml-1.5 text-[13px] text-muted">{p.nameHi}</span>}
                    </span>
                    <span className="block truncate text-[13px] text-muted">{p.context}</span>
                  </span>
                </button>
              ))}
            </>
          )}
          {empty && !results.cadastral && <p className="px-4 py-3 text-sm text-muted">No place by that name in Gautam Buddha Nagar.</p>}
        </div>
      )}
    </div>
  );
}

function Legend({ region, coverage, onClose }: { region: Region; coverage: Coverage[]; onClose: () => void }) {
  const real = coverage.filter((c) => !c.synthetic);
  return (
    <div className="absolute top-[4.25rem] right-3 left-3 z-[500] max-h-[70vh] overflow-y-auto rounded-2xl bg-white p-4 shadow-lift ring-1 ring-line sm:top-[4.75rem] sm:right-[4.25rem] sm:left-auto sm:w-80">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-ink">Legend</p>
        <button type="button" onClick={onClose} aria-label="Close legend" className="-mt-1 -mr-1 flex size-8 items-center justify-center rounded-full text-muted hover:bg-mist">
          <X className="size-4" />
        </button>
      </div>
      <ul className="mt-3 space-y-2.5 text-[13px] text-ink-soft">
        <LegendRow swatch={<span className="block h-0 w-7 border-t-[2.5px] border-dashed border-brand-600" />}>{region.district.name} district (approximate outline)</LegendRow>
        <LegendRow swatch={<span className="block h-0 w-7 border-t border-dotted border-ink-soft" />}>Tehsil (approximate outline)</LegendRow>
        <LegendRow swatch={<span className="block h-4 w-7 rounded-sm border border-brand-700 bg-brand-500/5" />}>Revenue village boundary (Survey of India)</LegendRow>
        <LegendRow swatch={<span className="block h-4 w-7 rounded-sm border border-dashed border-brand-600 bg-brand-500/15" />}>Area with plot data (zoom in)</LegendRow>
        <LegendRow swatch={<span className="block h-4 w-7 rounded-sm border border-brand-600 bg-brand-500/10" />}>Parcel boundary from the source</LegendRow>
        <LegendRow swatch={<span className="block h-4 w-7 rounded-sm border-2 border-ink bg-brand-500/30" />}>Selected parcel</LegendRow>
        {coverage.some((c) => c.synthetic) && <LegendRow swatch={<span className="block h-4 w-7 rounded-sm border border-dashed border-orange-700 bg-orange-500/10" />}>Synthetic sample parcel (not real)</LegendRow>}
      </ul>
      <div className="mt-4 border-t border-line pt-3 text-[13px] leading-relaxed text-muted">
        <p className="font-semibold text-ink">Coverage</p>
        {real.length === 0 ? (
          <p className="mt-1">
            Official village boundaries cover all of {region.district.name}. Plot (Gata) boundaries aren&apos;t available yet — they need an authorized dataset from the revenue department.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {real.map((c) => (
              <li key={c.datasetId}>
                {c.villages.length ? c.villages.join(", ") : c.name} — {fmt(c.parcels, 0)} parcels <span className="text-faint">({c.attribution})</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-faint">
          Village boundaries: Survey of India, via the National Water Data Portal (simplified to about 2 m). District and tehsil outlines and place names: OpenStreetMap, approximate.
        </p>
      </div>
    </div>
  );
}

function LegendRow({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex w-7 shrink-0 justify-center">{swatch}</span>
      {children}
    </li>
  );
}

function DetailPanel({ detail, state, onClose, onRetry }: { detail: Detail | null; state: "idle" | "loading" | "error"; onClose: () => void; onRetry: () => void }) {
  const area = detail?.computedAreaSqm ?? 0;
  const rows: { label: string; value: string | null }[] = detail
    ? [
        { label: "Parcel (Gata) no.", value: detail.parcelNumber },
        { label: "ULPIN (Bhu-Aadhaar)", value: detail.ulpin },
        { label: "Village", value: detail.villageName ? `${detail.villageName}${detail.villageCode ? ` (${detail.villageCode})` : ""}` : null },
        { label: "Tehsil", value: detail.tehsilName },
        { label: "District", value: detail.districtName },
        { label: "State", value: detail.stateName },
        { label: "Land class", value: detail.landClass },
      ]
    : [];

  return (
    <aside
      aria-label="Parcel details"
      className="absolute inset-x-0 bottom-0 z-[600] flex max-h-[58vh] flex-col rounded-t-3xl bg-white shadow-lift ring-1 ring-line md:top-4 md:right-4 md:bottom-28 md:left-auto md:max-h-none md:w-96 md:rounded-3xl"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 pt-4 pb-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Parcel</p>
          <h2 className="truncate text-lg font-bold text-ink">{detail ? (detail.parcelNumber ? `No. ${detail.parcelNumber}` : "Parcel") : state === "loading" ? "Loading…" : "Parcel"}</h2>
          {detail?.villageName && <p className="truncate text-sm text-muted">{detail.villageName}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close parcel details" className="-mr-2 flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-mist">
          <X className="size-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {state === "loading" && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading parcel details…
          </p>
        )}
        {state === "error" && (
          <p className="text-sm text-danger">
            Couldn&apos;t load this parcel.{" "}
            <button type="button" onClick={onRetry} className="font-semibold underline">
              Try again
            </button>
          </p>
        )}
        {detail && (
          <>
            {detail.synthetic && (
              <p className="mb-4 flex gap-2 rounded-xl bg-orange-50 p-3 text-[13px] font-medium text-orange-900 ring-1 ring-orange-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> SYNTHETIC sample — this parcel, its number and attributes are made up for testing. It is not a real land record.
              </p>
            )}

            <dl className="divide-y divide-line">
              {rows.map((r) => (
                <Row key={r.label} label={r.label} value={r.value} />
              ))}
            </dl>

            <h3 className="mt-5 text-[13px] font-semibold text-ink">Area</h3>
            <dl className="mt-1 divide-y divide-line">
              <Row label="Recorded (source)" value={detail.recordedArea != null ? `${fmt(detail.recordedArea, 4)} ${detail.recordedAreaUnit ?? "(unit not given)"}` : null} />
              <Row label="From the boundary" value={`${fmt(area, 0)} m² · ${fmt(area / 10_000, 3)} ha · ${fmt(area / 4046.8564224, 3)} acre`} />
            </dl>
            <p className="mt-1.5 text-xs leading-relaxed text-faint">
              “From the boundary” is calculated from the polygon on the WGS 84 sphere. It can differ from the recorded area; the record is the reference.
            </p>

            <h3 className="mt-5 text-[13px] font-semibold text-ink">Source &amp; freshness</h3>
            <dl className="mt-1 divide-y divide-line">
              <Row label="Dataset" value={detail.source.datasetName} />
              <Row label="Source" value={detail.source.sourceName} />
              <Row label="Source record id" value={detail.source.sourceRecordId} mono />
              {detail.source.sourceReference && <Row label="Authorization" value={detail.source.sourceReference} />}
              <Row label="Licence" value={detail.source.license} />
              <Row label="Source updated" value={day(detail.source.sourceUpdatedAt)} />
              <Row label="Data obtained" value={day(detail.source.acquiredAt)} />
              <Row label="Imported" value={day(detail.source.importedAt)} />
              <Row label="Quality" value={detail.qualityStatus === "VERIFIED" ? "Checked" : detail.qualityStatus === "FLAGGED" ? "Flagged for review" : "Not independently verified"} />
            </dl>
            {detail.source.sourceUrl && (
              <a href={detail.source.sourceUrl} target="_blank" rel="noopener" className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline">
                Open the source
              </a>
            )}

            <p className="mt-5 rounded-xl bg-mist p-3 text-xs leading-relaxed text-muted">
              A boundary on this map is not proof of ownership, title, encumbrance or legal status. Always check the land records (khatauni) and the registry with the revenue
              department or a lawyer.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-[13px] text-muted">{label}</dt>
      <dd className={cn("min-w-0 text-right text-[13px] font-medium break-words", value ? "text-ink" : "text-faint", mono && "font-mono text-xs")}>{value ?? "Not available"}</dd>
    </div>
  );
}

function VillagePanel({ village, attribution, onClose, onZoom }: { village: VillageInfo; attribution: string; onClose: () => void; onZoom: () => void }) {
  return (
    <aside
      aria-label="Village details"
      className="absolute inset-x-0 bottom-0 z-[600] flex max-h-[58vh] flex-col rounded-t-3xl bg-white shadow-lift ring-1 ring-line md:inset-y-auto md:top-4 md:right-4 md:bottom-auto md:left-auto md:max-h-[calc(100%-7rem)] md:w-96 md:rounded-3xl"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 pt-4 pb-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Village</p>
          <h2 className="truncate text-lg font-bold text-ink">{village.name}</h2>
          {village.tehsil && <p className="truncate text-sm text-muted">{village.tehsil} tehsil · Gautam Buddha Nagar</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close village details" className="-mr-2 flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-mist">
          <X className="size-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <button type="button" onClick={onZoom} className="mb-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-50 px-3.5 text-sm font-semibold text-brand-800 ring-1 ring-brand-100 hover:bg-brand-100">
          <MapPin className="size-4" aria-hidden /> Zoom to village
        </button>
        <dl className="divide-y divide-line">
          <Row label="Village code (Census 2011)" value={village.code} mono />
          <Row label="Tehsil" value={village.tehsil ? `${village.tehsil}${village.tehsilCode ? ` (${village.tehsilCode})` : ""}` : null} />
          <Row label="Block" value={village.block} />
          <Row label="Rural / urban" value={village.kind} />
          <Row label="Area (Census record)" value={village.censusAreaHa != null ? `${fmt(village.censusAreaHa, 0)} ha` : null} />
          <Row label="Area (from the boundary)" value={`${fmt(village.areaHa, 0)} ha · ${fmt(village.areaHa * 2.4710538, 0)} acre`} />
        </dl>
        <h3 className="mt-5 text-[13px] font-semibold text-ink">Source</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{attribution}. Dataset updated 2 May 2025. Boundary simplified to about 2 m for display.</p>
        <a href="https://nwdp.nwic.gov.in/dataset/village-boundary" target="_blank" rel="noopener" className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline">
          Open the source
        </a>
        <p className="mt-5 rounded-xl bg-mist p-3 text-xs leading-relaxed text-muted">
          This is the revenue village&apos;s outer boundary — not individual plots (Gata), and not proof of ownership. Plot boundaries will appear here only from an authorized revenue dataset.
        </p>
      </div>
    </aside>
  );
}
