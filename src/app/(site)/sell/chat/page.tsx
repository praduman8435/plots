import type { Metadata } from "next";
import { SellerChat } from "@/components/chat/seller-chat";
import { resolveChatPhone } from "@/server/seller/chat-phone";
import { loadChatState } from "@/server/whatsapp/chat-state";

export const metadata: Metadata = {
  title: "Chat with Plots",
  description: "List your land by chatting with the Plots listing assistant.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The WhatsApp listing assistant in the browser. Full viewport height under
 * the site header (h-16, lg:h-[72px]); the site's tab bar is hidden here.
 */
export default async function SellChatPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const access = await resolveChatPhone();
  const initial = access ? await loadChatState(access.phone, [], { forSeller: true }) : null;

  return (
    <div className="h-[calc(100dvh-4rem)] overflow-hidden bg-[#efeae2] md:bg-mist lg:h-[calc(100dvh-72px)]">
      <SellerChat
        initial={initial}
        autoStart={sp.start === "1"}
        upgrade={Boolean(access && access.via === "cookie" && access.sellerExists)}
      />
    </div>
  );
}
