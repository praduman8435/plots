import { AlertCircle, ArrowRight, BadgeCheck, Eye, Fingerprint, ImageOff, LogOut, MessageCircle, Phone, Plus, Sprout } from "lucide-react";
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
import { cn } from "@/lib/cn";
import { freshnessLabel } from "@/lib/freshness";
import { LAND_TYPES, placeName } from "@/lib/land";
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

const TABS = [
  { key: "all", label: "All", match: () => true },
  { key: "live", label: "Live", match: (st: ListingStatus) => st === "ACTIVE" },
  { key: "review", label: "In review", match: (st: ListingStatus) => st === "PENDING" || st === "REJECTED" },
  { key: "hidden", label: "Hidden", match: (st: ListingStatus) => st === "HIDDEN" },
  { key: "sold", label: "Sold", match: (st: ListingStatus) => st === "SOLD" },
] as const;

export default async function SellerDashboard(props: PageProps<"/seller/dashboard">) {
  const seller = await requireSeller();
  const sp = await props.searchParams;
  const profileUrl = sellerProfileUrl(await ensureProfileSlug(seller));
  const [plots, enquiries] = await Promise.all([
    db.property.findMany({
      where: { sellerId: seller.id, removedAt: null },
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
  const live = plots.filter((p) => p.status === "ACTIVE").length;
  const views = plots.reduce((n, p) => n + p.viewCount, 0);
  const enquiryCount = plots.reduce((n, p) => n + p._count.enquiries, 0);

  const tabs = TABS.map((t) => ({ ...t, count: plots.filter((p) => t.match(p.status)).length })).filter((t) => t.key === "all" || t.count > 0);
  const tab = tabs.find((t) => t.key === sp.show) ?? tabs[0];
  const shown = plots.filter((p) => tab.match(p.status));
  const firstName = seller.name.split(" ")[0];

  return (
    <div className="bg-mist pb-28 md:pb-16">
      <div className="container-page max-w-4xl pt-5 sm:pt-8 lg:grid lg:max-w-[78rem] lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        {/* Left on desktop: who you are + your share link (stays in view). */}
        <aside className="space-y-3 lg:sticky lg:top-24">
          <section className="relative isolate overflow-hidden rounded-3xl bg-linear-to-br from-brand-700 via-brand-800 to-brand-950 p-5 text-white shadow-card">
            <div className="bg-contours absolute inset-0 -z-10 opacity-70" aria-hidden />
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-lg font-bold ring-1 ring-white/20">{seller.name.charAt(0).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-xl leading-tight font-bold">Namaste, {firstName}</h1>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-white/75">
                  <span className="inline-flex items-center gap-1"><BadgeCheck className="size-3.5 text-brand-200" aria-hidden /> Phone verified</span>
                  {seller.identityStatus === "VERIFIED" && <span className="inline-flex items-center gap-1"><Fingerprint className="size-3.5 text-brand-200" aria-hidden /> Aadhaar verified</span>}
                </p>
              </div>
              <form action={sellerSignOut}>
                <button aria-label="Sign out" title="Sign out" className="flex size-9 shrink-0 items-center justify-center rounded-full text-white/80 ring-1 ring-white/20 transition hover:bg-white/10">
                  <LogOut className="size-4" aria-hidden />
                </button>
              </form>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/10">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-widest text-white/60 uppercase">Seller ID</p>
                <p className="mt-0.5 truncate font-mono text-xl font-bold tracking-wider">{seller.code}</p>
              </div>
              <CopySellerId code={seller.code} />
            </div>
            <Link
              href={isWhatsAppConnected() ? waLink(site.whatsappNumber, "STATUS") : "/sell/chat"}
              {...(isWhatsAppConnected() ? { target: "_blank", rel: "noopener" } : {})}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-white/85 hover:text-white"
            >
              <WhatsAppIcon className="size-4" /> Open my WhatsApp chat <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </section>

          <dl className="grid grid-cols-3 divide-x divide-line rounded-2xl bg-white shadow-soft ring-1 ring-line">
            <Stat label="Live" value={live} />
            <Stat label="Views" value={views} />
            <Stat label="Enquiries" value={enquiryCount} />
          </dl>

          {needsAnswer > 0 && (
            <p className="flex gap-2.5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-100">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <strong>Still available?</strong> Please confirm {needsAnswer === 1 ? "your property" : `${needsAnswer} properties`} below, so buyers keep seeing {needsAnswer === 1 ? "it" : "them"}.
              </span>
            </p>
          )}
          {showVerify && (
            <Link href="/seller/verify" className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-line transition hover:ring-brand-300">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Fingerprint className="size-5" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">Verify with Aadhaar — 2 minutes</span>
                <span className="block text-sm text-muted">Buyers trust listings with ✓ Aadhaar verified.</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-brand-700" aria-hidden />
            </Link>
          )}
          <div className="@container">
            <ShareProfile url={profileUrl} name={seller.name} />
          </div>
        </aside>

        <div className="min-w-0">
          {/* Properties */}
          <section className="mt-8 lg:mt-0">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold tracking-tight sm:text-xl">My properties</h2>
              <div className="flex gap-2">
                <ButtonA {...sellOnWhatsAppProps()} variant="secondary" size="sm" className="hidden sm:inline-flex">
                  <WhatsAppIcon className="text-brand-600" /> Add via WhatsApp
                </ButtonA>
                <ButtonLink href="/seller/plots/new" size="sm">
                  <Plus /> Add property
                </ButtonLink>
              </div>
            </div>

            {plots.length > 0 && tabs.length > 2 && (
              <nav aria-label="Filter properties" className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                {tabs.map((t) => (
                  <Link
                    key={t.key}
                    href={t.key === "all" ? "/seller/dashboard" : `/seller/dashboard?show=${t.key}`}
                    aria-current={t.key === tab.key ? "page" : undefined}
                    scroll={false}
                    className={cn(
                      "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ring-1 transition",
                      t.key === tab.key ? "bg-ink text-white ring-ink" : "bg-white text-ink-soft ring-line hover:ring-line-strong",
                    )}
                  >
                    {t.label}
                    <span className={cn("tabular text-xs", t.key === tab.key ? "text-white/70" : "text-faint")}>{t.count}</span>
                  </Link>
                ))}
              </nav>
            )}

            {plots.length === 0 ? (
              <div className="mt-4 rounded-3xl border border-dashed border-line-strong bg-white p-10 text-center">
                <Sprout className="mx-auto size-8 text-brand-600" aria-hidden />
                <p className="mt-3 font-semibold">No properties yet</p>
                <p className="mt-1 text-sm text-muted">Add your first property — it takes a few minutes.</p>
                <ButtonLink href="/seller/plots/new" className="mt-5">
                  <Plus /> Add property
                </ButtonLink>
              </div>
            ) : (
              <ul className="mt-4 grid gap-3 xl:grid-cols-2">
                {shown.map((p) => {
                  const st = statusOf(p.status, p.hiddenReason);
                  const fresh = p.status === "ACTIVE" ? freshnessLabel(p) : null;
                  const awaiting = p.status === "ACTIVE" && Boolean(p.availabilityCheckSentAt);
                  return (
                    <li key={p.id} className="rounded-2xl bg-white p-3 shadow-soft ring-1 ring-line sm:p-4">
                      <div className="flex gap-3 sm:gap-4">
                        <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-mist sm:size-28">
                          {p.images[0] ? (
                            <Image src={p.images[0].url} alt="" fill sizes="112px" className="object-cover" />
                          ) : (
                            <span className="flex h-full items-center justify-center text-faint"><ImageOff className="size-5" aria-hidden /></span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge tone={st.tone} size="sm">{st.label}</Badge>
                            <span className="truncate font-mono text-[11px] text-faint">{p.code}</span>
                          </div>
                          <p className="tabular mt-1.5 text-[17px] leading-tight font-bold text-ink">{formatPrice(p.price)}</p>
                          <p className="mt-0.5 truncate text-sm font-medium text-ink-soft">
                            {formatArea(p.area, p.areaUnit)} · {LAND_TYPES[p.landType].label}
                          </p>
                          <p className="truncate text-[13px] text-muted">{placeName(p)}, {p.city.name}</p>
                          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                            <span className="inline-flex items-center gap-1"><Eye className="size-3.5" aria-hidden /> {p.viewCount}</span>
                            <span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5" aria-hidden /> {p._count.enquiries}</span>
                            {fresh && <span className={fresh.fresh ? "font-medium text-brand-700" : undefined}>{fresh.short}</span>}
                          </p>
                        </div>
                      </div>

                      {p.status === "PENDING" && <Note tone="blue">We&apos;re checking it. You&apos;ll get a WhatsApp message when it&apos;s live.</Note>}
                      {p.status === "REJECTED" && <Note tone="red">{p.rejectionReason ? `Not approved: ${p.rejectionReason}. ` : "Not approved. "}Edit and send it again, or message us on WhatsApp.</Note>}
                      {p.status === "HIDDEN" && p.hiddenReason === "AVAILABILITY_UNCONFIRMED" && <Note tone="amber">Hidden because we didn&apos;t hear back. Still available? Make it live again.</Note>}
                      {p.status === "HIDDEN" && p.hiddenReason === "BY_SELLER" && <Note tone="neutral">Hidden by you. Buyers can&apos;t see it until you make it live again.</Note>}
                      {awaiting && <Note tone="amber">Is it still available? Let buyers know with one tap.</Note>}

                      <div className="mt-3 border-t border-line pt-3">
                        <PlotActions id={p.id} slug={p.slug} title={p.title} status={p.status} hiddenReason={p.hiddenReason} awaitingReply={awaiting} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Enquiries */}
          <section className="mt-10">
            <h2 className="mb-1 text-lg font-bold tracking-tight sm:text-xl">Who contacted me</h2>
            <p className="mb-4 text-sm text-muted">Buyers who tapped WhatsApp or Call on your listings.</p>
            {enquiries.length === 0 ? (
              <p className="rounded-2xl bg-white p-5 text-sm text-muted ring-1 ring-line">No enquiries yet. Share your page in WhatsApp groups to reach more buyers.</p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-line">
                {enquiries.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 p-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 font-bold text-brand-800 ring-1 ring-brand-100">{e.buyerName.charAt(0)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{e.buyerName}</p>
                      <p className="truncate text-sm text-ink-soft">+91 {formatPhone(e.buyerPhone)}</p>
                      <p className="truncate text-xs text-muted">{e.property.title} · {when(e.createdAt)}</p>
                    </div>
                    <a
                      href={waLink(e.buyerPhone, `Namaste ${e.buyerName.split(" ")[0]} ji, this is ${seller.name} about ${e.property.title} (${e.property.code}).`)}
                      target="_blank"
                      rel="noopener"
                      aria-label={`WhatsApp ${e.buyerName}`}
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-brand"
                    >
                      <WhatsAppIcon className="size-[18px]" />
                    </a>
                    <a href={`tel:${e.buyerPhone}`} aria-label={`Call ${e.buyerName}`} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-line-strong">
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2 py-3 text-center">
      <dd className="tabular text-lg leading-tight font-bold text-ink">{new Intl.NumberFormat("en-IN").format(value)}</dd>
      <dt className="mt-0.5 text-xs text-muted">{label}</dt>
    </div>
  );
}

function Note({ tone, children }: { tone: "blue" | "red" | "amber" | "neutral"; children: React.ReactNode }) {
  const tones = {
    blue: "bg-sky-50 text-sky-900",
    red: "bg-red-50 text-red-800",
    amber: "bg-amber-50 text-amber-900",
    neutral: "bg-mist text-ink-soft",
  };
  return <p className={cn("mt-3 rounded-xl px-3 py-2 text-[13px] leading-relaxed", tones[tone])}>{children}</p>;
}
