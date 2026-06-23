# Production Readiness Audit

Last reviewed: June 23, 2026

## Current Status

The website is now a production-shaped Next.js marketing site, but it is not yet a production commerce site.

Users can browse the homepage, story, pricing, gift, partners, and privacy pages. They cannot complete a real purchase or gift unless checkout links or endpoints are configured in Vercel environment variables.

## Critical Launch Blockers

1. Real checkout is not connected.
   - Monthly and annual plan buttons need payment links or a checkout endpoint.
   - Set `NEXT_PUBLIC_OLW_CHECKOUT_MONTHLY` and `NEXT_PUBLIC_OLW_CHECKOUT_ANNUAL` in Vercel.

2. Gift purchase needs fulfillment logic.
   - A simple payment link can charge for a gift, but it will not automatically store recipient email, gift note, delivery day, redemption status, or delivery.
   - For a real "purchase for a friend" flow, use `NEXT_PUBLIC_OLW_GIFT_CHECKOUT_ENDPOINT` or an equivalent backend.

3. Partner inquiries need a destination.
   - The partner form needs a form endpoint, CRM endpoint, or mail handling flow.
   - Until configured, it falls back to an email link.
   - Set `NEXT_PUBLIC_OLW_PARTNER_INQUIRY_ENDPOINT` when ready.

4. Legal pages are incomplete for paid launch.
   - Privacy policy exists.
   - Terms of Service, subscription terms, cancellation policy, refund policy, and gift terms still need review and publication.

5. Post-purchase provisioning is undefined.
   - After payment, users need a clear handoff: App Store download, account creation, magic link, invite flow, or gift redemption.
   - Gift buyers need confirmation and recipient delivery status.

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

Purpose: help a family choose monthly/yearly or route gift buyers.

Current flow:
- Monthly, yearly, and gift year are clear.
- Launch pricing is intentionally low: $4.99 monthly, $3.99/month when billed yearly, and $48 for a gift year.
- Yearly is framed as best value.
- Form prepares checkout once configured.

Missing before paid launch:
- Real checkout links.
- Cancellation/refund language.
- What happens after checkout.
- Whether pricing is introductory, permanent, or limited.

### Gift

Purpose: make "purchase for a friend" a primary conversion path.

Current flow:
- Gift page speaks to baby showers, births, first birthdays, clients, employees, siblings, and close friends.
- Form collects giver, recipient, gift note, and delivery date.
- Preview makes the gift feel personal.

Missing before paid launch:
- Gift checkout endpoint or payment link.
- Recipient email delivery.
- Redemption code or invite creation.
- Gift confirmation email.
- Refund/cancellation handling.

### Partners

Purpose: start B2B2C conversations with photographers, doulas, registries, employers, and family brands.

Current flow:
- Partner categories are clear.
- Partner form has the right fields.
- Copy has been softened so it does not overclaim built systems.

Missing before outreach:
- Form endpoint.
- Partner package/pricing.
- Fulfillment model for codes, bulk gifts, and redemption tracking.
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
- Terms link.
- Support/account deletion process details.

## Recommended Pre-Deploy Checklist

- Configure monthly and annual checkout links.
- Build or connect gift checkout fulfillment.
- Connect partner inquiry endpoint.
- Add Terms, refund/cancellation, and gift terms.
- Add App Store download or waitlist handoff.
- Add analytics for CTA clicks, form starts, form submits, and checkout redirects.
- Confirm production domain, SSL, and Open Graph image.
- Run a full mobile QA pass on homepage, pricing, gift, partners, and privacy.

## Vercel Configuration

- Root directory: `apps/web`
- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm build`
- Framework preset: Next.js
