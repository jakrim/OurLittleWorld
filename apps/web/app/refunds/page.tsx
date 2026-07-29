import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { exportPolicyCopy } from "@/content/exportPolicy";

export const metadata: Metadata = {
  title: "Cancellation and Refund Policy",
  description:
    "Our Little World cancellation, refund, duplicate purchase, gift code, partner code, and billing owner policy.",
};

export default function RefundsPage() {
  return (
    <main id="main">
      <BreadcrumbStructuredData route="refunds" />
      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumbs">
            <Link href="/">Home</Link>
            <span>/</span>
            <span>Refunds</span>
          </div>
          <p className="script">billing help</p>
          <h1 className="page-title">Cancellation and Refund Policy</h1>
          <p className="lead">
            Effective July 2, 2026. This policy explains how cancellation, refunds,
            duplicate purchases, gift codes, partner codes, and billing owner support work.
          </p>
        </div>
      </section>

      <section className="section band-soft">
        <div className="narrow policy-list">
          <PolicyItem title="No Free Trial at Launch">
            <p>
              Our Little World does not offer a free trial at launch. A subscription starts
              when the purchase is confirmed by Apple App Store, Google Play, or Stripe.
            </p>
          </PolicyItem>

          <PolicyItem title="Automatic Renewal">
            <p>
              Monthly and yearly subscriptions renew automatically until canceled. Cancel before
              the renewal date if you do not want the next billing period to begin.
            </p>
          </PolicyItem>

          <PolicyItem title="App Store and Google Play Purchases">
            <p>
              Our Little World is not publicly downloadable from either store yet. When native app
              subscriptions become available, they will be billed, renewed, canceled, and refunded by the store
              account used to purchase them. To cancel or request a refund, use Apple App Store
              or Google Play account settings and refund tools. Our Little World can help with
              entitlement troubleshooting, but the stores control native subscription billing.
            </p>
          </PolicyItem>

          <PolicyItem title="Website Stripe Subscriptions">
            <p>
              Website subscriptions are available only when the site shows an enabled live checkout;
              the current public pre-launch site does not take payment. Enabled website subscriptions
              are processed by Stripe. The billing owner can manage a Stripe
              subscription through the website billing portal from the app, when available, or by
              contacting support.
            </p>
            <p>
              Canceling a Stripe subscription stops future renewal charges. Access normally
              continues until the end of the paid billing period unless a refund, chargeback,
              or revocation applies.
            </p>
          </PolicyItem>

          <PolicyItem title="Lapsed Access and Exports">
            <p>{exportPolicyCopy.lapsedVault}</p>
            <p>
              {exportPolicyCopy.exportScope} {exportPolicyCopy.previewLimits}
            </p>
          </PolicyItem>

          <PolicyItem title="Stripe Subscription Refunds">
            <p>
              For website subscriptions, contact support within 14 days of the initial Stripe
              subscription charge if you are not satisfied, purchased the wrong plan, or purchased
              by mistake. Renewal refunds are reviewed case by case, especially for duplicate
              purchases, billing errors, accidental renewals, or recent renewals with little or
              no continued use.
            </p>
            <p>
              Approved refunds are returned to the original payment method when possible. Stripe
              processing times and bank timelines can vary.
            </p>
          </PolicyItem>

          <PolicyItem title="Duplicate Purchases">
            <p>
              If you accidentally bought more than one plan for the same family space, contact
              support with the receipt email, store receipt, Stripe receipt, purchase code, and
              the email used in the app. We will help connect the correct purchase and review
              whether the duplicate charge can be refunded.
            </p>
          </PolicyItem>

          <PolicyItem title="Gift Year Purchases">
            <p>
              Website gift years are available only when the gift page shows an enabled live checkout.
              Completed gift years use single-use digital codes. A gift can usually be refunded
              before the recipient redeems the code. After redemption, gift refunds are reviewed
              case by case. If a gift is refunded before redemption, the code may be revoked.
            </p>
          </PolicyItem>

          <PolicyItem title="Partner and Comp Codes">
            <p>
              Partner, promotional, and complimentary codes have no cash value. They may expire,
              have limited duration, be restricted to one family space, and be revoked if issued
              in error, refunded, misused, or obtained through fraud.
            </p>
          </PolicyItem>

          <PolicyItem title="Billing Owner Changes">
            <p>
              Billing owner transfer is not self-serve at launch. Contact support if a family
              needs a billing owner change, lost code lookup, duplicate purchase review, or
              account help.
            </p>
          </PolicyItem>

          <PolicyItem title="Taxes, Discounts, and Chargebacks">
            <p>
              Taxes, exchange rates, discounts, promotions, app store fees, and bank fees may
              affect the amount charged or refunded. If a payment is disputed or charged back,
              paid access may be paused or revoked while the dispute is reviewed.
            </p>
          </PolicyItem>

          <PolicyItem title="How to Request Help">
            <p>
              Email <a href="mailto:support@ourlittleworld.me">support@ourlittleworld.me</a> with
              the purchase email, app account email, family name if available, receipt or order ID,
              and a short description of the issue.
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
