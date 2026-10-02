import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import { daysAgo } from "@/components/admin/data";
import { EmptyState } from "@/components/admin/empty-state";
import { EnquiryList } from "@/components/admin/enquiry-list";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination } from "@/components/admin/pagination";
import { Segmented } from "@/components/admin/segmented";
import type { Prisma } from "@/generated/prisma/client";
import type { ContactChannel } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/admin/require";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Enquiries" };

const PAGE_SIZE = 30;
const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "all", label: "All time" },
] as const;
const CHANNELS = [
  { value: "", label: "All" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "CALL", label: "Calls" },
] as const;

export default async function AdminEnquiriesPage({ searchParams }: PageProps<"/admin/enquiries">) {
  await requireAdmin();
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const range = RANGES.find((r) => r.value === first(sp.range))?.value ?? "30";
  const channelParam = first(sp.channel);
  const channel = channelParam === "WHATSAPP" || channelParam === "CALL" ? (channelParam as ContactChannel) : undefined;
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? "1", 10) || 1);

  const where: Prisma.EnquiryWhereInput = {
    ...(range !== "all" ? { createdAt: { gte: daysAgo(Number(range)) } } : {}),
    ...(channel ? { channel } : {}),
  };
  const [total, enquiries] = await Promise.all([
    db.enquiry.count({ where }),
    db.enquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { property: { select: { id: true, title: true, code: true, seller: { select: { id: true, name: true, code: true } } } } },
    }),
  ]);

  const href = (r: string, c?: string) => {
    const q = new URLSearchParams();
    if (r !== "30") q.set("range", r);
    if (c) q.set("channel", c);
    const s = q.toString();
    return s ? `/admin/enquiries?${s}` : "/admin/enquiries";
  };

  return (
    <>
      <PageHeader title="Enquiries" description={`${total} buyer enquir${total === 1 ? "y" : "ies"} — every WhatsApp or Call tap on a plot.`} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented label="Time range" options={RANGES.map((r) => ({ label: r.label, href: href(r.value, channel), active: r.value === range }))} />
        <Segmented label="Channel" options={CHANNELS.map((c) => ({ label: c.label, href: href(range, c.value || undefined), active: (c.value || undefined) === channel }))} />
      </div>

      <div className="mt-5">
        {enquiries.length === 0 ? (
          <EmptyState icon={Inbox} title="No enquiries in this period" />
        ) : (
          <EnquiryList enquiries={enquiries} />
        )}
        <Pagination basePath="/admin/enquiries" params={{ range: range !== "30" ? range : undefined, channel }} page={page} pageSize={PAGE_SIZE} total={total} />
      </div>
    </>
  );
}
