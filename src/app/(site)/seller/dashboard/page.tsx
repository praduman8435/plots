import { BadgeCheck, ExternalLink, Eye, Fingerprint, LogOut, MessageCircle, Phone, Plus, Sprout } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CopySellerId } from "@/components/seller/copy-id";
import { PlotActions } from "@/components/seller/plot-actions";
import { Badge } from "@/components/ui/badge";
import { ButtonA, ButtonLink } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/ui/icons";
import type { HiddenReason, ListingStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { freshnessLabel } from "@/lib/freshness";
import { placeName } from "@/lib/land";
import { formatPhone } from "@/lib/phone";
import { requireSeller } from "@/lib/seller/require";
import { formatArea } from "@/lib/units";
import { site } from "@/lib/site";
import { isWhatsAppConnected, sellOnWhatsAppProps, waLink } from "@/lib/whatsapp-links";
import { sellerSignOut } from "@/server/actions/seller/auth";
import { ShareProfile } from "@/components/seller/share-profile";
import { sellerProfileUrl } from "@/lib/seller-profile";
import { isKycAvailable } from "@/server/kyc/provider";
import { ensureProfileSlug } from "@/server/seller/profile";

export const metadata: Metadata = { title: "My properties", robots: { index: false } };
export const dynamic = "force-dynamic";

function statusOf(status: ListingStatus, hiddenReason: HiddenReason | null): { label: string; tone: "brand" | "amber" | "neutral" | "red" | "blue" } {
  switch (status) {
    case "PENDING":
      return { label: "Pending approval", tone: "blue" };
    case "ACTIVE":
      return { label: "Live", tone: "brand" };
    case "SOLD":
      return { label: "Sold", tone: "neutral" };
    case "REJECTED":
      return { label: "Not approved", tone: "red" };
    case "HIDDEN":
      return { label: hiddenReason === "AVAILABILITY_UNCONFIRMED" ? "Unavailable" : "Hidden", tone: "amber" };
  }
}

const enquiryTime = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
function when(d: Date) {
  const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) === d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
  return today ? `Today, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}` : enquiryTime.format(d);
}

export default async function SellerDashboard() {
  const seller = await requireSeller();
  const profileUrl = sellerProfileUrl(await ensureProfileSlug(seller));
  const [plots, enquiries] = await Promise.all([
    db.property.findMany({
      where: { sellerId: seller.id },
      orderBy: [{ createdAt: "desc" }],
      include: { images: { orderBy: { position: "asc" }, take: 1 }, city: true, _count: { select: { enquiries: true } } },
    }),
    db.enquiry.findMany({
      where: { property: { sellerId: seller.id } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { property: { select: { title: true, code: true } } },
    }),
  ]);
  const needsAnswer = plots.filter((p) => p.status === "ACTIVE" && p.availabilityCheckSentAt).length;
  const showVerify = isKycAvailable() && seller.identityStatus !== "VERIFIED";

  return (
    <div className="bg-mist pb-28 md:pb-16">
      <div className="container-page max-w-4xl pt-6 sm:pt-10 lg:grid lg:max-w-[78rem] lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        {/* Left on desktop: who you are + your share link (stays in view). Phones: stacked as before. */}
        <aside className="lg:sticky lg:top-24">
        {/* Welcome + Seller ID */}
        <section className="relative isolate overflow-hidden rounded-[1.75rem] bg-linear-to-br from-brand-700 via-brand-800 to-brand-950 p-5 text-white shadow-lift sm:p-7">
          <div className="bg-contours absolute inset-0 -z-10 opacity-70" aria-hidden />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-extrabold sm:text-3xl lg:text-2xl">Welcome, {seller.name.split(" ")[0]}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/75">
                <span className="inline-flex items-center gap-1"><BadgeCheck className="size-4 text-brand-200" aria-hidden /> Phone verified</span>
                {seller.identityStatus === "VERIFIED" && <span className="inline-flex items-center gap-1"><Fingerprint className="size-4 text-brand-200" aria-hidden /> Identity verified</span>}
              </p>
            </div>
            <form action={sellerSignOut}>
              <button aria-label="Sign out" className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-white/80 ring-1 ring-white/20 hover:bg-white/10">
                <LogOut className="size-4" aria-hidden /> <span className="hidden sm:inline lg:hidden">Sign out</span>
              </button>
            </form>
          </div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-white/15 pt-4">
            <div>
              <p className="text-xs font-semibold tracking-widest text-white/60 uppercase">Seller ID</p>
              <p className="mt-0.5 font-mono text-3xl font-bold tracking-wider">{seller.code}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <CopySellerId code={seller.code} />
              <Link
                href={isWhatsAppConnected() ? waLink(site.whatsappNumber, "STATUS") : "/sell/chat"}
                {...(isWhatsAppConnected() ? { target: "_blank", rel: "noopener" } : {})}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-800 transition hover:bg-brand-50"
              >
                <WhatsAppIcon className="size-3.5" /> Messages
              </Link>
            </div>
          </div>
        </section>

        {showVerify && (
          <Link href="/seller/verify" className="mt-3 flex items-center gap-3 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-line transition hover:ring-brand-300">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Fingerprint className="size-5" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Verify your identity — 2 minutes</span>
              <span className="block text-sm text-muted">Buyers trust listings with ✓ Identity verified.</span>
            </span>
            <span className="text-sm font-semibold text-brand-700">Verify</span>
          </Link>
        )}
        {needsAnswer > 0 && (
          <p className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-100">
            <strong>Still available?</strong> Please confirm {needsAnswer === 1 ? "your property" : `${needsAnswer} properties`} below — otherwise {needsAnswer === 1 ? "it is" : "they are"} hidden from buyers after 24 hours.
          </p>
        )}

        <div className="@container mt-3">
          <ShareProfile url={profileUrl} name={seller.name} />
        </div>
        </aside>

        <div className="min-w-0">
        {/* Properties */}
        <section className="mt-8 lg:mt-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold">My properties</h2>
            <div className="flex gap-2">
              <ButtonA {...sellOnWhatsAppProps()} variant="secondary" size="sm" className="hidden sm:inline-flex">
                <WhatsAppIcon className="text-brand-600" /> Add via WhatsApp
              </ButtonA>
              <ButtonLink href="/seller/plots/new" size="sm">
                <Plus /> Add new property
              </ButtonLink>
            </div>
          </div>

          {plots.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-line-strong bg-white p-10 text-center">
              <Sprout className="mx-auto size-8 text-brand-600" aria-hidden />
              <p className="mt-3 font-semibold">No properties yet</p>
              <p className="mt-1 text-sm text-muted">Add your first property — it takes a few minutes.</p>
              <ButtonLink href="/seller/plots/new" className="mt-5">
                <Plus /> Add property
              </ButtonLink>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {plots.map((p) => {
                const st = statusOf(p.status, p.hiddenReason);
                const fresh = p.status === "ACTIVE" ? freshnessLabel(p) : null;
                return (
                  <li key={p.id} className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-line">
                    <div className="relative aspect-[16/9] bg-mist">
                      {p.images[0] && <Image src={p.images[0].url} alt="" fill sizes="(min-width: 640px) 50vw, 100vw" className="object-cover" />}
                      <Badge tone={st.tone} className="absolute top-3 left-3 shadow-soft">{st.label}</Badge>
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <p className="tabular text-xl font-extrabold">{formatPrice(p.price)}</p>
                      <p className="mt-0.5 line-clamp-1 font-semibold">{formatArea(p.area, p.areaUnit)} · {p.title.replace(/^.*? in /, "")}</p>
                      <p className="text-sm text-muted">{placeName(p)}, {p.city.name}</p>
                      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
                        <span className="inline-flex items-center gap-1"><Eye className="size-4 text-muted" aria-hidden /> {p.viewCount} views</span>
                        <span className="inline-flex items-center gap-1"><MessageCircle className="size-4 text-muted" aria-hidden /> {p._count.enquiries} enquiries</span>
                      </p>
                      {fresh && <p className={`mt-1 text-xs font-medium ${fresh.fresh ? "text-brand-700" : "text-muted"}`}>{fresh.text}</p>}
                      {p.status === "PENDING" && <p className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-900">We&apos;re reviewing it — usually live within a few hours.</p>}
                      {p.status === "REJECTED" && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{p.rejectionReason ? `Not approved: ${p.rejectionReason}. ` : ""}Edit and resubmit, or message us on WhatsApp.</p>}
                      {p.status === "HIDDEN" && p.hiddenReason === "AVAILABILITY_UNCONFIRMED" && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Hidden because we didn&apos;t hear back. Still available? Make it live again.</p>}
                      {p.status === "ACTIVE" && p.availabilityCheckSentAt && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Is it still available? Tap “Still available”.</p>}
                      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 [margin-top:max(0.75rem,auto)]">
                        <PlotActions id={p.id} status={p.status} hiddenReason={p.hiddenReason} awaitingReply={Boolean(p.availabilityCheckSentAt)} />
                        {(p.status === "ACTIVE" || p.status === "SOLD") && (
                          <Link href={`/property/${p.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                            View <ExternalLink className="size-3.5" aria-hidden />
                          </Link>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Enquiries */}
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-extrabold">Who contacted me</h2>
          {enquiries.length === 0 ? (
            <p className="rounded-3xl bg-white p-6 text-sm text-muted ring-1 ring-line">No enquiries yet. Share your property links in WhatsApp groups to reach more buyers.</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-line">
              {enquiries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 p-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 font-bold text-brand-800 ring-1 ring-brand-100">{e.buyerName.charAt(0)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{e.buyerName}</p>
                    <p className="truncate text-sm text-ink-soft">+91 {formatPhone(e.buyerPhone)}</p>
                    <p className="truncate text-xs text-muted">Interested in {e.property.title} · {when(e.createdAt)}</p>
                  </div>
                  <a
                    href={waLink(e.buyerPhone, `Namaste ${e.buyerName.split(" ")[0]} ji, this is ${seller.name} about ${e.property.title} (${e.property.code}).`)}
                    target="_blank"
                    rel="noopener"
                    aria-label={`WhatsApp ${e.buyerName}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-brand"
                  >
                    <WhatsAppIcon className="size-5" />
                  </a>
                  <a href={`tel:${e.buyerPhone}`} aria-label={`Call ${e.buyerName}`} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-line-strong">
                    <Phone className="size-4" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
        </div>
      </div>
    </div>
  );
}
