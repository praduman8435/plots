import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { ReportReason, ReportTarget } from "@/generated/prisma/enums";
import { generateUnambiguousCode } from "@/lib/unambiguous-code";
import { db } from "@/lib/db";
import { keyedHash } from "@/lib/keyed-hash";
import { isPubliclyViewable } from "@/lib/listing-visibility";
import { hitRateLimit, type RateLimitResult } from "@/lib/rate-limit";
import { OTHER_DESCRIPTION_MIN, REPORT_DESCRIPTION_MAX, reasonsFor } from "@/lib/reports";
import { isValidProfileSlug } from "@/lib/seller-profile";

/**
 * A buyer's report about a plot or a seller profile.
 *
 * Trust rules: the browser only names WHICH public page it is on (a plot id or
 * a profile slug) and the reason. Everything else — the seller, the label, the
 * reporter — comes from the server. Only targets a visitor can actually see
 * can be reported. Reporters are a signed-in seller or anonymous: anonymous
 * reporters are known only by keyed hashes of a random cookie and of the IP.
 */

const inputSchema = z.object({
  target: z.enum(["LISTING", "PROFILE"]),
  /** LISTING: the plot id. PROFILE: the profile slug. */
  ref: z.string().trim().min(1).max(80),
  reason: z.string().max(40),
  description: z.string().max(REPORT_DESCRIPTION_MAX * 2).optional(),
});

export type ReportInput = z.input<typeof inputSchema>;
export type ReportSubmitResult =
  | { ok: true; alreadyReported: boolean; code: string }
  | { ok: false; message: string; field?: "reason" | "description"; retryAfterSeconds?: number };

export type Reporter = {
  /** Signed-in seller, if any. */
  sellerId: string | null;
  /** Random per-browser token from an httpOnly cookie (anonymous reporters). */
  browserToken: string | null;
  /** Trusted client IP (TRUSTED_IP_HEADER), if configured. */
  ip: string | null;
};

const NOT_FOUND = "This page is no longer available to report.";

/** Plain text only: no control characters (except newlines), collapsed blank lines, trimmed. */
export function cleanDescription(raw: string | undefined): string {
  return (raw ?? "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function submitReport(rawInput: unknown, reporter: Reporter): Promise<ReportSubmitResult> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: "Please choose a reason and try again." };
  const { target, ref } = parsed.data;

  const allowed = reasonsFor(target);
  const reason = allowed.find((r) => r.code === parsed.data.reason)?.code as ReportReason | undefined;
  if (!reason) return { ok: false, field: "reason", message: "Please choose why you're reporting this." };

  const description = cleanDescription(parsed.data.description);
  if (description.length > REPORT_DESCRIPTION_MAX) return { ok: false, field: "description", message: `Please keep it under ${REPORT_DESCRIPTION_MAX} characters.` };
  if (reason === "OTHER" && description.length < OTHER_DESCRIPTION_MIN) {
    return { ok: false, field: "description", message: "Please tell us briefly what's wrong (at least a few words)." };
  }

  // Resolve the target from trusted records — never from client-supplied seller ids or labels.
  const resolved = await resolveTarget(target, ref);
  if (!resolved) return { ok: false, message: NOT_FOUND };
  if (reporter.sellerId && reporter.sellerId === resolved.sellerId) {
    return { ok: false, message: "You can't report your own listing or profile. Edit it from your dashboard instead." };
  }

  const reporterKey = reporter.sellerId
    ? keyedHash("reporter", `seller:${reporter.sellerId}`)
    : reporter.browserToken
      ? keyedHash("reporter", `anon:${reporter.browserToken}`)
      : null;
  if (!reporterKey) return { ok: false, message: "Please enable cookies and try again." };
  const reporterIpHash = reporter.ip ? keyedHash("reporter-ip", reporter.ip) : null;

  // Repeated taps / retries / a second report on the same thing → the same open report.
  const targetId = resolved.propertyId ?? resolved.sellerId;
  const dedupeKey = keyedHash("report-dedupe", `${reporterKey}|${target}|${targetId}`);
  const existing = await db.report.findUnique({ where: { dedupeKey }, select: { code: true } });
  if (existing) return { ok: true, alreadyReported: true, code: existing.code };

  const limits: [Parameters<typeof hitRateLimit>[0], string | null][] = [
    ["reportPerReporter", reporterKey],
    ["reportPerIp", reporterIpHash],
    ["reportPerTarget", `${target}:${targetId}`],
  ];
  for (const [name, subject] of limits) {
    if (!subject) continue;
    const r: RateLimitResult = await hitRateLimit(name, subject);
    if (!r.ok) return { ok: false, message: "You've sent several reports recently. Please try again later.", retryAfterSeconds: r.retryAfterSeconds };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = `R-${generateUnambiguousCode(6)}`;
    try {
      await db.report.create({
        data: {
          code,
          target,
          reason,
          description: description || null,
          propertyId: resolved.propertyId,
          sellerId: resolved.sellerId,
          targetLabel: resolved.label,
          reporterSellerId: reporter.sellerId,
          reporterKey,
          reporterIpHash,
          priority: reason === "FRAUD",
          dedupeKey,
        },
      });
      return { ok: true, alreadyReported: false, code };
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      // A concurrent identical submission won the race → that's the same report.
      // (Checked by lookup: the driver adapter doesn't always say which column clashed.)
      const winner = await db.report.findUnique({ where: { dedupeKey }, select: { code: true } });
      if (winner) return { ok: true, alreadyReported: true, code: winner.code };
      // Otherwise a report-code collision: try a new code.
    }
  }
  return { ok: false, message: "Something went wrong. Please try again." };
}

async function resolveTarget(target: ReportTarget, ref: string): Promise<{ propertyId: string | null; sellerId: string; label: string } | null> {
  if (target === "LISTING") {
    if (!/^[a-z0-9]{1,40}$/i.test(ref)) return null;
    const p = await db.property.findUnique({
      where: { id: ref },
      select: { id: true, title: true, status: true, hiddenReason: true, sellerId: true, seller: { select: { isBlocked: true } } },
    });
    if (!p || !isPubliclyViewable(p)) return null;
    return { propertyId: p.id, sellerId: p.sellerId, label: p.title.slice(0, 200) };
  }
  const slug = ref.toLowerCase();
  if (!isValidProfileSlug(slug)) return null;
  const seller = await db.seller.findUnique({ where: { profileSlug: slug }, select: { id: true, name: true, isBlocked: true } });
  if (!seller || seller.isBlocked) return null;
  return { propertyId: null, sellerId: seller.id, label: seller.name.slice(0, 200) };
}
