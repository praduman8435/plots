import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
// HTTPS-only directives only where the site is actually served over HTTPS
// (Vercel), so `next start` on http://localhost keeps working.
const isHttpsDeployment = Boolean(process.env.VERCEL);

/**
 * Content Security Policy, static (no nonces) so pages stay cacheable/ISR.
 * Next.js streams its data as inline <script> tags, so script-src needs
 * 'unsafe-inline' without nonces; everything else is locked down. Our own
 * pages never render user HTML (React escapes all text; the two JSON-LD
 * blocks escape "<"), which is the primary XSS defence.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Leaflet positions map tiles with inline styles.
  "style-src 'self' 'unsafe-inline'",
  // Photos (Vercel Blob), OpenStreetMap tiles, data:/blob: previews before upload.
  "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://tile.openstreetmap.org",
  "font-src 'self'",
  // Place search on the listing form (browser → Nominatim).
  `connect-src 'self' https://nominatim.openstreetmap.org${isDev ? " ws:" : ""}`,
  "media-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isHttpsDeployment ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Location is used by the listing form and chat ("use my location"); nothing else.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isHttpsDeployment ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Explicit: no public browser source maps in production builds.
  productionBrowserSourceMaps: false,
  images: {
    // Photos uploaded on Vercel live in Vercel Blob (see src/server/storage.ts).
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com", pathname: "/plots/**" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
