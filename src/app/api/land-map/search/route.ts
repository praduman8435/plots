import { z } from "zod";
import { badRequest, failed, gate, ok } from "@/server/land-map/http";
import { lookupParcels } from "@/server/land-map/parcels";
import { searchPlaces } from "@/server/land-map/places";

const schema = z.object({ q: z.string().trim().min(1).max(60), village: z.string().trim().min(2).max(120).optional() });

/** "12/3", "Gata 45" → parcel number; 14 characters → ULPIN. Everything is also tried as a place name. */
function cadastralQuery(q: string): { number?: string; ulpin?: string } | null {
  const s = q.replace(/^(?:gata|khasra|plot|survey|khata)\s*(?:no\.?|number)?\s*/i, "").trim();
  if (/^[A-Za-z0-9]{14}$/.test(s.replace(/[\s-]/g, "")) && /\d/.test(s)) return { ulpin: s };
  if (/^\d{1,6}[A-Za-z]?(?:\s*\/\s*\d{1,4}[A-Za-z]?)*$/.test(s)) return { number: s };
  return null;
}

/** GET ?q[&village] → { places, parcels } — place search and cadastral lookup, kept apart. */
export async function GET(req: Request) {
  const blocked = await gate("landMapSearchPerIp");
  if (blocked) return blocked;
  const parsed = schema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return badRequest("Type a place, sector, village or Gata number");
  try {
    const cad = cadastralQuery(parsed.data.q);
    const parcels = cad ? await lookupParcels({ ...cad, village: parsed.data.village }) : [];
    return ok({ places: searchPlaces(parsed.data.q), parcels, cadastral: Boolean(cad) }, 120);
  } catch (err) {
    return failed("land_map.search_failed", err);
  }
}
