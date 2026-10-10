import type { Metadata } from "next";
import Link from "next/link";
import { LegalContact, LegalPage, type LegalSection } from "@/components/site/legal";
import { site } from "@/lib/site";
import { FOUNDING_SPOTS } from "@/server/founding";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The rules for buying and selling land on ${site.name}: what we do, what we don't, and what we expect from sellers and buyers.`,
  alternates: { canonical: "/terms" },
};

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "These terms",
    body: (
      <p>
        These terms apply when you use {site.name}, on our website or our WhatsApp number. By using it, you agree to them and to our{" "}
        <Link href="/privacy-policy">Privacy Policy</Link>. If you don&apos;t agree, please don&apos;t use {site.name}. {site.name} is run by{" "}
        {site.legal.operator}.
      </p>
    ),
  },
  {
    id: "what-we-are",
    title: "What InstaPlots is, and isn't",
    body: (
      <>
        <p>
          {site.name} is a listing platform. Sellers list land; buyers find it and contact the seller directly. <strong>We are not a party to any deal.</strong>{" "}
          We don&apos;t own, sell, broker or guarantee any land, we don&apos;t hold money, and we don&apos;t take part in price talks, payments, papers or
          registration.
        </p>
        <p>
          <strong>We check sellers&apos; phone numbers, and their identity with Aadhaar where a listing shows that badge. We do not check land ownership,
          titles, papers, approvals or boundaries.</strong> Before you pay anything, check the papers yourself (for example khatauni, registry, mutation and any
          approvals), visit the land, and take legal advice if you need it.
        </p>
      </>
    ),
  },
  {
    id: "who-can-use",
    title: "Who can use it",
    body: <p>You must be 18 or older and able to make a legal agreement in India. You are responsible for keeping your phone and your Seller ID secure.</p>,
  },
  {
    id: "sellers",
    title: "If you list land",
    body: (
      <>
        <p>When you list, you promise that:</p>
        <ul>
          <li>you own the land, or have the owner&apos;s permission to sell it, and you will say which when you list;</li>
          <li>the details are true: price, size, location and land type, and the photos are real photos of this land;</li>
          <li>you will update or remove the listing when it is sold or no longer available, and answer our availability checks;</li>
          <li>the land and the listing follow the law, including RERA and local rules where they apply;</li>
          <li>you agree that buyers may contact you on the number you give us.</li>
        </ul>
        <p>
          We review listings before they go live and may ask for changes, refuse, hide or remove any listing, at any time, for example if it looks false,
          duplicated, already sold, or breaks these terms.
        </p>
        <p>
          You keep ownership of your photos and text. By listing, you allow us to show, resize and share them on {site.name} and when promoting {site.name}, for
          as long as the listing is up.
        </p>
      </>
    ),
  },
  {
    id: "founding-sellers",
    title: "Founding Sellers",
    body: (
      <ul>
        <li>The first {FOUNDING_SPOTS} sellers to get a listing approved become Founding Sellers. Signing up alone does not take a spot.</li>
        <li>Founding Sellers get a Founding Seller badge, and their live listings are shown first when buyers sort by &ldquo;Recommended&rdquo;.</li>
        <li>The spot belongs to the seller account and can&apos;t be moved or sold.</li>
        <li>We may remove the badge and placement from anyone who breaks these terms, for example with false or duplicate listings.</li>
      </ul>
    ),
  },
  {
    id: "buyers",
    title: "If you are looking for land",
    body: (
      <ul>
        <li>Using {site.name} is free for buyers. You don&apos;t need an account.</li>
        <li>When you contact a seller, we share your name and number with them so they can reply.</li>
        <li>
          When you ask us to tell you about land, we message you on WhatsApp when something matching may be listed. This is a free help, not a promise that such
          land will be found.
        </li>
        <li>Deal only with the seller, and never pay anyone before checking the land and its papers.</li>
      </ul>
    ),
  },
  {
    id: "not-allowed",
    title: "What's not allowed",
    body: (
      <ul>
        <li>False, misleading or duplicate listings, or land you have no right to sell.</li>
        <li>Asking buyers for money before they have seen the land and its papers, or any kind of fraud.</li>
        <li>Pretending to be someone else, or using someone else&apos;s number.</li>
        <li>Spam, harassment, or sending unwanted messages to people you found on {site.name}.</li>
        <li>Copying listings or data in bulk, or trying to break into, overload or work around the limits of the service.</li>
      </ul>
    ),
  },
  {
    id: "fees",
    title: "Fees",
    body: <p>Listing and contacting sellers are free. If we ever add paid options, we will show the price clearly before you choose them, and nothing free today will start charging without notice.</p>,
  },
  {
    id: "whatsapp",
    title: "WhatsApp messages",
    body: (
      <p>
        By listing, signing in or sending a request, you agree that we may message you on WhatsApp about it: login codes, updates on your listing or request,
        and availability checks. We don&apos;t send unrelated promotions without asking. Tell us any time to stop.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Our responsibility",
    body: (
      <>
        <p>
          We work to keep {site.name} accurate and running, but we provide it &ldquo;as is&rdquo;. Listings come from sellers, and we can&apos;t promise that
          every detail is correct, that land will sell, or that the service will never be down.
        </p>
        <p>
          As far as the law allows, we are not responsible for losses from deals between buyers and sellers, from relying on a listing, or from things outside our
          control. Nothing in these terms limits rights you have that the law does not let us remove.
        </p>
        <p>If you break these terms and that causes a claim against us, you agree to cover our reasonable costs.</p>
      </>
    ),
  },
  {
    id: "ending",
    title: "Suspending or closing accounts",
    body: (
      <p>
        We may hide listings or block an account that breaks these terms or puts others at risk. You can stop using {site.name} at any time, remove your
        listings, and ask us to <Link href="/data-deletion">delete your data</Link>.
      </p>
    ),
  },
  {
    id: "law",
    title: "Law and disputes",
    body: (
      <p>
        These terms are governed by the laws of India. Please contact us first so we can try to fix any problem. If we can&apos;t, the courts in India will
        decide.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes",
    body: <p>We may update these terms. The date at the top shows the latest version. If a change is important, we will tell sellers on WhatsApp before it applies.</p>,
  },
  {
    id: "contact",
    title: "Contact and grievances",
    body: (
      <>
        <p>Questions, complaints or a listing you think is wrong? Contact us:</p>
        <LegalContact />
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      current="/terms"
      title="Terms of Service"
      intro={
        <p>
          {site.name} helps buyers and sellers of land find each other. Here is what we do, what we don&apos;t, and what we ask of everyone, in plain words.
        </p>
      }
      sections={sections}
    />
  );
}
