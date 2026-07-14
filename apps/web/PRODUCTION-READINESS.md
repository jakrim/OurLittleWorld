# Production Readiness Audit

Last reviewed: July 13, 2026

## Current Status

The production website is in an explicit prelaunch state. It accurately says the
app is coming soon, stores and synchronizes consented launch interest, does not
render checkout forms, and returns a noindex 404 for the hidden Partners route.
The launch audience is isolated from the parent-product onboarding audience, and
unsubscribe, complaint, bounce, and confirmed-resubscribe state round-trip through
signed provider webhooks. Stripe test mode is fully provisioned and has passed
end-to-end payment, webhook, entitlement, gift, redemption, cancellation, and
refund scenarios. Test mode does not grant production access.

## Remaining Launch Blockers

Lifecycle measurement is implemented but not deployed:

- Deploy the central HTTPS lifecycle ingest service with durable storage.
- Configure matching product-specific ingest and contact-key secrets without
  printing or committing their values.
- Apply `20260714003000_marketing_measurement_outbox.sql` and deploy
  `export-lifecycle-events` with the feature flag still disabled.
- Prove one controlled event inserts once, identical replay inserts zero,
  consent withdrawal cancels queued work, and no private identifier appears in
  the central ledger.
- Enable `OUR_LITTLE_WORLD_LIFECYCLE_EXPORT_ENABLED` only after those checks.

1. Transactional gift email is not connected.
   - Configure a dedicated transactional provider, authenticated sender, reply handling, and scheduler.
   - Verify buyer confirmation and scheduled recipient delivery in real email clients.
   - The outbox fails closed and stops after five attempts; it must not be described as delivered before this gate passes.

2. Parent-product onboarding is not connected to product eligibility state.
   - Website interest synchronizes only to the dedicated `Our Little World Website Launch` audience.
   - The six-message parent sequence remains on the separate `Our Little World` audience for controlled/internal use; a visitor signup cannot enter it.
   - Do not connect real product accounts until server-authored role, explicit consent, activation, exit, and frequency-cap signals are deployed and verified.

3. Product analytics needs post-deploy event readback.
   - A dedicated Our Little World PostHog project and public token are configured in Vercel, with a prior privacy-safe checkpoint verified.
   - The privacy allowlist, consent controls, website funnel schema, and first/last-touch checkout propagation are implemented.
   - Verify provider readback for the new funnel event names before relying on conversion reporting.

4. Legal pages need review.
   - Privacy, Terms, and Refunds pages exist.
   - Subscription, cancellation, refund, gift, child data, and privacy terms still need legal review before taking real money.

5. Live commerce and public apps remain disabled.
   - Decide whether website checkout should launch before the apps can be publicly downloaded and redeemed.
   - Configure live Stripe credentials/prices only after that decision and run a separately authorized low-value live test.
   - Publish and verify official Apple/Google listings before changing store availability to `available`.
   - App Store sandbox, Google Play test purchases, restore, export/read-only lapse policy, and store refund paths still require their own release QA.

6. Operational escalation is durable but not externally paged.
   - Route and marketing work is dispatched every five minutes; operational alerts are evaluated every ten minutes, with open/resolved incidents retained in Supabase.
   - Configure an external alert destination before relying on this as an unattended revenue surface.
   - Verify the full reply loop for the intended `hello@ourlittleworld.me` alias before replacing the current `support@ourlittleworld.me` sender or inviting replies in lifecycle email.

## Page Flow Audit

### Homepage

Purpose: explain the product, motivate parent and gift-buyer intent, and route visitors to pricing or gift.

Current flow:
- Hero explains the private baby book wedge.
- Feature section explains what gets preserved.
- Contrast section handles "why not camera roll?"
- Ritual section reduces effort anxiety.
- Product-detail section shows app screens.
- Gift section routes gift buyers.
- Privacy and future-print sections build trust and expansion.
- FAQ and final CTA handle common hesitations.

Missing before scale:
- Real testimonials or proof once available.
- Verified store links once live.
- Analytics provider readback for the current funnel event names.

### Pricing

Purpose: help a family choose Family vs Vault (monthly/yearly) or route gift buyers.

Current flow:
- Two tiers: Family ($7.99 monthly / $69.99 yearly, recommended) and Vault ($14.99 monthly / $149.99 yearly) for video-heavy families who want original backup.
- Gift years: Family $70, Vault $150.
- Production presents these as planned prices and routes visitors to the launch list; it does not render checkout controls.
- In explicit test/live configuration, the implementation submits server-allowlisted plan keys (`family_monthly`, `family_yearly`, `vault_monthly`, `vault_yearly`; gifts use `gift_year` / `gift_vault_year`).

Missing before paid launch:
- Explicit live-mode credentials and a separately authorized live smoke test.
- A confirmed launch sequence that makes a website purchase redeemable immediately.

### Gift

Purpose: make "purchase for a friend" a primary conversion path.

Current flow:
- Gift page speaks to baby showers, births, first birthdays, clients, employees, siblings, and close friends.
- Production describes planned gift years and routes visitors to the launch list; no buyer or recipient form is rendered.
- In explicit test/live configuration, the form collects giver, recipient, gift note, and delivery date and includes a personal preview.

Missing before paid launch:
- Authenticated transactional sender and scheduler.
- Real-client rendering and delivery evidence.

### Partners

The future implementation remains in source behind one explicit feature flag.
The route currently returns 404 and is absent from navigation, internal CTAs,
the sitemap, and indexing. Do not enable it until a real program, pricing, and
fulfillment process exist.

### Story

Purpose: explain the emotional and product philosophy.

Current flow:
- Good fit for warm visitors and brand trust.
- Strong principles: private, gentle, durable.

Missing before scale:
- Founder note or a more personal reason this exists could strengthen trust.

### Privacy

Purpose: satisfy App Store and trust expectations.

Current flow:
- Clear privacy promise.
- Explains collected data and photo-library posture.

Missing before launch:
- Legal review.
- Confirm support/account deletion response process and timing.

### Terms and Refunds

Purpose: set customer expectations for paid subscriptions, website checkout, native app purchases, gift codes, partner codes, cancellation, and support.

Current flow:
- Expanded Terms of Service covers accounts, private family spaces, child/family information, user content rights, subscriptions, gifts, exports, acceptable use, and service limitations.
- Standalone Cancellation and Refund Policy covers Stripe subscriptions, App Store/Google Play purchases, gifts, duplicate purchases, partner codes, and billing owner changes.

Missing before launch:
- Legal review.
- Final owner/entity name after LLC formation.

## Live-commerce release checklist

- Resolve the website-before-app availability decision.
- Configure and test transactional gift email plus scheduling.
- Connect the isolated parent onboarding sequence only after product eligibility and exit-state synchronization exists.
- Verify the new website funnel events in the dedicated analytics project without PII.
- Legal-review Privacy, Terms, and Refunds.
- Publish verified store listings or keep the honest coming-soon state.
- Run separately authorized live Stripe and native-store release tests.
- Confirm support ownership for refunds, failed delivery, lost codes, and billing transfers.
- Configure an external destination for durable website and marketing alerts.

## Rollback

- Website: promote the previous healthy Vercel production deployment and keep
  `NEXT_PUBLIC_OLW_COMMERCE_STATE=coming_soon`.
- Edge Functions: redeploy the previous source version. Current database
  migrations are additive; do not remove columns/tables during an incident.
- Marketing sync: set `OUR_LITTLE_WORLD_MAILCHIMP_SYNC_ENABLED=false` to stop provider writes;
  keep signed webhooks enabled so suppressions continue to flow inward. Do not
  delete the launch audience or merge it into the parent audience during rollback.
- Payments: leave live commerce disabled. If payment processing becomes unsafe,
  change commerce to `temporarily_unavailable` before investigating.

## Vercel Configuration

- Root directory: `apps/web`
- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm build`
- Framework preset: Next.js
