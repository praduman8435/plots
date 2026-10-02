// OTP policy — same numbers as the shop project, env-overridable.
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const OTP_CONFIG = {
  codeLength: 6,
  expiryMinutes: envInt("OTP_EXPIRY_MINUTES", 10),
  maxAttempts: envInt("OTP_MAX_ATTEMPTS", 5),
  resendCooldownSeconds: envInt("OTP_RESEND_COOLDOWN_SECONDS", 45),
  maxRequestsPerWindow: envInt("OTP_MAX_REQUESTS_PER_WINDOW", 5),
  requestWindowMinutes: envInt("OTP_REQUEST_WINDOW_MINUTES", 60),
  maxRequestsPerIpPerHour: envInt("OTP_MAX_REQUESTS_PER_IP_PER_HOUR", 15),
  maxRequestsGlobalPerHour: envInt("OTP_MAX_REQUESTS_GLOBAL_PER_HOUR", 500),
} as const;

export const SELLER_SESSION_DURATION_DAYS = envInt("SELLER_SESSION_DURATION_DAYS", 30);
