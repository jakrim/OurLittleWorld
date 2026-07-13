import type { Metadata } from "next";
import Link from "next/link";
import ConversionCompleteBeacon from "@/components/ConversionCompleteBeacon";

export const metadata: Metadata = {
  title: "Checkout Complete",
  description: "Connect your Our Little World website subscription to your family space.",
};

type CheckoutSuccessProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CheckoutSuccessPage({ searchParams }: CheckoutSuccessProps) {
  const params = await searchParams;
  const claimCode = value(params?.claim_code);

  return (
    <main id="main">
      <ConversionCompleteBeacon kind="purchase" />
      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumbs">
            <Link href="/">Home</Link>
            <span>/</span>
            <span>Checkout</span>
          </div>
          <p className="script">welcome in</p>
          <h1 className="page-title">Your family plan is ready.</h1>
          <p className="lead">
            Use this code in the Our Little World app after onboarding to unlock the private family archive.
          </p>
        </div>
      </section>

      <section className="section band-soft">
        <div className="narrow policy-list">
          <article className="policy-item">
            <h2>Purchase code</h2>
            {claimCode ? (
              <div className="code-box" aria-label="Purchase code">{claimCode}</div>
            ) : (
              <p>Your code is being prepared. If it does not appear, contact support and include your Stripe receipt email.</p>
            )}
            <p>
              In the app, finish onboarding, open the purchase screen, and choose Redeem gift, website, or partner access.
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
    </main>
  );
}

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input;
}
