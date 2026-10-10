import type { Metadata } from "next";
import Link from "next/link";
import { LegalContact, LegalPage, type LegalSection } from "@/components/site/legal";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Data deletion",
  description: `How to delete your listings, your account and your WhatsApp chats with ${site.name}.`,
  alternates: { canonical: "/data-deletion" },
};

const sections: LegalSection[] = [
  {
    id: "listing",
    title: "Remove a listing yourself",
    body: (
      <ol>
        <li>
          Sign in at <Link href="/seller/login">Seller login</Link> with your Seller ID or number.
        </li>
        <li>Open &ldquo;My plots&rdquo;, find the listing, tap More, then Remove listing.</li>
        <li>It disappears from {site.name} for everyone straight away.</li>
      </ol>
    ),
  },
  {
    id: "everything",
    title: "Delete your account and all your data",
    body: (
      <>
        <p>Send us a message from your registered number, saying &ldquo;Please delete my data&rdquo;, using any of these:</p>
        <ul>
          <li>WhatsApp, to the number below (works for sellers and buyers);</li>
          {site.legal.email && <li>email, from any address, including the mobile number your data is linked to.</li>}
        </ul>
        <p>Then:</p>
        <ol>
          <li>We confirm the request comes from you, for example with a code sent to that number, so nobody can delete someone else&apos;s data.</li>
          <li>We delete your data within 30 days, usually much sooner.</li>
          <li>We message you when it is done.</li>
        </ol>
      </>
    ),
  },
  {
    id: "what-is-deleted",
    title: "What we delete",
    body: (
      <ul>
        <li>
          <strong>Sellers:</strong> your account, Seller ID and profile page, all your listings and their photos, your identity check result, and your sign-in
          sessions.
        </li>
        <li>
          <strong>Buyers:</strong> your name and number on the contacts you made, and your land requests.
        </li>
        <li>
          <strong>Everyone:</strong> your chats with our WhatsApp number and in the chat on our site.
        </li>
      </ul>
    ),
  },
  {
    id: "what-we-keep",
    title: "What we may keep",
    body: (
      <>
        <p>We keep only what the law or safety requires, and only for as long as needed:</p>
        <ul>
          <li>records of reports and misuse, to prevent fraud;</li>
          <li>anything we must keep by law, or for a legal claim or investigation;</li>
          <li>usage numbers that no longer identify you.</li>
        </ul>
        <p>Sellers who already received your number when you contacted them keep it on their own phone; we can&apos;t delete it from their phone.</p>
      </>
    ),
  },
  {
    id: "meta",
    title: "WhatsApp and Facebook",
    body: (
      <p>
        {site.name} does not use Facebook Login and does not get data from your Facebook account. We use the WhatsApp Business Platform only to message people
        who contact us or use {site.name}. To delete what we hold from WhatsApp, follow the steps above. To manage what Meta itself holds, use the settings in
        your WhatsApp app.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <>
        <p>
          Send deletion requests and questions here. See our <Link href="/privacy-policy">Privacy Policy</Link> for your other rights.
        </p>
        <LegalContact />
      </>
    ),
  },
];

export default function DataDeletionPage() {
  return (
    <LegalPage
      current="/data-deletion"
      title="Data deletion"
      intro={<p>You can remove a listing yourself in a few taps, or ask us to delete everything we hold about you. Here is how.</p>}
      sections={sections}
    />
  );
}
