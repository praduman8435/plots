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
    <ul className={cn("divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-soft", className)}>
      {enquiries.map((e) => (
        <li key={e.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:gap-5">
          <div className="flex min-w-0 items-start justify-between gap-3 md:w-64 md:shrink-0">
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{e.buyerName}</p>
              <p className="tabular text-sm text-muted">{formatPhone(e.buyerPhone)}</p>
            </div>
            <ContactButtons
              phone={e.buyerPhone}
              text={`Hi ${e.buyerName}, this is Plots. You enquired about ${e.property.title} (${e.property.code}).`}
              className="md:hidden"
            />
          </div>
          {(showProperty || showSeller) && (
            <div className="min-w-0 flex-1 text-sm">
              {showProperty && (
                <Link href={`/admin/listings/${e.property.id}`} className="block truncate font-medium text-ink hover:text-brand-700">
                  {e.property.title} <span className="tabular text-faint">· {e.property.code}</span>
                </Link>
              )}
              {showSeller && (
                <Link href={`/admin/sellers/${e.property.seller.id}`} className="mt-0.5 block truncate text-muted hover:text-brand-700">
                  Seller: {e.property.seller.name} <span className="tabular text-faint">· {e.property.seller.code}</span>
                </Link>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 md:shrink-0 md:justify-end">
            <div className="flex items-center gap-2">
              <ChannelBadge channel={e.channel} />
              <time dateTime={e.createdAt.toISOString()} title={formatDateTime(e.createdAt)} className="text-xs whitespace-nowrap text-muted">
                {timeAgo(e.createdAt)}
              </time>
            </div>
            <ContactButtons
              phone={e.buyerPhone}
              text={`Hi ${e.buyerName}, this is Plots. You enquired about ${e.property.title} (${e.property.code}).`}
              className="hidden md:flex"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
