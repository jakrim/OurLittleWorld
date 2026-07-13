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
- `/privacy/`
- `/terms/`
- `/refunds/`
- `/for/unfinished-baby-book/`

`/partners/` is retained in source behind `NEXT_PUBLIC_OLW_PARTNERS_ENABLED`, but
returns a noindex 404 and is excluded from navigation and the sitemap while the
program does not exist. `robots.txt` does not hide the URL so crawlers can observe
the 404 and remove any stale listing.

## Vercel Deployment

Create a Vercel project with:

- Root directory: `apps/web`
- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm build`
- Output: Next.js default

## Commercial and store availability

The public site defaults closed. Configure the explicit state variables in Vercel:

```sh
NEXT_PUBLIC_OLW_CONTACT_EMAIL=support@ourlittleworld.me
NEXT_PUBLIC_OLW_COMMERCE_STATE=coming_soon
NEXT_PUBLIC_OLW_STORE_AVAILABILITY=coming_soon
NEXT_PUBLIC_OLW_APPLE_APP_STORE_URL=
NEXT_PUBLIC_OLW_GOOGLE_PLAY_URL=
NEXT_PUBLIC_OLW_APPLE_APP_ID=6781823693
NEXT_PUBLIC_OLW_ANDROID_PACKAGE=com.jessekrim.ourlittleworld
NEXT_PUBLIC_OLW_STORE_LAUNCH_DATE=
NEXT_PUBLIC_OLW_PARTNERS_ENABLED=false
```

- Commerce states are `coming_soon`, `test`, `live`, and `temporarily_unavailable`.
- Store states are `coming_soon`, `available`, and `temporarily_unavailable`.
- Store links render only for official `apps.apple.com` or `play.google.com` URLs.
- Checkout forms render only in explicit `test` or `live` commerce states.
- The production default is `coming_soon`; it does not accept payment.

Stripe Checkout Sessions are created only by Supabase Edge Functions. Price IDs,
claim-code creation, webhook verification, canonical purchase records, and
transactional-email outbox state remain server-side. Success-page parameters do
not grant access; they only ask the server to verify the Stripe session and
canonical record.

Gift delivery requires `OLW_TRANSACTIONAL_EMAIL_PROVIDER`, provider credentials,
`OLW_TRANSACTIONAL_FROM`, and an authenticated scheduler calling
`send-transactional-email`. Do not set commerce to `live` until those gates and
the legal/store gates in `PRODUCTION-READINESS.md` are complete.

## Consent-aware measurement

Web analytics is disabled until a visitor explicitly allows it. Configure only
a dedicated Our Little World PostHog project token using the variables documented
in `.env.example`. The browser stores only allowlisted campaign, angle, creative,
channel, and landing-page dimensions; denying or revoking consent clears that
local attribution and the anonymous analytics identifier.

The same allowlisted first-touch and last-touch attribution is submitted to the
checkout Edge Functions, copied into Stripe metadata, retained by the webhook,
and attached to the family entitlement when a website or gift code is redeemed.
Private checkout fields are never placed in analytics payloads. The launch list
is first stored in the consent-only `marketing_contacts` ledger, then synchronized
through a retryable server-side outbox to the dedicated `Our Little World Website
Launch` Mailchimp audience. Signed provider webhooks feed unsubscribe, complaint,
bounce, and confirmed resubscribe state back into the canonical ledger. Website
interest never enters the separate parent-product onboarding audience.

## Website operations

- `/api/health/` is a no-store, noindex liveness endpoint for the public site.
- Supabase dispatches route and marketing work every five minutes, evaluates
  operational alerts every ten minutes, and keeps durable open/resolved records.
- Marketing contacts are RPC-only; direct table access is denied even with the
  service role. Consent history is append-only and suppression wins over form
  resubmission until the provider confirms a new subscription.
- The launch-signup function acknowledges after durable enqueue. Mailchimp
  delivery is asynchronous, leased, idempotent, and retried with a terminal
  quarantine instead of blocking the browser request.
