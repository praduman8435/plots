import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MockKycScreen } from "@/components/kyc/mock-kyc-screen";
import { db } from "@/lib/db";
import { isDemoMode } from "@/lib/demo";
import { getSellerSession } from "@/lib/seller/session";

export const metadata: Metadata = { title: "Identity verification (simulated)", robots: { index: false } };

/** Stand-in for the provider's hosted page (DigiLocker etc.). 404 outside local dev. */
export default async function MockKycPage(props: PageProps<"/kyc/mock/[attemptId]">) {
  if ((process.env.NODE_ENV === "production" && !isDemoMode()) || process.env.KYC_PROVIDER?.trim().toLowerCase() !== "mock") notFound();
  const { attemptId } = await props.params;
  const sp = await props.searchParams;
  const returnUrl = typeof sp.return === "string" && sp.return.startsWith("/kyc/return?") ? sp.return : "/sell/start";
  const seller = await getSellerSession();
  const attempt = seller ? await db.kycAttempt.findFirst({ where: { id: attemptId, sellerId: seller.id } }) : null;
  if (!seller || !attempt) notFound();
  return <MockKycScreen attemptId={attempt.id} returnUrl={returnUrl} sellerName={seller.name} />;
}
