# Our Little World Website

This is the deployable Next.js marketing website for `ourlittleworld.me`.

It intentionally lives next to the Expo mobile app inside the monorepo:

- `apps/web` is the Vercel/Next.js website.
- `apps/mobile` is the Expo mobile app.
- Shared code can later live in `packages/*` without nesting the website inside the app.

## Local Development

From the repo root:

```sh
pnpm install
pnpm dev:web
```

Then open `http://localhost:3000`.

You can also run the site directly from this folder:

```sh
cd apps/web
pnpm dev
```

## Routes

- `/`
- `/story/`
- `/pricing/`
- `/gift/`
- `/partners/`
- `/privacy/`
- `/terms/`
- `/refunds/`

`Begin Chapter One` points to `/pricing/#chapter-one`.
`Gift the first year` points to `/gift/`.

## Vercel Deployment

Create a Vercel project with:

- Root directory: `apps/web`
- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm build`
- Output: Next.js default

## Production Checkout Configuration

Purchases and gifts are honest fallbacks until production checkout is wired. Configure these public env vars in Vercel:

```sh
NEXT_PUBLIC_OLW_CONTACT_EMAIL=support@ourlittleworld.me
NEXT_PUBLIC_OLW_CHECKOUT_MONTHLY=https://...
NEXT_PUBLIC_OLW_CHECKOUT_ANNUAL=https://...
NEXT_PUBLIC_OLW_CHECKOUT_GIFT=https://...
NEXT_PUBLIC_OLW_GIFT_CHECKOUT_ENDPOINT=https://...
NEXT_PUBLIC_OLW_PARTNER_INQUIRY_ENDPOINT=https://...
```

- `NEXT_PUBLIC_OLW_CHECKOUT_MONTHLY` and `NEXT_PUBLIC_OLW_CHECKOUT_ANNUAL` can be hosted checkout/payment links for the family plans.
- `NEXT_PUBLIC_OLW_CHECKOUT_GIFT` can be a simple gift payment link.
- `giftCheckoutEndpoint` is preferred for real gifting because it can store recipient email, gift note, delivery date, redemption code, and payment state.
- `partnerInquiryEndpoint` is required if the partner form should submit without relying on email fallback.

If these values are blank, the forms do not fake success. They show an honest fallback message with an email link.

## Privacy-safe acquisition analytics

The website has a provider transport for landing, CTA, checkout, and gift events.
It sends only allowlisted campaign, product, path, and anonymous attribution data.
It never reads form names, email addresses, recipient details, gift notes, claim
codes, or redemption codes.

Use a dedicated Our Little World PostHog project and configure:

```sh
NEXT_PUBLIC_OUR_LITTLE_WORLD_ANALYTICS_POSTHOG_API_KEY=phc_...
NEXT_PUBLIC_OUR_LITTLE_WORLD_ANALYTICS_POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_OUR_LITTLE_WORLD_ANALYTICS_ENVIRONMENT=production
NEXT_PUBLIC_OUR_LITTLE_WORLD_ANALYTICS_DEFAULT_CONSENT=unknown
```

`unknown` is the safe default and prevents delivery. Change the default to
`granted` only when the product's consent policy permits it, or store
`olw.analytics-consent.v1=granted` after an explicit preference action. Do not use
a Get Mentors or LiveVault project token.
