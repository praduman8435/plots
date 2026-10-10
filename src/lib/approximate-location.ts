import "server-only";
import { keyedHash } from "@/lib/keyed-hash";

/**
 * The only location a public page may send to the browser: the plot's point
 * moved by up to ~250 m in a direction derived from a server secret (so it
 * can't be undone from the public plot id), then snapped to a ~110 m grid.
 * The 550 m circle drawn around it still covers the real spot.
 */
export function approximateLocation(lat: number, lng: number, plotId: string): { lat: number; lng: number } {
  const bytes = Buffer.from(keyedHash("approximate-location", plotId), "base64url");
  const a = bytes.readUInt16BE(0) / 65535 - 0.5;
  const b = bytes.readUInt16BE(2) / 65535 - 0.5;
  const snap = (v: number) => Math.round(v / 0.001) * 0.001;
  return { lat: +snap(lat + a * 0.0045).toFixed(3), lng: +snap(lng + b * 0.0045).toFixed(3) };
}
