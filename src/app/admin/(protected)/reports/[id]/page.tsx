import { ArrowLeft, ExternalLink, Flag, History, ShieldAlert, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlockedBadge, IdentityBadge, PhoneVerifiedBadge, SellerTypeBadge, StatusBadge } from "@/components/admin/badges";
import { formatDate, formatDateTime } from "@/components/admin/format";
import { ListingThumb } from "@/components/admin/listing-thumb";
import { PageHeader } from "@/components/admin/page-header";
import { ReportReasonBadge, ReportStatusBadge, ReportTargetBadge } from "@/components/admin/report-badges";
import { ReportModeration } from "@/components/admin/report-moderation";
import { requireAdmin } from "@/lib/admin/require";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { LAND_TYPES, placeName } from "@/lib/land";
import { OUTCOME_LABELS, REASON_LABELS, STATUS_LABELS } from "@/lib/reports";
import { sellerProfilePath } from "@/lib/seller-profile";
import { formatArea } from "@/lib/units";
import { getReportDetail } from "@/server/admin/reports";

export const metadata: Metadata = { title: "Report" };

const ACTION_LABELS: Record<string, string> = {
  "report.UNDER_REVIEW": "Report under review",
  "report.RESOLVED": "Report resolved",
  "report.DISMISSED": "Report dismissed",
  "report.note": "Note",
  "listing.MARK_SOLD": "Plot marked sold",
  "listing.HIDE": "Plot hidden",
  "listing.UNHIDE": "Plot restored",
  "listing.APPROVE": "Plot approved / relisted",
  "listing.REJECT": "Plot rejected",
  "listing.CONFIRM_AVAILABLE": "Plot confirmed available",
  "listing.AVAILABILITY_CHECK": "Availability check sent",
  "listing.EDIT": "Plot edited by admin",
  "seller.block": "Seller suspended",
  "seller.unblock": "Seller suspension lifted",
};

function Card({ title, icon: Icon, tone, children, className }: { title: string; icon?: typeof Flag; tone?: "reporter" | "target"; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5", tone === "target" && "ring-amber-200", className)}>
      <h2 className={cn("mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase", tone === "target" ? "text-amber-800" : "text-muted")}>
        {Icon && <Icon className="size-4" aria-hidden />} {title}
      </h2>
      {children}
    </section>
  );
}

export default async function AdminReportPage({ params }: PageProps<"/admin/reports/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const detail = await getReportDetail(id);
  if (!detail) notFound();
  const { report: r, sellerListings, related, sameSource, history } = detail;
  const p = r.property;
  const relatedOpen = related.filter(
    (x) => (x.status === "PENDING" || x.status === "UNDER_REVIEW") && (r.target === "LISTING" ? x.propertyId === r.propertyId : x.target === "PROFILE"),
  ).length;
  const actions = (
    <Card title="Actions">
      <ReportModeration
        report={{ id: r.id, status: r.status, target: r.target }}
        listing={p ? { id: p.id, status: p.status, hiddenReason: p.hiddenReason } : null}
        seller={{ id: r.seller.id, isBlocked: r.seller.isBlocked }}
        relatedOpen={relatedOpen}
      />
    </Card>
  );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={
          <Link href="/admin/reports" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden /> Reports
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            Report <span className="tabular text-muted">{r.code}</span>
          </span>
        }
        description={`${r.target === "LISTING" ? "About a plot" : "About a seller profile"} · received ${formatDateTime(r.createdAt)}`}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* The report itself */}
          <Card title="What was reported" icon={Flag}>
            <div className="flex flex-wrap items-center gap-1.5">
              <ReportStatusBadge status={r.status} size="md" />
              <ReportReasonBadge reason={r.reason} size="md" />
              <ReportTargetBadge target={r.target} size="md" />
            </div>
            {r.reason === "FRAUD" && (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-800 ring-1 ring-red-100">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> Possible fraud — review first. A report is an accusation, not proof: check before acting.
              </p>
            )}
            {r.reason === "PROPERTY_SOLD" && p && (
              <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2.5 text-sm text-sky-900 ring-1 ring-sky-100">
                Don&apos;t mark it sold from this report alone — ask the seller first (&ldquo;Ask seller: still available?&rdquo;) or call them.
              </p>
            )}
            <p className="mt-3 text-sm whitespace-pre-wrap text-ink">{r.description ? `“${r.description}”` : <span className="text-muted">No description given.</span>}</p>
            {(r.status === "RESOLVED" || r.status === "DISMISSED") && (
              <p className="mt-3 rounded-xl bg-mist px-3 py-2.5 text-sm text-ink-soft ring-1 ring-line">
                <span className="font-semibold">{STATUS_LABELS[r.status]}</span>
                {r.outcome ? ` — ${OUTCOME_LABELS[r.outcome]}` : ""}
                {r.reviewedAt ? ` · ${formatDateTime(r.reviewedAt)}` : ""}
                {r.resolutionNote ? <span className="mt-1 block whitespace-pre-wrap">{r.resolutionNote}</span> : null}
              </p>
            )}
            <p className="mt-3 text-xs text-muted">
              {r.assignedAdmin ? `Handled by ${r.assignedAdmin.name}` : "Not picked up yet"} · Last update {formatDateTime(r.updatedAt)}
            </p>
          </Card>

          {/* Phones: act right after reading the report, not after scrolling the whole history. */}
          <div className="lg:hidden">{actions}</div>

          {/* The reported listing */}
          {p && (
            <Card title="Reported plot" icon={Flag} tone="target">
              <div className="flex flex-col gap-3 sm:flex-row">
                <ListingThumb url={p.images[0]?.url} alt={p.title} sizes="12rem" count={p.images.length} className="aspect-[4/3] w-full shrink-0 rounded-xl sm:w-48" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={p.status} hiddenReason={p.hiddenReason} />
                    <span className="tabular text-xs text-muted">{p.code}</span>
                  </div>
                  <p className="mt-1.5 font-semibold text-ink">{p.title}</p>
                  <p className="tabular mt-0.5 text-sm text-ink-soft">
                    {formatPrice(p.price)} · {formatArea(p.area, p.areaUnit)} · {LAND_TYPES[p.landType].label}
                  </p>
                  <p className="text-sm text-muted">
                    {placeName(p)}, {p.city.name}
                    {p.latitude != null && p.longitude != null && (
                      <>
                        {" · "}
                        <a href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`} target="_blank" rel="noreferrer" className="font-medium text-brand-700 hover:underline">
                          map pin
                        </a>
                      </>
                    )}
                  </p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted">
                    <dt>Created</dt>
                    <dd>{formatDate(p.createdAt)}</dd>
                    <dt>Last edited</dt>
                    <dd>{formatDate(p.updatedAt)}</dd>
                    <dt>First live</dt>
                    <dd>{p.publishedAt ? formatDate(p.publishedAt) : "—"}</dd>
                    <dt>Last confirmed</dt>
                    <dd>{p.freshnessAt ? formatDate(p.freshnessAt) : "—"}</dd>
                    {p.soldAt && (
                      <>
                        <dt>Sold</dt>
                        <dd>{formatDate(p.soldAt)}</dd>
                      </>
                    )}
                    {p.availabilityCheckSentAt && (
                      <>
                        <dt>Check sent</dt>
                        <dd>{formatDateTime(p.availabilityCheckSentAt)} (waiting)</dd>
                      </>
                    )}
                  </dl>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
                    <Link href={`/admin/listings/${p.id}`} className="text-brand-700 hover:text-brand-800">
                      Open in admin →
                    </Link>
                    <a href={`/property/${p.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted hover:text-ink">
                      Public page <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                    <Link href={`/admin/reports?listing=${p.id}`} className="text-muted hover:text-ink">
                      All reports on this plot
                    </Link>
                  </div>
                </div>
              </div>
              {p.images.length > 1 && (
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {p.images.slice(1).map((img) => (
                    <ListingThumb key={img.url} url={img.url} alt="" sizes="6rem" className="aspect-square rounded-lg" />
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* The reported seller */}
          <Card title={r.target === "PROFILE" ? "Reported seller" : "Seller of this plot"} icon={UserRound} tone={r.target === "PROFILE" ? "target" : undefined}>
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="font-semibold text-ink">{r.seller.name}</p>
              <span className="tabular text-xs text-muted">{r.seller.code}</span>
              <SellerTypeBadge type={r.seller.sellerType} />
              <PhoneVerifiedBadge verified={Boolean(r.seller.phoneVerifiedAt)} />
              <IdentityBadge status={r.seller.identityStatus} />
              {r.seller.isBlocked && <BlockedBadge />}
            </div>
            <p className="mt-1 text-xs text-muted">
              Joined {formatDate(r.seller.createdAt)} · {r.seller._count.properties} plot{r.seller._count.properties === 1 ? "" : "s"} in total
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
              <Link href={`/admin/sellers/${r.seller.id}`} className="text-brand-700 hover:text-brand-800">
                Open seller in admin →
              </Link>
              {r.seller.profileSlug && !r.seller.isBlocked && (
                <a href={sellerProfilePath(r.seller.profileSlug)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted hover:text-ink">
                  Public profile <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
              <Link href={`/admin/reports?seller=${r.seller.id}`} className="text-muted hover:text-ink">
                All reports on this seller
              </Link>
            </div>
            {sellerListings.length > 0 && (
              <ul className="mt-3 divide-y divide-line rounded-xl ring-1 ring-line">
                {sellerListings.map((l) => (
                  <li key={l.id}>
                    <Link href={`/admin/listings/${l.id}`} className={cn("flex items-center gap-2 px-3 py-2 text-sm hover:bg-mist", l.id === p?.id && "bg-amber-50/60")}>
                      <StatusBadge status={l.status} />
                      <span className="min-w-0 flex-1 truncate text-ink">{l.title}</span>
                      {l._count.reports > 0 && <span className="shrink-0 text-xs font-semibold text-amber-800">{l._count.reports} report{l._count.reports === 1 ? "" : "s"}</span>}
                      <span className="tabular shrink-0 text-xs text-muted">{formatPrice(l.price)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Other reports */}
          <Card title={`Other reports on this ${r.target === "LISTING" ? "plot or seller" : "seller"} (${related.length})`} icon={Flag}>
            {related.length === 0 ? (
              <p className="text-sm text-muted">This is the first report.</p>
            ) : (
              <ul className="divide-y divide-line">
                {related.map((x) => (
                  <li key={x.id}>
                    <Link href={`/admin/reports/${x.id}`} className="flex flex-wrap items-center gap-1.5 py-2 text-sm hover:text-brand-800">
                      <ReportStatusBadge status={x.status} />
                      <span className="font-medium text-ink">{REASON_LABELS[x.reason]}</span>
                      <span className="min-w-0 flex-1 truncate text-muted">· {x.target === "LISTING" ? x.targetLabel : "profile"}</span>
                      {x.reporterKey === r.reporterKey && <span className="text-[11px] font-semibold text-amber-800">same reporter</span>}
                      <span className="text-xs text-faint">{formatDate(x.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* History */}
          <Card title="History" icon={History}>
            {history.length === 0 ? (
              <p className="text-sm text-muted">No admin actions yet.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {history.map((h) => (
                  <li key={h.id} className="text-sm">
                    <p className="text-ink">
                      <span className="font-semibold">{ACTION_LABELS[h.action] ?? h.action}</span>
                      {h.reportId && h.reportId !== r.id ? <span className="text-muted"> (another report)</span> : null}
                    </p>
                    {h.note && <p className="mt-0.5 whitespace-pre-wrap text-ink-soft">{h.note}</p>}
                    <p className="text-xs text-faint">
                      {h.actorLabel} · {formatDateTime(h.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        {/* Right column: reporter + actions */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          {/* Desktop: actions stay beside the details. */}
          <div className="hidden lg:block">{actions}</div>

          <Card title="Reported by" icon={UserRound} tone="reporter">
            {r.reporterSeller ? (
              <p className="text-sm text-ink">
                Signed-in seller{" "}
                <Link href={`/admin/sellers/${r.reporterSeller.id}`} className="font-semibold text-brand-700 hover:text-brand-800">
                  {r.reporterSeller.name} ({r.reporterSeller.code})
                </Link>
              </p>
            ) : (
              <p className="text-sm text-ink">A visitor who wasn&apos;t signed in.</p>
            )}
            <p className="mt-1.5 text-xs text-muted">
              {sameSource > 0 ? (
                <Link href={`/admin/reports?reporter=${encodeURIComponent(r.reporterKey)}`} className="font-semibold text-amber-800 hover:underline">
                  {sameSource} other report{sameSource === 1 ? "" : "s"} from the same reporter →
                </Link>
              ) : (
                "No other reports from this reporter."
              )}
            </p>
            <p className="mt-2 text-xs text-faint">Never shared with the seller. Visitors are identified only by an anonymous browser reference.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
