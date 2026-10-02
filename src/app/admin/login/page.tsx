import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/login-form";
import { LogoMark } from "@/components/ui/logo";
import { getAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function AdminLoginPage() {
  if (await getAdminSession()) redirect("/admin");

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-brand-950 bg-contours" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-56 h-40 bg-gradient-to-b from-brand-950/0 to-mist" />

      <div className="relative w-full max-w-[400px] animate-fade-up">
        <div className="mb-7 flex flex-col items-center text-center text-white">
          <LogoMark className="size-12 shadow-brand ring-4 ring-white/10" />
          <p className="mt-4 text-2xl font-extrabold tracking-tight">Plots Admin</p>
          <p className="mt-1 text-sm text-brand-100/80">Review plots, help sellers, keep listings honest.</p>
        </div>

        <div className="rounded-3xl border border-line bg-white p-6 shadow-lift sm:p-8">
          <h1 className="text-lg font-bold text-ink">Sign in</h1>
          <p className="mt-1 mb-6 text-sm text-muted">Use the email and password your team lead gave you.</p>
          <AdminLoginForm />
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted">
          <ShieldCheck className="size-3.5" aria-hidden />
          Staff only. Every sign-in attempt is rate limited.
        </p>
      </div>
    </main>
  );
}
