# Account Deletion Release-Candidate Handoff

Date: 2026-07-24

Branch: `codex/olw-account-deletion`

Base: clean release lineage `origin/codex/olw-first-look-release` at `5560b74`
Implementation commits: `dba9fb2`, `5588ff7`, `82d8282`

## Outcome

The prior policy-only deletion gap is implemented end to end in source. Parents can
reach account controls from every lifecycle gate, export first, see the exact
role-derived impact, reauthenticate with a fresh email code, and explicitly confirm
permanent deletion. The server deletes only what the requester’s role owns:
sole-writer families and app-controlled media are removed; co-parent family history
stays with the remaining writer and loses the deleted author reference; Circle access
is removed without changing the family.

The implementation keeps the product invariant intact: private discovery candidates,
local Photos identifiers, face evidence, fingerprints, queue state, drafts, rejects,
and selection rationale remain device-only and never enter the deletion service,
audit ledger, analytics, notifications, or reports.

## Source map

- Parent flow: `apps/mobile/src/DeleteAccountScreen.js`,
  `accountDeletionModel.js`, `accountDeletion.js`, `accountDeletionLocal.js`.
- Lifecycle access: `SettingsMenuSheetScreen.js`, `SetupScreen.js`,
  `FamilyOnboardingScreen.js`, `PurchaseScreen.js`, route guards and stack routes.
- Local erasure: `mediaDb.js`, `tonightVoiceDrafts.js`,
  `sharedAnnotationDraftStore.js`.
- Database/RLS: `supabase/migrations/20260724120000_account_deletion_lifecycle.sql`.
- Edge: `supabase/functions/delete-account/index.ts` and
  `_shared/accountDeletion.ts`.
- Provider orphan safety: `create-stream-upload/index.ts` and
  `workers/media-gateway/src/accountDeletion.js`; the Worker deletion marker
  also denies an already-issued original-media session before cache lookup.
- Reproducible proof: `supabase/tests/account_deletion_lifecycle_test.sql`,
  Deno tests, mobile unit tests, and `scripts/qa-account-deletion-local.mjs`.

## Evidence captured before handoff

- Frozen dependency install completed.
- Fresh migration replay and schema lint passed.
- Account lifecycle pgTAP passed 39 assertions, including sole/additional/Circle
  classification, writer/membership locks, legal hold, cross-family Storage
  selection, billing minimization, auth deletion, and shared-author preservation.
- All repository SQL tests passed 133 assertions; the legacy identity migration
  replay passed 6 assertions through its host-psql harness.
- Edge and Worker checks passed; ten focused Deno tests passed, including the
  deleted-family marker overriding a valid media session before cache lookup.
- Repository tests passed with all 448 mobile unit contracts; repository lint,
  typecheck, build, the direct web production build, Expo lint, and Expo Doctor
  `20/20` passed.
- The real local HTTP journey passed with synthetic Auth users, two writers, a
  sole family, a shared family, Mailpit OTP, Supabase Storage, Edge orchestration,
  database finalization, and Auth hard deletion. Aggregate result: sole family and
  object deleted; shared family/object preserved; deleted membership removed;
  shared moment preserved with null attribution.
- Current Wrangler bundled the Worker successfully in dry-run mode. No Worker,
  Edge Function, schema, or binary was deployed to production.
- Provider readback found no Supabase preview branch. Production has
  `create-stream-upload` version 20 but no `delete-account` function, and the
  current media Worker deployment predates this branch. The latest EAS store build
  remains iOS `1.1.0` build `1.1.11` from base commit `5560b74`; it does not contain
  account deletion.
- The deterministic part of `pnpm smoke:mobile` passed `25/25`. Maestro stopped
  at its documented credential boundary because `OLW_SMOKE_DEV_CODE` is not
  present in an authorized local test profile. No credential was logged or invented.

## Release boundary

This branch is implementation and rehearsal evidence, not production evidence.
Before claiming account deletion in public product/marketing, complete the
non-production provider rehearsal, deploy in the authorized order from
`docs/account-deletion-operations.md`, build/install the exact signed client, and
exercise a synthetic physical-device deletion. A real family deletion remains a
parent action and must never be used as release QA.

There is currently no Supabase preview branch on the linked project, so a
representative remote schema/provider rehearsal could not be performed without
creating provider state. That creation, the shared deletion secret, and every
production mutation remain explicit release-authority boundaries.

Production actions still awaiting explicit authorization:

1. apply the additive migration;
2. set the new shared Worker/Edge deletion secret;
3. deploy the media Worker and affected Edge Functions;
4. build/upload the dependent signed client to an internal channel;
5. run provider-backed synthetic deletion and physical-device proof;
6. promote any public store release.
