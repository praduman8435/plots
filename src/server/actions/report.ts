"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getTrustedClientIp } from "@/lib/request-ip";
import { getSellerSession } from "@/lib/seller/session";
import { submitReport, type ReportSubmitResult } from "@/server/reports/submit";

/** Random per-browser id for anonymous reporters (never shown, only hashed). Not a tracking id: it is only read here. */
const REPORTER_COOKIE = "plots_reporter";

/**
 * Public: report a plot or a seller profile. No sign-in needed (buyers browse
 * without accounts); a signed-in seller is recorded as the reporter. Server
 * Actions only accept same-origin POSTs (Next.js checks Origin against Host),
 * which is the CSRF protection here.
 */
export async function reportAction(input: unknown): Promise<ReportSubmitResult> {
  const [seller, ip, store] = await Promise.all([getSellerSession(), getTrustedClientIp(), cookies()]);

  let browserToken = store.get(REPORTER_COOKIE)?.value ?? null;
  if (!seller && (!browserToken || !/^[\w-]{20,64}$/.test(browserToken))) {
    browserToken = randomBytes(18).toString("base64url");
    store.set(REPORTER_COOKIE, browserToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
    });
  }

  const result = await submitReport(input, { sellerId: seller?.id ?? null, browserToken, ip });
  if (result.ok && !result.alreadyReported) revalidatePath("/admin", "layout");
  return result;
}
