import { site } from "./site";

/** Click-to-chat link that opens WhatsApp with a pre-filled message. */
export function waLink(phoneE164OrDigits: string, text: string): string {
  return `https://wa.me/${phoneE164OrDigits.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** Buyer → seller, about one plot. */
export function buyerToSellerLink(sellerPhone: string, p: { title: string; code: string; slug: string }, buyerName?: string) {
  const intro = buyerName ? `Hi, I'm ${buyerName}.` : "Hi,";
  return waLink(sellerPhone, `${intro} I'm interested in this property on ${site.name}: ${p.title} (${p.code})\n${site.url}/property/${p.slug}`);
}

/** True once the business number is connected to the WhatsApp Cloud API (set NEXT_PUBLIC_WHATSAPP_CONNECTED=true). */
export function isWhatsAppConnected(): boolean {
  return process.env.NEXT_PUBLIC_WHATSAPP_CONNECTED === "true";
}

/**
 * Seller → our listing assistant. "SELL" starts the guided flow.
 * Until Meta is connected, the same assistant runs in the in-site chat (/sell/chat).
 */
export function sellOnWhatsAppLink(): string {
  return isWhatsAppConnected() ? waLink(site.whatsappNumber, "SELL — Hi, I want to list my land on Plots.") : "/sell/chat?start=1";
}

/** Props for an <a>/ButtonA: new tab only for real WhatsApp. */
export function sellOnWhatsAppProps(): { href: string; target?: string; rel?: string } {
  return isWhatsAppConnected() ? { href: sellOnWhatsAppLink(), target: "_blank", rel: "noopener" } : { href: sellOnWhatsAppLink() };
}

export function supportWhatsAppLink(text = "Hi, I need help with Plots."): string {
  return waLink(site.whatsappNumber, text);
}
