import { Camera, FileText, IndianRupee, LayoutDashboard, MapPin, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SellerChat } from "@/components/chat/seller-chat";
import { resolveChatPhone } from "@/server/seller/chat-phone";
import { loadChatState } from "@/server/whatsapp/chat-state";

export const metadata: Metadata = {
  title: "Chat with InstaPlots",
  description: "List your land by chatting with the InstaPlots listing assistant.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The WhatsApp listing assistant in the browser. Phones: a full-height chat
 * under the site header (h-16); the site's tab bar is hidden here. Tablet and
 * desktop: a messaging panel that fills the viewport height (it scrolls
 * inside), with a guide alongside on large screens.
 */
export default async function SellChatPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const access = await resolveChatPhone();
  const initial = access ? await loadChatState(access.phone, [], { forSeller: true }) : null;

  return (
    <div className="h-[calc(100dvh-4rem)] overflow-hidden bg-[#efeae2] md:bg-mist">
      <div className="h-full md:container-page md:grid md:gap-6 md:py-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="h-full min-h-0">
          <SellerChat initial={initial} autoStart={sp.start === "1"} upgrade={Boolean(access && access.via === "cookie" && access.sellerExists)} />
        </div>
        <aside className="hidden min-h-0 overflow-y-auto lg:block" aria-label="About the listing assistant">
          <div className="rounded-2xl bg-white p-5 ring-1 ring-line">
            <h1 className="text-base font-bold text-ink">List your land by chat</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              The assistant asks one simple question at a time — in Hindi or English, whichever you prefer. Our team checks every
              listing before buyers see it, so serious buyers trust it.
            </p>
            <h2 className="mt-5 text-xs font-semibold tracking-wide text-muted uppercase">Keep these ready</h2>
            <ul className="mt-2 space-y-2.5 text-sm text-ink-soft">
              <li className="flex gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> Village or area, and the city or district
              </li>
              <li className="flex gap-2.5">
                <FileText className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> Land type and size (bigha, acre, gaj, marla…)
              </li>
              <li className="flex gap-2.5">
                <IndianRupee className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> Your asking price
              </li>
              <li className="flex gap-2.5">
                <Camera className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> A few clear photos of the land
              </li>
            </ul>
          </div>
          <div className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-line">
            <p className="text-sm font-semibold text-ink">Prefer a form?</p>
            <p className="mt-1 text-sm text-muted">Same listing, all fields on one page.</p>
            <div className="mt-3 flex flex-col gap-1.5 text-sm font-semibold">
              <Link href="/seller/properties/new" className="text-brand-700 hover:text-brand-800">
                Add a property with the form →
              </Link>
              <Link href="/seller/dashboard" className="inline-flex items-center gap-1.5 text-muted hover:text-ink">
                <LayoutDashboard className="size-4" aria-hidden /> Your dashboard
              </Link>
            </div>
          </div>
          <p className="mt-4 flex gap-2 px-1 text-xs leading-relaxed text-muted">
            <ShieldCheck className="size-4 shrink-0" aria-hidden /> Your number is only shared with buyers who contact you about a live listing.
          </p>
        </aside>
      </div>
    </div>
  );
}
