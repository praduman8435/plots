/**
 * True unless a browser says the request came from another site. Browsers
 * always send Origin on cross-site POSTs, so this blocks forms and scripts on
 * other sites from posting to our APIs as a visitor; non-browser clients send
 * no Origin and are handled by each route's own limits.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = new URL(origin).host;
    const allowed = [request.headers.get("x-forwarded-host"), request.headers.get("host"), new URL(request.url).host];
    if (process.env.NEXT_PUBLIC_SITE_URL) allowed.push(new URL(process.env.NEXT_PUBLIC_SITE_URL).host);
    return allowed.includes(host);
  } catch {
    return false;
  }
}
