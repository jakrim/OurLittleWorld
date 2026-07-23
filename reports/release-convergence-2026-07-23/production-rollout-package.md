# Our Little World controlled production rollout package

Prepared 2026-07-23. This package is preparation, not production authorization.

## Release invariant

Private before Keep; shared only after parent confirmation.

Unsaved candidates, local asset identifiers, face evidence, fingerprints,
selection rationale, drafts, rejects, unavailable originals, and private queue
state remain device-local. Remote Tonight delivery stays disabled.

## Candidate lineage

- Base: `polish-sprints` at `5ce3ee39e1256f852e5352699efe5d543045a3d1`
- Candidate: `codex/olw-first-look-release` at
  `5560b740d04269f538978da1c8377ebfaee52f30`
- Draft PRs: [#27](https://github.com/jakrim/OurLittleWorld/pull/27) and
  [#28](https://github.com/jakrim/OurLittleWorld/pull/28)
- Signed iOS candidate: 1.1.0 (1.1.11), EAS build
  `e533a90d-082a-4264-9fb6-13ec9cde6ec0`
- Native fingerprint:
  `72651e123f4b5f81facdb3cf705c567a8591fddb`
- Internal group only: `OLW Internal`; EAS submission finished and Apple
  processing is complete. App Store Connect reports `Ready to Submit`, one
  invite, and no recorded install.

## Additive migration set

1. `20260720210000_private_shared_media_identity.sql`
2. `20260720211000_shared_archive_write_and_authorship.sql`
3. `20260720220000_automatic_factual_collections.sql`
4. `20260720230000_grounded_context_and_shared_enrichment.sql`

The candidate also includes restart-safety fix `96493b3`, adding explicit
policy drops before policy recreation where repeat rehearsal exposed a collision.
Fresh local replay, schema lint, 94 pgTAP assertions, six direct legacy-identifier
assertions, and two consecutive migration reapplications passed. No
representative remote Supabase branch exists, and production has not been
changed.

## Minimum compatible-client adoption gate

Do not rotate or backfill legacy identifiers until every active writer in the
limited cohort uses clean build 1.1.11 or a later build derived from the same
compatibility contract. Remove older internal builds from active testing or
prove that their write paths cannot execute. Then verify:

1. New clients create only opaque identifiers.
2. Raw device identifiers are rejected at both RPC and direct API boundaries.
3. An old writer cannot recreate raw identifiers or duplicate a Keep.
4. Two distinct parents retain distinct authorship.
5. Lapsed and Circle roles cannot bypass write policy.
6. Export, correction, context invalidation, and account-removal preservation
   remain intact.

This gate is required before any legacy-ID backfill. A backfill requires a new,
action-specific authorization with exact row counts, lock/runtime estimates,
backup/restore proof, and a forward-fix plan.

## Authorized-order checklist

Run only after explicit production authorization:

1. Confirm the compatible client is installed by the limited cohort.
2. Snapshot production schema and aggregate row counts without content.
3. Apply the four additive migrations in order.
4. Verify migration ledger, RLS, direct API rejection, lifecycle access, and
   restart behavior.
5. Deploy only compatible Edge Functions and Worker code whose source commits
   are named in the release receipt.
6. Exercise the signed build with a synthetic two-writer family.
7. Start a limited cohort; do not enable remote Tonight delivery.
8. Monitor only privacy-safe aggregate health.
9. Expand gradually after the seven-day personal-library ledger is complete.

Check the resumable gate with
`node scripts/release/check-seven-day-library-ledger.mjs`. Use
`--require-complete` in the release decision so pending days exit non-zero.

## Forward-fix and rollback contract

Rollback never deletes family data. Preserve additive tables, candidate ledgers,
family records, parent exclusions, annotations, collections, context, and
shared authorship. Prefer disabling a new write path or shipping a compatible
client/forward migration over schema removal. A rollback decision must include:

- the last compatible build and service version;
- the failing contract and affected aggregate scope;
- the reversible flag or forward migration;
- export and lapsed-access validation;
- proof that private candidate state was never uploaded.

## Explicit authorization still required

- Cancel, replace, or advance App Store submission
  `759b593f-1283-475b-9077-eb348ca337ef`.
- Apply production Supabase migrations or repair the remote migration ledger.
- Deploy production Supabase Edge Functions.
- Deploy or change the Cloudflare media Worker or its bindings.
- Rotate or backfill legacy identifiers.
- Promote any TestFlight build to public App Store release.
- Deploy the web changes to production.
- Create or publish a Google Play listing.
- Make a paid, DNS, secret-rotation, or privacy-scope change.

## Stop conditions

Stop rollout on any raw identifier, private queue state, candidate content,
face/fingerprint evidence, cross-family data, missing separate authorship,
lapsed-write bypass, duplicate Keep, partial-write corruption, export leak, or
unbounded media/notification failure. Preserve evidence without private content,
disable the new path if possible, and forward-fix.
