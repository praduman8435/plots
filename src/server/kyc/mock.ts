import "server-only";
import { db } from "@/lib/db";
import type { KycProvider, KycResult } from "./provider";

/**
 * LOCAL DEVELOPMENT ONLY. Simulates a hosted DigiLocker-style flow at
 * /kyc/mock/[attemptId]. The "provider side" writes its outcome onto the
 * KycAttempt row; fetchResult reads it back, like a real status API would.
 */
export class MockKycProvider implements KycProvider {
  readonly id = "mock";
  readonly label = "a secure Aadhaar OTP";

  async start(input: { attemptId: string; returnUrl: string }) {
    const params = new URLSearchParams({ return: input.returnUrl });
    return { redirectUrl: `/kyc/mock/${input.attemptId}?${params}`, providerRef: `mock_${input.attemptId}` };
  }

  async fetchResult(attempt: { id: string }): Promise<KycResult> {
    const row = await db.kycAttempt.findUnique({ where: { id: attempt.id } });
    if (!row || row.status === "PENDING" || row.status === "UNVERIFIED") return { status: "PENDING" };
    if (row.status === "FAILED") return { status: "FAILED", reason: row.failReason ?? "Verification failed" };
    return { status: "VERIFIED", masked: row.masked ?? undefined, providerRef: row.providerRef ?? undefined };
  }
}
