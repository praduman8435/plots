import "server-only";
import { put } from "@vercel/blob";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Image storage. MVP driver: local disk (STORAGE_DIR), served by
 * /media/[...key]. Every image is auto-rotated, stripped of EXIF (phone
 * photos carry GPS of the seller's home), resized to ≤1600px and stored as
 * WebP — a 6 MB phone photo becomes ~250 KB for buyers on 4G.
 *
 * Drivers (picked automatically):
 *   • Vercel Blob — when BLOB_READ_WRITE_TOKEN is set (Vercel deployments; the
 *     server disk there is not persistent). URLs are https://….blob.vercel-storage.com/…
 *   • Local disk — otherwise (local dev / a VM with a persistent volume), served by /media/[...key].
 * To move to Cloudflare R2 / S3 later, add a driver here — nothing else changes.
 */
// Runtime data, not code: tell the bundler not to trace this directory into the server build.
export const STORAGE_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR || "storage/uploads");
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
/** What the bytes actually are (sharp sniffs the content) — the client's MIME type and file name are never trusted. */
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);
/** Decompression-bomb guard: a 15 MB PNG can declare billions of pixels. 50 MP covers any phone camera. */
export const MAX_INPUT_PIXELS = 50_000_000;

export class UnsupportedImageError extends Error {}

export type StoredImage = { url: string; width: number; height: number };

export function isAllowedImageType(mime: string): boolean {
  return ALLOWED.has(mime.toLowerCase());
}

/**
 * Decodes and re-encodes to a fresh WebP: only pixels survive — no EXIF/GPS,
 * no embedded scripts, no polyglot payloads. SVG, GIF, TIFF, PDF and
 * anything else sharp could read are refused by content, whatever their name.
 */
export async function processImage(bytes: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  if (bytes.length > MAX_UPLOAD_BYTES) throw new UnsupportedImageError("Photo is too large (max 15 MB).");
  const input = () => sharp(bytes, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS, pages: 1 });
  let format: string | undefined;
  try {
    format = (await input().metadata()).format;
  } catch {
    throw new UnsupportedImageError("Couldn't read this photo. Use a JPG, PNG, WebP or HEIC photo.");
  }
  if (!format || !ALLOWED_FORMATS.has(format)) throw new UnsupportedImageError("Use a JPG, PNG, WebP or HEIC photo.");
  const { data, info } = await input()
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 76 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export async function saveImage(bytes: Buffer): Promise<StoredImage> {
  const { data, ...info } = await processImage(bytes);

  const now = new Date();
  const dir = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const name = `${randomBytes(12).toString("base64url")}.webp`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`plots/${dir}/${name}`, data, { access: "public", contentType: "image/webp", addRandomSuffix: false, cacheControlMaxAge: 31_536_000 });
    return { url: blob.url, width: info.width, height: info.height };
  }

  await fs.mkdir(path.join(/*turbopackIgnore: true*/ STORAGE_DIR, dir), { recursive: true });
  await fs.writeFile(path.join(/*turbopackIgnore: true*/ STORAGE_DIR, dir, name), data);
  return { url: `/media/${dir}/${name}`, width: info.width, height: info.height };
}

/** Resolves a /media key safely (no path traversal). Null if missing. */
export async function readMedia(key: string[]): Promise<Buffer | null> {
  if (key.some((k) => !/^[\w.-]+$/.test(k) || k.startsWith("."))) return null;
  const full = path.join(/*turbopackIgnore: true*/ STORAGE_DIR, ...key);
  if (!full.startsWith(STORAGE_DIR + path.sep)) return null;
  try {
    return await fs.readFile(full);
  } catch {
    return null;
  }
}

/** Only accept image URLs our own storage produced (never arbitrary URLs from a client). */
export function isOurImageUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 300) return false;
  if (/^\/(media|demo)\/[\w./-]+$/.test(url) && !url.includes("..")) return true;
  return /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/plots\/[\w./-]+$/i.test(url);
}
