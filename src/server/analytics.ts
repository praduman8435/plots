import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ClientEvent, ServerEvent } from "@/lib/analytics-events";
import { db } from "@/lib/db";

/** Records an analytics event. Best-effort: never throws, never blocks the caller's result. */
export async function trackEvent(
  name: ServerEvent | ClientEvent,
  data: { visitorId?: string | null; sellerId?: string | null; propertyId?: string | null; props?: Prisma.InputJsonValue } = {},
): Promise<void> {
  try {
    await db.analyticsEvent.create({
      data: { name, visitorId: data.visitorId ?? null, sellerId: data.sellerId ?? null, propertyId: data.propertyId ?? null, props: data.props },
    });
  } catch (err) {
    console.error("analytics: failed to record", name, err instanceof Error ? err.message : err);
  }
}
