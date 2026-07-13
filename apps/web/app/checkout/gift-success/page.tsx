import type { Metadata } from "next";
import Link from "next/link";

import CheckoutCompletionStatus from "@/components/CheckoutCompletionStatus";
import CommercialAvailability from "@/components/CommercialAvailability";

export const metadata: Metadata = {
  title: "Gift Checkout Complete",
  description: "Your Our Little World gift year purchase is ready to send or redeem.",
  robots: { index: false, follow: false, nocache: true },
};

type GiftSuccessProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GiftSuccessPage({ searchParams }: GiftSuccessProps) {
  const params = await searchParams;
  const sessionId = value(params?.session_id) || "";

  return (
    <main id="main">
      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumbs">
            <Link href="/">Home</Link>
            <span>/</span>
            <span>Gift</span>
          </div>
          <p className="script">gift ready</p>
          <h1 className="page-title">We’re verifying the gift purchase.</h1>
          <p className="lead">
            A return from Stripe does not create a gift by itself. The code appears only after verified payment and the canonical gift record exist.
          </p>
        </div>
      </section>

      <section className="section band-soft">
        <div className="narrow policy-list">
          <article className="policy-item">
            <h2>Gift code</h2>
            <CheckoutCompletionStatus kind="gift" sessionId={sessionId} />
            <p>
              The recipient should choose Redeem website gift or partner access from the app purchase screen.
            </p>
          </article>
          <article className="policy-item">
            <h2>Support</h2>
            <p>
              Contact <a href="mailto:support@ourlittleworld.me">support@ourlittleworld.me</a> for delivery changes,
              lost codes, or refund questions. See the <Link href="/refunds/">Cancellation and Refund Policy</Link>
              for gift refund details.
            </p>
          </article>
        </div>
      </section>
      <CommercialAvailability surface="success" />
    </main>
  );
}

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input;
}
