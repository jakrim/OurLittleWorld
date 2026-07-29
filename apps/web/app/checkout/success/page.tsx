import type { Metadata } from "next";
import Link from "next/link";
import CheckoutCompletion from "@/components/CheckoutCompletion";

import CommercialAvailability from "@/components/CommercialAvailability";
import { metadataFor } from "@/lib/siteSeo";

export const metadata: Metadata = metadataFor("checkoutSuccess");

type CheckoutSuccessProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CheckoutSuccessPage({ searchParams }: CheckoutSuccessProps) {
  const params = await searchParams;
  const claimCode = value(params?.claim_code);
  const sessionId = value(params?.session_id);

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
          <h1 className="page-title">Finish in the app.</h1>
          <p className="lead">
            We will verify payment with Stripe, then help you install or open Our Little World and connect the plan.
          </p>
        </div>
      </section>

      <section className="section band-soft">
        <div className="narrow policy-list">
          <CheckoutCompletion kind="purchase" sessionId={sessionId} code={claimCode} />
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
