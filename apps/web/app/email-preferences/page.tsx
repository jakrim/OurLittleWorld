import type { Metadata } from "next";
import Link from "next/link";

import { BreadcrumbStructuredData } from "@/components/StructuredData";
import { metadataFor } from "@/lib/siteSeo";

export const metadata: Metadata = metadataFor("emailPreferences");

export default function EmailPreferencesPage() {
  return (
    <main id="main">
      <BreadcrumbStructuredData route="emailPreferences" />
      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumbs">
            <Link href="/">Home</Link>
            <span>/</span>
            <span>Email preferences</span>
          </div>
          <p className="script">your inbox, your choice</p>
          <h1 className="page-title">Email preferences</h1>
          <p className="lead">
            Marketing updates are optional. Billing, gift, account, privacy, and security
            messages are handled separately as service communications.
          </p>
        </div>
      </section>

      <section className="section band-soft">
        <div className="narrow policy-list">
          <section>
            <h2>Unsubscribing from marketing</h2>
            <p>
              Every Our Little World marketing email includes an unsubscribe link. Use that
              link to stop launch and occasional product updates from the mailing provider.
            </p>
          </section>
          <section>
            <h2>Suppression stays in place</h2>
            <p>
              Submitting a launch-list form again does not override an existing unsubscribe,
              bounce, complaint, or other provider suppression. We do not silently resubscribe
              an address after marketing consent has been withdrawn. If you explicitly ask to
              join again after unsubscribing, the mailing provider may send a confirmation request;
              marketing resumes only after that confirmation succeeds.
            </p>
          </section>
          <section>
            <h2>Service messages are separate</h2>
            <p>
              Transactional messages needed for billing, gifts, account access, privacy requests,
              or security may still be sent when they are necessary to provide or protect the
              service. They do not enroll you in marketing.
            </p>
          </section>
          <section>
            <h2>Need help?</h2>
            <p>
              There is not a self-service email-preference dashboard today. For help with a
              marketing preference or unsubscribe request, email{" "}
              <a href="mailto:support@ourlittleworld.me">support@ourlittleworld.me</a>.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
