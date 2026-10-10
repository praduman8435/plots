import { site } from "./site";

/**
 * Public seller profile links: /sellers/<slug>, e.g. /sellers/praduman-rp44qh (old /s/… links redirect).
 * The slug is the seller's name in url-safe words plus the random part of
 * their Seller ID, so it is unique without collision handling and reveals
 * nothing private. It is stored once (Seller.profileSlug) and never
 * regenerated, so a shared link stays valid forever.
 * Must stay in sync with the SQL backfill in the seller_profile_slug migration.
 */
export function sellerProfileSlug(name: string, code: string): string {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
  return `${words || "seller"}-${code.slice(4).toLowerCase()}`;
}

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,70})$/;

export function isValidProfileSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export function sellerProfilePath(slug: string): string {
  return `/sellers/${slug}`;
}

export function sellerProfileUrl(slug: string): string {
  return `${site.url}${sellerProfilePath(slug)}`;
}

/** The message sellers share. Uses their public name only. */
export function profileShareText(name: string, url: string): string {
  return `Looking for land? 🏡 See ${name.trim() ? `${name.trim()}'s` : "my"} land for sale on ${site.name} — real photos and prices, and you can call or WhatsApp directly: ${url}`;
}

/** WhatsApp "share to anyone" link (no recipient — the seller picks the chat or group). */
export function whatsappShareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
