export const site = {
  name: "InstaPlots",
  tagline: "Land, made simple.",
  description:
    "Find farmland, house plots and commercial land across India — real photos, real prices, and the seller just one call away. Sellers list free on WhatsApp, in Hindi or English.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  /** Our WhatsApp Business number (digits only, with country code) — sellers chat here to list. */
  whatsappNumber: (process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER ?? "919999999999").replace(/\D/g, ""),
  supportPhone: process.env.NEXT_PUBLIC_SUPPORT_PHONE ?? "+919999999999",
  /** Shown on every detail page. We verify the seller's phone — never ownership. */
  disclaimer:
    "InstaPlots verifies the seller's phone number only. We have not checked ownership or land documents — always verify papers (khatauni, registry) before paying anything.",
} as const;

/** Top-level paths a City.slug must never take, since /[city] sits at the root. */
export const RESERVED_SLUGS = new Set([
  "admin", "api", "media", "demo", "cities", "s", "login", "logout", "sell", "seller", "search", "property",
  "about", "contact", "privacy", "terms", "help", "sitemap.xml", "robots.txt",
]);
