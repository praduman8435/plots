import { normalizePhoneNumber } from "@/lib/phone";
import { hitIpRateLimit, hitRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/same-origin";
import { buyerRequestSchema, saveBuyerRequest } from "@/server/buyer-requests";

const MAX_BODY_BYTES = 4_096;

/**
 * "Tell us what you need": saves a buyer's request for land. Public, so every
 * step is capped: per IP, per number and site-wide (fake requests would
 * inflate the demand we show sellers). Returns nothing about other buyers.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return Response.json({ ok: false }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return Response.json({ ok: false }, { status: 413 });

  const byIp = await hitIpRateLimit("buyerRequestPerIp");
  if (!byIp.ok) return tooManyRequests(byIp, { ok: false });

  const parsed = buyerRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
  const phone = normalizePhoneNumber(parsed.data.phone);
  if (!phone.valid) return Response.json({ ok: false }, { status: 400 });

  for (const [policy, subject] of [["buyerRequestPerPhone", phone.normalized], ["buyerRequestGlobal", "all"]] as const) {
    const limited = await hitRateLimit(policy, subject);
    if (!limited.ok) return tooManyRequests(limited, { ok: false });
  }

  await saveBuyerRequest({ ...parsed.data, phone: phone.normalized });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
