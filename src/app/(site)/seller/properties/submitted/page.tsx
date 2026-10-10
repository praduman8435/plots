import { CheckCircle2, Clock, MessageCircle, Plus } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { requireSeller } from "@/lib/seller/require";
import { formatArea } from "@/lib/units";

export const metadata: Metadata = { title: "Submitted", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SubmittedPage(props: PageProps<"/seller/properties/submitted">) {
  const seller = await requireSeller();
  const sp = await props.searchParams;
  const code = typeof sp.code === "string" ? sp.code : "";
  const p = await db.property.findFirst({
    where: { code, sellerId: seller.id },
    include: { images: { orderBy: { position: "asc" }, take: 1 }, city: true },
  });
  if (!p) notFound();

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-mist pb-28">
      <div className="mx-auto max-w-lg px-4 pt-8 sm:pt-12">
        <div className="rounded-[1.75rem] bg-white p-6 text-center shadow-card ring-1 ring-line sm:p-8">
          <CheckCircle2 className="mx-auto size-12 text-brand-600" aria-hidden />
          <h1 className="mt-4 text-2xl font-extrabold sm:text-3xl">{sp.edited ? "Your changes have been submitted" : "Your land has been submitted"}</h1>
          <p className="mx-auto mt-2 max-w-sm text-[15px] text-muted">
            We&apos;ll review your listing before it appears to buyers — usually within a few hours.
          </p>

          <div className="mt-6 flex items-center gap-3.5 rounded-2xl bg-mist p-3 text-left ring-1 ring-line">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-white">
              {p.images[0] && <Image src={p.images[0].url} alt="" fill sizes="64px" className="object-cover" />}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold">{p.title}</p>
              <p className="text-sm text-muted">
                {formatArea(p.area, p.areaUnit)} · {formatPrice(p.price)} · {p.city.name}
              </p>
              <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 ring-1 ring-sky-100">
                <Clock className="size-3" aria-hidden /> Pending approval
              </p>
            </div>
          </div>

          <p className="mt-5 flex items-center justify-center gap-2 text-sm text-muted">
            <MessageCircle className="size-4 text-brand-600" aria-hidden /> We&apos;ll message you on WhatsApp when it&apos;s live.
          </p>

          <div className="mt-7 grid gap-2.5">
            <ButtonLink href="/seller/dashboard" size="xl" className="w-full">
              Go to my properties
            </ButtonLink>
            <ButtonLink href="/seller/properties/new" size="xl" variant="secondary" className="w-full">
              <Plus /> Add another property
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}
