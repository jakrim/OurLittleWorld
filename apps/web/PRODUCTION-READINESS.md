# Production Readiness Audit

Last reviewed: June 23, 2026

## Current Status

The website is now a production-shaped Next.js marketing site with first-pass commerce endpoints.

Users can browse the homepage, story, pricing, gift, partners, privacy, terms, and refunds pages. Pricing and gift forms can create Stripe Checkout Sessions through Supabase Edge Functions once Stripe price IDs and secrets are configured.

## Critical Launch Blockers

1. Live Stripe credentials and price IDs are not configured in this repo (test mode IS fully provisioned).
   - Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_FAMILY_MONTHLY`, `STRIPE_PRICE_FAMILY_YEARLY`, `STRIPE_PRICE_VAULT_MONTHLY`, `STRIPE_PRICE_VAULT_YEARLY`, `STRIPE_PRICE_GIFT_YEAR`, and `STRIPE_PRICE_GIFT_VAULT_YEAR` in Supabase.
   - Set `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL` in Vercel.

2. Gift delivery email is not connected.
   - Gift checkout creates a single-use redemption code and success page.
   - Scheduled recipient delivery still needs an email provider/job before relying on delayed delivery dates.

3. Partner operations need production process.
   - Partner inquiries are logged through a Supabase function.
   - Bulk code generation exists behind `OLW_BILLING_ADMIN_SECRET`, but package pricing and fulfillment ops still need owner approval.

4. Legal pages need review.
   - Privacy, Terms, and Refunds pages exist.
   - Subscription, cancellation, refund, gift, child data, and privacy terms still need legal review before taking real money.

5. End-to-end live payment QA is still required.
   - Stripe webhooks, App Store sandbox purchases, Google Play test purchases, refunds, restore, and code redemption must pass against real provider credentials.

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
- App Store badge once live.
- Analytics on CTA clicks and section depth.

### Pricing

Purpose: help a family choose Family vs Vault (monthly/yearly) or route gift buyers.

Current flow:
- Two tiers: Family ($7.99 monthly / $69.99 yearly, recommended) and Vault ($14.99 monthly / $149.99 yearly) for video-heavy families who want original backup.
- Gift years: Family $70, Vault $150.
- Checkout form submits explicit plan keys (`family_monthly`, `family_yearly`, `vault_monthly`, `vault_yearly`; gifts use `gift_year` / `gift_vault_year`).
- Self-checkout requires only a preselected plan and email; name and child stage are deferred to app onboarding.
- Completion is verified against Stripe and webhook-provisioned billing state before a code is shown or a conversion event is recorded.
- Verified purchasers can open the installed app with the code prefilled; public store buttons appear when their URLs are configured.

Missing before paid launch:
- Live-mode Stripe secrets and price IDs.
- End-to-end test of the post-checkout claim-code page in live mode.
- Deploy and smoke-test `stripe-checkout-status`, then configure the public iOS/Android store URLs when the listings are available.

### Gift

Purpose: make "purchase for a friend" a primary conversion path.

Current flow:
- Gift page speaks to baby showers, births, first birthdays, clients, employees, siblings, and close friends.
- Form collects giver, recipient, gift note, and delivery date.
- Preview makes the gift feel personal.

Missing before paid launch:
- Recipient email delivery.
- Gift confirmation email.
- Refund/cancellation handling.

### Partners

Purpose: start B2B2C conversations with photographers, doulas, registries, employers, and family brands.

Current flow:
- Partner categories are clear.
- Partner form has the right fields.
- Copy has been softened so it does not overclaim built systems.

Missing before outreach:
- Partner package/pricing.
- Fulfillment operations for issued bulk codes.
- Examples or sample campaign mockups.

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

## Recommended Pre-Deploy Checklist

- Configure Stripe and Supabase function secrets.
- Connect gift delivery email.
- Legal-review Privacy, Terms, and Refunds.
- Add App Store download or waitlist handoff.
- Add analytics for CTA clicks, form starts, form submits, and checkout redirects.
- Confirm production domain, SSL, and Open Graph image.
- Run a full mobile QA pass on homepage, pricing, gift, partners, and privacy.

## Vercel Configuration

- Root directory: `apps/web`
- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm build`
- Framework preset: Next.js
