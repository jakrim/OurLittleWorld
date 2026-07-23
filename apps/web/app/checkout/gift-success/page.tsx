import type { Metadata } from "next";
import Link from "next/link";
import CheckoutCompletion from "@/components/CheckoutCompletion";

export const metadata: Metadata = {
  title: "Gift Checkout Complete",
  description: "Your Our Little World Family gift year is ready to send or redeem.",
};

type GiftSuccessProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GiftSuccessPage({ searchParams }: GiftSuccessProps) {
  const params = await searchParams;
  const giftCode = value(params?.gift_code);
  const sessionId = value(params?.session_id);

  return (
    <main id="main">
      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumbs">
            <Link href="/">Home</Link>
            <span>/</span>
            <span>Gift</span>
          </div>
          <p className="script">gift checkout</p>
          <h1 className="page-title">Confirm the gift.</h1>
          <p className="lead">
            We will verify payment with Stripe before showing the single-use gift code.
          </p>
        </div>
      </section>

      <section className="section band-soft">
        <div className="narrow policy-list">
          <CheckoutCompletion kind="gift" sessionId={sessionId} code={giftCode} />
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
    </main>
  );
}

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input;
}
