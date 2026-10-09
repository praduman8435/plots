import { Phone } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WhatsAppIcon } from "@/components/ui/icons";
import type { ContactChannel } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";
import { formatPhone } from "@/lib/phone";
import { ContactButtons } from "./contact-buttons";
import { formatDateTime, timeAgo } from "./format";

export type EnquiryRow = {
  id: string;
  buyerName: string;
  buyerPhone: string;
  channel: ContactChannel;
  source: string | null;
  createdAt: Date;
  property: { id: string; title: string; code: string; seller: { id: string; name: string; code: string } };
};

export function ChannelBadge({ channel }: { channel: ContactChannel }) {
  return channel === "WHATSAPP" ? (
    <Badge tone="brand" size="sm">
      <WhatsAppIcon /> WhatsApp
    </Badge>
  ) : (
    <Badge tone="blue" size="sm">
      <Phone /> Call
    </Badge>
  );
}

/** Buyer enquiries as stacked cards on phones, aligned rows on desktop. */
export function EnquiryList({
  enquiries,
  showProperty = true,
  showSeller = true,
  className,
}: {
  enquiries: EnquiryRow[];
  showProperty?: boolean;
  showSeller?: boolean;
  className?: string;
}) {
  return (
    <ul className={cn("divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line", className)}>
      {enquiries.map((e) => (
        <li key={e.id} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-2">
              <span className="truncate text-[15px] font-semibold text-ink">{e.buyerName}</span>
              <span className="tabular shrink-0 text-xs text-muted">{formatPhone(e.buyerPhone)}</span>
            </p>
            {showProperty && (
              <Link href={`/admin/listings/${e.property.id}`} className="mt-0.5 block truncate text-[13px] text-ink-soft hover:text-brand-700">
                {e.property.title}
              </Link>
            )}
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              <span className="inline-flex items-center gap-1 font-medium">
                {e.channel === "WHATSAPP" ? <WhatsAppIcon className="size-3 text-brand-600" /> : <Phone className="size-3 text-sky-600" />}
                {e.channel === "WHATSAPP" ? "WhatsApp" : "Call"}
              </span>
              <span aria-hidden>·</span>
              <time dateTime={e.createdAt.toISOString()} title={formatDateTime(e.createdAt)}>
                {timeAgo(e.createdAt)}
              </time>
              {showSeller && (
                <>
                  <span aria-hidden>·</span>
                  <Link href={`/admin/sellers/${e.property.seller.id}`} className="truncate hover:text-brand-700">
                    {e.property.seller.name}
                  </Link>
                </>
              )}
            </p>
          </div>
          <ContactButtons phone={e.buyerPhone} text={`Hi ${e.buyerName}, this is InstaPlots. You enquired about ${e.property.title} (${e.property.code}).`} />
        </li>
      ))}
    </ul>
  );
}
