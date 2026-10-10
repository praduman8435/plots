import { NextResponse } from "next/server";
import { getSellerSession } from "@/lib/seller/session";
import { completeIdentityVerification, finishOnboarding, safeNext } from "@/server/seller/onboarding";

/** Where the KYC provider sends the seller back. The outcome is fetched from the provider, never read from this URL. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const seller = await getSellerSession();
  if (!seller) return NextResponse.redirect(new URL("/seller/login", url));

  const attempt = url.searchParams.get("attempt") ?? "";
  const next = safeNext(url.searchParams.get("next"), seller.onboardedAt ? "/seller/dashboard" : "/sell/start?done=1");
  const result = await completeIdentityVerification(seller.id, attempt);

  if (result.status === "VERIFIED") {
    if (!seller.onboardedAt) await finishOnboarding(seller.id);
    return NextResponse.redirect(new URL(next, url));
  }
  const back = seller.onboardedAt ? "/seller/verify" : "/sell/start";
  return NextResponse.redirect(new URL(`${back}?kyc=${result.status === "PENDING" ? "pending" : "failed"}`, url));
}
