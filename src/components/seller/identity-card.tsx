import { AlertTriangle, ArrowRight, BadgeCheck, Fingerprint, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { beginIdentityCheck } from "@/server/actions/seller/signup";

/** One-time identity check prompt (sellers who registered on WhatsApp, or skipped it). */
export function IdentityCard({ next, providerLabel, failed, title = "Verify your identity — once" }: { next: string; providerLabel: string; failed?: boolean; title?: string }) {
  return (
    <div className="rounded-[1.75rem] bg-white p-6 shadow-card ring-1 ring-line sm:p-8">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
        <Fingerprint className="size-6" aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl leading-tight font-extrabold sm:text-3xl">{title}</h1>
      <p className="mt-2 text-[15px] text-muted">
        A quick Aadhaar check through {providerLabel}. Buyers then see <strong className="text-ink">✓ Identity verified</strong> on all your listings. You won&apos;t be asked again.
      </p>
      {failed && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-2xl bg-red-50 p-3.5 text-sm text-red-800 ring-1 ring-red-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> Verification didn&apos;t go through. Please try again.
        </p>
      )}
      <ul className="mt-5 space-y-2.5 text-sm text-ink-soft">
        <li className="flex gap-2.5"><Lock className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> We never store your Aadhaar number.</li>
        <li className="flex gap-2.5"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> Takes about 2 minutes.</li>
      </ul>
      <form action={beginIdentityCheck} className="mt-7">
        <input type="hidden" name="next" value={next} />
        <Button type="submit" size="xl" className="w-full">
          Verify with Aadhaar <ArrowRight />
        </Button>
      </form>
    </div>
  );
}
