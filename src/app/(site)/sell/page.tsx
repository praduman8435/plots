import { ArrowRight, BadgeCheck, Camera, ClipboardList, Fingerprint, IdCard, MessageCircle, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SectionHeading } from "@/components/site/sections";
import { ButtonA, ButtonLink } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/ui/icons";
import { getSellerSession } from "@/lib/seller/session";
import { site } from "@/lib/site";
import { sellOnWhatsAppProps } from "@/lib/whatsapp-links";

export const metadata: Metadata = {
  title: "Sell your land — list free in a few minutes",
  description: `Owners and brokers: list residential plots, farmland or commercial land on ${site.name} in a few minutes. Buyers contact you directly on WhatsApp or call.`,
};

const steps = [
  { icon: Smartphone, title: "Your details", text: "Your name and mobile number, verified with a code. Only the first time." },
  { icon: Fingerprint, title: "Quick identity check", text: "A one-time Aadhaar check. We never store your Aadhaar number." },
  { icon: ClipboardList, title: "Property details", text: "Land type, size, price and where it is — drop a pin on the map." },
  { icon: Camera, title: "Photos & submit", text: "Add a few photos. We review it and it goes live, usually within hours." },
];

export default async function SellPage() {
  const seller = await getSellerSession();

  return (
    <>
      <section className="relative isolate overflow-hidden bg-brand-950">
        <Image src="/demo/land-097.webp" alt="" fill preload fetchPriority="high" quality={50} sizes="100vw" className="-z-10 object-cover opacity-45" />
        <div className="absolute inset-0 -z-10 bg-linear-to-b from-brand-950/80 to-brand-950/90" />
        <div className="container-page py-12 sm:py-16 lg:py-20">
          <h1 className="max-w-3xl text-[2.3rem] leading-[1.05] font-extrabold text-white sm:text-5xl lg:text-[3.25rem]">Sell your land in a few minutes.</h1>
          <p className="mt-4 max-w-xl text-base text-white/85 sm:text-lg">
            Just a few basic details and your listing is ready. Buyers contact you directly — no documents needed to list.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {seller?.onboardedAt ? (
              <ButtonLink href="/seller/plots/new" variant="white" size="xl" className="w-full sm:w-auto">
                Add another property <ArrowRight />
              </ButtonLink>
            ) : (
              <ButtonLink href="/sell/start" variant="white" size="xl" className="w-full sm:w-auto">
                Start selling <ArrowRight />
              </ButtonLink>
            )}
            <ButtonA {...sellOnWhatsAppProps()} size="xl" className="w-full bg-white/10 shadow-none ring-1 ring-white/25 hover:bg-white/15 sm:w-auto">
              <WhatsAppIcon /> List on WhatsApp instead
            </ButtonA>
          </div>
          {!seller && (
            <p className="mt-4 text-sm text-white/75">
              Already a seller?{" "}
              <Link href="/seller?next=/seller/plots/new" className="font-semibold text-white underline underline-offset-4">
                Add another property with your Seller ID
              </Link>
            </p>
          )}
        </div>
      </section>

      <section className="container-page py-12 sm:py-20">
        <SectionHeading title="How it works" description="The first time takes about 5 minutes. After that, adding another property takes 2." />
        <ol className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><s.icon className="size-5" aria-hidden /></span>
                <span className="text-xs font-bold tracking-widest text-faint">STEP {i + 1}</span>
              </div>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-mist py-12 sm:py-20">
        <div className="container-page grid items-center gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading title="One Seller ID for all your properties" description="Brokers: register once, then list as many properties as you like. No repeat registration, no repeat verification." />
            <ul className="space-y-3 text-[15px] text-ink-soft">
              {[
                "Sign in with your Seller ID or mobile number",
                "See who contacted you, with their number",
                "Confirm availability or mark sold — on WhatsApp or here",
                "Add another property in about 2 minutes",
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <BadgeCheck className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="mx-auto w-full max-w-sm rounded-[2rem] bg-linear-to-br from-brand-700 to-brand-900 p-7 text-white shadow-lift">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-widest text-white/60 uppercase">
              <IdCard className="size-4" aria-hidden /> {site.name} · Seller
            </p>
            <p className="mt-8 text-sm text-white/70">Seller ID</p>
            <p className="mt-1 font-mono text-3xl font-bold tracking-wider">SLR-7A41K2</p>
            <div className="mt-8 flex items-end justify-between">
              <div>
                <p className="text-sm font-semibold">Gurpreet Singh</p>
                <p className="text-xs text-white/60">Broker · Mohali</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
                <BadgeCheck className="size-3.5" aria-hidden /> Verified
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-12 sm:py-20">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: MessageCircle, title: "Buyers contact you directly", text: "On WhatsApp or by call. You stay in control of every conversation." },
            { icon: BadgeCheck, title: "Weekly “still available?”", text: "One tap YES keeps your listing live. NO marks it sold. That's it." },
            { icon: Fingerprint, title: "Your data stays private", text: "Buyers see your name and number only. Never your Aadhaar." },
          ].map((it) => (
            <div key={it.title} className="rounded-3xl bg-mist p-6 ring-1 ring-line">
              <it.icon className="size-6 text-brand-600" aria-hidden />
              <h3 className="mt-3 font-bold">{it.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{it.text}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
