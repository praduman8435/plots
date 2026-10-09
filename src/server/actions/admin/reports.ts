"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require";
import { addReportNote, changeReportStatus, type ReportStatusInput } from "@/server/reports/moderation";
import type { AdminActionResult } from "./listings";

/** Admin-only: the session is checked here, on the server, before anything else. */
export async function setReportStatusAction(reportId: string, input: ReportStatusInput): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const result = await changeReportStatus(admin, reportId, input);
  if (result.ok) revalidatePath("/admin", "layout");
  return result;
}

/** Admin-only internal note on a report (never shown to the seller or the reporter). */
export async function addReportNoteAction(reportId: string, note: string): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const result = await addReportNote(admin, reportId, note);
  if (result.ok) revalidatePath(`/admin/reports/${reportId}`);
  return result;
}
