import { z } from "zod";
import { CLIENT_EVENTS } from "@/lib/analytics-events";
import { hitIpRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { trackEvent } from "@/server/analytics";

const schema = z.object({
  name: z.enum(CLIENT_EVENTS),
  visitorId: z.string().uuid().nullable().optional(),
  propertyId: z.string().max(40).optional(),
  props: z.record(z.string().max(40), z.union([z.string().max(120), z.number(), z.boolean(), z.null()])).optional(),
});

/** Browser analytics beacon. Only whitelisted event names; small, typed payloads. */
export async function POST(req: Request) {
  const limited = await hitIpRateLimit("eventsPerIp");
  if (!limited.ok) return tooManyRequests(limited, null);
  const raw = await req.text();
  if (raw.length > 2000) return new Response(null, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return new Response(null, { status: 400 });
  const props = parsed.data.props && Object.keys(parsed.data.props).length <= 10 ? parsed.data.props : undefined;
  await trackEvent(parsed.data.name, { visitorId: parsed.data.visitorId, propertyId: parsed.data.propertyId, props });
  return new Response(null, { status: 204 });
}
