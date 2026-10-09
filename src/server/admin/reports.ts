import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ReportReason, ReportStatus, ReportTarget } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { REASON_LABELS, STATUS_LABELS } from "@/lib/reports";

export const REPORTS_PAGE_SIZE = 20;
const OPEN: ReportStatus[] = ["PENDING", "UNDER_REVIEW"];

export type ReportFilters = {
  status?: ReportStatus | "OPEN";
  target?: ReportTarget;
  reason?: ReportReason;
  from?: Date;
  to?: Date;
  q?: string;
  sellerId?: string;
  propertyId?: string;
  reporter?: string;
  page: number;
};

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const ID = /^[a-z0-9]{1,40}$/i;

function day(v: string | undefined, endOfDay = false): Date | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+05:30`); // dates are entered in IST
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** URL params → validated filters. Unknown values are dropped (allowlists only). */
export function parseReportFilters(sp: Raw): ReportFilters {
  const status = one(sp.status);
  const target = one(sp.type);
  const reason = one(sp.reason);
  const seller = one(sp.seller);
  const listing = one(sp.listing);
  const reporter = one(sp.reporter);
  return {
    status: status === "OPEN" || (status && Object.hasOwn(STATUS_LABELS, status)) ? (status as ReportFilters["status"]) : undefined,
    target: target === "LISTING" || target === "PROFILE" ? target : undefined,
    reason: reason && Object.hasOwn(REASON_LABELS, reason) ? (reason as ReportReason) : undefined,
    from: day(one(sp.from)),
    to: day(one(sp.to), true),
    q: one(sp.q)?.slice(0, 100),
    sellerId: seller && ID.test(seller) ? seller : undefined,
    propertyId: listing && ID.test(listing) ? listing : undefined,
    reporter: reporter && /^[\w-]{10,64}$/.test(reporter) ? reporter : undefined,
    page: Math.min(1000, Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1)),
  };
}

function whereFor(f: ReportFilters): Prisma.ReportWhereInput {
  const and: Prisma.ReportWhereInput[] = [];
  if (f.status === "OPEN") and.push({ status: { in: OPEN } });
  else if (f.status) and.push({ status: f.status });
  if (f.target) and.push({ target: f.target });
  if (f.reason) and.push({ reason: f.reason });
  if (f.from || f.to) and.push({ createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } });
  if (f.sellerId) and.push({ sellerId: f.sellerId });
  if (f.propertyId) and.push({ propertyId: f.propertyId });
  if (f.reporter) and.push({ reporterKey: f.reporter });
  if (f.q) {
    const q = f.q;
    const upper = q.toUpperCase();
    and.push({
      OR: [
        { code: upper },
        { targetLabel: { contains: q, mode: "insensitive" } },
        { property: { code: upper } },
        { property: { title: { contains: q, mode: "insensitive" } } },
        { seller: { code: upper } },
        { seller: { name: { contains: q, mode: "insensitive" } } },
        { reporterSeller: { code: upper } },
        { reporterSeller: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

/** One page of reports, fraud and oldest-open first within open statuses. */
export async function listReports(f: ReportFilters) {
  const where = whereFor(f);
  const [total, rows] = await Promise.all([
    db.report.count({ where }),
    db.report.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      skip: (f.page - 1) * REPORTS_PAGE_SIZE,
      take: REPORTS_PAGE_SIZE,
      select: {
        id: true,
        code: true,
        target: true,
        reason: true,
        description: true,
        status: true,
        priority: true,
        targetLabel: true,
        createdAt: true,
        reporterKey: true,
        property: { select: { id: true, code: true, status: true } },
        seller: { select: { id: true, code: true, name: true, isBlocked: true } },
        reporterSeller: { select: { id: true, code: true, name: true } },
        assignedAdmin: { select: { name: true } },
      },
    }),
  ]);
  // How many open reports each target has — makes pile-ups obvious in the list.
  const propertyIds = [...new Set(rows.map((r) => r.property?.id).filter(Boolean))] as string[];
  const sellerIds = [...new Set(rows.filter((r) => r.target === "PROFILE").map((r) => r.seller.id))];
  const [byProperty, bySeller] = await Promise.all([
    propertyIds.length ? db.report.groupBy({ by: ["propertyId"], where: { propertyId: { in: propertyIds }, status: { in: OPEN } }, _count: { _all: true } }) : [],
    sellerIds.length ? db.report.groupBy({ by: ["sellerId"], where: { sellerId: { in: sellerIds }, target: "PROFILE", status: { in: OPEN } }, _count: { _all: true } }) : [],
  ]);
  const openFor = new Map<string, number>([
    ...byProperty.map((g) => [`L:${g.propertyId}`, g._count._all] as [string, number]),
    ...bySeller.map((g) => [`P:${g.sellerId}`, g._count._all] as [string, number]),
  ]);
  const items = rows.map((r) => ({
    ...r,
    openOnTarget: openFor.get(r.target === "LISTING" ? `L:${r.property?.id}` : `P:${r.seller.id}`) ?? 0,
  }));
  return { total, items, pages: Math.max(1, Math.ceil(total / REPORTS_PAGE_SIZE)) };
}

/** Real counts per status (+ open fraud) for the overview and the nav badge. */
export async function reportCounts() {
  const [grouped, fraudOpen] = await Promise.all([
    db.report.groupBy({ by: ["status"], _count: { _all: true } }),
    db.report.count({ where: { status: { in: OPEN }, priority: true } }),
  ]);
  const by = (s: ReportStatus) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  return { PENDING: by("PENDING"), UNDER_REVIEW: by("UNDER_REVIEW"), RESOLVED: by("RESOLVED"), DISMISSED: by("DISMISSED"), fraudOpen };
}

/** Everything an admin needs to decide one report — and nothing sensitive (no phones, KYC data, tokens). */
export async function getReportDetail(id: string) {
  if (!ID.test(id)) return null;
  const report = await db.report.findUnique({
    where: { id },
    include: {
      reporterSeller: { select: { id: true, code: true, name: true } },
      assignedAdmin: { select: { name: true, email: true } },
      property: {
        select: {
          id: true,
          code: true,
          slug: true,
          title: true,
          status: true,
          hiddenReason: true,
          price: true,
          area: true,
          areaUnit: true,
          landType: true,
          locality: true,
          village: true,
          latitude: true,
          longitude: true,
          createdAt: true,
          updatedAt: true,
          publishedAt: true,
          soldAt: true,
          freshnessAt: true,
          availabilityCheckSentAt: true,
          city: { select: { name: true } },
          images: { select: { url: true }, orderBy: { position: "asc" }, take: 4 },
        },
      },
      seller: {
        select: {
          id: true,
          code: true,
          name: true,
          sellerType: true,
          profileSlug: true,
          isBlocked: true,
          identityStatus: true,
          phoneVerifiedAt: true,
          createdAt: true,
          _count: { select: { properties: true } },
        },
      },
    },
  });
  if (!report) return null;

  const [sellerListings, related, sameSource, history] = await Promise.all([
    db.property.findMany({
      where: { sellerId: report.sellerId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 12,
      select: { id: true, code: true, title: true, status: true, price: true, _count: { select: { reports: true } } },
    }),
    // Other reports about the same plot, or about this seller (profile or any of their plots).
    db.report.findMany({
      where: { id: { not: report.id }, OR: [{ sellerId: report.sellerId }, ...(report.propertyId ? [{ propertyId: report.propertyId }] : [])] },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, code: true, target: true, reason: true, status: true, createdAt: true, propertyId: true, targetLabel: true, reporterKey: true },
    }),
    db.report.count({ where: { reporterKey: report.reporterKey, id: { not: report.id } } }),
    db.auditLog.findMany({
      where: { OR: [{ reportId: report.id }, { sellerId: report.sellerId }, ...(report.propertyId ? [{ propertyId: report.propertyId }] : [])] },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, action: true, actorLabel: true, note: true, createdAt: true, reportId: true, targetType: true, meta: true },
    }),
  ]);
  return { report, sellerListings, related, sameSource, history };
}
