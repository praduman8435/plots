import "server-only";
import type { ClientEvent, ServerEvent } from "@/lib/analytics-events";
import { db } from "@/lib/db";

/**
 * The validation funnel, straight from AnalyticsEvent (+ Enquiry rows).
 * "People" = distinct visitorId for browser events, distinct sellerId for
 * seller events; events without either id count once each.
 */
export const INSIGHT_RANGES = [
  { value: "7", label: "Last 7 days", days: 7 },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "all", label: "All time", days: null },
] as const;
export type InsightRange = (typeof INSIGHT_RANGES)[number]["value"];

type EventName = ClientEvent | ServerEvent;
type Row = { name: string; events: number; visitors: number; sellers: number; people: number };

export async function getInsights(range: InsightRange, now = new Date()) {
  const days = INSIGHT_RANGES.find((r) => r.value === range)?.days ?? null;
  const since = days ? new Date(now.getTime() - days * 86_400_000) : new Date(0);

  const [rows, contactedRows, enquiries] = await Promise.all([
    db.$queryRaw<Row[]>`
      SELECT name,
             COUNT(*)::int AS events,
             COUNT(DISTINCT "visitorId")::int AS visitors,
             COUNT(DISTINCT "sellerId")::int AS sellers,
             COUNT(DISTINCT COALESCE("sellerId", "visitorId", id))::int AS people
      FROM analytics_events
      WHERE "createdAt" >= ${since}
      GROUP BY name`,
    // A buyer who both WhatsApp'd and called counts once.
    db.$queryRaw<{ n: number }[]>`
      SELECT COUNT(DISTINCT COALESCE("visitorId", id))::int AS n
      FROM analytics_events
      WHERE "createdAt" >= ${since} AND name IN ('whatsapp_click', 'call_click')`,
    db.enquiry.groupBy({ by: ["channel"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
  ]);

  const by = new Map(rows.map((r) => [r.name, r]));
  const get = (name: EventName) => by.get(name) ?? { name, events: 0, visitors: 0, sellers: 0, people: 0 };
  const enquiryCount = (c: "WHATSAPP" | "CALL") => enquiries.find((e) => e.channel === c)?._count._all ?? 0;

  return {
    since: days ? since : null,
    buyers: {
      visited: get("visit").visitors,
      viewed: get("property_view").visitors,
      contacted: contactedRows[0]?.n ?? 0,
      enquiries: { whatsapp: enquiryCount("WHATSAPP"), call: enquiryCount("CALL") },
    },
    sellers: {
      // Browser "Add plot" starts (per visitor) + web sign-ups started (one event each).
      started: get("listing_started").people + get("seller_signup_started").people,
      registered: get("seller_registered").sellers,
      submitted: get("listing_submitted").sellers,
      approved: get("listing_approved").sellers,
      listings: {
        submitted: get("listing_submitted").events,
        approved: get("listing_approved").events,
        rejected: get("listing_rejected").events,
      },
    },
    availability: {
      checksSent: get("availability_check_sent").events,
      yes: get("availability_yes").events,
      no: get("availability_no").events,
      noResponse: get("availability_no_response").events,
      sold: get("property_sold").events,
      reactivated: get("property_reactivated").events,
    },
  };
}

export type Insights = Awaited<ReturnType<typeof getInsights>>;
