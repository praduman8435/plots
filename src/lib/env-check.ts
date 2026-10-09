/**
 * Production configuration check, run once per server start (src/instrumentation.ts).
 * `errors` stop the server — it can't run safely without them. `warnings` are
 * logged loudly: the feature they guard fails closed on its own.
 * Never prints a value, only variable names.
 */
export function checkProductionEnv(env: Record<string, string | undefined> = process.env): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const has = (k: string) => Boolean(env[k]?.trim());

  if (!has("DATABASE_URL")) errors.push("DATABASE_URL is not set.");
  if (!has("SESSION_SECRET")) errors.push("SESSION_SECRET is not set (signs the chat cookie and admin two-step sign-in).");
  else if (env.SESSION_SECRET!.trim().length < 32) warnings.push("SESSION_SECRET is shorter than 32 characters — use `openssl rand -base64 48`.");

  if (!has("CRON_SECRET")) warnings.push("CRON_SECRET is not set — the daily availability job will refuse to run.");
  else if (env.CRON_SECRET!.trim().length < 24) warnings.push("CRON_SECRET is shorter than 24 characters.");
  if (!has("TRUSTED_IP_HEADER")) warnings.push("TRUSTED_IP_HEADER is not set — per-IP rate limits are off (set x-real-ip on Vercel).");
  if (!has("NEXT_PUBLIC_SITE_URL")) warnings.push("NEXT_PUBLIC_SITE_URL is not set — share links and canonical URLs will be wrong.");

  const whatsappOn = has("WHATSAPP_API_TOKEN") && has("WHATSAPP_PHONE_NUMBER_ID");
  if (whatsappOn && !has("WHATSAPP_APP_SECRET")) warnings.push("WHATSAPP_APP_SECRET is not set — incoming WhatsApp messages will be rejected.");
  if (has("WHATSAPP_VERIFY_TOKEN") && env.WHATSAPP_VERIFY_TOKEN!.trim().length < 16) warnings.push("WHATSAPP_VERIFY_TOKEN is shorter than 16 characters.");

  if (env.DEMO_MODE?.trim().toLowerCase() === "true") {
    warnings.push("DEMO_MODE=true — login codes are shown on screen and identity checks are simulated. Anyone can sign in as any seller. Turn it off before a real launch.");
  }
  if (env.ADMIN_REQUIRE_MFA?.trim().toLowerCase() !== "true") warnings.push("ADMIN_REQUIRE_MFA is not true — admins can sign in with a password only.");
  return { errors, warnings };
}
