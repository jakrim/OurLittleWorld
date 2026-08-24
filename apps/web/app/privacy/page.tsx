import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import AnalyticsConsentControls from "@/components/AnalyticsConsentControls";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import { metadataFor } from "@/lib/siteSeo";

export const metadata: Metadata = metadataFor("privacy");

export default function PrivacyPage() {
  return (
    <main id="main">
      <BreadcrumbStructuredData route="privacy" />
      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumbs">
            <Link href="/">Home</Link>
            <span>/</span>
            <span>Privacy</span>
          </div>
          <p className="script">private by design</p>
          <h1 className="page-title">Privacy Policy</h1>
          <p className="lead">
            Effective July 2, 2026. Our Little World is a private baby book for
            parents, guardians, and caregivers. This policy explains what information
            the website and app collect and how that information is used.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head center">
            <p className="eyebrow">Our promise</p>
            <h2 className="section-title">A keepsake for your family, not a social network.</h2>
            <p className="lead">
              We do not sell personal information. We do not use a public feed, likes,
              follower counts, or third-party advertising algorithms. Your family memories
              are meant for the family space you create and the people you invite.
            </p>
          </div>
          <div className="grid grid-3 privacy-grid">
            <article className="card privacy-card">
              <span className="icon-box"><i data-lucide="lock-keyhole" /></span>
              <h3 className="card-title">Private family space</h3>
              <p>Memories are shared only with invited family members according to their role.</p>
            </article>
            <article className="card privacy-card">
              <span className="icon-box"><i data-lucide="images" /></span>
              <h3 className="card-title">Selected archive</h3>
              <p>Only selected or auto-saved moments are uploaded to your private archive.</p>
            </article>
            <article className="card privacy-card">
              <span className="icon-box"><i data-lucide="shield-check" /></span>
              <h3 className="card-title">No ad sale</h3>
              <p>Family content is not sold to advertisers or used to build a public social graph.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section band-soft">
        <div className="narrow policy-list">
          <PolicyItem title="Information We Collect">
            <ul>
              <li>Account information, such as email address, sign-in details, support requests, and contact preferences.</li>
              <li>Family profile information, such as child name, birthday, family name, relationship labels, invitations, and family circle roles.</li>
              <li>Family memories, such as photos, videos, thumbnails, voice notes, written notes, firsts, prompts, reactions, letters, saved moments, and export files.</li>
              <li>Media metadata, such as creation time, dimensions, media type, local library identifiers, and location metadata when available from saved media.</li>
              <li>Purchase and billing records, such as plan, billing owner, product identifiers, redemption codes, Stripe customer or subscription IDs, store purchase metadata, and refund status.</li>
              <li>Website form details, such as gift giver and recipient contact details, gift notes, delivery dates, partner inquiries, and checkout form entries.</li>
              <li>Technical information, such as device permissions, app version, operating system, logs, error reports, and basic website request data.</li>
            </ul>
          </PolicyItem>

          <PolicyItem title="How We Use Information">
            <p>
              We use information to authenticate users, create and manage family spaces, store
              selected memories, organize timelines, run prompts and letters, manage invitations,
              process purchases and gift codes, provide support, prevent abuse, maintain security,
              comply with law, and improve the service.
            </p>
          </PolicyItem>

          <PolicyItem title="Optional Product Analytics">
            <p>
              Analytics is off unless you choose to allow it. When allowed, we use a
              dedicated Our Little World analytics project with person profiles disabled.
              Events contain coarse actions and campaign labels only. They do not contain
              child names, birthdays, captions, notes, letters, prompt answers, photos,
              media identifiers, precise locations, contacts, checkout session IDs, or
              gift and redemption codes.
            </p>
            <p>
              You can deny analytics, change your choice, or revoke consent at any time.
              Revoking clears the anonymous analytics identifier and campaign attribution
              stored by this browser and stops future analytics delivery.
            </p>
            <AnalyticsConsentControls />
          </PolicyItem>

          <PolicyItem title="Photo Library Access and Discovery">
            <p>
              Manual photo and video adds use the system photo picker or the permissions you grant
              on your device. Optional library discovery can scan your local photo library to help
              find likely baby moments. Face matching and scene hints are designed to run on device
              where available. Selected manual imports and calibrated auto-saves are uploaded to
              your private family archive.
            </p>
            <p>
              You can change Photos, Camera, or Microphone permissions in your device settings.
              If future discovery features require materially different processing, we will update
              this policy.
            </p>
          </PolicyItem>

          <PolicyItem title="Child and Family Information">
            <p>
              Our Little World is for adults creating a record about their family. It is not
              intended for children to create accounts. Parents, guardians, and caregivers decide
              what information about a child or family to add to the private archive.
            </p>
          </PolicyItem>

          <PolicyItem title="Payments">
            <p>
              Our Little World is not publicly listed in the App Store or Google Play yet. When
              enabled, those stores process native subscriptions and Stripe processes website
              subscriptions and gift purchases. Payment providers may collect card, billing, tax,
              fraud-prevention, and transaction information under their own policies. Our Little
              World does not store full payment card numbers.
            </p>
          </PolicyItem>

          <PolicyItem title="Media Storage and Processing">
            <p>
              The Family plan stores optimized app-quality copies of the photos and videos you
              save. The Vault plan additionally stores original-quality copies for selected
              media. Our Little World is not a full-device photo library backup unless original
              backup is enabled for selected media.
            </p>
            <p>
              Video processing may include upload, encoding, storage, streaming, and delivery
              through media infrastructure providers. In addition to our other service
              providers, we may use Cloudflare for video streaming, media storage, and content
              delivery.
            </p>
          </PolicyItem>

          <PolicyItem title="How Information Is Shared">
            <ul>
              <li>With invited users in your family space, based on their role and the memories you share.</li>
              <li>With service providers that help run authentication, hosting, database, storage, payments, app distribution, email, support, analytics, and security.</li>
              <li>With payment platforms and app stores as needed to process purchases, renewals, refunds, chargebacks, and entitlement checks.</li>
              <li>When required by law, legal process, safety, security, fraud prevention, or to protect our rights or users.</li>
              <li>In connection with a merger, financing, acquisition, reorganization, or sale of business assets, subject to reasonable confidentiality protections.</li>
            </ul>
          </PolicyItem>

          <PolicyItem title="What We Do Not Do">
            <ul>
              <li>We do not sell personal information.</li>
              <li>We do not run a public social feed, likes, followers, or ad-ranking algorithm.</li>
              <li>We do not store full payment card numbers.</li>
              <li>We do not intend for children to create accounts.</li>
            </ul>
          </PolicyItem>

          <PolicyItem title="Security">
            <p>
              We use reasonable technical and organizational measures designed to protect your
              information, including private storage and access controls for family archive data.
              No method of transmission or storage is completely secure.
            </p>
          </PolicyItem>

          <PolicyItem title="Retention">
            <p>
              We keep information for as long as needed to provide the service, comply with legal
              and tax obligations, resolve disputes, prevent abuse, maintain backups, and enforce
              agreements. Deleted content may persist for a limited time in backups or logs.
            </p>
          </PolicyItem>

          <PolicyItem title="Your Choices and Requests">
            <p>
              You can manage device permissions in iOS or Android settings, choose whom to invite,
              review shared family circle access, and contact support for help with access,
              correction, export, deletion, billing owner changes, or account removal.
            </p>
            <p>
              Depending on where you live, you may have additional privacy rights, including access,
              correction, deletion, portability, appeal, or opt-out rights. We will honor applicable
              rights requests as required by law.
            </p>
          </PolicyItem>

          <PolicyItem title="International Use">
            <p>
              If you use the service outside the United States, your information may be processed
              in the United States and other places where we or our service providers operate.
            </p>
          </PolicyItem>

          <PolicyItem title="Changes">
            <p>
              We may update this policy as the app, website, providers, or legal requirements
              change. The latest version will be posted on this page.
            </p>
          </PolicyItem>

          <PolicyItem title="Contact">
            <p>
              For privacy, account, billing, gift, or deletion requests, email{" "}
              <a href="mailto:support@ourlittleworld.me">support@ourlittleworld.me</a>.
            </p>
          </PolicyItem>
        </div>
      </section>
    </main>
  );
}

function PolicyItem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="policy-item">
      <h2>{title}</h2>
      {children}
    </article>
  );
}
