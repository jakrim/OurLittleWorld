import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Gift Checkout Complete",
  description: "Your Our Little World gift year purchase is ready to send or redeem.",
};

type GiftSuccessProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GiftSuccessPage({ searchParams }: GiftSuccessProps) {
  const params = await searchParams;
  const giftCode = value(params?.gift_code);

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
          <h1 className="page-title">The first year is ready to give.</h1>
          <p className="lead">
            Share this code with the recipient. They can redeem it in the app after creating their family space.
          </p>
        </div>
      </section>

      <section className="section band-soft">
        <div className="narrow policy-list">
          <article className="policy-item">
            <h2>Gift code</h2>
            {giftCode ? (
              <div className="code-box" aria-label="Gift code">{giftCode}</div>
            ) : (
              <p>Your gift code is being prepared. If it does not appear, contact support with your Stripe receipt email.</p>
            )}
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
    </main>
  );
}

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input;
}
