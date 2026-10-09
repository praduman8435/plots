import "server-only";

/**
 * Optional AI for the WhatsApp assistant. OFF unless AI_ENABLED=true and a
 * key is set. Any OpenAI-compatible API works (OpenAI, xAI Grok, Groq,
 * OpenRouter, Google Gemini's OpenAI endpoint, a local server), plus
 * Anthropic Claude natively.
 *
 *   AI_ENABLED=true
 *   AI_PROVIDER=openai | anthropic | xai | gemini | groq | openrouter | compatible
 *   AI_API_KEY=…
 *   AI_MODEL=…            (optional; empty or "default" = a sensible default per provider)
 *   AI_BASE_URL=…         (only for "compatible", or to override; empty or "default" = provider's URL)
 *   AI_TIMEOUT_MS=8000
 *   AI_MAX_CALLS_PER_DAY=500            (all chats together)
 *   AI_MAX_CALLS_PER_CHAT_PER_DAY=25    (one seller)
 */
export type AiProvider = "openai" | "anthropic" | "xai" | "gemini" | "groq" | "openrouter" | "compatible";

const DEFAULTS: Record<AiProvider, { baseUrl: string; model: string }> = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  anthropic: { baseUrl: "https://api.anthropic.com/v1", model: "claude-haiku-5-5" },
  xai: { baseUrl: "https://api.x.ai/v1", model: "grok-3-mini" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.0-flash" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  compatible: { baseUrl: "", model: "" },
};

export type AiConfig = {
  provider: AiProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxPerDay: number;
  maxPerChatPerDay: number;
};

const int = (v: string | undefined, fallback: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Placeholders like "replace-me" (kept in Vercel until a real key exists) count as "no key". */
function realKey(v: string | undefined): string | null {
  const k = v?.trim() ?? "";
  if (k.length < 20 || /^(replace|change|your|add|todo|none|xxx|placeholder)/i.test(k)) return null;
  return k;
}

/** The active AI configuration, or null when AI is off / incomplete. Read per call so env changes apply on redeploy. */
export function getAiConfig(env: Record<string, string | undefined> = process.env): AiConfig | null {
  if (env.AI_ENABLED?.trim().toLowerCase() !== "true") return null;
  const provider = (env.AI_PROVIDER?.trim().toLowerCase() || "openai") as AiProvider;
  if (!Object.hasOwn(DEFAULTS, provider)) return null;
  const apiKey = realKey(env.AI_API_KEY);
  if (!apiKey) return null;
  // "default" / "auto" (Vercel can't store empty values) mean: use the provider's default.
  const pick = (v: string | undefined) => (v?.trim() && !/^(default|auto)$/i.test(v.trim()) ? v.trim() : "");
  const baseUrl = (pick(env.AI_BASE_URL) || DEFAULTS[provider].baseUrl).replace(/\/+$/, "");
  const model = pick(env.AI_MODEL) || DEFAULTS[provider].model;
  if (!baseUrl.startsWith("https://") && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(baseUrl)) return null;
  if (!model) return null;
  return {
    provider,
    apiKey,
    model,
    baseUrl,
    timeoutMs: int(env.AI_TIMEOUT_MS, 8000),
    maxPerDay: int(env.AI_MAX_CALLS_PER_DAY, 500),
    maxPerChatPerDay: int(env.AI_MAX_CALLS_PER_CHAT_PER_DAY, 25),
  };
}

export function isAiEnabled(): boolean {
  return getAiConfig() !== null;
}
