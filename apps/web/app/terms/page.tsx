import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Our Little World terms for accounts, private family spaces, subscriptions, gifts, refunds, cancellation, and support.",
};

export default function TermsPage() {
  return (
    <main id="main">
      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumbs">
            <Link href="/">Home</Link>
            <span>/</span>
            <span>Terms</span>
          </div>
          <p className="script">plain terms</p>
          <h1 className="page-title">Terms of Service</h1>
          <p className="lead">
            Effective July 2, 2026. These terms apply to Our Little World accounts,
            private family spaces, subscriptions, gifts, partner codes, exports, and support.
          </p>
        </div>
      </section>

      <section className="section band-soft">
        <div className="narrow policy-list">
          <PolicyItem title="The Service">
            <p>
              Our Little World is a private baby book for parents, guardians, and caregivers.
              Families can keep selected photos, videos, notes, firsts, prompts, letters,
              voice notes, and related memory details in a private family space.
            </p>
          </PolicyItem>

          <PolicyItem title="Who May Use It">
            <p>
              You must be at least 18 years old, or the age of majority where you live, to create
              an account or purchase a subscription. The service is intended for adults creating
              a family keepsake. It is not intended for children to create accounts.
            </p>
          </PolicyItem>

          <PolicyItem title="Accounts and Family Spaces">
            <p>
              You are responsible for the email account you use to sign in and for the people you
              invite into your family space. Invited co-parents or caregivers may be able to see,
              add, edit, or manage memories depending on their role. View-only family circle members
              may see content you choose to share with them.
            </p>
          </PolicyItem>

          <PolicyItem title="Your Content">
            <p>
              You keep ownership of the photos, videos, notes, letters, voice notes, and other
              content you add. You give Our Little World a limited permission to host, process,
              store, resize, display, back up, and transmit that content only as needed to operate,
              support, secure, and improve the service.
            </p>
            <p>
              Only upload or share content when you have the rights and permissions to do so,
              including permissions from other adults whose private information, image, or voice
              may appear in a family memory.
            </p>
          </PolicyItem>

          <PolicyItem title="Child and Family Information">
            <p>
              The service may store information about your child or family that you choose to add,
              such as a child&apos;s name, birthday, photos, videos, voice notes, milestones, letters,
              and location metadata from saved media. You are responsible for deciding what to add
              and whom to invite into the family space.
            </p>
          </PolicyItem>

          <PolicyItem title="Subscriptions and Payments">
            <p>
              The launch model covers one private family space for one child and the included
              caregiver features in the app. Planned Family pricing is $7.99 monthly or $69.99
              yearly. Planned Vault pricing is $14.99 monthly or $149.99 yearly. A purchase is
              available only when the website or an official app-store listing shows an enabled,
              verified checkout with the final price and billing interval.
            </p>
            <p>
              When native subscriptions become publicly available, they will be managed by Apple
              App Store or Google Play. Enabled website subscriptions and gift purchases are
              processed by Stripe. Our Little World does not store full card numbers.
            </p>
          </PolicyItem>

          <PolicyItem title="Media Storage and Quality">
            <p>
              The Family plan stores optimized app-quality copies of photos and videos by default,
              within the plan&apos;s included storage and video limits. The Vault plan additionally
              includes original-quality backup for selected photos and videos. Our Little World is
              not a full-device photo library backup unless original backup is enabled for
              selected media on an eligible plan.
            </p>
            <p>
              Video processing may include upload, encoding, storage, streaming, and delivery
              through media infrastructure providers.
            </p>
          </PolicyItem>

          <PolicyItem title="Renewal, Cancellation, and Refunds">
            <p>
              Paid subscriptions renew automatically unless canceled before the renewal date.
              App Store and Google Play subscriptions must be canceled through the relevant store
              account. Stripe website subscriptions can be managed through the website billing
              portal from the app, when available, or through support.
            </p>
            <p>
              See the <Link href="/refunds/">Cancellation and Refund Policy</Link> for refund,
              duplicate purchase, gift, partner code, and billing owner details.
            </p>
          </PolicyItem>

          <PolicyItem title="Gifts and Partner Codes">
            <p>
              Purchased gift codes are single-use unless we state otherwise. They cannot be
              redeemed into multiple family spaces, exchanged for cash, resold, or transferred
              after redemption without support approval. We may revoke codes that are refunded,
              issued in error, expired, misused, or obtained through fraud.
            </p>
          </PolicyItem>

          <PolicyItem title="Exports and Printed Keepsakes">
            <p>
              The app may let you export or preview parts of your family archive. You are responsible
              for reviewing exports before printing or sharing. Printed books and physical keepsakes,
              if offered, may have separate pricing, production, shipping, and refund terms.
            </p>
          </PolicyItem>

          <PolicyItem title="Acceptable Use">
            <p>
              Do not use Our Little World to upload illegal content, violate another person&apos;s
              privacy, harass others, access accounts or family spaces without permission, bypass
              security or billing controls, scrape the service, or interfere with the service.
            </p>
          </PolicyItem>

          <PolicyItem title="Not Medical, Safety, or Parenting Advice">
            <p>
              Our Little World is a keepsake and memory product. It does not provide medical,
              developmental, legal, safety, or parenting advice. Do not rely on the service for
              emergencies, supervision, health decisions, or child safety decisions.
            </p>
          </PolicyItem>

          <PolicyItem title="Third-Party Services">
            <p>
              The service depends on third-party providers for app distribution, payments,
              authentication, hosting, database, storage, and device features. Their terms and
              policies may also apply to your use of those features.
            </p>
          </PolicyItem>

          <PolicyItem title="Service Changes and Availability">
            <p>
              We may add, remove, change, suspend, or discontinue features. We work to keep the
              service reliable, but we do not guarantee uninterrupted access or that every memory,
              export, device permission, provider integration, or third-party service will always
              work as expected.
            </p>
          </PolicyItem>

          <PolicyItem title="Account Removal">
            <p>
              We may suspend or terminate access if we believe these terms were violated, payment
              failed, a code was misused, or continued use creates legal, security, or operational
              risk. You can contact support for account and data deletion help.
            </p>
          </PolicyItem>

          <PolicyItem title="Disclaimers and Limits">
            <p>
              To the extent allowed by law, the service is provided as is and as available. We
              disclaim implied warranties, including merchantability, fitness for a particular
              purpose, and non-infringement. To the extent allowed by law, Our Little World is not
              liable for indirect, incidental, special, consequential, exemplary, or punitive damages.
            </p>
          </PolicyItem>

          <PolicyItem title="Governing Law">
            <p>
              These terms are governed by New Jersey law, except where consumer protection or other
              mandatory laws give you non-waivable rights in another place.
            </p>
          </PolicyItem>

          <PolicyItem title="Changes">
            <p>
              We may update these terms as the service changes. The latest version will be posted
              on this page. If a change is material, we will use reasonable efforts to provide
              additional notice.
            </p>
          </PolicyItem>

          <PolicyItem title="Contact">
            <p>
              For billing, gift, privacy, account, or legal requests, email{" "}
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
