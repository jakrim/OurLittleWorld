# Session 019f688d release convergence

**Evidence date:** 2026-07-23
**Release status:** clean signed candidate built; internal TestFlight upload
scheduled; not production-ready because physical-device, two-writer,
non-production remote migration, external-media, notification, and seven-day
personal-library gates remain open.

## Outcome

The July 21 curated-memory implementation is no longer stranded in a local-only
branch, and the later mixed working tree is no longer the only source of the
First Look, subscription, billing, web, release, and native-matcher work.

- The seven curated-memory commits were pushed without rewriting
  `origin/polish-sprints`.
- Draft PR [#27](https://github.com/jakrim/OurLittleWorld/pull/27) makes the
  curated lineage reviewable against `master`.
- Later source was reconstructed into nine coherent commits on
  `codex/olw-first-look-release`.
- Draft PR [#28](https://github.com/jakrim/OurLittleWorld/pull/28) layers that
  release work on `polish-sprints`.
- A signed clean iOS candidate exists from exact commit `5560b74`, version
  1.1.0 (1.1.11), EAS build `e533a90d-082a-4264-9fb6-13ec9cde6ec0`.
- The canonical dirty checkout and the separate growth-measurement worktree
  were preserved. No reset, clean, stash, history rewrite, merge, production
  deploy, migration, backfill, or public release was performed.

The governing trust invariant remains:

> Private before Keep; shared only after parent confirmation.

## Branch, worktree, and commit disposition

| Checkout | Branch / commit | Disposition |
| --- | --- | --- |
| `/Users/jessekrim/Desktop/ourLittleWorld` | `polish-sprints` / `5ce3ee3` | Canonical dirty checkout preserved. Seven curated commits now match `origin/polish-sprints`. |
| `/Users/jessekrim/Desktop/ourLittleWorld-curated-rc` | `codex/olw-curated-rc` / `5ce3ee3` | Clean verification checkout for the curated base. A generated Deno lock from verification was removed after proving it was untracked and reproducible. |
| `/Users/jessekrim/Desktop/ourLittleWorld-first-look-release` | `codex/olw-first-look-release` / `5560b74` | Clean reconstructed source and signed release-candidate owner. Pushed. |
| `/Users/jessekrim/Desktop/ourLittleWorld-release-evidence` | `codex/olw-release-evidence` / based on `5560b74` | Report-only owner for this inventory, receipts, ledger, and HTML report. |
| `/Users/jessekrim/Desktop/app-marketing/_worktrees/olw-growth-measurement` | `codex/olw-growth-measurement` / `76c4345` | Clean, pushed, and intentionally separate. |

### Curated commits

| Commit | Scope |
| --- | --- |
| `b70ecc5` | Durable private candidate ledger |
| `54f6fac` | Tonight ritual MVP |
| `3c24a20` | First-year catch-up engine |
| `58d1e59` | Opaque shared identity and parent authorship |
| `cb2fb23` | Automatic factual collections |
| `5024648` | Grounded shared context and invalidation |
| `5ce3ee3` | Final product/privacy stabilization |

### Later reconstructed commits

| Commit | Isolated scope |
| --- | --- |
| `d3f462a` | Repository validation contracts and runbooks |
| `ff75b0e` | Expo 57 runtime, dependency lock, native patches |
| `ffb0835` | Bounded native PhotoKit/iCloud matcher reads |
| `643f9c1` | Device-local First Look, paywall, redemption, mobile analytics |
| `f09c0f1` | Billing and provider verification |
| `0b8b809` | Web checkout verification and consent analytics |
| `2d16eae` | Primary mobile smoke flow |
| `96493b3` | Restart-safe curated migrations |
| `5560b74` | Deterministic iOS 1.1.11 release-candidate profile |

## Dirty-file ownership

The machine-readable inventory expands the canonical Git status into 124
individual files, including directory contents:

| Workstream | Files | Disposition |
| --- | ---: | --- |
| Subscription / paywall / First Look | 33 | Reconstructed in `643f9c1` |
| Backend billing / provider verification | 9 | Reconstructed in `f09c0f1`; not deployed |
| Web / marketing / analytics | 39 | Product web changes in `0b8b809`; active App Store asset work remains quarantined |
| Release / smoke tooling / runbooks | 18 | Reconstructed across `d3f462a`, `ff75b0e`, `2d16eae`, and `5560b74` |
| Native matcher / media ingestion | 1 | Reconstructed in `ffb0835` |
| Generated reports / research artifacts | 21 | Preserved locally; excluded from release source |
| Unknown / overlapping | 3 | Editor metadata remains excluded; one test overlap is explicitly carried in `643f9c1` |

The curated-memory roadmap has no remaining dirty source ownership: its seven
commits are already committed and now remote. The growth-measurement worktree is
clean and outside this inventory by design.

See
[`change-inventory.json`](../reports/release-convergence-2026-07-23/change-inventory.json)
for hashes, sizes, modification times, ownership evidence, and per-file
disposition; see
[`change-inventory.md`](../reports/release-convergence-2026-07-23/change-inventory.md)
for a readable file-by-file table.

## Verification

### Source and build gates

- Frozen dependency installation: passed.
- `pnpm agent:inventory` and `pnpm agent:validate`: passed.
- Expo Doctor: 20/20 checks passed.
- Full mobile test suite: 439/439 passed.
- Lint and typecheck: passed for mobile and web.
- Web production build: passed, 16 pages.
- Secret scan and `git diff --check`: passed.
- Vercel preview checks on PRs #27 and #28: passed; no production web deploy.

### Curated high-risk contracts

Focused privacy and curated-memory tests passed, including candidate-ledger
durability, scan/review independence, opaque identity and raw-ID rejection,
idempotent Keep/retry, lapsed/Circle write boundaries, separate authorship,
collection correction, context invalidation, export rules, notification
ownership, and account-removal authorship preservation.

Performance fixtures passed:

- 5,000-candidate ledger: approximately 450 ms insert, 16 ms query, 3.17 MB.
- 5,000 opaque identities: approximately 112 ms insert, 5 ms lookup, 1.57 MB.
- 5,000-item Tonight queue evaluation: approximately 17.6 ms.
- 5,000 saved-memory collection/context evaluation: approximately 24 ms.

These are deterministic test fixtures, not proof of a real iCloud library.

### Migration and service rehearsal

The fresh local Supabase stack was restored without deleting preserved volumes.
The full migration chain replayed from zero, schema lint passed, pgTAP passed
94/94, and the direct legacy-identifier script passed 6/6. The four curated
migrations then reapplied twice in order.

The first repeat exposed policy-name collisions in migrations
`20260720220000` and `20260720230000`. Commit `96493b3` adds explicit
`drop policy if exists` statements, and the double reapply passed afterward.

Billing Deno tests passed 3/3. Notification cadence tests passed 4/4 and remote
Tonight delivery remains refused. The media Worker passed a Wrangler 4.114.0
dry-run with its declared bindings; a live unsigned probe was denied with
HTTP 401 and `x-olw-cache: denied`; it was not deployed. The current deployed
Worker version remains `b9d559ac-8031-4a8f-81f4-4ee6058389b7`. Supabase has no
representative non-production branch/project, so the remote rehearsal remains a
real open gate rather than a claimed pass.

## Clean signed candidate

| Field | Value |
| --- | --- |
| Repository | `jakrim/OurLittleWorld` |
| Commit | `5560b740d04269f538978da1c8377ebfaee52f30` |
| Version | 1.1.0 |
| Build | 1.1.11 |
| EAS profile | `release-candidate` |
| Environment | `production` |
| Expo SDK | 57.0.0 |
| EAS build ID | `e533a90d-082a-4264-9fb6-13ec9cde6ec0` |
| Fingerprint | `72651e123f4b5f81facdb3cf705c567a8591fddb` |
| Distribution | Apple store-signed |
| Internal group | `OLW Internal` |

The artifact was built from a clean commit and the EAS fingerprint matched the
pre-build fingerprint. Its internal TestFlight submission was scheduled as EAS
submission `6f942a79-12b9-49b6-b38b-3892e46938e8`. App Store processing was
not yet visible when this evidence snapshot was written; EAS reported the
submission as `IN_QUEUE`.

## Runtime gates

The deterministic portion of `pnpm smoke:mobile` passed 25/25 privacy and
persistence assertions. Maestro then stopped because `OLW_SMOKE_DEV_CODE` was
not present in the current environment or repository env files. No value was
requested or exposed.

Both registered physical iPhones were offline. Therefore the following are
correctly open:

- install and launch of signed 1.1.11 on a physical iPhone;
- synthetic two-writer separate authorship and role boundaries;
- local candidate privacy observed across two devices;
- Keep/Skip, text, voice, photo, video, retry/interruption, collections,
  grounded context, correction/invalidation, lapsed/Circle, and export in the
  signed binary;
- signed Cloudflare video playback and voice delivery with authorized
  synthetic media;
- physical notification scheduling and tap;
- offline, iCloud, backgrounding, process termination, and Low Power Mode;
- seven captured days against Jesse's authorized personal library.

The durable resumable
[`seven-day-library-ledger.json`](../reports/release-convergence-2026-07-23/seven-day-library-ledger.json)
records these without private media or candidate evidence. The release is not
called complete early.

## Provider truth and unexpected public submission

No production Supabase migration, Edge Function, Cloudflare Worker, web deploy,
identifier rotation, or backfill was performed. There is no Google Play listing
for Our Little World.

App Store Connect now contains public submission
`759b593f-1283-475b-9077-eb348ca337ef`, created July 23 at 4:04 PM by API user
`89ZANNGUT8`. It is **Waiting for Review** and contains:

- iOS app 1.1.0 using older build 1.1.10;
- Family Monthly;
- Family Yearly;
- the Our Little World Plans subscription group.

This task did not create that public submission. It is configured for
**manual release**, so App Review approval alone will not make it public.
Changing or canceling it is an explicit external authorization boundary.

## Account deletion gap

Account deletion is not implemented. The authorship-preservation migration
solves record attribution after a user leaves; it does not provide a user-facing
deletion request, reauthentication, provider cleanup, storage cleanup, or auth
identity deletion.

The smallest coherent follow-up is:

1. Add a settings entry with export-first guidance, consequence summary, and
   reauthentication.
2. Add an idempotent deletion-request ledger and orchestrating Edge Function.
3. Handle sole-writer, co-parent, Circle, lapsed, purchaser, gift, and pending
   billing cases independently.
4. Preserve shared authorship while removing private drafts, device state, push
   registrations, recoverable storage objects, provider/customer links, and the
   auth identity in a documented order.
5. Expose partial progress and safe retry; never report completion after only
   client sign-out.
6. Test export-before-delete, interrupted deletion, two-parent preservation,
   retention/legal exceptions, and Apple account-deletion compliance on a
   signed build.

## Marketing position

The product is best positioned as relief from camera-roll overwhelm: a private,
calm family-memory ritual that helps parents notice a small number of meaningful
moments, confirm what is worth keeping, and share only those confirmed memories
with one trusted family space. The useful emotional promise is less organizing
and more remembering without turning family life into a public feed.

Safe claims today:

- a private family timeline for photos, notes, Firsts, and letters;
- no public feed, likes, or audience-building loop;
- parents decide what becomes a shared memory;
- private candidate review happens before Keep in the candidate build;
- lapsed families retain documented read/export behavior, subject to the
  stated export format limitations.

Withhold until runtime and release gates pass:

- availability of Tonight, automatic collections, or grounded context in the
  public app;
- flawless results on large personal libraries;
- perfect face/identity matching;
- complete account deletion;
- full-fidelity export of every video and voice asset;
- production-ready two-parent, external playback, or notification claims.

## Production authorization boundary

The exact prepared order and rollback contract are in
[`production-rollout-package.md`](../reports/release-convergence-2026-07-23/production-rollout-package.md).
Explicit action-specific authorization is still required for the public
submission, production migrations, migration-ledger repair, Edge/Worker
deployment, identifier rotation/backfill, web production deploy, public store
release, Google Play listing, paid changes, DNS, secrets, or privacy-scope
expansion.

## Smallest remaining blockers

1. Decide whether to cancel/replace or retain the older 1.1.10 public App Review
   submission.
2. Bring an authorized physical iPhone online and install 1.1.11 from the
   internal group.
3. Supply the existing smoke authentication capability through its approved
   environment, then run the signed synthetic two-writer journey.
4. Complete external media, voice, notification, iCloud, offline/background,
   termination, and Low Power Mode gates.
5. Provide a representative non-production Supabase branch/project for remote
   compatibility rehearsal.
6. Complete the seven-day personal-library ledger with Jesse's participation.
7. Implement and separately review account deletion.
