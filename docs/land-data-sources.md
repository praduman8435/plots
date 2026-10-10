# Land parcel data sources — Noida / Gautam Buddha Nagar

Investigated on **11 October 2026** for the Land Parcel Map (`/land-map`, see `docs/LAND_MAP.md`).
"Inspected" means the page was actually fetched and read. "Not verified" means we could not confirm it.
Nothing here is legal advice. Before any real dataset is imported, the access and reuse terms must be confirmed in writing by the data owner.

## Summary

| Source | Parcel polygons? | Machine access | Reuse / licence | Status |
|---|---|---|---|---|
| UP Bhulekh GeoDashboard | No (progress counts only) | None seen | None stated | Inspected |
| UP Bhunaksha (upbhunaksha.gov.in) | Yes, shown in a viewer (vector map) | None seen. Public output is a per-plot PDF "Map Report" (per secondary guides) | None stated | Inspected (viewer only) |
| NIC Bhu-Naksha (bhunaksha.nic.in) | The product has bulk export (for officials) | "Meant for authorized officials". Download needs a login | Policy page returned 404 | Inspected |
| UP Bhulekh (upbhulekh.gov.in) | Text records (khatauni), which contain owner names | — | — | Page content not retrievable |
| DoLR ULPIN / Bhu-Aadhaar | Identifier, not geometry | No public API found | No terms found | Inspected |
| data.gov.in | Unknown | — | GODL if present | **Not verified** (403 for automated fetch) |
| OpenStreetMap | No cadastral parcels; place names and admin outlines | Overpass / Nominatim (policy-limited) | ODbL 1.0 | **Used** for place search |
| Survey of India Village Boundary, on the National Water Data Portal (NWIC) | **Village** polygons (not plots), with Census 2011 codes | Direct public download (GeoJSON / SHP / KML) | Portal copyright policy: free reproduction with acknowledgement | **Used**: all 333 villages of the district |

**Conclusion:**
- **Village level — done with real data.** The official revenue-village boundaries of all 333 villages of Gautam Buddha Nagar come from the Survey of India dataset on the National Water Data Portal, which may be reproduced with acknowledgement.
- **Plot (Gata) level — not available.** No source we could inspect offers authorized bulk or API access to plot polygons that we may store and show. The plot import pipeline, APIs and map are built and tested with a clearly labelled synthetic dataset. Real plots need the authorization listed under *Remaining dependencies*.

## Findings per source

### 1. UP Bhulekh GeoDashboard — https://upbhulekh.gov.in/GeoDashboard/

- **What it is:** "Digitization of Cadastral Maps and Geo Referencing (Dashboard)", designed and hosted by NIC UP State Unit, Lucknow. You pick State, District and Tehsil, and it shows aggregate progress.
- **Evidence:** the state totals shown were "Total Geo Reference" 95,751 villages / 117,594 mapsheets and "Total Remaining Village" 2,200 / 2,755 mapsheets. There are "Unavailable Maps", "Plot Count" and "Complete Report" sections.
- **Parcels:** none. Counts only, no geometry.
- **Access / licence:** no download, API or terms of use in the page content.
- **Value:** tells us digitized, geo-referenced cadastral maps exist for most UP villages. It doesn't give access to them. We did not read the per-tehsil numbers for Gautam Buddha Nagar.

### 2. UP Bhunaksha — https://upbhunaksha.gov.in/

- **What it is:** an interactive map viewer with District / Tehsil / Village / Plot No. fields, base map and layer selectors. The default view showed district 146 Agra.
- **Parcels:** yes, as an on-screen vector cadastral map. Secondary guides (not official) describe a per-plot "Map Report → Show Report PDF" output: [Landeed](https://web.landeed.com/uttar-pradesh/bhunaksha), [Square Yards](https://www.squareyards.com/blog/bhunaksha-up-lrart).
- **Coverage of Gautam Buddha Nagar:** not verified. The fetched page didn't list the district options.
- **Access / licence:** no API, bulk download, terms of use or reuse statement in the fetched content.
- **Decision:** we do **not** scrape this viewer. That would mean automated extraction from a government viewer with no stated permission, and the plot pages are linked to land records.

### 3. NIC Bhu-Naksha — https://bhunaksha.nic.in/

- **What it is:** NIC's cadastral map management software. The site says it is *"meant for authorized officials of States/UTs."*
- **Access:** the "Download" menu leads to a login page. The policy page (`/policy.jsp`) returned HTTP 404. The Bhunaksha 3.0 user guide (a Rajasthan-hosted copy) describes bulk export of geometry and attributes, but as an official/admin feature.
- **Decision:** an official export from Bhu-Naksha is the most likely format for an authorized dataset (it will probably arrive as a Shapefile or GeoJSON). It needs an arrangement with UP Revenue / NIC.

### 4. UP Bhulekh — https://upbhulekh.gov.in/

- The fetched content was only the title "भूलेख". Bhulekh serves the textual records (khatauni), which include **owner names and rights**.
- **Decision:** out of scope. The map never shows owners, and the importer drops personal fields (see `LAND_MAP.md`).

### 5. DoLR — ULPIN / Bhu-Aadhaar — https://dolr.gov.in/en/ulpin/

- **What it is:** a 14-digit ID "based on the longitude and latitude coordinates of the land parcel", following ECCMA and OGC standards. **Uttar Pradesh is listed** among the 29 states where it has been rolled out. The page says it "may include ownership details".
- **Access:** no public API, data-access process or sharing terms on the page.
- **Decision:** the schema has an `ulpin` field (validated as 14 alphanumerics) and search supports it. It stays empty unless an authorized dataset includes it. We never derive or invent ULPINs.

### 6. data.gov.in

- An automated fetch of the catalogue search returned **403**, and web searches found no Gautam Buddha Nagar cadastral or village-boundary dataset. **Not verified** either way. Worth a manual look for UP village boundaries (Census 2011 / Bhuvan), which would be under the Government Open Data License (GODL).

### 7. OpenStreetMap — used

- **Used for:** the place search index (district, the Dadri / Jewar / Gautam Buddha Nagar tehsils, 100 Noida/YEIDA sectors, 124 villages, 35 localities) and approximate district/tehsil outlines. It is built by `scripts/land-map/build-places.ts` and committed as `src/data/land-map/gbn-places.json`.
- **Licence:** ODbL 1.0. The map shows "© OpenStreetMap" and "Places © OpenStreetMap contributors (ODbL)". The extract is a derived database published under ODbL in this repository.
- **Limits:** OSM has no cadastral parcels for the district, and its outlines are approximate (simplified to ~80 m). The UI labels them "approximate outline", not revenue boundaries. We draw nothing from imagery, roads or field shapes.

### 8. Survey of India — Village Boundary, via the National Water Data Portal (NWIC) — used

- **Dataset:** https://nwdp.nwic.gov.in/dataset/village-boundary
  - Inspected: 36 states/UTs, each in KML, GeoJSON and SHP.
  - Data producer listed as Geological Survey of India; the organisation box says Survey of India (the page is inconsistent).
  - Last updated 2 May 2025.
  - The download links are direct, with no login.
- **Terms:**
  - The dataset page shows no licence field.
  - The portal's [copyright policy](https://nwdp.nwic.gov.in/footer/copyrightPolicy) says the material may be reproduced free of charge, in any format or media, without specific permission. Conditions: it must be reproduced accurately, not used in a derogatory manner or misleading context, and the source must be prominently acknowledged.
  - This permission excludes material explicitly identified as third-party copyright. The village file is not marked that way.
  - **We credit it on the map** ("Village boundaries: Survey of India, via National Water Data Portal (NWIC)"), in the village panel and in the docs.
- **File used:** Uttar Pradesh GeoJSON (`vb_soi_up_geojson.zip`, 124 MB, which contains one 606 MB file `vb_soi_up.GeoJSON`).
  - CRS: **EPSG:7755** (WGS 84 / India NSF LCC). It is transformed to EPSG:4326 with an ellipsoidal LCC inverse (`src/lib/land-map/geo.ts`).
  - 333 features have `district = "Gautam Buddha Nagar"`.
  - Attributes: village name, Census 2011 village code, sub-district (tehsil) name and code, block, rural/urban, Census area, and village amenity fields (we don't use those).
- **Checks run when building the extract** (`scripts/land-map/build-villages.ts`):
  - All 333 villages fall inside the district bounds.
  - The median ratio of polygon area to Census area is **1.02**.
  - 48 of the 57 OSM village points that match a village by name fall inside that village's polygon.
- **What it is not:** these are revenue-village outer boundaries. They do not contain plots (Gata) and say nothing about ownership. The UI says so.

### Why we don't extract plots from Bhu-Naksha

The UP Bhunaksha viewer shows plots publicly, but the system is run for the Revenue Department and states no reuse permission. NIC's Bhu-Naksha site says it is for authorized officials. Copying or extracting data in bulk from a computer system without its owner's permission can create liability under **Section 43(b) of the Information Technology Act, 2000** ([text, Income Tax Department copy](https://incometaxindia.gov.in/Acts/Information%20Technology%20Act,%202000/102120000000005390.htm)).

Open-data policy — the [National Geospatial Policy 2022](https://www.indiaenvironmentportal.org.in/reports-and-documents/national-geospatial-policy-2022) and data under NDSAP — supports reuse of data the government **publishes** for reuse, like the NWDP village file. It does not cover scraping an application. So plot data needs the department's export or written permission.

### Also seen (not used)

- [Stanford EarthWorks, UP village boundaries 2011](https://earthworks.stanford.edu/catalog/stanford-dg232hy0110): access is restricted (login needed).
- [GISMAP IN](https://www.gismaps.in/Village_Boundaries_Maps/Uttar_Pradesh_VillageMaps.html): commercial; licence and price not checked.
- [ArcGIS "Noida City Boundary"](https://cdn.arcgis.com/home/item.html?id=29a492c3a6174bffac6a37fd134b1756): a city outline, not parcels. We saw it only in search results and did not inspect it.

## Coverage implemented

- **Official village boundaries:** all **333 villages** of Gautam Buddha Nagar (Survey of India via NWDP). They are searchable, and clicking one shows its Census code, tehsil, block and areas.
- **Plot (Gata) boundaries: none.** No authorized dataset exists yet.
- **Place search and navigation:** Gautam Buddha Nagar district (OSM).
- **Synthetic sample:** 96 made-up plots in a made-up "Synthetic Test Village (sample)". These are served only when `LAND_PARCEL_MAP_SYNTHETIC=true`, never in Vercel production, and are labelled on the map, in search and in the panel.

## Recommended first dataset

One village's cadastral export from **UP Revenue Department / NIC UP (Bhu-Naksha)** for a village in Dadri or Gautam Buddha Nagar tehsil. Format: Shapefile or GeoJSON, with the plot (Gata) number, village code and name, recorded area and unit, the CRS, and the export date. It should come with a written permission covering storage, public display on a website, and attribution wording.

## Remaining dependencies

1. **Authorization from UP Revenue / NIC** (or a licensed data provider) to obtain, store and display cadastral polygons publicly, with attribution wording and an update arrangement.
2. **The dataset itself** (one village to start), with its CRS documented.
3. **ULPIN:** only if the provider includes it under the same permission.
4. **Legal review** of the terms before launch, including whether derived displays (simplified outlines, computed area) are allowed.
5. Optional: a manual check of data.gov.in for village boundaries (GODL), to show official village extents.
