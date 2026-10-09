import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { log } from "@/lib/log";

export type AuditEntry = {
  action: string;
  targetType: "report" | "listing" | "seller" | "admin";
  targetId: string;
  reportId?: string | null;
  propertyId?: string | null;
  sellerId?: string | null;
  note?: string | null;
  meta?: Prisma.InputJsonValue;
};

/**
 * Appends one admin action to audit_logs. Never throws: losing a log line must
 * not undo an action that already happened, so failures are reported instead.
 * When `reportId` is set, a still-pending report moves to "Under review" and is
 * assigned to the admin acting on it.
 */
export async function recordAudit(admin: { id: string; email: string }, entry: AuditEntry): Promise<void> {
  try {
    const reportId = entry.reportId ? ((await db.report.findUnique({ where: { id: entry.reportId }, select: { id: true } }))?.id ?? null) : null;
    await db.auditLog.create({
      data: {
        adminUserId: admin.id,
        actorLabel: admin.email,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        reportId,
        propertyId: entry.propertyId ?? null,
        sellerId: entry.sellerId ?? null,
        note: entry.note?.slice(0, 2000) ?? null,
        meta: entry.meta,
      },
    });
    if (reportId) {
      await db.report.updateMany({ where: { id: reportId, status: "PENDING" }, data: { status: "UNDER_REVIEW", assignedAdminId: admin.id } });
    }
  } catch (err) {
    log("error", "audit.write_failed", { action: entry.action, targetType: entry.targetType, err });
  }
}

/** Optional context an admin action can carry: the report it was taken for, and why. */
export type ModerationContext = { reportId?: string; note?: string };

export function cleanContext(ctx: unknown): ModerationContext {
  const c = (ctx ?? {}) as Record<string, unknown>;
  return {
    reportId: typeof c.reportId === "string" && /^[a-z0-9]{1,40}$/i.test(c.reportId) ? c.reportId : undefined,
    note: typeof c.note === "string" && c.note.trim() ? c.note.trim().slice(0, 2000) : undefined,
  };
}
