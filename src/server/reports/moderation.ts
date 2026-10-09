import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { OUTCOME_LABELS } from "@/lib/reports";
import { recordAudit } from "@/server/audit";

export type ModerationResult = { ok: true; message?: string } | { ok: false; message: string };
type Admin = { id: string; email: string };

const idSchema = z.string().regex(/^[a-z0-9]{1,40}$/i);

const statusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("UNDER_REVIEW"), note: z.string().trim().max(2000).optional() }),
  z.object({
    status: z.literal("RESOLVED"),
    outcome: z.enum(Object.keys(OUTCOME_LABELS) as [keyof typeof OUTCOME_LABELS, ...(keyof typeof OUTCOME_LABELS)[]]),
    note: z.string().trim().max(2000).optional(),
    /** Also close the other open reports about the same plot / profile. */
    includeRelated: z.boolean().optional(),
  }),
  z.object({
    status: z.literal("DISMISSED"),
    note: z.string().trim().min(3, "Say briefly why it's dismissed").max(2000),
    includeRelated: z.boolean().optional(),
  }),
]);
export type ReportStatusInput = z.input<typeof statusSchema>;

/**
 * Moves a report through PENDING → UNDER_REVIEW → RESOLVED | DISMISSED (and
 * back to UNDER_REVIEW to reopen). Callers must have checked the admin session
 * (see actions/admin/reports.ts); every change is audit-logged.
 * Closing a report never changes the listing or seller by itself — those are
 * separate, explicit actions.
 */
export async function changeReportStatus(admin: Admin, reportId: string, input: ReportStatusInput): Promise<ModerationResult> {
  const id = idSchema.safeParse(reportId);
  const parsed = statusSchema.safeParse(input);
  if (!id.success) return { ok: false, message: "Unknown report." };
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  const a = parsed.data;
  if (a.status === "RESOLVED" && a.outcome === "OTHER" && !a.note) return { ok: false, message: "Add a note saying what was done." };

  const report = await db.report.findUnique({ where: { id: id.data }, select: { id: true, status: true, target: true, propertyId: true, sellerId: true } });
  if (!report) return { ok: false, message: "This report no longer exists." };
  if (report.status === a.status) return { ok: false, message: "The report is already in that state. Refresh the page." };

  const now = new Date();
  const closing = a.status === "RESOLVED" || a.status === "DISMISSED";
  const data = closing
    ? { status: a.status, outcome: a.status === "RESOLVED" ? a.outcome : null, resolutionNote: a.note || null, reviewedAt: now, dedupeKey: null, assignedAdminId: admin.id }
    : { status: a.status, assignedAdminId: admin.id, ...(report.status === "PENDING" ? {} : { outcome: null, reviewedAt: null }) };

  // Optimistic: only if nobody changed it meanwhile.
  const changed = await db.report.updateMany({ where: { id: report.id, status: report.status }, data });
  if (changed.count === 0) return { ok: false, message: "Someone else just updated this report. Refresh the page." };
  await recordAudit(admin, {
    action: `report.${a.status}`,
    targetType: "report",
    targetId: report.id,
    reportId: report.id,
    propertyId: report.propertyId,
    sellerId: report.sellerId,
    note: a.note,
    meta: { from: report.status, outcome: a.status === "RESOLVED" ? a.outcome : null },
  });

  let related = 0;
  if (closing && "includeRelated" in a && a.includeRelated) {
    const where = {
      id: { not: report.id },
      status: { in: ["PENDING", "UNDER_REVIEW"] as ("PENDING" | "UNDER_REVIEW")[] },
      ...(report.target === "LISTING" ? { propertyId: report.propertyId } : { target: "PROFILE" as const, sellerId: report.sellerId }),
    };
    const others = await db.report.findMany({ where, select: { id: true, status: true } });
    for (const o of others) {
      const r = await db.report.updateMany({ where: { id: o.id, status: o.status }, data });
      if (r.count) {
        related++;
        await recordAudit(admin, {
          action: `report.${a.status}`,
          targetType: "report",
          targetId: o.id,
          reportId: o.id,
          propertyId: report.propertyId,
          sellerId: report.sellerId,
          note: a.note,
          meta: { from: o.status, outcome: a.status === "RESOLVED" ? a.outcome : null, closedWith: report.id },
        });
      }
    }
  }

  const verb = { UNDER_REVIEW: report.status === "PENDING" ? "Marked under review" : "Reopened", RESOLVED: "Resolved", DISMISSED: "Dismissed" }[a.status];
  return { ok: true, message: `${verb}.${related ? ` ${related} related report${related === 1 ? "" : "s"} closed too.` : ""}` };
}

const noteSchema = z.string().trim().min(2, "Write a short note").max(2000);

/** Internal note on a report (admins only; never shown to the seller or the reporter). */
export async function addReportNote(admin: Admin, reportId: string, note: string): Promise<ModerationResult> {
  const id = idSchema.safeParse(reportId);
  const text = noteSchema.safeParse(note);
  if (!id.success) return { ok: false, message: "Unknown report." };
  if (!text.success) return { ok: false, message: text.error.issues[0]?.message ?? "Write a short note." };
  const report = await db.report.findUnique({ where: { id: id.data }, select: { id: true, propertyId: true, sellerId: true } });
  if (!report) return { ok: false, message: "This report no longer exists." };
  await recordAudit(admin, { action: "report.note", targetType: "report", targetId: report.id, reportId: report.id, propertyId: report.propertyId, sellerId: report.sellerId, note: text.data });
  return { ok: true, message: "Note added." };
}
