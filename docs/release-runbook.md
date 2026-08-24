# Release and deployment runbook

Use this runbook for iOS/Android, web, Supabase/Edge Functions, database, and the
media Worker. It deliberately excludes current versions, build numbers,
branches, migration lists, resource IDs, and provider connection state.

## Authority boundary

A task requesting a testing release authorizes preparation, build, and upload to
an already configured internal testing channel after all gates pass. Production
deployment, public store submission or promotion, production OTA, DNS/domain or
paid-service changes, destructive/backward-incompatible migrations, secret
rotation, and privacy-scope expansion require explicit action-specific
authorization. Credentials confer capability, not permission.

## 1. Establish source and ownership

```bash
pnpm agent:inventory
git diff --check
git log -1 --oneline
```

Record the owning worktree, commit, intended environment/channel, and dirty-file
disposition. Release from a clean worktree unless every intentional exception is
committed and named in the receipt. Discover app version, build profiles,
identifiers, runtime policy, hosting targets, environment schema, and migrations
from current manifests/config/workflows and provider readback.

Verify provider identity and required variable names through Expo/EAS, Supabase,
Cloudflare, and hosting tools without displaying secret values. Missing access
should yield the failing command, profile/project, required scope, and login or
recovery command—not a copied secret.

## 2. Preflight

```bash
pnpm install --frozen-lockfile
pnpm agent:validate
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm db:reset:migrations
pnpm smoke:mobile
```

Run applicable Deno tests/checks for changed Edge Functions and the package's
Worker validation/deploy dry run. Audit staged files for secrets, private family
fixtures, real media, simulator screenshots, local databases, generated builds,
and exports. Reconcile public privacy/subscription/gift claims with exercised
behavior.

## 3. Database and service compatibility

Classify each schema change as additive, dual-read/write, backfill, cutover, or
destructive. Replay the entire migration chain against a fresh local database,
test RLS and direct API paths, and rehearse on a representative non-production
database. Confirm backup/restore or point-in-time recovery before production.

Prefer additive changes. Deploy server/Edge/Worker behavior that remains
compatible with current public clients before a dependent mobile build. Keep
private candidate data and local identifiers outside the shared schema. Use
idempotent, resumable backfills with progress/error output. Destructive production
work requires explicit authorization and a rehearsed rollback or forward-fix.

## 4. Mobile build and internal distribution

Choose profiles from the current mobile build config; do not copy a remembered
profile or build number. Build each affected platform with the repository-
supported EAS command. Confirm the provider artifact resolves to the recorded
commit/config, install it on a supported device, and repeat the primary smoke plus
the affected family/permission/lifecycle flow.

Upload to TestFlight internal or Play internal only when the task includes a
testing release. A cloud build is not install, processing, tester availability,
physical-device, or public-release evidence.

## 5. Web and service deployment

Build an immutable artifact from the recorded commit, excluding env files, key
material, local databases, private media, screenshots, and scratch output. Deploy
to preview first when supported. Exercise purchase/gift/auth/support/privacy flows
in a real browser at mobile and desktop widths, and probe Edge/Worker routes,
auth boundaries, media access, rate limits, and telemetry.

For production, deploy compatible database preparation, then backend/Edge/Worker,
then web, then dependent clients. Do not infer success from a provider badge;
exercise the end-to-end journey in the actual environment.

## 6. Public release, evidence, and recovery

Only with explicit authorization, submit the named build to store review or
promote the named release. Recheck privacy labels, subscription/gift terms,
screenshots, descriptions, support/privacy URLs, compliance answers, pricing,
and staged/phased settings. Capture provider IDs and visible status.

The generated release receipt includes repository/worktree/commit, discovered
versions/builds, target, checks, migration state, installed-device evidence,
deployment/build IDs, provider state, known exceptions, and rollback trigger—no
secrets or family content. Tag only the exact released commit with the established
repository convention.

Monitor crash/error, auth, write-denial, Edge/Worker, storage/media, purchase,
privacy-safe analytics, and the primary Today-to-Keep-to-Our-World journey. Halt a
staged rollout or restore compatible server traffic on failure. Preserve additive
data; do not “roll back” by deleting candidate ledgers or family records.
