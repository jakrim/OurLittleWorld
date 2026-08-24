# Curated Memory Library Operations

Status: local implementation and verification runbook. Nothing in this document is
evidence of a production deployment.

## Release boundary

The curated-memory program is complete in local source through Release 4 and the
final navigation/measurement stabilization slice. Production rollout remains a
separate, explicit operation.

The invariant is: private before Keep, shared only after parent confirmation.
Candidate rows, local asset identifiers, face evidence, perceptual fingerprints,
selection evidence, rejects, unavailable originals, queue/session IDs, and drafts
must not enter Supabase, push payloads, analytics, Sentry, or logs.

## Nightly notification ownership

Tonight queue readiness exists only in the device-local candidate ledger. Therefore:

- `tonightNotifications.js` is the only scheduler for `tonight_picks`;
- a real active non-empty writer queue is required;
- entitlement, preference, family timezone, quiet hours, duplicate schedule,
  completion, expiry, role, and daily-cap checks must all pass;
- the payload contains only a coarse count/date/state and
  `/tonight?source=notification`;
- `notify-event` rejects `tonight_picks`, even when a stored preference is enabled.

The remote category remains in shared preference constraints for compatibility, but
it is deliberately device-scheduled. Do not enable a server send until a privacy-safe
queue-readiness proof exists; do not upload the private queue to create that proof.

## Privacy-safe product metrics

All events are consent-gated by the central allowlist. Operational views may use:

- Tonight opened by direct, Today, or notification source;
- coarse queue-size and completion-count buckets;
- Keep, Skip, unavailable, media kind, fixed selection reason, and retry state;
- coarse completion-duration and enrichment buckets;
- factual collection exclusion/restoration by fixed collection kind;
- successful shared annotation kind: text, voice, or mixed.

Never add moment, candidate, session, asset, cluster, fingerprint, annotation, voice,
reaction, or collection IDs to product analytics. Never add authored content, paths,
URLs, scores, confidence, exact dates, birthdays, or location.

Recommended consented dashboards:

1. `tonight_opened` to `tonight_completed`, segmented by open source and coarse queue
   bucket.
2. Scheduled-notification to notification-open conversion, aggregated by day.
3. Keep/Skip/unavailable and retry distributions by fixed reason and media kind.
4. Completion duration and enrichment buckets.
5. Collection corrections and shared-annotation kinds.

Guardrail alerts should be aggregate and threshold-based: rising unavailable rate,
retry rate, Skip rate, queue-repeat test failures, scan duration bands, or migration
failures. Child-identity false positives remain a dedicated physical-device review
gate; never export face confidence or candidate examples to analytics.

## Weekly local QA

Use synthetic families and media only unless Jesse explicitly initiates the physical
device gate.

1. Run the full mobile test, lint, and typecheck gates.
2. Replay Supabase migrations from a fresh local database and run all pgTAP tests.
3. Run notification cadence tests and applicable Edge/Worker checks.
4. Exercise Today to Tonight to Keep to Our World, including photo, video, voice,
   collection correction, shared annotation, and export.
5. Repeat with empty queue, unavailable media, offline/retry, process termination,
   Circle, and lapsed states.
6. Recheck the 5,000-candidate and 5,000-saved-memory performance fixtures.
7. Audit staged files for private fixtures, secrets, simulator libraries, screenshots,
   generated builds, and unrelated work.

## Production rollout sequence

This sequence requires a separate explicit authorization:

1. Ship a compatible client that writes opaque shared media identity and can tolerate
   all additive schemas while the new features remain unreleased.
2. Replay and verify migrations in timestamp order through:
   `20260720210000`, `20260720211000`, `20260720220000`, and `20260720230000`.
3. Confirm RLS, active-writer write gates, Circle reads, lapsed read-only behavior,
   cascades, export queries, and migration ledger state in a non-production target.
4. Backfill or rotate legacy raw shared identifiers only after old writers can no
   longer recreate them. This is the compatibility gate; do not guess adoption.
5. Deploy the compatible Edge/Worker code. Keep remote Tonight delivery disabled.
6. Run signed-build synthetic smoke tests, then a two-writer test family.
7. Complete the real-device large-library gate for seven captured days, iCloud,
   background/Low Power Mode, notification timing, false positives, videos, and one
   two-parent loop.
8. Roll out gradually and watch only the privacy-safe aggregate guardrails above.

## Rollback and recovery

- Client rollback must leave additive tables in place; older compatible clients
  ignore them.
- Do not roll back by deleting candidate ledgers or shared family records.
- A local candidate migration failure must fail closed with actionable diagnostics;
  preserve the database and retry the idempotent migration.
- A Tonight partial Keep resumes the same canonical moment/media/voice/reaction IDs.
  Do not unlock Skip or create a replacement transaction.
- Notification issues are contained by disabling the device category preference or
  reverting the client scheduler; the remote function already refuses Tonight.
- Collection derivation can be refreshed from canonical kept facts. Parent exclusions
  and separately authored annotations must be preserved.
- Context facts can be regenerated from sources. Exact duplicate groups may be
  rebuilt from ready kept media, but neither original nor authored context is deleted.

## External release gates

The following are intentionally not complete in local source evidence:

- production migration/backfill;
- Edge/Worker deployment;
- EAS/TestFlight/App Store build or submission;
- real notification delivery on a signed physical device;
- seven-day validation against Jesse's real large photo library;
- production analytics project/token and consented dashboard observation;
- destructive account-deletion UI/backend, which remains governed by
  `docs/account-deletion-policy.md` and is not part of the curated-memory feature
  migrations.

These gates do not justify weakening privacy, copying a camera roll to the server, or
claiming production readiness from simulator/unit evidence alone.
