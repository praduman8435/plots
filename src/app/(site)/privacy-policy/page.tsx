import type { Metadata } from "next";
import Link from "next/link";
import { LegalContact, LegalPage, type LegalSection } from "@/components/site/legal";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `What ${site.name} collects, why, who sees it, how long we keep it, and how to get it deleted.`,
  alternates: { canonical: "/privacy-policy" },
};

const sections: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <>
        <p>
          {site.name} ({site.url.replace(/^https?:\/\//, "")}) is an online place where people selling land list it, and people looking for land find it and
          contact the seller directly. It is run by {site.legal.operator} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). For data protection law, including India&apos;s
          Digital Personal Data Protection Act, 2023, we are the &ldquo;Data Fiduciary&rdquo; for the personal data described here.
        </p>
        <p>This policy covers our website and our WhatsApp number. It applies whether you are buying, selling or just looking around.</p>
      </>
    ),
  },
  {
    id: "what-we-collect",
    title: "What we collect",
    body: (
      <>
        <h3>If you sell land</h3>
        <ul>
          <li>
            <strong>Your details:</strong> name, mobile number (also your WhatsApp number), and whether you are the owner or selling for someone.
          </li>
          <li>
            <strong>Your listings:</strong> land type, size, price, address, village or area, map location, description and photos.
          </li>
          <li>
            <strong>Identity check:</strong> if you verify with Aadhaar, the check happens on our verification partner&apos;s own pages. We never receive or
            store your Aadhaar number. We keep only the result, the partner&apos;s reference, and a masked number such as XXXX XXXX 4321.
          </li>
          <li>
            <strong>Messages:</strong> what you send to our WhatsApp number or in the chat on our site, including photos and locations, so we can create
            and manage your listing.
          </li>
        </ul>
        <h3>If you are looking for land</h3>
        <ul>
          <li>
            <strong>When you contact a seller:</strong> your name and mobile number.
          </li>
          <li>
            <strong>When you ask us to tell you about land:</strong> your name, WhatsApp number, the place, and the land type and budget you choose.
          </li>
          <li>
            <strong>When you report a listing:</strong> what you tell us in the report.
          </li>
        </ul>
        <h3>From everyone who visits</h3>
        <ul>
          <li>
            <strong>Usage:</strong> pages viewed, searches and filters used, and taps on buttons such as WhatsApp or Call, linked to a random ID stored in your
            browser, not to your name.
          </li>
          <li>
            <strong>Technical data:</strong> IP address and browser details, used to keep the service running and to stop abuse (for example, limiting how many
            messages can be sent).
          </li>
        </ul>
        <p>We do not use advertising or tracking cookies, and we do not run third-party analytics or ad networks on the site.</p>
      </>
    ),
  },
  {
    id: "how-we-use-it",
    title: "How we use it",
    body: (
      <ul>
        <li>To publish listings and show them to people looking for land.</li>
        <li>To connect buyers and sellers: passing your details to the other side when you choose to contact them.</li>
        <li>To sign you in, using one-time codes sent to your WhatsApp.</li>
        <li>To review listings before they go live, keep them up to date (for example, asking sellers if land is still available) and remove sold or false ones.</li>
        <li>To send you messages you asked for or that relate to your listing or request, on WhatsApp.</li>
        <li>To look into reports, prevent fraud and spam, and keep the service secure.</li>
        <li>To understand, in total numbers, how the site is used, so we can improve it.</li>
        <li>To meet legal obligations.</li>
      </ul>
    ),
  },
  {
    id: "who-sees-it",
    title: "Who sees your data",
    body: (
      <>
        <h3>The public</h3>
        <p>
          Listings are public: photos, price, size, description, the area, and the seller&apos;s name and verification badges. On the map we show only an
          approximate location, a few hundred metres from the real spot. A seller&apos;s phone number is not shown on the page; it is shared only with a buyer
          who enters their own name and number to contact them.
        </p>
        <h3>The other side of a contact</h3>
        <p>When a buyer contacts a seller, the seller receives the buyer&apos;s name and number, and the buyer gets the seller&apos;s number.</p>
        <h3>Our service providers</h3>
        <p>We use trusted companies to run {site.name}. They process data only on our instructions:</p>
        <ul>
          <li>
            <strong>Vercel</strong>: website hosting and photo storage.
          </li>
          <li>
            <strong>Supabase</strong>: our database.
          </li>
          <li>
            <strong>Meta (WhatsApp Business Platform)</strong>: sending and receiving WhatsApp messages, including login codes.
          </li>
          <li>
            <strong>Our identity verification partner</strong>: Aadhaar-based identity checks, when you choose to verify.
          </li>
          <li>
            <strong>Google (Gemini)</strong>: when switched on, helps our WhatsApp assistant understand messages. Phone and Aadhaar-like numbers are hidden
            before a message is sent to it.
          </li>
        </ul>
        <h3>When the law requires it</h3>
        <p>We may share data with police, courts or government bodies when the law requires it, or to protect people from fraud or harm.</p>
        <p>
          <strong>We do not sell your personal data</strong>, and we do not share it with advertisers.
        </p>
      </>
    ),
  },
  {
    id: "where-its-stored",
    title: "Where your data is stored",
    body: (
      <p>
        Our website and database run on servers in Singapore, run by the providers named above. WhatsApp messages are handled by Meta&apos;s systems. We
        transfer data outside India only as Indian law allows, and our providers protect it with industry-standard security.
      </p>
    ),
  },
  {
    id: "how-long",
    title: "How long we keep it",
    body: (
      <ul>
        <li>Login codes: deleted within a day.</li>
        <li>Seller accounts and listings: while your account is open. Removed listings are hidden from everyone at once.</li>
        <li>Buyer contacts and land requests: while they are useful to you and the seller, and deleted when you ask.</li>
        <li>Usage data: kept only to see trends, and never linked to your name.</li>
        <li>Reports and records of misuse: as long as needed to prevent fraud and meet legal duties.</li>
      </ul>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and browser storage",
    body: (
      <>
        <p>We only use what the site needs to work:</p>
        <ul>
          <li>
            <strong>Sign-in cookies</strong> for sellers and our team, so you stay signed in.
          </li>
          <li>
            <strong>A chat cookie</strong> that remembers your number in the on-site chat.
          </li>
          <li>
            <strong>Browser storage</strong> on your device: a random visitor ID, and your name and number if you contacted a seller, so you don&apos;t have to
            type them again. Clearing your browser data removes these.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "security",
    title: "How we protect it",
    body: (
      <p>
        All traffic is encrypted (HTTPS). Sellers sign in with one-time codes, our team&apos;s accounts use strong passwords with two-step sign-in, access to
        personal data is limited to people who need it, and actions by our team are logged. No system is perfectly secure; if a breach affects you, we will tell you and the
        authorities as the law requires.
      </p>
    ),
  },
  {
    id: "your-rights",
    title: "Your rights",
    body: (
      <>
        <p>You can ask us to:</p>
        <ul>
          <li>tell you what personal data we hold about you and how we use it;</li>
          <li>correct or update it (sellers can edit listings themselves from &ldquo;My plots&rdquo;);</li>
          <li>
            delete it (see <Link href="/data-deletion">how to delete your data</Link>);
          </li>
          <li>stop sending you WhatsApp messages;</li>
          <li>nominate someone to act for you if you are unable to.</li>
        </ul>
        <p>
          Contact us using the details below. We may ask you to confirm the request from your registered number. We reply within 30 days. If you are not happy
          with our answer, you can complain to the Data Protection Board of India.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: <p>{site.name} is for adults. You must be 18 or older to list land or contact sellers. We do not knowingly collect data from children.</p>,
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: <p>If we change this policy, we will update the date at the top. If the change is important, we will tell sellers on WhatsApp before it applies.</p>,
  },
  {
    id: "contact",
    title: "Contact and grievances",
    body: (
      <>
        <p>For any question, request or complaint about your personal data, contact us:</p>
        <LegalContact />
      </>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      current="/privacy-policy"
      title="Privacy Policy"
      intro={
        <p>
          We collect only what we need to connect people buying land with people selling it. We never store Aadhaar numbers, we don&apos;t sell your data, and
          you can ask us to delete it at any time.
        </p>
      }
      sections={sections}
    />
  );
}
