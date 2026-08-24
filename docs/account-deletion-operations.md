# Account Deletion Operations

This runbook operates the implemented account-deletion lifecycle. It does not grant
production authority. Production migration, Edge/Worker deployment, secret changes,
or deletion of a real account require explicit action-specific authorization.

## Components and configuration names

| Owner | Source | Runtime configuration |
| --- | --- | --- |
| Database/RLS | `20260724120000_account_deletion_lifecycle.sql` | Supabase project connection |
| Edge orchestration | `supabase/functions/delete-account` | Supabase built-ins plus existing `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `STRIPE_SECRET_KEY`; new `MEDIA_GATEWAY_INTERNAL_URL`, `MEDIA_DELETION_SECRET` |
| Stream orphan tracking | `supabase/functions/create-stream-upload` | Existing Cloudflare credentials |
| R2 erasure | `workers/media-gateway/src/accountDeletion.js` | Existing `ORIGINALS` binding; new secret `MEDIA_DELETION_SECRET` |
| Mobile | `/settings-menu`, `/delete-account` | Existing Supabase public client configuration |

`MEDIA_DELETION_SECRET` is the same high-entropy secret on the Edge function and
media Worker. Set it through provider secret stores, never source, shell arguments,
reports, or logs. `MEDIA_GATEWAY_INTERNAL_URL` is configuration, not a credential.

## Pre-deployment rehearsal

1. Start a disposable local Supabase stack and replay every migration:
   `pnpm db:reset:migrations`.
2. Run all SQL contracts: `supabase test db supabase/tests/*.sql`.
3. Run Edge/Worker checks and tests:
   `deno check supabase/functions/delete-account/index.ts
   supabase/functions/create-stream-upload/index.ts
   workers/media-gateway/src/index.js` and
   `deno test supabase/functions/_shared/accountDeletion_test.ts
   workers/media-gateway/src/accountDeletion_test.js`.
4. Serve the function locally, then run
   `pnpm qa:account-deletion:local`. The script refuses a non-local Supabase URL,
   uses synthetic accounts/media only, consumes a local Mailpit OTP, verifies sole
   versus shared-family behavior, and removes its fixture.
5. Validate the Worker bundle without deployment using current Wrangler:
   `pnpm dlx wrangler@latest deploy --dry-run` from `workers/media-gateway`.
6. Rehearse the same migration and synthetic role matrix on a named,
   representative non-production Supabase project before any production action.
   Record only aggregate outcomes and provider object counts.

## Authorized deployment order

1. Confirm a database backup/PITR point and the exact clean source commit.
2. Apply the additive account-deletion migration.
3. Verify function grants, RLS, writer-lock behavior, and old-client compatibility.
4. Add the shared deletion secret to the media Worker and Edge Function secret
   stores without printing it.
5. Deploy the media Worker. Probe the internal route for unauthorized rejection and
   run an authorized synthetic R2-prefix deletion in non-production.
   Verify the persistent non-content deletion marker makes a previously valid
   original-media session return `410` before any cached response.
6. Deploy `create-stream-upload`, then `delete-account`.
7. Run the synthetic sole/additional/Circle matrix, Supabase Storage check,
   Stream/R2 check, Stripe test subscription cancellation, and auth hard-delete in
   non-production.
8. Build a clean signed client from the exact commit, distribute only to the
   authorized internal channel, and exercise export → preview → OTP → `DELETE` →
   local cleanup on a physical device with a synthetic account. Exercise a second
   installation too: revoke the account while it is offline, confirm server access
   stays denied, then reconnect and confirm revoked-session cleanup removes its OLW
   caches, drafts, notifications, and local session.
9. Roll out to a limited cohort only after aggregate error/attempt counts remain
   healthy. No deletion payload or account content enters analytics.

## Retry and recovery

- `prepared` or `cleanup_failed`: reauthenticate and retry. The stable user-owned
  request ledger is reused, roles/providers are re-inventoried, and locks renew.
- `provider_cleaned`: retry database finalization; do not recreate provider content.
- `database_deleted` or `auth_deleting`: retry hard Auth deletion. Shared records
  and retained legal rows are already detached/minimized.
- `completed`: return success idempotently.
- `blocked_legal_hold`: do not touch providers or data. Escalate through the legal
  process; lifting a hold is a separate authorized database action.
- Expired family lock: retry from inventory. Never bypass or lengthen a lock by
  weakening RLS.

The failure response to a parent stays generic. Detailed provider messages, paths,
emails, OTPs, media identifiers, and content must not enter logs or support tickets.
Operational reconciliation may query the service-only ledger for status, attempt
count, aggregate provider counts, and bounded error code.

## Rollback and forward fix

The schema is additive. If the client or orchestration must be halted, disable the
parent entry point or restore the previous compatible Edge/Worker version while
leaving the tables and nullable provider columns intact. Release expired locks by
normal expiry or a narrowly authorized request-level operation after checking the
ledger.

Never roll back by deleting families, account-deletion ledgers, retained billing
records, annotations, collections, parent exclusions, candidate ledgers, or shared
authorship. If provider cleanup completed but database finalization did not, forward
fix the request; do not restore deleted media into a family.
