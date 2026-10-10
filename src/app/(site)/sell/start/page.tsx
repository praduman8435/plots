import { AlertTriangle, ArrowRight, BadgeCheck, Fingerprint, Lock, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CopySellerId } from "@/components/seller/copy-id";
import { SellProgress } from "@/components/seller/progress";
import { SignupWizard } from "@/components/seller/signup-wizard";
import { Button, ButtonLink } from "@/components/ui/button";
import { getSellerSession } from "@/lib/seller/session";
import { beginIdentityCheck, continueWithoutIdentity } from "@/server/actions/seller/signup";
import { getKycProvider } from "@/server/kyc/provider";

export const metadata: Metadata = { title: "Sell your land — get started", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * First-time seller sign-up: name → mobile → OTP → identity → Seller ID →
 * first property. Returning sellers who land here are sent straight to
 * "Add another property".
 */
export default async function SellStartPage(props: PageProps<"/sell/start">) {
  const sp = await props.searchParams;
  const seller = await getSellerSession();
  const kyc = getKycProvider();

  // Returning, fully registered seller → only property details.
  if (seller?.onboardedAt && sp.done !== "1") redirect("/seller/properties/new");

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-mist pb-16">
      <div className="mx-auto w-full max-w-lg px-4 pt-6 sm:pt-12">
        <SellProgress current={seller?.onboardedAt ? 1 : 0} />
        <div className="mt-6 rounded-[1.75rem] bg-white p-6 shadow-card ring-1 ring-line sm:p-8">
          {!seller && <SignupWizard />}

          {seller && !seller.onboardedAt && (
            <div>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                <Fingerprint className="size-6" aria-hidden />
              </span>
              <h1 className="mt-5 text-[1.6rem] leading-tight font-extrabold sm:text-3xl">Verify your identity</h1>
              {sp.kyc === "failed" && (
                <p role="alert" className="mt-4 flex items-start gap-2 rounded-2xl bg-red-50 p-3.5 text-sm text-red-800 ring-1 ring-red-100">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> Verification didn&apos;t go through. Please try again.
                </p>
              )}
              {kyc ? (
                <>
                  <p className="mt-2 text-[15px] text-muted">
                    A one-time check with your Aadhaar through {kyc.label}. Buyers then see <strong className="text-ink">✓ Aadhaar verified</strong> on your listings.
                  </p>
                  <ul className="mt-5 space-y-2.5 text-sm text-ink-soft">
                    <li className="flex gap-2.5"><Lock className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> We never store your Aadhaar number.</li>
                    <li className="flex gap-2.5"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> Buyers never see your Aadhaar details.</li>
                    <li className="flex gap-2.5"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> Takes about 2 minutes. Only once.</li>
                  </ul>
                  <form action={beginIdentityCheck} className="mt-7">
                    <input type="hidden" name="next" value="/sell/start?done=1" />
                    <Button type="submit" size="xl" className="w-full">
                      Verify with Aadhaar <ArrowRight />
                    </Button>
                  </form>
                </>
              ) : (
                <>
                  <p className="mt-2 text-[15px] text-muted">
                    Aadhaar verification is coming soon. Your mobile number is verified, so you can list your land now — we&apos;ll ask you to verify later.
                  </p>
                  <form action={continueWithoutIdentity} className="mt-7">
                    <Button type="submit" size="xl" className="w-full">
                      Continue <ArrowRight />
                    </Button>
                  </form>
                </>
              )}
            </div>
          )}

          {seller?.onboardedAt && (
            <div className="text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-brand">
                <BadgeCheck className="size-7" aria-hidden />
              </span>
              <h1 className="mt-5 text-[1.6rem] leading-tight font-extrabold sm:text-3xl">Your seller account is ready</h1>
              <p className="mt-2 text-[15px] text-muted">We&apos;ve also sent your Seller ID on WhatsApp. Use it to add and manage your properties.</p>
              <div className="relative isolate mt-6 overflow-hidden rounded-3xl bg-linear-to-br from-brand-700 to-brand-900 p-5 text-left text-white">
                <div className="bg-contours absolute inset-0 -z-10 opacity-70" aria-hidden />
                <p className="text-xs font-semibold tracking-widest text-white/60 uppercase">Seller ID</p>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-mono text-3xl font-bold tracking-wider">{seller.code}</p>
                  <CopySellerId code={seller.code} />
                </div>
                <p className="mt-3 text-sm text-white/75">
                  {seller.name}
                  {seller.identityStatus === "VERIFIED" ? " · Aadhaar verified ✓" : " · Phone verified ✓"}
                </p>
              </div>
              <ButtonLink href="/seller/properties/new" size="xl" className="mt-7 w-full">
                Add your first property <ArrowRight />
              </ButtonLink>
              <Link href="/seller/dashboard" className="mt-3 inline-block py-2 text-sm font-semibold text-muted hover:text-ink">
                Go to my dashboard
              </Link>
            </div>
          )}
        </div>
        {!seller && (
          <p className="mt-5 text-center text-sm text-muted">
            Already listed with us?{" "}
            <Link href="/seller/login?next=/seller/properties/new" className="font-semibold text-brand-700">
              Sign in with your Seller ID
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
