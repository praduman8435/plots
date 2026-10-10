# Land Parcel Map (Noida / Gautam Buddha Nagar)

A standalone cadastral map at **`/land-map`**, behind a feature flag. It is separate from the marketplace: no listings, sellers, prices or "sell this land" actions, and no database relations to marketplace tables.
Data sources and permissions are in [`land-data-sources.md`](./land-data-sources.md).

## Current coverage

- **Real parcel boundaries:** none. No authorized dataset is available yet (see the data sources doc).
- **Place search and navigation:** Gautam Buddha Nagar district, using OpenStreetMap (ODbL). This covers the district, 3 tehsils, 100 sectors, 124 villages and 35 localities.
- **Development only:** 96 synthetic sample parcels, labelled everywhere and never served in Vercel production.

## Feature flag

| Variable | Default | Effect |
|---|---|---|
| `LAND_PARCEL_MAP_ENABLED` | off | Only the exact value `true` (any case, trimmed) turns it on. Missing, empty or anything else means off. When off, the page `/land-map` and every `/api/land-map/*` route answer **404**, the same as a URL that doesn't exist. |
| `LAND_PARCEL_MAP_SYNTHETIC` | off | `true` also serves datasets marked synthetic. It is **ignored when `VERCEL_ENV=production`**. |

- Both are read on the server only (`src/lib/land-map/flag.ts`). Nothing is exposed to the browser.
- The page is a server component that calls `notFound()`. The APIs check the flag before the rate limit and before any query.
- API responses use `Cache-Control: private`, so no shared cache keeps serving data after the flag is turned off.

**To set it:**
- **Local:** add `LAND_PARCEL_MAP_ENABLED=true` (and optionally `LAND_PARCEL_MAP_SYNTHETIC=true`) to `.env.local`, then restart `pnpm dev`.
- **Vercel:** Settings → Environment Variables. Add it to **Preview** first, and to **Production** only once it's approved. Redeploy after changing it.

## Architecture

```
Browser (/land-map, Leaflet + OSM tiles)
  ├─ search box ── GET /api/land-map/search?q=        → places (OSM index, in memory) + parcel lookup (DB)
  ├─ map moves ─── GET /api/land-map/parcels?bbox&zoom → parcels in view (zoom ≥ 15), debounced, stale requests aborted
  ├─ click ─────── GET /api/land-map/parcels/:id       → public attributes + source + freshness
  └─ (server render) coverage boxes + district/tehsil outlines

Server (Next.js route handlers, src/server/land-map/*)
  gate(): flag → per-IP rate limit → zod validation → bounded Prisma queries

Postgres (same database, new tables, RLS on)
  parcel_datasets ─< parcel_imports
        └─< parcels (GeoJSON + bbox + grid cell)

Offline (never in a web request)
  scripts/land-map/import-parcels.ts  ← manifest.json + GeoJSON (authorized export)
  scripts/land-map/build-places.ts    ← OpenStreetMap (place index)
  scripts/land-map/make-synthetic.ts  → synthetic sample
```

**Files:**
- `src/lib/land-map/flag.ts`: the feature switch.
- `src/lib/land-map/geo.ts`: geometry. Covers CRS transforms (EPSG:4326, 3857, 32643, 32644), validation, geodesic area, bbox/centroid, Douglas-Peucker simplification and the grid cell.
- `src/server/land-map/import.ts`: prepare (pure) and write (one transaction).
- `src/server/land-map/parcels.ts`: viewport, coverage, detail and lookup queries.
- `src/server/land-map/places.ts`: place search over `src/data/land-map/gbn-places.json`.
- `src/server/land-map/http.ts`: the route gate (flag, rate limit) and response helpers.
- `src/app/api/land-map/**`: the route handlers.
- `src/app/(site)/land-map/page.tsx` and `src/components/land-map/land-map.tsx`: the page and the map UI.

## Database

Migration: `prisma/migrations/20261011120000_land_parcel_map`. It only adds the three new tables, with CHECK constraints and RLS enabled like every other table. Existing tables are not touched.

- **`parcel_datasets`:** one authorized source per row.
  - `key` (unique slug); name and source name; `sourceUrl`; `sourceReference` (the permission letter or agreement).
  - `license` and `attribution`.
  - `isSynthetic` (a dataset can't switch between synthetic and real).
  - State and district names; `sourceCrs`; `acquiredAt`; `sourceUpdatedAt`.
- **`parcel_imports`:** one importer run per row.
  - File name and SHA-256; status (RUNNING / SUCCEEDED / FAILED).
  - Counts: read, inserted, updated, unchanged, rejected.
  - `report`: the first 200 rejections and warnings, plus the list of dropped personal fields.
- **`parcels`:**
  - `sourceRecordId`: unique per dataset; the trace back to the source record.
  - Location: tehsil, village and village code; `parcelNumber` (as in the source) plus `parcelNumberKey` (normalised for lookup); `ulpin`.
  - Area: `recordedArea` and `recordedAreaUnit` as given by the source, kept apart from `computedAreaSqm` (calculated from the polygon). `landClass`.
  - Geometry: `geometry` (EPSG:4326 as imported); `displayGeometry` (simplified to about 0.2 m); bbox and centroid; `cellX` / `cellY`.
  - `sourceAttributes`: the original properties minus personal fields. Never returned by any API.
  - `contentHash`, `qualityStatus`, `importId`, `sourceUpdatedAt`.

### Spatial indexing without PostGIS

The local database (`postgres:17-alpine`) has no PostGIS. Enabling it on the production Supabase project would be a production change, so we haven't done that.

Instead, each parcel is filed under the 0.01° (~1.1 km) grid cell of its south-west corner, with a btree index on `(cellX, cellY)`. The importer rejects parcels wider than 0.02°, which the cell maths relies on. A viewport query reads only the cells near the view, then applies the exact bbox overlap test.

**Measured locally** with 50,000 synthetic parcels on one dense grid (Postgres 17, `EXPLAIN ANALYZE`, a 1 × 1 km view, 754 matching rows):

| Index | Time | Rows read and discarded |
|---|---|---|
| Grid cell (current) | 3.0 ms (bitmap index scan) | 10,446 |
| Plain bbox btree with `ORDER BY id` (first attempt) | 15.8 ms (scan of the whole primary key) | 49,342 |

The cost now depends on how dense the area around the view is, not on the size of the table.

Through the API, on a production build: the 96-parcel synthetic viewport took about 5 ms server time and returned 33.6 KB. Importing 50,000 parcels (14.5 MB GeoJSON) took 17 s.

**When to move to PostGIS:**
- Use `geometry` with a GiST index and `ST_Intersects` / `ST_AsMVT` when one of these applies:
  - the data reaches several hundred thousand parcels across many villages;
  - vector tiles are needed;
  - exact polygon (not bbox) intersection is needed.
- The `geometry` JSON and the bbox columns map directly onto that, so no data model change is needed.

## Import process

1. Get an **authorized** export. Record the permission in `sourceReference`.
2. **Shapefile or GeoPackage:** convert to GeoJSON with GDAL. You can keep the CRS (EPSG:4326, 3857, 32643 or 32644 are understood) or reproject it:
   ```
   ogr2ogr -f GeoJSON -t_srs EPSG:4326 parcels.geojson input.shp
   ```
3. **Write a manifest** next to the file. See `data/land-map/synthetic/manifest.json`. It contains:
   - dataset metadata: licence, attribution, dates;
   - `crs` (if the file doesn't declare one);
   - `fields`: which source property is the record id, Gata number, village, area and so on;
   - optional `defaults` (for example the village name, if it isn't on each feature).
4. **Validate only:** `pnpm land-map:import path/to/manifest.json --dry-run`.
5. **Import:** `pnpm land-map:import path/to/manifest.json`. It uses `DIRECT_URL` or `DATABASE_URL`. Run it against production only with explicit approval.

**What the importer guarantees:**
- **File:** the data file must be inside the manifest's folder (no `../`, no symlinks out), be `.geojson` or `.json`, be ≤ 100 MB and have ≤ 200,000 features.
- **Geometry:**
  - The CRS is checked; a mismatch between the manifest and the file is refused.
  - Only Polygon or MultiPolygon is accepted, with finite coordinates inside the district bounds (this catches a wrong CRS).
  - Rings must be closed with ≥ 4 points and must not self-intersect. Open rings are closed; nothing else is repaired.
  - Shapes must have area > 0, ≤ 5,000 vertices and be ≤ ~2 km across.
- **Duplicates:** a repeated record id is rejected. An identical geometry produces a warning.
- **Personal data:** fields that look personal (owner, khatedar, father/pita, mobile, Aadhaar, नाम…) are **dropped before storage** and listed in the run report.
- **Missing values:** they stay null. ULPIN is only stored if it is 14 alphanumerics.
- **Writes:**
  - The whole file lands in **one transaction**, or nothing does. The run is recorded either way.
  - Unchanged parcels aren't rewritten (content hash), so repeating an import is safe.
  - Parcels missing from a newer file are **kept** and reported, never deleted.
- **Synthetic datasets** need `--allow-synthetic` and are refused when `VERCEL_ENV=production`.

**Synthetic sample:** `pnpm land-map:synthetic`, then `pnpm land-map:import data/land-map/synthetic/manifest.json --allow-synthetic`.

**Place index refresh** (only occasionally): `pnpm land-map:places`. This makes a handful of Overpass and Nominatim requests, spaced to respect their usage policies. Commit the resulting JSON.

## API

All routes are GET, 404 when the flag is off, rate-limited per client IP (`landMapViewPerIp` 600 / 10 min, `landMapSearchPerIp` 240 / 10 min), validated with zod, and sent with `Cache-Control: private` and `X-Robots-Tag: noindex`.

| Route | Parameters | Returns |
|---|---|---|
| `/api/land-map/parcels` | `west,south,east,north` (degrees; each side ≤ 0.05°), `zoom` 0–22 | `{mode:"zoom-in", minZoom:15}` below zoom 15. Otherwise `{mode:"parcels", type:"FeatureCollection", features[≤1500], truncated}`. Each feature has `id`, simplified geometry, `parcelNumber`, `villageName` and `synthetic`. 400 for an invalid or too-large box. |
| `/api/land-map/parcels/:id` | — | `{parcel}`: Gata number, ULPIN, village, tehsil, district, state, recorded area (with unit), computed area, land class, quality, bbox, geometry, and `source` (dataset, source, licence, attribution, source record id, source update date, obtained date, import date). 404 if unknown. |
| `/api/land-map/search` | `q` (1–60 characters), optional `village` | `{places[≤8], parcels[≤20], cadastral}`. Places come from the OSM index. Parcels are a lookup by Gata number (e.g. `12/3`, `Gata 45`) or a 14-character ULPIN. A number that exists in several villages returns **all** of them with their village; nothing is guessed. |
| `/api/land-map/coverage` | — | `{coverage:[{datasetId, name, attribution, synthetic, parcels, villages, bbox}]}` |

## Map behaviour

- **Starting view:** the whole district, with OSM tiles, the dashed district outline, dotted tehsil outlines and boxes where parcel data exists. Panning is limited to the district plus a margin.
- **Zoom ≥ 15:** parcels load for the visible area. Requests are debounced (250 ms) and stale ones are cancelled.
- **Selecting a parcel:** it is highlighted and the details panel opens (on the side on desktop, as a bottom sheet on phones). Unknown values show "Not available". Recorded and computed area are shown separately, along with source and freshness and a note that a boundary is not proof of ownership.
- **No data in view:** "Parcel-level data is not currently available for this area."
- **Controls and states:** search, reset view, outlines on/off, legend and coverage, zoom buttons, and loading / empty / error states.
- **Synthetic data:** an orange dashed style, plus a banner and a warning in the panel.

## Security and privacy

- Server-side checks happen in this order: flag, rate limit, validation. All queries are Prisma (parameterised) and bounded by box size, zoom and row limits.
- Never sent to browsers: source attributes, owner or personal fields (also not stored), seller or listing data.
- Imports run offline with path, size, count and complexity limits.
- The map only reads public tables, all of which have RLS on. Existing auth, CSP and headers are unchanged. The OSM tile host was already allowed by the CSP.

## Tests

- **`pnpm check:land-map`** (81 checks, uses the local DB):
  - flag parsing;
  - CRS round trips (UTM 43N/44N against an independent forward projection, within 1 cm), Web Mercator, area within 0.5 %;
  - invalid geometries rejected (bow-tie, out of area, wrong CRS, too complex, too big, zero area);
  - import preparation: duplicates, personal fields, ULPIN, missing values, CRS errors;
  - database imports: idempotent re-import, updates, nothing deleted, synthetic/real lock;
  - viewport: correctness, synthetic hiding, low zoom, box validation, caps;
  - lookup: duplicates across villages, village context, ULPIN;
  - detail privacy; coverage; place search;
  - API routes returning 404 (with no data in the body) when off, and 200 when on; caching; 400s; rate limiting.
- **`pnpm check:http`** (against a production build): the page and every API agree with the flag, which is off by default. Disabled means the normal 404 page and no data in the body. Unknown nested URLs give the site's 404.
