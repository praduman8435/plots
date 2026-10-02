import { Phone } from "lucide-react";
import { ButtonA } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatPhone } from "@/lib/phone";
import { waLink } from "@/lib/whatsapp-links";

/** One-tap WhatsApp + call for a phone number (E.164). */
export function ContactButtons({
  phone,
  text = "",
  size = "sm",
  showNumber = false,
  className,
}: {
  phone: string;
  text?: string;
  size?: "sm" | "md";
  showNumber?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {showNumber && <span className="tabular mr-1 text-sm font-medium whitespace-nowrap text-ink">{formatPhone(phone)}</span>}
      <ButtonA
        href={waLink(phone, text)}
        target="_blank"
        rel="noreferrer"
        variant="soft"
        size={size === "sm" ? "icon-sm" : "icon"}
        aria-label={`WhatsApp ${formatPhone(phone)}`}
        title="WhatsApp"
        className="size-11 sm:size-9"
      >
        <WhatsAppIcon />
      </ButtonA>
      <ButtonA
        href={`tel:${phone}`}
        variant="secondary"
        size={size === "sm" ? "icon-sm" : "icon"}
        aria-label={`Call ${formatPhone(phone)}`}
        title="Call"
        className="size-11 sm:size-9"
      >
        <Phone />
      </ButtonA>
    </div>
  );
}
