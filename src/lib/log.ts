/**
 * Structured server logs: one JSON object per line, which Vercel's log viewer
 * (and any log drain) can filter by `event`. Never pass secrets — but as a
 * safety net, fields that look sensitive are dropped before printing.
 */
type Level = "info" | "warn" | "error";
const SENSITIVE = /pass(word)?|token|secret|otp|code|cookie|authorization|phone|aadhaar|session/i;

export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SENSITIVE.test(k)) continue;
    safe[k] = v instanceof Error ? v.message.slice(0, 300) : typeof v === "string" ? v.slice(0, 300) : v;
  }
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...safe });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
