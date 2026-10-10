import "server-only";
import { log } from "@/lib/log";
import type { AiConfig } from "./config";

const GEMINI_THINKING_TOKENS = 1024;

export type AiMessage = { role: "user" | "assistant"; content: string };

/**
 * One chat completion. Returns the model's text, or null on any failure
 * (timeout, HTTP error, odd response) — callers always have a non-AI fallback.
 * A call that hangs or hits a provider hiccup (5xx) is tried once more within
 * the same overall time budget: providers sometimes stall a single request
 * that a fresh one answers in a second. Never logs prompts or replies (they
 * contain seller messages).
 */
export async function complete(
  cfg: AiConfig,
  input: { system: string; messages: AiMessage[]; maxTokens?: number; json?: boolean; temperature?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const perAttemptMs = Math.max(2500, Math.floor(cfg.timeoutMs / 2));
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await attemptOnce(cfg, input, fetchImpl, perAttemptMs, attempt);
    if (result.text !== null || !result.retry) return result.text;
  }
  return null;
}

async function attemptOnce(
  cfg: AiConfig,
  input: { system: string; messages: AiMessage[]; maxTokens?: number; json?: boolean; temperature?: number },
  fetchImpl: typeof fetch,
  timeoutMs: number,
  attempt: number,
): Promise<{ text: string | null; retry: boolean }> {
  const started = Date.now();
  const maxTokens = input.maxTokens ?? 300;
  const temperature = input.temperature ?? 0.3;
  // Gemini's full models think before answering; Flash-Lite answers straight away unless asked to think.
  const thinks = cfg.provider === "gemini" && !/lite/i.test(cfg.model);
  try {
    let res: Response;
    if (cfg.provider === "anthropic") {
      res = await fetchImpl(`${cfg.baseUrl}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, temperature, system: input.system, messages: input.messages }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } else {
      res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          // Gemini's thinking counts against max_tokens: keep it short and leave room for it, or the answer comes back empty.
          max_tokens: thinks ? maxTokens + GEMINI_THINKING_TOKENS : maxTokens,
          ...(thinks ? { reasoning_effort: "low" } : {}),
          temperature,
          messages: [{ role: "system", content: input.system }, ...input.messages],
          ...(input.json ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    }
    if (!res.ok) {
      log("warn", "ai.http_error", { provider: cfg.provider, status: res.status, ms: Date.now() - started, attempt });
      // A provider hiccup is worth one more try; a bad key or a rate limit is not.
      return { text: null, retry: res.status >= 500 };
    }
    const data = (await res.json()) as {
      content?: { type?: string; text?: string }[];
      choices?: { message?: { content?: string | null } }[];
    };
    const text =
      cfg.provider === "anthropic"
        ? data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("")
        : data.choices?.[0]?.message?.content;
    log("info", "ai.call", { provider: cfg.provider, ok: Boolean(text), ms: Date.now() - started, attempt });
    return { text: text?.trim() || null, retry: false };
  } catch (err) {
    log("warn", "ai.failed", { provider: cfg.provider, ms: Date.now() - started, attempt, err });
    return { text: null, retry: true };
  }
}
