import { ArrowRight, BadgeCheck, Camera, Check, ClipboardList, Fingerprint, IdCard, Languages, Laptop, MessageCircle, PhoneCall, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PhoneChat } from "@/components/site/phone-chat";
import { SectionHeading } from "@/components/site/sections";
import { ButtonA, ButtonLink } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";
import { sellOnWhatsAppProps } from "@/lib/whatsapp-links";

export const metadata: Metadata = {
  title: "Sell your land — list free in a few minutes",
  description: `List farmland, house plots or commercial land on ${site.name} in a few simple steps — on WhatsApp in Hindi or English, or right here. We check every listing, then buyers call you directly.`,
};

const WHATSAPP_STEPS = [
  { title: "Say namaste", text: "Message us on WhatsApp and choose Hindi or English." },
  { title: "Tell us about your land", text: "Write it the way you'd say it — “2 bigha khet, Sathiyaon, 18 lakh” — and send a few photos." },
  { title: "We check, buyers call you", text: "Our team checks your listing and tells you in the chat when it's live. Buyers then call or WhatsApp you directly." },
];

const WEB_STEPS = [
  { icon: Smartphone, title: "Your details", text: "Your name and mobile number, confirmed with a code. Only the first time." },
  { icon: Fingerprint, title: "Aadhaar check", text: "A one-time identity check, so buyers see ✓ Aadhaar verified. We never store your Aadhaar number." },
  { icon: ClipboardList, title: "Land details", text: "Land type, size, price and where it is — drop a pin on the map." },
  { icon: Camera, title: "Photos & submit", text: "Add a few clear photos. Our team checks it, then it goes live." },
];

export default function SellPage() {
  // Same page for everyone, so it is served from the CDN: /sell/start sends a signed-in seller
  // straight to "add a property".
  const web = { href: "/sell/start", label: "Start selling" };

  return (
    <>
      {/* ── Hero */}
      <section className="relative isolate overflow-hidden bg-brand-950">
        <Image src="/demo/land-097.webp" alt="" fill preload fetchPriority="high" quality={50} sizes="100vw" className="-z-10 object-cover opacity-45" />
        <div className="absolute inset-0 -z-10 bg-linear-to-b from-brand-950/80 to-brand-950/90" />
        <div className="container-page py-12 sm:py-16 lg:py-24">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/20">
            <BadgeCheck className="size-3.5 text-brand-200" aria-hidden /> For sellers · Free while we launch
          </p>
          <h1 className="mt-4 max-w-3xl text-[2rem] leading-[1.1] font-extrabold tracking-tight text-white sm:text-5xl lg:text-[3.25rem]">Your land. Your price. The right buyer.</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/80 sm:mt-4 sm:text-lg">
            List in a few simple steps — on WhatsApp in Hindi or English, or right here. We check every listing, then buyers looking for land in your area call you directly.
          </p>

          <div className="mt-7 grid gap-2.5 sm:flex sm:flex-wrap sm:gap-3">
            <ButtonLink href={web.href} variant="white" size="lg" className="w-full sm:w-auto">
              {web.label} <ArrowRight />
            </ButtonLink>
            <ButtonA {...sellOnWhatsAppProps()} size="lg" className="w-full bg-white/10 shadow-none ring-1 ring-white/25 hover:bg-white/15 sm:w-auto">
              <WhatsAppIcon /> List on WhatsApp
            </ButtonA>
          </div>
          <ul className="mt-6 grid max-w-md grid-cols-3 divide-x divide-white/15 rounded-2xl bg-white/[0.06] py-3 text-center ring-1 ring-white/10">
            {[
              { icon: BadgeCheck, label: "Free listing" },
              { icon: Languages, label: "Hindi / English" },
              { icon: PhoneCall, label: "Direct calls" },
            ].map((t) => (
              <li key={t.label} className="flex flex-col items-center gap-1 px-1 text-xs font-medium text-white/85">
                <t.icon className="size-4 text-brand-300" aria-hidden /> {t.label}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-white/70">
            Already a seller?{" "}
            <Link href="/seller/login?next=/seller/properties/new" className="font-semibold text-white underline underline-offset-4">
              Sign in with your Seller ID
            </Link>
          </p>
        </div>
      </section>

      {/* ── Two ways */}
      <section className="container-page py-12 sm:py-20">
        <SectionHeading eyebrow="Two easy ways" title="List the way that suits you" description="Same listing, same free checks. Pick whatever is easier for you." />
        <div className="grid gap-4 md:grid-cols-2 md:gap-5">
          <WayCard
            highlight
            icon={<WhatsAppIcon className="size-[22px]" />}
            tag="Easiest on a phone"
            title="On WhatsApp"
            text="Chat with our assistant in Hindi or English, and send photos straight from your phone."
            points={["No app, no password", "One simple question at a time", "Updates come right in the chat"]}
            action={
              <ButtonA {...sellOnWhatsAppProps()} size="md" className="w-full sm:w-auto">
                <WhatsAppIcon /> Start on WhatsApp
              </ButtonA>
            }
          />
          <WayCard
            icon={<Laptop className="size-[22px]" />}
            tag="Everything on one page"
            title="On the website"
            text="Fill one short form, drop a pin on the map and upload your photos."
            points={["See all your details at once", "Pin the spot — buyers only see the area", "Manage all your land from one dashboard"]}
            action={
              <ButtonLink href={web.href} variant="secondary" size="md" className="w-full sm:w-auto">
                {web.label} <ArrowRight />
              </ButtonLink>
            }
          />
        </div>
      </section>

      {/* ── WhatsApp story */}
      <section className="overflow-hidden bg-mist py-12 sm:py-20">
        <div className="container-page grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-20">
          <div className="max-w-xl">
            <SectionHeading
              eyebrow="On WhatsApp"
              title="Like talking to someone who knows land"
              description="Our assistant understands how you speak — Hindi, English or a mix. Write it your way; it only asks for what's missing."
            />
            <ol className="relative space-y-6">
              <span className="absolute top-2 bottom-2 left-[15px] w-px bg-line-strong" aria-hidden />
              {WHATSAPP_STEPS.map((s, i) => (
                <li key={s.title} className="relative flex gap-4">
                  <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white ring-4 ring-mist">{i + 1}</span>
                  <div className="pt-0.5">
                    <h3 className="font-bold text-ink">{s.title}</h3>
                    <p className="mt-1 text-[15px] leading-relaxed text-muted">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <ButtonA {...sellOnWhatsAppProps()} size="lg" className="mt-8 w-full sm:w-auto">
              <WhatsAppIcon /> Start on WhatsApp
            </ButtonA>
          </div>
          <PhoneChat />
        </div>
      </section>

      {/* ── Website steps */}
      <section className="container-page py-12 sm:py-20">
        <SectionHeading title="On the website, in 4 short steps" description="The first time takes about 5 minutes. After that, adding more land takes about 2." />
        <ol className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {WEB_STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl bg-white p-5 ring-1 ring-line">
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <s.icon className="size-5" aria-hidden />
                </span>
                <span className="text-xs font-bold tracking-widest text-faint">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-bold text-ink">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Seller ID */}
      <section className="bg-mist py-12 sm:py-20">
        <div className="container-page grid items-center gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading title="One Seller ID for all your land" description="Register once, then list as much land as you have — each with its own page. No repeat registration, no repeat checks." />
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
                <p className="text-xs text-white/60">Seller · Mohali</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
                <BadgeCheck className="size-3.5" aria-hidden /> Aadhaar verified
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why sellers like it */}
      <section className="container-page py-12 sm:py-20">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: MessageCircle, title: "Buyers contact you directly", text: "On WhatsApp or by call. You decide who to talk to, and when." },
            { icon: BadgeCheck, title: "Always up to date", text: "We check in with you on WhatsApp. One tap keeps your land live, or marks it sold." },
            { icon: Fingerprint, title: "Your data stays private", text: "Buyers see your name and number only. Never your Aadhaar." },
          ].map((it) => (
            <div key={it.title} className="rounded-2xl bg-mist p-6 ring-1 ring-line">
              <it.icon className="size-6 text-brand-600" aria-hidden />
              <h3 className="mt-3 font-bold">{it.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{it.text}</p>
            </div>
          ))}
        </div>

        <div className="relative isolate mt-12 overflow-hidden rounded-[2rem] bg-linear-to-br from-brand-800 to-brand-600 px-6 py-10 text-center text-white sm:px-10 sm:py-14">
          <div className="bg-contours absolute inset-0 -z-10" aria-hidden />
          <h2 className="text-[1.6rem] leading-tight font-extrabold sm:text-3xl">Ready when you are.</h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] text-white/80">About 5 minutes the first time. Free to list while we launch.</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href={web.href} variant="white" size="xl">
              {web.label} <ArrowRight />
            </ButtonLink>
            <ButtonA {...sellOnWhatsAppProps()} size="xl" className="bg-white/10 shadow-none ring-1 ring-white/25 hover:bg-white/15">
              <WhatsAppIcon /> List on WhatsApp
            </ButtonA>
          </div>
        </div>
      </section>
    </>
  );
}

function WayCard({
  icon,
  tag,
  title,
  text,
  points,
  action,
  highlight = false,
}: {
  icon: React.ReactNode;
  tag: string;
  title: string;
  text: string;
  points: string[];
  action: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={cn("flex flex-col rounded-3xl bg-white p-5 sm:p-7", highlight ? "shadow-card ring-2 ring-brand-500" : "ring-1 ring-line")}>
      <div className="flex items-center justify-between gap-3">
        <span className={cn("flex size-11 items-center justify-center rounded-2xl", highlight ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700")}>{icon}</span>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", highlight ? "bg-brand-50 text-brand-800" : "bg-mist text-ink-soft")}>{tag}</span>
      </div>
      <h3 className="mt-4 text-lg font-bold text-ink">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
      <ul className="mt-4 mb-5 space-y-2 text-sm text-ink-soft">
        {points.map((p) => (
          <li key={p} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> {p}
          </li>
        ))}
      </ul>
      <div className="mt-auto">{action}</div>
    </div>
  );
}
