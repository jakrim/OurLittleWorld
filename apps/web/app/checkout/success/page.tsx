import type { Metadata } from "next";
import Link from "next/link";

import CheckoutCompletionStatus from "@/components/CheckoutCompletionStatus";
import CommercialAvailability from "@/components/CommercialAvailability";

export const metadata: Metadata = {
  title: "Checkout Complete",
  description: "Connect your Our Little World website subscription to your family space.",
  robots: { index: false, follow: false, nocache: true },
};

type CheckoutSuccessProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CheckoutSuccessPage({ searchParams }: CheckoutSuccessProps) {
  const params = await searchParams;
  const sessionId = value(params?.session_id) || "";

  return (
    <main id="main">
      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumbs">
            <Link href="/">Home</Link>
            <span>/</span>
            <span>Checkout</span>
          </div>
          <p className="script">welcome in</p>
          <h1 className="page-title">We’re verifying your family plan.</h1>
          <p className="lead">
            A return from Stripe does not grant access by itself. Your code appears only after verified payment and the canonical subscription record exist.
          </p>
        </div>
      </section>

      <section className="section band-soft">
        <div className="narrow policy-list">
          <article className="policy-item">
            <h2>Purchase code</h2>
            <CheckoutCompletionStatus kind="purchase" sessionId={sessionId} />
            <p>
              In the app, finish onboarding, open the purchase screen, and choose Redeem website gift or partner access.
            </p>
          </article>
          <article className="policy-item">
            <h2>Need help?</h2>
            <p>
              Contact <a href="mailto:support@ourlittleworld.me">support@ourlittleworld.me</a> for duplicate purchases,
              lost codes, or billing owner changes. See the <Link href="/refunds/">Cancellation and Refund Policy</Link>
              for refund details.
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
