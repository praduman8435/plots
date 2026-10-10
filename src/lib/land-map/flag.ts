/**
 * The Land Parcel Map feature switch — one place, read on the server only.
 *
 *   LAND_PARCEL_MAP_ENABLED=true     the /land-map page and /api/land-map/* exist
 *   anything else (missing, "false") the page and every API answer 404
 *
 *   LAND_PARCEL_MAP_SYNTHETIC=true   also serve datasets marked synthetic (sample
 *                                    polygons for development). Never in
 *                                    Vercel production, whatever the value.
 */
type Env = Record<string, string | undefined>;

export function isLandParcelMapEnabled(env: Env = process.env): boolean {
  return env.LAND_PARCEL_MAP_ENABLED?.trim().toLowerCase() === "true";
}

export function isSyntheticParcelDataAllowed(env: Env = process.env): boolean {
  if (env.VERCEL_ENV === "production") return false;
  return env.LAND_PARCEL_MAP_SYNTHETIC?.trim().toLowerCase() === "true";
}
