import "server-only";
import { isDemoMode } from "@/lib/demo";
import { MockKycProvider } from "./mock";

/**
 * Identity (Aadhaar/KYC) verification — provider-agnostic.
 *
 * Design rule: the Aadhaar number never reaches our database. The seller is
 * sent to the provider's hosted flow (e.g. DigiLocker via Setu, Cashfree,
 * Surepass, IDfy), and we only store the outcome: status, the provider's
 * reference, and a masked id like "XXXX XXXX 4321".
 *
 * To add a real provider: implement KycProvider in server/kyc/<name>.ts,
 * register it in getKycProvider(), set KYC_PROVIDER=<name> + its credentials,
 * and point its webhook/redirect at /kyc/return.
 */
export type KycResult =
  | { status: "VERIFIED"; masked?: string; providerRef?: string }
  | { status: "FAILED"; reason: string }
  | { status: "PENDING" };

export interface KycProvider {
  readonly id: string;
  /** Shown to sellers, e.g. "DigiLocker". */
  readonly label: string;
  /** Starts a hosted verification and returns where to send the seller. */
  start(input: { attemptId: string; sellerName: string; returnUrl: string }): Promise<{ redirectUrl: string; providerRef?: string }>;
  /** Asks the provider for the outcome. Never trust query params from the redirect. */
  fetchResult(attempt: { id: string; providerRef: string | null }): Promise<KycResult>;
}

export function getKycProvider(): KycProvider | null {
  const name = process.env.KYC_PROVIDER?.trim().toLowerCase();
  if (name === "mock") {
    // The mock never "verifies" anyone in a real production launch — only in dev or an
    // explicitly labelled demo (DEMO_MODE), where the site says checks are simulated.
    if (process.env.NODE_ENV === "production" && !isDemoMode()) return null;
    return new MockKycProvider();
  }
  return null;
}

/** False → identity step is shown as "coming soon" and sellers continue phone-verified only. */
export function isKycAvailable(): boolean {
  return getKycProvider() !== null;
}
