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

/** Seller → our WhatsApp listing assistant. "SELL" starts the guided flow. */
export function sellOnWhatsAppLink(): string {
  return waLink(site.whatsappNumber, "SELL — Hi, I want to list my land on Plots.");
}

export function supportWhatsAppLink(text = "Hi, I need help with Plots."): string {
  return waLink(site.whatsappNumber, text);
}
