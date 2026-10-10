import Link from "next/link";
import { WhatsAppIcon } from "@/components/ui/icons";
import { site } from "@/lib/site";
import { supportWhatsAppLink } from "@/lib/whatsapp-links";

export type LegalSection = { id: string; title: string; body: React.ReactNode };

const LEGAL_PAGES = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/data-deletion", label: "Data deletion" },
] as const;

/** Shared layout for the legal pages: title, date, contents, then numbered sections. */
export function LegalPage({ title, intro, sections, current }: { title: string; intro: React.ReactNode; sections: LegalSection[]; current: string }) {
  return (
    <article className="container-page py-10 sm:py-14">
      <nav aria-label="Legal pages" className="flex flex-wrap gap-2 text-sm">
        {LEGAL_PAGES.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            aria-current={p.href === current ? "page" : undefined}
            className={
              p.href === current
                ? "rounded-full bg-brand-600 px-3.5 py-1.5 font-semibold text-white"
                : "rounded-full px-3.5 py-1.5 font-semibold text-ink-soft ring-1 ring-line hover:bg-mist"
            }
          >
            {p.label}
          </Link>
        ))}
      </nav>

      <header className="mt-8 max-w-3xl">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {site.legal.updated}</p>
        <div className="mt-5 text-[17px] leading-relaxed text-ink-soft">{intro}</div>
      </header>

      <div className="mt-10 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
        <nav aria-label="On this page" className="mb-10 rounded-2xl bg-mist p-5 ring-1 ring-line lg:sticky lg:top-24 lg:mb-0 lg:self-start lg:bg-transparent lg:p-0 lg:ring-0">
          <p className="text-xs font-bold tracking-widest text-muted uppercase">On this page</p>
          <ol className="mt-3 space-y-2 text-sm">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-ink-soft hover:text-brand-700">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="max-w-3xl space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="text-xl font-bold text-ink">
                {i + 1}. {s.title}
              </h2>
              <div className="legal-prose mt-3">{s.body}</div>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}

/** How to reach us: always WhatsApp, plus email, address and grievance officer once they're set. */
export function LegalContact() {
  const { operator, email, address, grievanceOfficer } = site.legal;
  return (
    <div className="not-prose mt-4 rounded-2xl bg-mist p-5 ring-1 ring-line">
      <p className="font-semibold text-ink">{operator}</p>
      <dl className="mt-3 grid gap-2 text-[15px] text-ink-soft sm:grid-cols-[9rem_1fr]">
        {email && (
          <>
            <dt className="font-medium text-muted">Email</dt>
            <dd>
              <a href={`mailto:${email}`} className="font-semibold text-brand-700 hover:underline">
                {email}
              </a>
            </dd>
          </>
        )}
        <dt className="font-medium text-muted">WhatsApp</dt>
        <dd>
          <a href={supportWhatsAppLink()} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline">
            <WhatsAppIcon className="size-4" /> +{site.whatsappNumber}
          </a>
        </dd>
        {address && (
          <>
            <dt className="font-medium text-muted">Address</dt>
            <dd>{address}</dd>
          </>
        )}
        {grievanceOfficer && (
          <>
            <dt className="font-medium text-muted">Grievance Officer</dt>
            <dd>
              {grievanceOfficer}
              {email && <>, reachable at the email above</>}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}
