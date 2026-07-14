# Our Little World lifecycle measurement export

Status: implemented on `codex/olw-growth-measurement`, disabled by default, not
deployed.

## Purpose

This path exports coarse, authoritative lifecycle outcomes to the portfolio
measurement ledger so email exposure can be compared with activation and paid
outcomes. It is independent from the Mailchimp lifecycle outbox: a measurement
failure cannot delay Mailchimp state tags, journey exits, unsubscribe handling,
or transactional email.

## Privacy contract

- The database outbox stores only references to product-owned lifecycle rows;
  it has no email, child, caption, letter, media, invite, or gift-content column.
- Email exists only inside the service-role claim long enough to derive the
  product-scoped HMAC contact key. It is never written to the portfolio ledger
  or logs.
- Internal moment, memory, invite, First, Letter, family, and entitlement IDs
  never leave the product. A domain-separated HMAC becomes the portfolio
  `event_id`.
- The exported action time is the product lifecycle transition time, never the
  photo capture date, birthday, letter date, or other family-content date.
- Attribution is limited to server-sanitized campaign, angle, creative, and
  channel values.

## Runtime

- Migration: `20260714003000_marketing_measurement_outbox.sql`
- Edge function: `export-lifecycle-events`
- Default feature flag: off
- Worker authentication: existing `x-olw-worker-secret` verifier
- Central authentication: product-specific HMAC-SHA256 over the exact request
  timestamp and body
- Retry: leased rows, bounded delay, maximum eight attempts, then quarantine
- Consent: only currently subscribed, explicitly consented contacts can be
  claimed; withdrawal cancels pending, retrying, or claimed measurement work

Required runtime secrets:

- `LIFECYCLE_INGEST_URL`
- `LIFECYCLE_INGEST_OUR_LITTLE_WORLD_SECRET`
- `LIFECYCLE_CONTACT_KEY_SECRET`
- `OUR_LITTLE_WORLD_LIFECYCLE_EXPORT_ENABLED=true` only after controlled proof

## Verification completed

- Node contract tests prove deterministic cross-language contact keys, hashed
  internal event IDs, safe source classification, exact-body request signing,
  and HTTPS-only production endpoints.
- Deno type checking passes for the shared exporter and edge function.
- The complete repository test suite passes.
- PostgreSQL 17 migration proof passed in an isolated database: trigger enqueue,
  safe attribution claim, zero private outbox columns, and immediate consent
  cancellation.
- A TypeScript-generated signed Our Little World event was accepted by the
  Python portfolio ingress exactly once, with no raw email or internal event ID.

## Activation and rollback

Do not deploy or enable this exporter until the central HTTPS ingest service,
durable ledger, matching secrets, and controlled test identity are ready. Enable
the function separately from Mailchimp synchronization. To roll back, turn off
`OUR_LITTLE_WORLD_LIFECYCLE_EXPORT_ENABLED`; queued product events remain in the
measurement outbox and Mailchimp behavior is unchanged.
