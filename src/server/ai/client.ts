import "server-only";
import { log } from "@/lib/log";
import type { AiConfig } from "./config";

export type AiMessage = { role: "user" | "assistant"; content: string };

/**
 * One chat completion. Returns the model's text, or null on any failure
 * (timeout, HTTP error, odd response) — callers always have a non-AI fallback.
 * Never logs prompts or replies (they contain seller messages).
 */
export async function complete(
  cfg: AiConfig,
  input: { system: string; messages: AiMessage[]; maxTokens?: number; json?: boolean },
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const started = Date.now();
  const maxTokens = input.maxTokens ?? 300;
  try {
    let res: Response;
    if (cfg.provider === "anthropic") {
      res = await fetchImpl(`${cfg.baseUrl}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, temperature: 0.3, system: input.system, messages: input.messages }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
    } else {
      res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: maxTokens,
          temperature: 0.3,
          messages: [{ role: "system", content: input.system }, ...input.messages],
          ...(input.json ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
    }
    if (!res.ok) {
      log("warn", "ai.http_error", { provider: cfg.provider, status: res.status, ms: Date.now() - started });
      return null;
    }
    const data = (await res.json()) as {
      content?: { type?: string; text?: string }[];
      choices?: { message?: { content?: string | null } }[];
    };
    const text =
      cfg.provider === "anthropic"
        ? data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("")
        : data.choices?.[0]?.message?.content;
    log("info", "ai.call", { provider: cfg.provider, ok: Boolean(text), ms: Date.now() - started });
    return text?.trim() || null;
  } catch (err) {
    log("warn", "ai.failed", { provider: cfg.provider, ms: Date.now() - started, err });
    return null;
  }
}
