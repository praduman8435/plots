/**
 * DEMO_MODE=true: a public demo before WhatsApp/KYC providers are connected.
 * Login codes are shown on screen and identity checks are simulated — the
 * site shows a banner saying so. Never enable it for a real launch.
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE?.trim().toLowerCase() === "true";
}

/** Local dev or demo: the OTP is shown on screen because no WhatsApp is connected. */
export function canShowCodeOnScreen(): boolean {
  return process.env.NODE_ENV !== "production" || isDemoMode();
}
