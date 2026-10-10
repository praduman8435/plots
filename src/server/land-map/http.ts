import "server-only";
import { isLandParcelMapEnabled } from "@/lib/land-map/flag";
import { log } from "@/lib/log";
import { hitIpRateLimit, tooManyRequests, type LimitName } from "@/lib/rate-limit";

/**
 * Shared front door for /api/land-map/*: the feature flag first (off → a
 * plain 404, as if the route didn't exist), then the per-IP rate limit.
 */
export async function gate(limit: LimitName): Promise<Response | null> {
  if (!isLandParcelMapEnabled()) return notFound();
  const r = await hitIpRateLimit(limit);
  if (!r.ok) return tooManyRequests(r);
  return null;
}

export function notFound() {
  return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}

/** Public map data, but browser-cached only: a shared cache could keep serving after the flag is turned off. */
export function ok(body: unknown, maxAge = 30) {
  return Response.json(body, { headers: { "Cache-Control": `private, max-age=${maxAge}`, "X-Robots-Tag": "noindex" } });
}

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
}

/** Unexpected failure: logged without request details, generic answer. */
export function failed(event: string, err: unknown) {
  log("error", event, { err });
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500, headers: { "Cache-Control": "no-store" } });
}
