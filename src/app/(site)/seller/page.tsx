import { BadgeCheck, LineChart, MessageSquareText } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoSellerIdHelp, SellerLoginForm } from "@/components/seller/login-form";
import { getSellerSession } from "@/lib/seller/session";
import { isOtpPaused } from "@/server/seller/otp";

export const metadata: Metadata = {
  title: "Seller login",
  description: "Sellers: sign in with your Seller ID to see your land, buyer enquiries and share link.",
  robots: { index: false },
};

export default async function SellerLoginPage(props: PageProps<"/seller">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/seller/") ? sp.next : undefined;
  if (await getSellerSession()) redirect(next ?? "/seller/dashboard");
  const otpPaused = isOtpPaused();

  return (
    <div className="bg-mist">
      <div className="container-page grid min-h-[calc(100dvh-4rem)] items-center gap-10 py-10 pb-28 lg:grid-cols-2 lg:py-16">
        <div className="hidden lg:block">
          <p className="text-xs font-bold tracking-[0.14em] text-brand-600 uppercase">Seller portal</p>
          <h1 className="mt-3 text-5xl leading-[1.05] font-extrabold">Your plots, enquiries and Seller ID — in one place.</h1>
          <ul className="mt-8 space-y-4 text-[15px] text-ink-soft">
            {[
              { icon: LineChart, text: "See views and enquiries for every plot" },
              { icon: MessageSquareText, text: "Every buyer who contacted you, with their number" },
              { icon: BadgeCheck, text: "Mark plots sold or still available in one tap" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-white text-brand-600 shadow-soft ring-1 ring-line">
                  <Icon className="size-5" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="rounded-[1.75rem] bg-white p-6 shadow-card ring-1 ring-line sm:p-8">
            <h1 className="text-2xl font-extrabold lg:hidden">Seller login</h1>
            <h2 className="hidden text-2xl font-extrabold lg:block">Sign in</h2>
            <p className="mt-1.5 mb-6 text-[15px] text-muted">
              {otpPaused
                ? "Enter your Seller ID and the mobile number you registered with."
                : "Enter your Seller ID. We'll send a code to your WhatsApp to check it's you."}
            </p>
            <SellerLoginForm otpPaused={otpPaused} next={next} />
          </div>
          <div className="mt-4">
            <NoSellerIdHelp />
          </div>
        </div>
      </div>
    </div>
  );
}
