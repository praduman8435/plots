export const site = {
  name: "InstaPlots",
  tagline: "Land, made simple.",
  /** Search-result snippet: under 160 characters, the words buyers actually search for. */
  description:
    "Buy land near you: farmland, house plots and commercial land across India. Real photos, real prices. Call or WhatsApp the seller directly, no fee.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  /** Our WhatsApp Business number (digits only, with country code) — sellers chat here to list. */
  whatsappNumber: (process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER ?? "919999999999").replace(/\D/g, ""),
  /** Our call-us number (E.164), shown in the footer and on the legal pages. Empty = not shown. */
  supportPhone: process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() || "",
  /**
   * Who runs InstaPlots, for the legal pages (/privacy-policy, /terms, /data-deletion).
   * Set in Vercel so they match your registration (Udyam/GST); empty ones are left out.
   */
  legal: {
    operator: process.env.NEXT_PUBLIC_LEGAL_NAME?.trim() || "InstaPlots",
    email: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "",
    address: process.env.NEXT_PUBLIC_BUSINESS_ADDRESS?.trim() || "",
    grievanceOfficer: process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER?.trim() || "",
    updated: "10 October 2026",
  },
  /** Shown on every detail page. We verify the seller's phone — never ownership. */
  disclaimer:
    "InstaPlots verifies every seller's phone number, and their identity with Aadhaar wherever you see ✓ Aadhaar verified. We don't check land ownership or documents — always verify papers (khatauni, registry) before paying anything.",
} as const;

/** Shared Open Graph fields: a page's `openGraph` replaces the layout's, so pages spread this in. */
export const ogBase = { siteName: site.name, locale: "en_IN" } as const;

/** src/app/opengraph-image.png: used when a page has no photo of its own. */
export const defaultShareImage = { url: "/opengraph-image.png", width: 1200, height: 630, alt: "InstaPlots: land for sale near you, with real photos and the real price" };

/** Top-level paths a City.slug must never take, since /[city] sits at the root. */
export const RESERVED_SLUGS = new Set([
  "admin", "api", "media", "demo", "brand", "cities", "s", "login", "logout", "sell", "seller", "sellers", "search", "property",
  "about", "contact", "privacy", "privacy-policy", "terms", "data-deletion", "help", "sitemap.xml", "robots.txt",
]);
