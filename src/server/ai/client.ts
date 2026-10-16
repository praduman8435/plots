import "server-only";
import { log } from "@/lib/log";
import type { AiConfig } from "./config";

const GEMINI_THINKING_TOKENS = 1024;

export type AiMessage = { role: "user" | "assistant"; content: string };

/**
 * One chat completion. Returns the model's text, or null on any failure
 * (timeout, HTTP error, odd response) — callers always have a non-AI fallback.
 * When the model is overloaded, busy or missing, the next fallback model is
 * tried (up to three models); with no fallbacks, a call that hangs or hits a
 * provider hiccup (5xx) is tried once more on the same model. Never logs
 * prompts or replies (they contain seller messages).
 */
export async function complete(
  cfg: AiConfig,
  input: { system: string; messages: AiMessage[]; maxTokens?: number; json?: boolean; temperature?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const perAttemptMs = Math.max(3000, Math.floor(cfg.timeoutMs * 0.6));
  const plan = cfg.fallbackModels.length ? [cfg.model, ...cfg.fallbackModels].slice(0, 3) : [cfg.model, cfg.model];
  for (let i = 0; i < plan.length; i++) {
    const result = await attemptOnce({ ...cfg, model: plan[i] }, input, fetchImpl, perAttemptMs, i + 1);
    if (result.text !== null || !result.retry) return result.text;
    // The same model again only helps when it stalled or hiccupped, not when it is missing or out of quota.
    if (plan[i + 1] === plan[i] && result.status !== undefined && result.status < 500) return null;
  }
  return null;
}

async function attemptOnce(
  cfg: AiConfig,
  input: { system: string; messages: AiMessage[]; maxTokens?: number; json?: boolean; temperature?: number },
  fetchImpl: typeof fetch,
  timeoutMs: number,
  attempt: number,
): Promise<{ text: string | null; retry: boolean; status?: number }> {
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
      log("warn", "ai.http_error", { provider: cfg.provider, model: cfg.model, status: res.status, ms: Date.now() - started, attempt });
      // Overloaded (5xx), busy (429) or unknown model (404): another model may answer. A bad key or request won't.
      return { text: null, retry: res.status >= 500 || res.status === 429 || res.status === 404, status: res.status };
    }
    const data = (await res.json()) as {
      content?: { type?: string; text?: string }[];
      choices?: { message?: { content?: string | null } }[];
    };
    const text =
      cfg.provider === "anthropic"
        ? data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("")
        : data.choices?.[0]?.message?.content;
    log("info", "ai.call", { provider: cfg.provider, model: cfg.model, ok: Boolean(text), ms: Date.now() - started, attempt });
    return { text: text?.trim() || null, retry: false };
  } catch (err) {
    log("warn", "ai.failed", { provider: cfg.provider, model: cfg.model, ms: Date.now() - started, attempt, err });
    return { text: null, retry: true };
  }
}
