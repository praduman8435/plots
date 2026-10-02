import { BadgeCheck } from "lucide-react";
import type { Metadata } from "next";
import { IdentityCard } from "@/components/seller/identity-card";
import { ButtonLink } from "@/components/ui/button";
import { requireSeller } from "@/lib/seller/require";
import { getKycProvider } from "@/server/kyc/provider";

export const metadata: Metadata = { title: "Verify your identity", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function VerifyIdentityPage(props: PageProps<"/seller/verify">) {
  const seller = await requireSeller();
  const sp = await props.searchParams;
  const kyc = getKycProvider();

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-mist pb-28">
      <div className="mx-auto max-w-lg px-4 pt-8 sm:pt-12">
        {seller.identityStatus === "VERIFIED" ? (
          <div className="rounded-[1.75rem] bg-white p-8 text-center shadow-card ring-1 ring-line">
            <BadgeCheck className="mx-auto size-10 text-brand-600" aria-hidden />
            <h1 className="mt-4 text-2xl font-extrabold">Identity verified</h1>
            <p className="mt-2 text-muted">Buyers see ✓ Identity verified on your listings.</p>
            <ButtonLink href="/seller/dashboard" size="lg" className="mt-6">Back to my properties</ButtonLink>
          </div>
        ) : kyc ? (
          <IdentityCard next="/seller/dashboard?verified=1" providerLabel={kyc.label} failed={sp.kyc === "failed"} />
        ) : (
          <div className="rounded-[1.75rem] bg-white p-8 text-center shadow-card ring-1 ring-line">
            <h1 className="text-2xl font-extrabold">Coming soon</h1>
            <p className="mt-2 text-muted">Aadhaar verification will be available shortly. Your phone number is already verified.</p>
            <ButtonLink href="/seller/dashboard" size="lg" className="mt-6">Back to my properties</ButtonLink>
          </div>
        )}
      </div>
    </div>
  );
}
