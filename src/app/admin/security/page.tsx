import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MfaSettings } from "@/components/admin/mfa-settings";
import { isAdminMfaRequired } from "@/lib/admin/mfa";
import { requireAdminSession } from "@/lib/admin/require";

export const metadata: Metadata = { title: "Sign-in security" };

/**
 * Outside the (protected) group on purpose: with ADMIN_REQUIRE_MFA=true every
 * other admin page sends an admin without two-step sign-in here.
 */
export default async function AdminSecurityPage() {
  const admin = await requireAdminSession();
  const required = isAdminMfaRequired();
  const enabled = Boolean(admin.mfaEnabledAt);

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      {(enabled || !required) && (
        <Link href="/admin" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Back to admin
        </Link>
      )}
      <div className="rounded-2xl bg-white p-5 ring-1 ring-line sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-bold text-ink">Two-step sign-in</h1>
            <p className="text-[13px] text-muted">{admin.email}</p>
          </div>
        </div>
        {required && !enabled && (
          <p className="mb-4 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900 ring-1 ring-amber-100">
            Two-step sign-in is required for every admin. Turn it on to continue.
          </p>
        )}
        <MfaSettings enabled={enabled} required={required} recoveryLeft={admin.mfaRecoveryCodes.length} />
      </div>
    </main>
  );
}
