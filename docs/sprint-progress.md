# Sprint Progress — Polish Backlog

Loop state: COMPLETE WITH RECORDED BLOCKERS + INDEPENDENT REVIEW PASS DONE (2026-07-06). Working branch: `polish-sprints`. Source of truth: `docs/polish-backlog.md`.

## Curated Memory Library audit and delivery plan (2026-07-18)

- Audited the current mobile routes, Today/Add/Our World flows, scan/checkpoint lifecycle, local media database, review state, day-first curation, best-photo and video models, moment enrichment, family-library contract, notifications, analytics, and supporting Supabase schema against the requested daily plus historical curated-memory vision.
- Created the repo-native implementation plan at `docs/curated-memory-library-plan.md` and the visual review at `reports/curated-memory-library-review-2026-07-18.html`.
- P0 finding: full-scan candidates and review decisions are not a durable historical backlog. The scan controller owns candidates in memory, the local SQLite index does not persist unsaved discovery candidates, and a completed checkpoint makes later scans normally look back only three days. The proposed first release separates analyzed from reviewed state and adds a private on-device candidate ledger plus a crash-safe nightly queue.
- Product recommendation: keep `Today` → `Add` → `Our World`, make Tonight's three-to-seven memory cards the primary Today ritual, move archive browsing out of Today, retain the dense review grid as an advanced utility, and keep printing/export secondary.
- Partner recommendation: discovery remains private to each parent's phone; kept memories form the shared family archive; post-save duplicate grouping must preserve each parent's original and authored context.
- Verification: focused daily-curation, Tonight, best-photo, partner-library, scene-label, and factual-caption tests passed 25/25; `git diff --check` passed for the new artifacts; HTML validation with `tidy` passed; and the full HTML document was rendered headlessly in Chrome and visually inspected. Expo MCP/runtime walkthrough was not used because the active MCP and booted simulator belong to the Get Mentors project; no process was interrupted and no production state changed.

## Curated Memory Library Release 0 foundation and Tonight slice (2026-07-18)

Status: implemented and verified locally on `polish-sprints`; no production deploy,
remote migration, push, App Store action, or notification deployment was performed.

### Durable design decisions

- Local SQLite schema version `1` adds `discovery_candidates`,
  `candidate_clusters`, `candidate_cluster_members`, `nightly_review_sessions`, and
  `nightly_review_items` through a restart-safe `pragma user_version` migration.
  Candidate rows are family-and-parent scoped and use constrained lifecycle values:
  `discovered`, `eligible`, `queued`, `shown`, `kept`, `skipped`, `unavailable`,
  `rejected`, and `superseded`.
- Scan checkpoints remain independent of review. Foreground, background, and manual
  writer scans persist analyzed candidates in bounded transactions before updating
  live scan state; checkpoints advance only after a complete scan. Repeated scans
  upsert by scoped asset identity, reuse current-version analysis, preserve parent
  decisions, and cannot make the historical backlog unreachable.
- Discovery evidence, asset identifiers, fingerprints, rejects, selection reasons,
  queue state, and drafts remain on the device. The candidate store has no Supabase,
  analytics, Sentry, or PostHog transport. Circle and inactive-entitlement states
  fail closed before Photos access or ledger reads/writes. Only Keep enters the
  existing `Tags.setBaby` and `Memories.setMine` path.
- One active Tonight session is allowed per family/parent. An unfinished session
  resumes without expiry until it is complete; completion suppresses another queue
  on the same local day. Queue and decision writes are transactional, and Keep uses
  `saving`/`failed`/`done` commit state around the existing idempotent upload path.
  After a partial non-availability Keep failure, the same item must be retried and
  cannot be skipped or replaced, preventing a later local decision from hiding a
  retryable shared save.
  Unavailable cards retain their ordered position and can recover to `shown` without
  silently advancing the session.
- The deterministic queue returns zero to seven items without padding: up to three
  strong recent candidates, up to three historical coverage/standout candidates,
  and one qualifying special video where available. It excludes already shown,
  decided, rejected, unavailable, and superseded items and exposes only fixed,
  parent-readable reason copy.
- `/tonight` is a protected full-screen photo/video ritual with factual date and age,
  one-line local draft autosave, Keep, Skip, iCloud recovery, native Photos escape,
  completion, and a secondary advanced Review grid. Today uses the real queue count;
  repair/trust/safety cards continue to outrank Tonight. `tonight_picks` now routes to
  `/tonight`.

### Scoped files

- Ledger and queue: `apps/mobile/src/mediaDbSchema.js`, `mediaDb.js`,
  `candidateLedgerModel.js`, `candidateLedgerStore.js`, and
  `nightlyQueueModel.js`.
- Scan integration and trust boundaries: `scanController.js`,
  `libraryScanLauncher.js`, `ScanProgressScreen.js`, `ReviewMatchesScreen.js`,
  `useForegroundAutoIngest.js`, and `backgroundAutoIngestTask.js`.
- Product surface and routing: `TonightScreen.js`, `app/tonight.jsx`,
  `TodayScreen.js`, `dayCardNudge.js`, `photoIngestionTrustModel.js`, and the local
  notification route/settings contracts.
- Deterministic proof: `candidateLedgerModel.test.js`,
  `mediaDbSchema.test.js`, `nightlyQueueModel.test.js`,
  `curatedMemoryContracts.test.js`, plus the touched Today/notification tests.
- Durable documentation: `docs/current-product-state.md`, `docs/architecture.md`,
  `docs/curated-memory-library-plan.md`, this sprint log, and
  `reports/curated-memory-library-review-2026-07-18.html`.

### Performance and bounds

Measured on the local development Mac with 5,000 deterministic, non-personal rows:

- schema migration: `1.785 ms`;
- bounded upsert: `80` rows maximum in memory/transaction, `171.486 ms` total,
  `29,157 rows/sec`;
- candidate query: `211` lightweight rows returned under the `900`-row cap in
  `11.464 ms`;
- deterministic seven-item queue generation: `6.524 ms`;
- current-model cache read: all `5,000` asset keys in `2.468 ms`;
- active-session resume query: `0.087 ms`;
- database impact for the compact 5,000-row fixture: `2,326,528 bytes` (`2.219 MiB`).

Named bounds: candidate persistence batch `80`; foreground photo analysis batch
`60`; video analysis batch `8`; live JavaScript match cap `600`; nightly candidate
query cap `900`; cached-analysis key cap `10,000`; Tonight draft cap `280` characters.

### Verification and runtime evidence

- Focused ledger/schema/queue/privacy contracts: `27/27` passed after the final
  unavailable-state repair.
- Closing gates: `pnpm test` passed web typecheck plus all `345` mobile unit tests;
  `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` passed; `pnpm lint`
  passed both packages; `pnpm typecheck` passed both packages; `pnpm build` completed
  the production Next.js build; `deno check supabase/functions/notify-event/cadence.ts`
  passed; and `git diff --check` passed. The iOS Debug simulator build used isolated
  DerivedData at `/tmp/olw-tonight-derived` and completed with `BUILD SUCCEEDED`.
- iPhone 16e local-only QA exercised: playable video; photo aspect fit; factual
  date/age/reason; draft autosave; forced termination and deep-link relaunch; failed
  Keep with private parent-safe error; successful image Keep through the canonical
  local Supabase upload/moment path; one-line memory persistence; Skip; session
  position restoration; unavailable/iCloud card and recovery; native Photos picker;
  advanced Review route; completion; honest no-queue; Circle denial; lapsed/read-only;
  dark appearance; accessibility-extra-extra-large text; Reduce Motion; and controls
  reachable by scroll on the compact 390x844-point simulator.
- Canonical successful Keep proof in the disposable local stack: one `photo_tags` row
  reached `upload_status=ready`, linked one moment and stored media, and the authored
  memory note persisted with length `32`. The earlier video Keep intentionally failed
  because the local Edge runtime has no Cloudflare credentials; retry stayed on the
  same card, exposed no provider/configuration string after the fix, and created no
  duplicate moment.
- Ignored evidence root:
  `tmp/evidence/curated-memory-library-2026-07-18/`. Retained non-personal examples
  include `tonight-photo-queue.png`, `tonight-photo-after-relaunch.png`,
  `advanced-review-from-tonight.png`, `tonight-unavailable-recovery.png`,
  `tonight-completion.png`, `tonight-no-queue.png`,
  `tonight-dark-large-text-reduce-motion-refined.png`,
  `tonight-circle-private.png`, and `tonight-lapsed-read-only.png`. Native-picker and
  other screenshots containing the simulator's existing private photo thumbnails
  were deleted and are not task artifacts.
- Expo MCP was deliberately not attached because the exposed session and active
  iPhone 16 Pro belong to Get Mentors. The isolated iPhone 16e, local Metro on 8092,
  Maestro, `simctl`, screenshots, logs, and disposable local Supabase stack were used
  instead. The existing Today fixture retained a legitimate photo-trust repair card,
  so runtime correctly kept that repair above Tonight; deterministic Today tests prove
  the real queue becomes the primary card when no repair/safety issue owns the slot.

### Next roadmap slice

The single best next slice is parent-authored enrichment inside Tonight: add durable
voice-note capture, emoji/favorite, and editable AI-suggested factual organization on
top of the now-stable candidate/session foundation. Keep every suggestion optional,
source-aware, and local until the parent confirms the memory; do not add automatic
milestone or developmental claims.

## Curated Memory Library Release 1 — Tonight's memories MVP (2026-07-20)

Status: implemented and verified locally on `polish-sprints` from Release 0 commit
`b70ecc5`. No push, deploy, remote migration, production notification, App Store,
TestFlight, signing, or production-data action was performed.

### Product and durable contracts

- Tonight is now a complete inline ritual. Each photo or video card supports the
  existing one-line draft plus voice record/stop/play/delete/re-record, explicit
  favorite, two restrained reactions, factual date/age/reason, Keep, Skip, native
  Photos replacement, and the secondary advanced Review grid. A best-of-burst card
  can expand up to 12 eligible local alternates and keeps the recommended frame
  selected until the parent chooses another.
- Local SQLite schema version `2` adds `nightly_review_enrichment`, keyed and
  constrained by session position plus family/parent scope. It persists the selected
  burst asset, private voice URI/metadata, favorite/reaction, stable retry and
  canonical moment/voice identities, media/text/voice/reaction commit states, and
  temporary-file cleanup state. The version-1 item order, decisions, text drafts,
  uploads, saved media, mappings, and scan checkpoints remain intact.
- Text, voice, favorite/reaction, and alternate selection remain private until Keep.
  The current writer owns new context. Keep continues through `Tags.setBaby`,
  `Memories.setMine`, the established voice-note uploader, and `moment_reactions`;
  it does not introduce another moment, upload, or remote candidate model. Stable
  identities and per-step states make repeated Keep safe after media, voice, or
  reaction partial success. Once any shared write starts, Skip and replacement stay
  locked until that transaction resolves. Skip before a shared write removes only
  the private draft and temporary recording.
- Voice files are copied into the app's private document area for relaunch safety.
  Delete/re-record/Skip cleans only that temporary file; successful Keep cleans it
  after the canonical voice step. App backgrounding stops an active recording and
  preserves the completed local draft. Microphone denial offers Settings without
  weakening the permission boundary.
- A real active non-empty queue drives local Tonight notification readiness. The
  scheduler observes category preference, family-local ritual time and timezone,
  quiet hours, the device's daily scheduled-notification cap, duplicate queue/date,
  writer role, active entitlement, and completion/expiry state. Payload data contains
  only `/tonight`, category, coarse ready state/count, and local queue date; it has no
  session ID, asset ID, draft, face, fingerprint, or score.
- Today still gives repair, permission, billing, and trust-safety work priority. When
  none owns the primary slot, the real queue count supplies Tonight's action; an empty
  queue produces no ritual card. Circle and lapsed users cannot read or mutate the
  private ledger.

### Scoped implementation

- Ledger and migration: `apps/mobile/src/mediaDbSchema.js`,
  `candidateLedgerStore.js`.
- Canonical commit and enrichment: `TonightScreen.js`, `tonightCommit.js`,
  `tonightCommitModel.js`, `tonightEnrichmentModel.js`, `tonightVoiceDrafts.js`,
  `moments.js`, and `storage.js`.
- Queue-aware entry and privacy: `TodayScreen.js`, `tonightNotificationModel.js`,
  `tonightNotifications.js`, and `analyticsEventsModel.js`.
- Proof: `mediaDbSchema.test.js`, `nightlyQueueModel.test.js`,
  `tonightCommitModel.test.js`, `tonightEnrichmentModel.test.js`,
  `tonightNotificationModel.test.js`, and `curatedMemoryContracts.test.js`.
- Durable state: `docs/current-product-state.md`, `docs/architecture.md`,
  `docs/curated-memory-library-plan.md`, and this log.

### Performance and tunables

Measured with deterministic non-personal fixtures on the local development Mac:

- schema v2 migration: `6.9 ms`;
- 5,000-row ingestion in production-sized 80-row transactions: `283.4 ms`
  (`17,643 rows/sec`);
- 5,000-row bounded coverage query: `6.6 ms` under the `900`-row cap;
- deterministic queue generation from 5,000 candidates: `12.0 ms`, seven results;
- process-style database reopen/resume test: `24.3 ms` including a separate SQLite
  process and transactional decision update;
- compact 5,000-row database: `2,453,504 bytes` (`2.340 MiB`).

The existing bounds remain candidate batch `80`, live JS matches `600`, queue query
`900`, queue size `0–7`, and text draft `280` characters. Release 1 adds burst
alternates `12`, waveform bars `28`, and one active session per family/parent. No
screen loads the full 5,000-item candidate set.

### Verification and native evidence

- Final `pnpm test`: both packages succeeded; mobile TypeScript plus `363/363` unit
  tests passed and web typecheck passed.
- `pnpm lint`: `2/2` packages passed. `pnpm typecheck`: `2/2` packages passed.
  `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` passed.
- `deno check supabase/functions/notify-event/index.ts` passed and
  `deno test supabase/functions/notify-event/cadence_test.ts` passed `3/3`.
- The focused migration/queue/notification run passed `24/24` and saved its timing
  output as `performance-and-model-tests.txt`. `git diff --check`, scoped privacy,
  secret/generated-output, and staged-diff checks are recorded at commit time.
- A production build was not run because this release changes only mobile runtime
  behavior and no shared package, native module, web bundle, or release artifact.
- Expo MCP tools were not exposed in this agent session. Verification used the
  isolated iPhone 16e simulator on iOS 26.0, local Metro, Maestro, `simctl`, synthetic
  media, and a disposable local-only Supabase family; the other project's simulator
  and Metro were not interrupted.
- The five-card walkthrough covered photo text, video playback, voice lifecycle,
  favorite/reaction, best-of-burst inspection and alternate choice, keyboard,
  microphone denial, background/resume, forced termination/relaunch with mixed
  drafts, successful image plus enrichment Keep, same-identity video retry failure,
  Skip cleanup, unavailable/iCloud, completion, native picker, advanced Review,
  honest no-queue, local notification delivery, dark appearance, accessibility-large
  text, Reduce Motion, Circle denial, and lapsed denial. Layout defects found in the
  unavailable card and card-to-card scroll restoration were fixed and rechecked.
- Ignored evidence root:
  `tmp/evidence/curated-memory-library-release1-2026-07-20/`. Key files include
  `tonight-enriched-alternate.png`, `tonight-voice-termination-resume.png`,
  `tonight-microphone-denied.png`, `tonight-video-playing.png`,
  `tonight-video-retry-safe.png`, `tonight-completion.png`,
  `tonight-local-notification-banner-2.png`, `tonight-native-picker.png`,
  `tonight-unavailable-icloud.png`, `tonight-dark-accessibility-large-final.png`,
  `tonight-circle-denied.png`, `tonight-lapsed-denied.png`, and
  `tonight-no-queue.png`.

### Known verification gaps and next slice

- The disposable local Edge runtime has no Cloudflare video-upload credentials.
  Video playback, local voice lifecycle, stable transaction identity, parent-safe
  failure, retry locking, and duplicate prevention were verified, while a successful
  video-plus-voice provider commit remains a signed-runtime integration check. Image
  plus text/favorite/reaction committed successfully through the canonical local
  Supabase path with writer attribution.
- Local notification banners and Notification Center delivery were verified. Maestro
  could select the grouped iOS notification but did not dismiss Notification Center,
  so the OS response-tap itself is not claimed as automated runtime proof. The app's
  `/tonight` deep link and current resumable queue were separately exercised, and the
  notification route/metadata/queue gates are deterministic tests.

Before production rollout, run one narrow signed runtime proof on a non-personal test
family: successful video plus voice upload/retry against configured Cloudflare, and
one physical-device notification tap into the current queue. This external proof did
not block the independent local Release 2 catch-up implementation.

## Curated Memory Library Release 2 — First-year catch-up engine (2026-07-20)

Status: implemented and verified locally on `polish-sprints` after Release 1 commit
`54f6fac`. Nothing was pushed, deployed, submitted, or changed in production. Local
Supabase records and simulator media used only deterministic disposable fixtures.

### Product and durable contracts

- Queue generation remains deterministic and quality-bounded, now ranking stable
  uncovered family-timezone day anchors before distinct event/composition standouts,
  with recent/history balance and qualifying special videos. It returns an honest
  short or zero queue instead of padding weak media. Primary evening pace adapts from
  three to five to seven cards; the optional completion-card `Keep going` continuation
  is capped at three and does not count as another completed evening or notification.
- SQLite schema version `3` adds capture-timezone provenance, asset last-seen scan
  metadata, unavailable reason, and family/user-scoped saved-day facts. Migration is
  restart-safe and validates the new table as well as columns. Completed scans can
  reconcile disappeared assets without consuming review state, bounded iCloud retries
  restore candidates, and an unavailable burst representative promotes the strongest
  remaining eligible member without duplicating a card or parent decision.
- Foreground and background scans resolve the family's ritual timezone before candidate
  persistence. Photo-library changes can request a full reconciliation without erasing
  cached valid analysis. Automatic discovery pauses in Low Power Mode through the
  newly linked `expo-battery` module and keeps permission, role, Circle, and entitlement
  checks ahead of all Photos access.
- Family-union saved-day coverage crosses the server boundary as captured dates only;
  local asset identifiers, fingerprints, face evidence, candidates, and rejects remain
  private. The 365-day album uses lightweight nested, family-scoped media facts and
  keeps honest gap days. A dedicated `/daily-album/[day]` route uses exact DST-safe
  local-day UTC bounds and shows every distinct same-day photo/video individually.
- Our World hydrates at most 500 rich recent moments for context-heavy compatibility,
  reads up to 5,000 lightweight day facts, and obtains exact aggregate counts instead
  of loading 5,000 rich context graphs. Search beyond the recent rich window moves to
  Release 3's collection-backed index.
- Runtime review found and corrected a lapsed-access policy defect: canceled, expired,
  and past-due families can now browse allowlisted Today/Our World/Moment/First/Letter/
  daily-album routes, while Add is removed from global navigation and write/discovery/
  queue paths remain closed. A family that never activated a plan still sees purchase
  setup.

### Scoped implementation

- Scan, power, and library reconciliation: `libraryScanLauncher.js`,
  `scanController.js`, `backgroundAutoIngestTask.js`, `useForegroundAutoIngest.js`,
  `mediaLibraryChanges.js`, `mediaLibraryChangeModel.js`, `scanPowerPolicy.js`, and
  the `expo-battery` dependency.
- Ledger, migration, queue, and coverage: `mediaDbSchema.js`,
  `candidateLedgerModel.js`, `candidateLedgerStore.js`, `nightlyQueueModel.js`,
  `savedDayCoverage.js`, `firstYearCatchupModel.js`, and `dailyCurationModel.js`.
- Archive and lapse UX: `moments.js`, `momentDayIndexModel.js`,
  `DailyAlbumScreen.js`, `DailyAlbumDayScreen.js`, `LibraryScreen.js`,
  `entitlementAccessModel.js`, `navigation/RouteGuards.js`, `ui/AppShell.js`,
  `ui/BottomTabs.js`, and the allowlisted browse route wrappers.
- Proof: new/updated candidate ledger, migration, queue, catch-up, change-detection,
  power, day-index, entitlement, and curated-memory contract tests.

### Performance and tunables

Final deterministic non-personal 5,000-item run on the local development Mac:

- schema-v3 migration `13.9 ms`;
- 5,000 candidate inserts in 80-row transactions `395.8 ms`;
- bounded 900-row coverage query `16.1 ms`;
- deterministic seven-card queue generation `13.2 ms`;
- 5,000 saved records to 365 daily models `7.6 ms`;
- 5,000 lightweight moment/media facts to 365 day rows `158.1 ms`, with at most
  365 cover URLs requiring signatures;
- compact 5,000-row SQLite database `3,158,016 bytes` (`3.012 MiB`).

Named bounds are candidate batch `80`, live match state `600`, queue query `900`,
queue `0–7`, continuation `0–3`, iCloud retry `24`, rich archive `500`, lightweight
day archive `5,000`, day-detail moments `5,000`, nested day media `20,000`, and one
signed cover per represented day. No queue or screen retains 5,000 full candidate or
rich moment objects.

### Verification and native evidence

- Focused migration/queue/day-index suite: `37/37` passed with the performance output
  above. Final mobile suite: TypeScript plus `395/395` unit tests passed.
- `pnpm test`: `2/2` packages passed. `pnpm lint`: `2/2` passed. `pnpm typecheck`:
  `2/2` passed. CI-mode Expo lint passed. `pnpm build` passed from cache for the
  unchanged web artifact.
- CocoaPods linked `ExpoBattery 56.0.4`. A normal locally signed iPhone Simulator
  Debug build succeeded with 153 targets, installed on the isolated iPhone 16e, and
  reopened the authenticated daily album. The new process logged no missing native
  module, Battery, SecureStore, exception, or fatal error. The earlier intentionally
  unsigned install was rejected by SecureStore as expected and is not product proof.
- Ignored evidence root:
  `tmp/evidence/curated-memory-library-release2-2026-07-20/`. Runtime proof includes
  `tonight-five-card-queue.png`, `tonight-completion-keep-going.png`,
  `daily-album-empty-gaps-final.png`, `daily-album-with-same-day-memories.png`,
  `daily-album-same-day-detail.png`, `daily-album-dark.png`,
  `library-lapsed-read-only-final.png`, and
  `native-signed-battery-build-daily-album.png`.

### Review decisions and next slice

- Checker findings corrected before closure: family/device timezone mismatch,
  stranded unavailable burst representatives, hidden same-day standouts, unscoped
  globally truncated day media, 5,000-rich-moment hydration, incomplete v3 schema
  validation, continuation sessions distorting pace, and lapsed purchase redirection.
- Release 1's external-only Cloudflare video-plus-voice and physical notification-tap
  proofs remain explicitly unclaimed; they do not block the completed local catch-up
  engine.
- Release 3 automatic collections is next, preceded only by the narrow shared-archive
  trust stabilization required to remove private local asset identifiers from new
  remote writes, enforce server-side lapsed writes, and preserve authored shared data
  through account deletion. These are prerequisites for safe collection membership,
  partner corrections, and later shared annotations—not an expansion of collections.

## Curated Memory Library — shared archive trust stabilization (2026-07-20)

Status: implemented, critically reviewed, and verified locally after Release 2 commit
`3c24a20`. This in-between slice was required before automatic collections because
shared membership cannot safely depend on a private camera-roll identifier, lapsed
clients must not write around UI gates, and deleting one writer must not erase a
family-owned memory. Nothing was pushed, deployed, submitted, or changed in production.

### Durable contracts and corrections

- SQLite schema version `4` extends `local_asset_mappings` with one opaque remote UUID
  plus stable canonical moment/media IDs. The identity and retry targets are created
  before the first remote write. Repeated Keep after a partial tag, moment, media, or
  storage success therefore resumes the same transaction instead of creating another
  moment. Mapping rows are family-and-owner scoped and indexed by the opaque key.
- `photoSync`, manual picker moments, First composition, saved-media queries, correction,
  deletion, retry, and poster-video promotion translate only at the device boundary.
  Raw Photos identifiers remain in local SQLite/upload jobs. Remote `photo_tags`,
  `moment_media`, memories, Firsts, and weekly references use the opaque UUID.
- Shared upload metadata now excludes device/picker asset IDs, candidate IDs, child
  recognition scores, face counts, sampled-video presence evidence, curation reasons,
  fingerprints, and identity evidence. The server migration rotates legacy raw keys,
  follows their relationships, scrubs metadata, rejects new raw values, and is
  repeatable without rotating already-opaque keys.
- Server policies now require both writer membership and active entitlement for all
  shared archive writes and storage mutation. This includes photo tags, memories,
  moments/media/voice/reactions/tags, prompts, Firsts, Letters/replies/views, digest and
  ritual settings, scan checkpoints/calibration, family library connection, and family
  update. Existing read-only Circle selection boundaries remain green.
- Family-owned authored rows use nullable author/owner foreign keys with `ON DELETE SET
  NULL`. Account removal preserves shared moments, media, voice, reactions, replies,
  notes, Firsts, Letters, and prompts while removing attribution. This establishes the
  smallest safe authorship base for Release 4; the destructive account-deletion product
  workflow itself remains tracked by its policy and is not implemented here.
- The simulator checker first exposed a missing `photo_tags` read policy during upsert,
  then a partial-Keep duplicate risk because canonical target IDs were not persisted
  until the tag existed, then a local/opaque mismatch in correction feedback. Each was
  corrected and the same real-write path was rerun to completion.

### Scoped implementation

- Device persistence and translation: `mediaDbSchema.js`, `mediaDb.js`, `photoSync.js`,
  `storage.js`, `moments.js`, `mediaUploadMetadataModel.js`, `autoSaveCorrection.js`,
  `FirstComposeSheetScreen.js`, and `MomentDetailScreen.js`.
- Runtime proof: `RealAutoSaveWriteSmokeScreen.js` now asserts one opaque UUID across
  the tag/media rows and rejects private metadata before performing real storage and
  correction cleanup.
- Remote contracts: migrations `20260720210000_private_shared_media_identity.sql` and
  `20260720211000_shared_archive_write_and_authorship.sql`; pgTAP coverage in
  `shared_media_identity_migration_test.sql`, `shared_archive_trust_test.sql`, and the
  updated `read_only_circle_rls_test.sql`.
- Model/migration proof: `mediaDbSchema.test.js`, `mediaUploadMetadataModel.test.js`,
  and `sharedArchiveTrustContracts.test.js`.

### Verification and performance

- Focused local model/migration suite: `28/28` passed after the final mapping-scale
  test. Complete mobile TypeScript plus unit suite: `402/402` passed. `pnpm test`,
  `pnpm lint`, `pnpm typecheck`, CI-mode Expo lint, and `pnpm build` all passed; web
  tasks used their unchanged cached artifacts where reported.
- `pnpm db:reset:migrations` replayed the complete migration history and database lint
  reported no schema errors. pgTAP suites passed: shared archive trust `10/10`, existing
  Circle read-only boundaries `22/22`, and legacy shared identity migration/replay
  `6/6`.
- Deterministic 5,000-row local mapping run: insert `338.0 ms`, indexed 250-key lookup
  `13.0 ms`, database `1,572,864 bytes`, lookup page cap `250`. The existing 5,000
  candidate run remained bounded: migration `25.8 ms`, insert `819.4 ms`, coverage
  query `26.3 ms`, database `3,170,304 bytes`.
- Actual iPhone 16 Pro simulator, local-only Supabase, disposable auth/family, and a
  simulator still photo passed the real `Tags.setBaby` path: entitlement, Photos read,
  opaque tag/media identity, privacy-safe metadata, full/thumb upload, correction,
  row/file deletion, and one local negative example. Evidence:
  `tmp/evidence/shared-archive-trust-runtime-pass.png`. Expo MCP was not exposed in this
  session; CLI/simctl and the existing isolated OLW Metro process were used without
  interrupting the other booted projects.

### Release gate and next slice

- The new remote migrations are intentionally local-only. Production rollout must be
  staged: first ship a compatible client that creates opaque mappings for new Keeps,
  then choose and validate a one-time legacy installed-device reconciliation before
  rotating existing raw rows, then apply server constraints/RLS, and only afterward
  retire old writers. Deploying the migration ahead of that client/backfill gate could
  make an old install re-save an already-kept asset. This is an explicit production
  rollout blocker, not a local Release 3 blocker.
- Release 3 automatic factual collections is next. Scene/activity suggestions remain
  gated until an on-device evaluation proves useful accuracy; factual date, media,
  author, confirmed First, safe place, and favorite/reaction collections do not depend
  on that model.

## Assistant-Curated Baby Book PRD (2026-07-09)

Source of truth: `docs/assistant-curated-baby-book-prd.md`.

- A1 north-star pitch: updated Welcome first slide, setup intro, web hero export, App Store metadata draft, and ASC metadata JSON so the first promise is likely camera-roll moments with optional photo access, parent approval, and private baby-book growth. Kept privacy/no-feed, firsts, letters, voice, and book payoff in web/App Store copy without public competitor comparisons. Verification: `pnpm --filter @ourlittleworld/mobile test` (127 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `pnpm --filter @ourlittleworld/web build`, App Store promotional text length check (134 chars). Expo MCP visual verification not run because this was copy/static-content scope.
- A2 category benchmark guardrail: added `docs/copy-positioning-notes.md` for internal web/app/App Store copy decisions: prompts plus assistant capture, parent approval, private book growth, and no public competitor naming. Updated web/App Store copy to explicitly pair gentle prompts with assistant capture. Verification: `rg -n "Qeepsake|competitor|category benchmark|category-benchmark|benchmark" apps/web apps/mobile/app-store apps/mobile/src` returned no public matches; `pnpm --filter @ourlittleworld/web build` passed; ASC metadata JSON parsed with promotional text still 134 chars. Expo MCP visual verification not run because this was docs/static-copy scope.
- A3 onboarding model: setup now teaches birth date -> optional photo discovery -> parent approval -> private book growth. Reference setup copy starts from birthday/photo access first, manual one-photo language is reserved for unavailable/failed birthday-first discovery, and Settings no longer says to pick one clear photo before automatic discovery; no-reference Settings actions now route to `/reference?autoSeed=1`. Also replaced one unsupported Library correction caption with "auto-save pauses and records a correction." Verification: `pnpm --filter @ourlittleworld/mobile test` (127 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, guardrail `rg` found no "pick one clear photo before automatic discovery" or "face model gets sharper" copy. Expo MCP visual verification gap: exposed Expo MCP route tree belongs to a different Expo project, so it was not a valid verifier for this repo without reconnecting/restarting MCP. Follow-up for E1: `ScanProgressScreen` still has "review before anything uploads" copy, intentionally left for the ingestion-copy task.
- B2 Book reframing: `LibraryScreen` now opens as `<Child>'s book`, shows a Book home before secondary controls, and uses real latest-month chapter counts plus Firsts and Letters entry cards linking to `/firsts` and `/letters`. The empty state now explains that the baby book starts only when a parent approves a moment, answers a prompt, saves a first, or writes a letter; chapter and camera-roll copy no longer frame the first view as only a photo archive. Verification: `pnpm --filter @ourlittleworld/mobile test` (127 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`. Expo MCP visual verification gap: `expo_router_sitemap` still reports a different Expo project, and `automation_take_screenshot` for this project root failed with "Multiple simulator are not supported yet"; visual verification needs a reconnected local Expo MCP session or a single active simulator.
- B3 Book collection cards: added `bookCollectionsModel.js` so Book cards can show completed Firsts, attached latest first photo state, letter counts, sealed/open counts, and latest letter state from stored rows. `LibraryScreen` now loads Firsts and Letters with the book data and renders those summaries in the Firsts/Letters cards while keeping `/firsts` and `/letters` intact. Verification: `node --test apps/mobile/tests/unit/bookCollectionsModel.test.js`, `pnpm --filter @ourlittleworld/mobile test` (130 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`. Expo MCP visual verification remains blocked by the same wrong-project sitemap/multiple-simulator issue recorded for B2.
- B1 bottom nav: reduced `BottomTabs` to exactly three actions: Today, Add, Book. Book keeps the existing `/library` route, and direct `/firsts` and `/letters` now pass `active="book"` so they remain reachable from Book without orphan bottom-tab keys. Verification: source route check for `apps/mobile/app/firsts.jsx`, `apps/mobile/app/letters.jsx`, and `apps/mobile/app/library.jsx`; guardrail `rg` found no remaining removed active keys or bottom-tab definitions; `pnpm --filter @ourlittleworld/mobile test` (130 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`. Expo MCP visual verification remains blocked by the same wrong-project sitemap/multiple-simulator issue recorded for B2.
- B4 secondary Book utilities: added `bookUtilityVisibilityModel.js` so failed uploads and iCloud waits stay prominent only when action is required, while upload-progress and camera-roll-change notices move into secondary details. `LibraryScreen` now shows Book home first, blocking repair if present, the saved chapter/empty payoff, and only then a `Book tools` panel for Places, Search, Export, camera roll browsing, and saving details; the Places/Search/Export segmented switcher renders only after a secondary utility surface is opened. Verification: `node --check apps/mobile/src/bookUtilityVisibilityModel.js apps/mobile/src/LibraryScreen.js`, `node --test apps/mobile/tests/unit/bookUtilityVisibilityModel.test.js apps/mobile/tests/unit/bookHomeModel.test.js` (10 tests), `pnpm --filter @ourlittleworld/mobile test` (191 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, and `git diff --check` passed. Expo MCP visual verification remains blocked: `expo_router_sitemap` reports a different Expo project, and `automation_take_screenshot` for this project root failed with "Multiple simulator are not supported yet."
- E1 ingestion philosophy copy: updated scan progress, review, Today scan banner, legacy Timeline scan banner, Book auto-save removal, and Moment delete copy to explain review-first trust building and later automatic saving of clear matches without exposing scores or thresholds. Removal copy now states that originals stay in Photos, and auto-save removal says it records a correction and pauses auto-save. Verification: `node --test apps/mobile/tests/unit/scanBannerCopyModel.test.js`, targeted guardrail `rg` for "review before anything uploads", "Auto-saving", "auto-saving", and "confidence score" in the touched UI files returned no matches; `pnpm --filter @ourlittleworld/mobile test` (130 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`. Expo MCP visual verification remains blocked by the same wrong-project sitemap/multiple-simulator issue recorded for B2.
- H1 Firsts pressure copy: softened Firsts progress and hero language from goals/checklist framing to optional starter firsts saved, possible next firsts, and catch-up memories. Past-window copy now says firsts can be added whenever they come back, and the model fallback caption is `Add whenever it fits` instead of a vague someday suggestion. Verification: `node --test apps/mobile/tests/unit/firstsModel.test.js`, source guardrail `rg` for "goals complete", "goal path", "family goal(s)", "Next family goal", "Goal path", and "Nothing has to be complete" returned no UI/source matches; `pnpm --filter @ourlittleworld/mobile test` (130 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`. Expo MCP visual verification remains blocked by the same wrong-project sitemap/multiple-simulator issue recorded for B2.
- C1 canonical Today queue: extended `selectDayCardNudge` so the tested priority order is blocking repair/data issue -> review -> suggested first -> catch-up first -> prompt -> book-readiness -> digest -> fallback. Today now feeds upload repair, iCloud wait, and scan-failed states into that queue, removes the separate scan banner, and hides duplicate actionable prompt/digest cards when the assistant card owns or outranks that action. Blocking repair copy says parent-safe things like "Some memories did not finish saving" and does not expose raw errors. Verification: `node --test apps/mobile/tests/unit/dayCardNudge.test.js`, source guardrail `rg` for "ScanBanner", scan-banner leftovers, and "confidence|threshold|queue|RPC|upload exception" in the touched source returned no matches; `pnpm --filter @ourlittleworld/mobile test` (131 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`. Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different app, and screenshot capture for this project root still fails with "Multiple simulator are not supported yet."
- C2 Tonight ritual model: added `tonightModel.js` as a pure evening-rhythm model that ranks up to three items from today's prompt, pending review count, current first suggestion, recent saved photos, and current digest, with suppression for actions already owned by the primary Today card or standalone prompt/digest cards. `TodayScreen` now renders a compact Tonight section only when the model has at least one item; brand-new families get no empty Tonight block, and no schema, notification, or pager was added. Verification: `node --check apps/mobile/src/tonightModel.js apps/mobile/src/TodayScreen.js`, `node --test apps/mobile/tests/unit/tonightModel.test.js apps/mobile/tests/unit/dayCardNudge.test.js` (11 tests), `pnpm --filter @ourlittleworld/mobile test` (195 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, and `git diff --check` passed. Expo MCP visual verification remains blocked by the same wrong-project sitemap/multiple-simulator issue recorded for B4.
- C3 missed prompt catch-up: added `missedPromptModel.js` with a 7-day tunable catch-up window, current-parent unanswered filtering, partner-only answer context, and one-candidate Today selection. `DailyPrompts` now supports `listMissed`, `getForDate`, and dated `saveResponse` so previous prompt answers preserve original `prompt_key`, `prompt_text`, and `prompt_date`; `/prompt?promptDate=YYYY-MM-DD` loads/saves that dated prompt and Today routes only one missed prompt through the existing assistant nudge queue. Verification: `node --check apps/mobile/src/missedPromptModel.js apps/mobile/src/rituals.js apps/mobile/src/useRitualHomeData.js apps/mobile/src/dayCardNudge.js apps/mobile/src/PromptSheetScreen.js apps/mobile/src/TodayScreen.js`, `node --test apps/mobile/tests/unit/missedPromptModel.test.js apps/mobile/tests/unit/dayCardNudge.test.js apps/mobile/tests/unit/dailyPrompts.test.js` (19 tests), `pnpm --filter @ourlittleworld/mobile test` (200 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, and `git diff --check` passed. Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different coaching app, and `automation_take_screenshot` for this project root failed with "Multiple simulator are not supported yet."
- C4 second-parent state: added `secondParentStateModel.js` so prompt answer status names known co-parents, avoids inventing a missing co-parent when only the current parent is known, and keeps status copy free of a partner-nudge CTA. Today now uses that model for prompt answer copy and shows digest read status as local-device copy; Digest detail says `Opened on this device. Family-wide view names are not shown yet.` until server-backed viewer state exists. Verification: `node --check apps/mobile/src/secondParentStateModel.js apps/mobile/src/TodayScreen.js apps/mobile/src/DigestDetailSheetScreen.js`, `node --test apps/mobile/tests/unit/secondParentStateModel.test.js apps/mobile/tests/unit/dayCardNudge.test.js` (14 tests), `pnpm --filter @ourlittleworld/mobile test` (206 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, and `git diff --check` passed. Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different coaching app, and `automation_take_screenshot` for this project root failed with "Multiple simulator are not supported yet."
- D1 progressive Add: added `buildAddMomentState` so Add save eligibility is driven by primary content only: photo/video, voice, or text. `AddSheetScreen` now keeps title, place, and tags behind an optional `Add context` control after primary content or existing context, removes old upfront field copy, and keeps saves on the existing `createMomentWithMedia` plus post-save nudge path. Verification: `node --check apps/mobile/src/AddSheetScreen.js`, `node --test apps/mobile/tests/unit/addMomentModel.test.js`, `pnpm --filter @ourlittleworld/mobile test` (134 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`, and guardrail `rg` for old Add copy/required-delete-model claims in touched Add files. Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different app, and screenshot capture for this project root still fails with "Multiple simulator are not supported yet."
- D2 post-save nudges: strengthened `selectPostSaveNudge` with saved-moment date logic, durable `sourceMomentId`/`sourceFirstId` route params, text-only one-line letter nudges, video-only book-ready caption nudges, and facts-only letter seed copy. First nudges now seed the first compose date from the saved moment date while preserving the existing `momentId` path that Firsts persists. `PostSaveNudgeSheet` now renders the book-ready nudge kind. Also removed the remaining `color: undefined` style from Add after the dark-mode guard caught it. Verification: `node --test apps/mobile/tests/unit/postSaveNudgeModel.test.js` (11 tests), `pnpm --filter @ourlittleworld/mobile test` (138 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`, and source guardrails for invented letter language and rejected dark-mode color unsets. Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different app, and screenshot capture for this project root still fails with "Multiple simulator are not supported yet."
- D3 Moment story chips: added nullable `letters.source_moment_id` and `letters.source_first_id` links, persisted source IDs from letter compose, and added data helpers for moment-linked firsts, source-linked letters, and the weekly digest covering the moment date. `MomentDetailScreen` now renders tested Story links chips for confirmed First, Letter, Voice, Digest, Book-ready, and Place state, with contextual `Possible first`, `Write letter`, and `Add one line` actions that do not claim unconfirmed relationships. Verification: `node --test apps/mobile/tests/unit/momentConnectionChips.test.js` (3 tests), `pnpm db:reset:migrations`, `pnpm --filter @ourlittleworld/mobile test` (141 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`, and source guardrails for source-link fields and chip copy. Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different app, and screenshot capture for this project root still fails with "Multiple simulator are not supported yet."
- D4 backdating parity: Add now exposes an optional happened-at date after primary content exists, using the same age caption copy as First compose, and passes the override to `createMomentWithMedia`. Moment detail edit now lets parents adjust the saved moment date, persists it through `updateMoment`, and reloads age labels, digest lookup, chips, and post-save/date-seeded flows from `captured_at`. The shared date picker now accepts a non-birth default date so Add opens on today without changing setup birthday behavior. Verification: syntax checks for touched screens/data helpers, `pnpm --filter @ourlittleworld/mobile test` (141 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`, and source guardrails for "Roughly when it happened is fine", happened-date controls, `capturedAt` create/update, digest lookup, first seed date, and post-save nudge date usage. Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different app, and screenshot capture for this project root still fails with "Multiple simulator are not supported yet."
- E2 auto-save trust-state model: added `photoIngestionTrustModel.js` with review-required, learning, ready, active, and correction-review states; internal diagnostic tunables for clean batch, high-confidence score, auto-save threshold, small batch, and capture-quality floor stay out of parent copy. Today now feeds import calibration, recent auto-saves, pending review count, and scan errors into the top assistant card, while Book consumes the same model in a trust/admin panel near upload repair and recent auto-saves. The model uses cumulative review history so a later clean-but-small batch does not disable active auto-save, and first scans remain review-first even with one pending photo. Verification: `node --check apps/mobile/src/photoIngestionTrustModel.js`, `node --test apps/mobile/tests/unit/photoIngestionTrustModel.test.js apps/mobile/tests/unit/dayCardNudge.test.js` (17 tests), `pnpm --filter @ourlittleworld/mobile test` (151 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`, and guardrail `rg` for raw matcher/tuning language in touched source/tests (hits only implementation/test names and numeric style values, not parent-facing copy). Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different app, and screenshot capture for this project root still fails with "Multiple simulator are not supported yet."
- E3 review skip-strays UX: updated Review copy to say likely matches start selected, parents skip strays, and skipped items can be tapped again to keep before saving. The sticky action bar now says `Skip shown` / `Keep shown` and the primary action is `Save selected`; stack summaries say `Kept best` and expanded folded frames still show `Tap to keep`. Added stack-action coverage proving keep/skip actions are reversible before save while default stacks keep only the best few. Verification: `node --test apps/mobile/tests/unit/photoStackModel.test.js` (8 tests), `pnpm --filter @ourlittleworld/mobile test` (152 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`, and Review copy guardrail for approve/delete/camera-roll/original language (hits only internal variable names/comments, not visible copy). Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different app, and screenshot capture for this project root still fails with "Multiple simulator are not supported yet."
- E4 auto-saved correction flows: added `autoSaveCorrectionModel.js` and shared `removeAutoSavedMemory` so assistant-added removals record a negative example, pause auto-save, dismiss recent-auto-save state, and then remove the tagged media through one path. New auto-save uploads pass `source: scan-auto-save` so image and poster-only video rows are durably labeled. Recent Auto-Saves in Book, Timeline long-press, Today long-press, and Moment detail `Not this` now share correction copy that says originals stay in Photos and auto-save pauses for review without claiming the matcher learns. Timeline and Moment detail label assistant-added media as `Added by the assistant`, while Book already had the same label. Verification: `node --check apps/mobile/src/autoSaveCorrectionModel.js apps/mobile/src/autoSaveCorrection.js`, `node --test apps/mobile/tests/unit/autoSaveCorrectionModel.test.js apps/mobile/tests/unit/photoIngestionTrustModel.test.js apps/mobile/tests/unit/mediaUploadMetadataModel.test.js` (16 tests), `pnpm --filter @ourlittleworld/mobile test` (156 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`, and E4 copy/source guardrails for assistant labels, `Not this`, originals, overclaiming model learning, and raw matcher terms. Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different app, and screenshot capture for this project root still fails with "Multiple simulator are not supported yet."
- E5 archive vs book-worthy: added `bookWorthinessModel.js` with explicit `savedToArchive`, `bookEligible`, `bookScore`, archive source, labels, and reasons. `bookHomeModel.js` now keeps archive stats separate from `bookReadyStats`, marks chapters with book-ready highlights, and lets print/export readiness enter `archive_only` when auto-saved items are saved privately but not ready to lead a book preview. Weekly digest representative media now prefers book-ready/high-score moments before falling back to archive-only media, and Book UI copy explains `Saved in archive` versus `Ready for the book`. Verification: `node --check apps/mobile/src/bookWorthinessModel.js apps/mobile/src/bookHomeModel.js apps/mobile/src/LibraryScreen.js apps/mobile/src/rituals.js`, `node --test apps/mobile/tests/unit/bookWorthinessModel.test.js apps/mobile/tests/unit/bookHomeModel.test.js apps/mobile/tests/unit/digestModel.test.js` (14 tests), `pnpm --filter @ourlittleworld/mobile test` (211 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, and `git diff --check` passed. Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different coaching app, and `automation_take_screenshot` for this project root failed with "Multiple simulator are not supported yet."
- E6 auto-save parent setting: made the product decision explicit that parents opt into `Auto-save clear matches` after review earns trust; clean review history now reaches `auto_save_ready` instead of silently turning on auto-save. `photoIngestionTrustModel.js` now exposes `Review first` / `Auto-save clear matches` setting copy, guards raw tuner language, and ignores enabled flags until trust is earned. `recognitionTrust.js` adds `setAutoSavePreference`, preserves calibrated score settings, and only supplies scan auto-save config when trust is earned and the parent setting is on; the existing `scanQualityModel` low-quality floor still gates auto-save. Book's Photo assistant panel renders the setting when ready/active and explains review-first behavior before readiness. Verification: `node --check apps/mobile/src/photoIngestionTrustModel.js apps/mobile/src/recognitionTrust.js apps/mobile/src/LibraryScreen.js`, `node --test apps/mobile/tests/unit/photoIngestionTrustModel.test.js apps/mobile/tests/unit/scanQualityModel.test.js apps/mobile/tests/unit/bookWorthinessModel.test.js` (19 tests), `pnpm --filter @ourlittleworld/mobile test` (213 tests), and `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` passed. Expo MCP visual verification remains blocked by the existing wrong-project sitemap and multiple-simulator screenshot errors.
- F1 suggested-first review card: verified the existing Suggested Firsts card already satisfies the PRD acceptance. The card uses `Worth a look` and `Possible first...` copy, shows evidence photos, supports `Keep`, `Not this`, and alternate promotion with `Choose this photo instead`, and the pure model preserves `Nothing is saved until you keep it` plus a Keep route that only opens the compose sheet. No code changes were needed for this loop. Verification: `node --test apps/mobile/tests/unit/firstSuggestionModel.test.js` (15 tests) and source guardrail for `Worth a look`, `Possible first`, `Keep`, `Not this`, alternate choice, and disallowed certainty/auto-save language. Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different app, and screenshot capture for this project root still fails with "Multiple simulator are not supported yet."
- F2 photo-stack suggestions: verified the existing `photoStackModel` plus E3 Review UI satisfies the PRD acceptance. `buildReviewStacks` groups session/near-duplicate photos, `rankStackMatches`/`qualityValue` pick the recommended primary/default keeps, low-quality siblings fold out, stacks summarize `Kept best`, expanded stacks show every frame, and folded frames can be tapped back in before `Save selected`. No additional code changes were needed for this loop beyond E3. Verification: `node --test apps/mobile/tests/unit/photoStackModel.test.js` (8 tests) and source guardrail for grouping, quality ranking, expand/fold, `Tap to keep`, `Kept best`, and `Save selected`. Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different app, and screenshot capture for this project root still fails with "Multiple simulator are not supported yet."
- F3 facts-only context drafts: extended `captionTemplateModel.js` with deterministic `factsOnlyContextDraft`, built from labeled metadata only: date, child age, place label, confirmed first title, prompt text, and parent-provided tags. Add and Moment edit now show a `Suggested line` row only when the note is empty; tapping `Use` inserts the draft, and the parent still has to save. Tests lock exact wording and guard against invented feelings, speech, intent, and `first ever` claims. Verification: `node --check apps/mobile/src/captionTemplateModel.js apps/mobile/src/AddSheetScreen.js apps/mobile/src/MomentDetailScreen.js`, `node --test apps/mobile/tests/unit/captionTemplateModel.test.js apps/mobile/tests/unit/promptStarterModel.test.js apps/mobile/tests/unit/postSaveNudgeModel.test.js` (17 tests), `pnpm --filter @ourlittleworld/mobile test` (215 tests), and `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` passed. Expo MCP visual verification remains blocked by the existing wrong-project sitemap and multiple-simulator screenshot errors.
- F4 book-readiness nudges: added `bookReadinessNudgeModel.js` with pure moment/month scores that require media plus durable parent context (title, note, voice, first, prompt answer, or letter) before a moment/month is book-ready. `useRitualHomeData` now fetches prompt responses, builds Book records/chapters from the cached Today payload, selects one gentle `Add one line to make July easier to remember` nudge when a media-rich chapter only needs context, and Today passes it into the existing single-card queue. Book keeps its neutral saved/media/book-ready counts and archive-vs-preview explanation without adding pressure UI. Verification: `node --check apps/mobile/src/bookReadinessNudgeModel.js apps/mobile/src/useRitualHomeData.js apps/mobile/src/TodayScreen.js`, `node --test apps/mobile/tests/unit/bookReadinessNudgeModel.test.js apps/mobile/tests/unit/dayCardNudge.test.js apps/mobile/tests/unit/bookHomeModel.test.js` (22 tests), `pnpm --filter @ourlittleworld/mobile test` (221 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`, and F4 copy guardrails passed. Expo MCP visual verification remains blocked: `expo_router_sitemap` reports an unrelated coaching app route tree, and `automation_take_screenshot` for this project root failed with "Multiple simulator are not supported yet."
- F5 transparent assistant feedback: added `assistantFeedbackTransparencyModel.js` so every assistant feedback kind declares the loop it affects and the loops it cannot silently train. First suggestion `Not this` now says it only quiets First suggestions on this device, while existing S6 trust still raises the bar and then quiets the detector after repeated rejects; tests assert it does not become child identity or face-match feedback. Auto-save correction copy now says originals stay in Photos, future scans for this parent treat the removal as a photo-match correction, and auto-save pauses for review without claiming the model learns. Verification: `node --check apps/mobile/src/assistantFeedbackTransparencyModel.js apps/mobile/src/firstSuggestionModel.js apps/mobile/src/autoSaveCorrectionModel.js`, `node --test apps/mobile/tests/unit/assistantFeedbackTransparencyModel.test.js apps/mobile/tests/unit/firstSuggestionModel.test.js apps/mobile/tests/unit/autoSaveCorrectionModel.test.js` (22 tests), `pnpm --filter @ourlittleworld/mobile test` (224 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`, and feedback-copy guardrails passed. Expo MCP visual verification remains blocked: `expo_router_sitemap` reports an unrelated coaching app route tree, and `automation_take_screenshot` for this project root failed with "Multiple simulator are not supported yet."
- G1 Book home model: added `bookHomeModel.js` as the pure Book business model for archive records, current chapter, latest saved moment, Firsts/Letters summaries, prompt/voice/digest summaries, print/export readiness, year summaries, and utility alerts. `LibraryScreen` now builds one `bookHome` object from moments, shared photos, firsts, letters, explicit empty digest/prompt/voice inputs, upload repair state, export limitations, and lapsed-subscription policy input, then renders the Book hero and new Book preview readiness card from that model. Unit coverage now covers empty, new, active, and mature archives, including parent-safe upload repair copy and finalized policy alerts without inventing lapsed-subscription rules. Verification: `node --check apps/mobile/src/bookHomeModel.js apps/mobile/src/LibraryScreen.js`, `node --test apps/mobile/tests/unit/bookHomeModel.test.js apps/mobile/tests/unit/bookCollectionsModel.test.js` (8 tests), `pnpm --filter @ourlittleworld/mobile test` (161 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`, and source guardrails for explicit model inputs plus removal of inline archive builders from `LibraryScreen`. Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different app, and screenshot capture for this project root still fails with "Multiple simulator are not supported yet."
- G2 chapter framing: extended `bookHomeModel.js` so chapters now include context rows for voice notes, saved firsts, letters, and answered prompts, including context-only chapters when there is no media tile yet. `LibraryScreen` loads prompt responses through `DailyPrompts.listResponses`, renders chapter notes inside each month, and changes touched visible copy from raw archive/search/photo-result framing to Book/chapter language. The local export preview copy now says it is generated from saved family book chapters instead of a family archive session. Verification: `node --check apps/mobile/src/bookHomeModel.js apps/mobile/src/LibraryScreen.js apps/mobile/src/rituals.js apps/mobile/src/archiveExport.js`, `node --test apps/mobile/tests/unit/bookHomeModel.test.js apps/mobile/tests/unit/bookCollectionsModel.test.js` (9 tests), `pnpm --filter @ourlittleworld/mobile test` (162 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, and copy/source guardrails for old visible archive phrasing plus chapter-context fields. Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different app, and screenshot capture for this project root still fails with "Multiple simulator are not supported yet."
- G3 human-readable Places: updated `visionSceneLabeler.js` so primary place labels no longer format raw coordinates. Known human place names win, coordinate-looking names are rejected, the largest unlabeled cluster can read `At home`, scene hints can produce labels like `At the park`, unnamed geotagged places fall back to `Out and about`, and coordinate formatting is isolated to `formatLocationDebugLabel` for detail/debug contexts. Added unit coverage for raw-coordinate guardrails, known-name precedence, home/scene fallbacks, and unknown-place behavior. Verification: `node --check apps/mobile/src/visionSceneLabeler.js`, `node --test apps/mobile/tests/unit/visionSceneLabeler.test.js` (4 tests), `pnpm --filter @ourlittleworld/mobile test` (166 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, and source guardrail for coordinate formatting versus primary labels. Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different app, and screenshot capture for this project root still fails with "Multiple simulator are not supported yet."
- G4 parent-safe repair states: changed the Book upload repair panel to say `Some memories did not finish saving` when failures exist, use a plain `Retry` action, keep raw `lastError` collapsed behind a `Details` button, and replace the retry failure alert with parent-safe copy plus a console warning. The shared Book utility alert now uses the same `Retry` action label, while the existing Today queue already keeps blocking repair ahead of photo-trust/review/prompt/digest nudges. Verification: `node --check apps/mobile/src/LibraryScreen.js apps/mobile/src/bookHomeModel.js apps/mobile/src/dayCardNudge.js`, `node --test apps/mobile/tests/unit/dayCardNudge.test.js apps/mobile/tests/unit/bookHomeModel.test.js` (13 tests), `pnpm --filter @ourlittleworld/mobile test` (166 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, and source guardrails for `lastError`, `Details`, `Retry`, raw exception terms, and removed `failed uploads`/`Retry uploads` copy. Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different app, and screenshot capture for this project root still fails with "Multiple simulator are not supported yet."
- G5 print/export preview trust feature: extracted `archiveExportModel.js` so generated Book preview HTML is unit-tested separately from Expo file sharing. Export copy now says memories are always exportable, the Book export screen lists photos, video posters, voice references, firsts, letters, prompt answers, dates, and chapter summaries as included when available, and both the screen and generated HTML show parent-readable preview limitations. The HTML renders available firsts, letters, prompt answers, voice references, and video poster badges, or labels those sections as a limited preview when unavailable. Verification: `node --check apps/mobile/src/archiveExportModel.js apps/mobile/src/archiveExport.js apps/mobile/src/LibraryScreen.js`, `node --test apps/mobile/tests/unit/archiveExportModel.test.js apps/mobile/tests/unit/bookHomeModel.test.js` (9 tests), `pnpm --filter @ourlittleworld/mobile test` (169 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`, and source guardrails for always-exportable copy, video poster/voice/prompt sections, limited-preview copy, and limitation strings. Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different app, and screenshot capture for this project root still fails with "Multiple simulator are not supported yet."
- H2 Firsts source links: added unit-tested `firstSourceAffordance` states so saved First rows name their source as `Source moment`, `Source photo`, or `Text-only first` instead of relying on a thumbnail/placeholder alone. First rows now expose source copy and accessibility hints, still open linked source moments when `first.moment_id` or the selected photo's moment is available, and the first composer shows a Source card with an `Open moment` action for existing or moment-seeded firsts. Moment-seeded compose close now falls back to the source moment when there is no back stack, preserving the moment/book context. Verification: `node --check apps/mobile/src/firstsModel.js apps/mobile/src/FirstsScreen.js apps/mobile/src/FirstComposeSheetScreen.js`, `node --test apps/mobile/tests/unit/firstsModel.test.js apps/mobile/tests/unit/momentConnectionChips.test.js apps/mobile/tests/unit/bookCollectionsModel.test.js` (18 tests), `pnpm --filter @ourlittleworld/mobile test` (171 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`, and source guardrails for source labels, source-card copy, and moment fallback routes. Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different app, and screenshot capture for this project root still fails with "Multiple simulator are not supported yet."
- H3 assistant-powered Letters: migrated Letters to open-by-default behavior with `open_on` nullable (`20260709133000_letters_open_by_default.sql`), `sealed_at` nullable, and `Letters.create` writing open letters with `open_on: null`; existing dated letters keep sealed-until-date behavior. Letter compose now saves open letters, labels source context from moment/first/digest/Book starts, and no longer defaults to an eighteenth-birthday lock. Letters list/detail render open letters immediately and still lock existing future-dated letters. Added direct starts from saved first (`Write letter` in first source card), digest (`Write letter from this week` seeded from factual digest summary), and Book (`Write` action on the Letters card) while the existing moment chip remains. Partner notification copy now says `letter_saved`; architecture docs reflect open-by-default letters. Optional sealing picker and email delivery remain named follow-ups in polish backlog L2/L3. Verification: `node --check` on touched Letters/Book/First/Digest/model files, `node --test apps/mobile/tests/unit/bookCollectionsModel.test.js apps/mobile/tests/unit/bookHomeModel.test.js apps/mobile/tests/unit/postSaveNudgeModel.test.js apps/mobile/tests/unit/momentConnectionChips.test.js` (23 tests), `pnpm db:reset:migrations`, `deno check supabase/functions/notify-event/index.ts`, `pnpm --filter @ourlittleworld/mobile test` (171 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`, and source guardrails for open-letter copy, source starts, and removed sealed-by-default language. Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different app, and screenshot capture for this project root still fails with "Multiple simulator are not supported yet."
- I1 private recap share primitive: added `privateRecapShareModel.js` with tested native-share payloads for selected weekly digest recaps and Book preview summaries. Digest detail now has `Share recap`; Book export now has `Private summary`; both say the share is private family sharing, not a feed, and no public link is created. Book preview file sharing also uses the private summary payload instead of exposing a public URL message. The access model explicitly keeps public links disabled and names future requirements: opaque server token, selected-content snapshot, revocation, and no writer/app/archive-wide permissions. Architecture docs now record the same model. Verification: `node --check apps/mobile/src/privateRecapShareModel.js apps/mobile/src/DigestDetailSheetScreen.js apps/mobile/src/LibraryScreen.js`, `node --test apps/mobile/tests/unit/privateRecapShareModel.test.js apps/mobile/tests/unit/archiveExportModel.test.js apps/mobile/tests/unit/digestModel.test.js apps/mobile/tests/unit/bookHomeModel.test.js` (13 tests), `pnpm --filter @ourlittleworld/mobile test` (173 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`, and source guardrails for private/not-feed/no-public-link copy and access-model constants. Expo MCP visual verification remains blocked: `expo_router_sitemap` still reports a different app, and screenshot capture for this project root still fails with "Multiple simulator are not supported yet."
- I2 read-only circle viewer plan: added `docs/read-only-circle-viewer-spec.md` for the web-first grandparent/circle viewer, including shared digest, selected moments, selected/linked firsts, and a gift upgrade path that does not expose billing internals or writer controls. Added `20260709150000_read_only_circle_viewer_policies.sql` so circle members can read only selected/shared content: shared moments and moment media, explicitly shared weekly digests, explicitly shared firsts, or firsts linked to shared moments. Letters, prompt answers, unshared memory notes, photo tags, unshared bucket objects, and writes remain writer-only. Added pgTAP coverage in `supabase/tests/read_only_circle_rls_test.sql` proving circle read/write limits and writer full-archive reads. Architecture docs now link the spec and access contract; the PRD records that parent-facing circle-sharing copy is backed by backend policy enforcement. Verification: `pnpm db:reset:migrations`, `supabase test db supabase/tests/read_only_circle_rls_test.sql --local` (18 tests), `git diff --check`, and copy guardrails for public-link/feed/broad-circle promises. Expo MCP visual verification was not applicable because this loop changed backend policies and docs only.
- I3 gift loop positioning: added web `giftOfferCopy` as the source for Family/Vault gift-year labels used by Gift/Pricing metadata, rendered Gift/Pricing page copy, and the checkout preview. Gift copy now leads with "Give the baby book they do not have time to make," uses the current `$70` Family gift-year fallback, and explicitly connects the gift path to first-year use cases for grandparents, photographers, doulas, employers, and client gifts. Added mobile `GIFT_REDEMPTION_COPY` so Purchase and Settings use the same app redemption phrase for gift, website, and partner codes; checkout success pages now point recipients to the same redemption wording. Verification: `pnpm --filter @ourlittleworld/web build`, `node --check apps/mobile/src/giftOfferCopy.js apps/mobile/src/PurchaseScreen.js apps/mobile/src/SettingsMenuSheetScreen.js`, `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `pnpm --filter @ourlittleworld/mobile test` (173 tests), `git diff --check`, rendered Gift/Pricing guardrails for the required gift audiences and no `$48`, and source guardrails for stale redemption/price copy. Expo MCP visual verification was not applicable because this loop changed web/static copy and app redemption copy only.
- I4 multi-child readiness: added `childScopeModel.js` and threaded optional `childId` through PRD-era pure model boundaries for Add state, Book home/collections, moment connection route params, photo-ingestion trust, auto-save correction targets, and private share payload metadata. Book models now filter child-owned rows when a child scope is present while preserving legacy unscoped rows for the K1 transition. Added `docs/multi-child-readiness.md` and an architecture link documenting the future `children` table, `child_id` backfill points, family-level prompt/digest decisions, recognition storage key change, analytics/event guardrails, and selected-content circle access. Verification: `node --check apps/mobile/src/childScopeModel.js apps/mobile/src/addMomentModel.js apps/mobile/src/autoSaveCorrectionModel.js apps/mobile/src/photoIngestionTrustModel.js apps/mobile/src/bookCollectionsModel.js apps/mobile/src/bookHomeModel.js apps/mobile/src/momentConnectionChips.js apps/mobile/src/privateRecapShareModel.js`, targeted `node --test` for the eight affected unit files (37 tests), `pnpm --filter @ourlittleworld/mobile test` (179 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`, and guardrails for fixture child ids and public-link/privacy copy. Expo MCP visual verification was not applicable because this loop changed pure models and docs only.
- J1 analytics event names: added `docs/analytics-events.md` as a contract-only spec before any SDK or event emission. It defines the privacy contract, common envelope, allowed shared enums, all required activation/assistant/book/gift/purchase events with triggers and event-specific properties, and J2 wrapper requirements to reject unknown events/properties plus content-like keys and values. Architecture now links the spec and records that J2 must add the central allowlisted wrapper before instrumentation. Verification: Node doc guard confirmed all 26 required events and the four required sections, `rg -n "posthog|amplitude|mixpanel|segment" package.json pnpm-lock.yaml apps/mobile/package.json apps/web/package.json` returned no SDK hits, and `git diff --check` passed. Expo MCP visual verification was not applicable because this loop changed docs only.
- J2 privacy-safe instrumentation: added `analyticsEventsModel.js` and `analytics.js` as the central no-SDK analytics wrapper. The model allowlists all J1 event names and event-specific properties, fills a privacy-safe common envelope, buckets counts, validates enums, rejects unknown events/properties, rejects forbidden content-like keys (`name`, `caption`, `body`, `text`, `mediaUrl`, `transcript`, etc.), and rejects unsafe string values such as URLs and emails before any transport is called. No SDK, provider transport, or product event emission call sites were added yet. Verification: `node --check apps/mobile/src/analyticsEventsModel.js apps/mobile/src/analytics.js`, `node --test apps/mobile/tests/unit/analyticsEventsModel.test.js` (9 tests), `pnpm --filter @ourlittleworld/mobile test` (188 tests), and `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`. Expo MCP visual verification was not applicable because this loop changed pure instrumentation code only.
- J3 account deletion policy: added `docs/account-deletion-policy.md` and linked it from the K7 business roadmap and architecture as the tracked **K7/J3 Delete account flow** instead of implementing destructive operations in this PRD pass. The policy covers sole-writer family deletion, co-parent/additional-writer membership removal, circle/read-only removal, redeemed/unredeemed gift handling, billing/legal record retention, Supabase auth deletion, app-owned storage/media deletion, backup/log retention, and the copy rule that camera-roll originals are not deleted. Verification: doc guardrail confirmed the tracked task and required policy terms across the policy, roadmap, architecture, and PRD; `git diff --check` passed. Expo MCP visual verification was not applicable because this loop changed policy docs only.
- J4 export and lapsed-subscription policy: added `docs/export-lapsed-subscription-policy.md` and linked it from architecture/business docs. Mobile now centralizes purchase/export trust copy in `exportPolicyCopy.js`; Purchase explains that memories are never deleted for non-payment, lapsed subscriptions become a read-only vault, and new uploads/assistant discovery/auto-save pause, while Book export and generated preview HTML name photos, videos, voice, letters, firsts, prompts, metadata, and current preview limits. Web pricing, Terms, and Refunds mirror the same lapsed-access/export policy. Verification: `node --check apps/mobile/src/exportPolicyCopy.js apps/mobile/src/archiveExportModel.js apps/mobile/src/LibraryScreen.js apps/mobile/src/PurchaseScreen.js`, `node --test apps/mobile/tests/unit/archiveExportModel.test.js` (3 tests), `pnpm --filter @ourlittleworld/mobile test` (188 tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `pnpm --filter @ourlittleworld/web build`, built-page `rg` guard for pricing/terms/refunds policy copy, source guardrails for forbidden copy, and `git diff --check` passed. Expo MCP visual verification was not available in this session; this loop was copy/policy-focused and covered by app/web builds plus built HTML checks.

## Independent review pass (2026-07-06, all sprints + J)

Every sprint diff and the notifications workstream were re-reviewed (four parallel read-only reviewers, findings adversarially verified against the code before acting).

- Sprint 2 (motion/pressability): clean. AnimatedPressable/EntranceView/SegmentedControl are reduced-motion gated with correct press-through and a11y roles; F1/F2 CTA removals match spec.
- Sprint 3 (I1/I3/I4/I7): clean. Confidence gates, Low-Power/isRunning guards, Tags.setBaby auto-save path (quota ledger honored), retry queue, and quality floor all verified correct.
- Sprint 4 (C1-C3/A3/I2/I8): clean. Three reported findings each refuted on verification (day-key already local-time; `finishPostSave` guards falsy routes; dismissal state read before nudge selection).
- Sprint 5 + review: clean. Reported BGTask plist mismatch refuted — expo-background-task multiplexes JS tasks under `com.expo.modules.backgroundtask.processing`, which is what app.config.js permits.
- **J2 CONFIRMED BUG, FIXED (6ad35a7):** quiet hours and the 2/day cap were evaluated on the UTC clock/UTC calendar day. notify-event now reads `family_ritual_settings.timezone` (IANA) for quiet-hours minutes and delivery-day keys, falling back to UTC when unset; the client stamps the device zone on ritual-settings save and after push-token registration (`ensureFamilyTimezone`). Verified with real Intl math (NY/SG/invalid-zone cases). `notify-event` redeployed after review on 2026-07-06 (project `baxgullapuksjbzkogii`, active version 2, `verify_jwt=true`).
- Housekeeping (2790aa2): committed the dangling settings-menu card presentation + `20260706133000_fix_notification_event_key_ambiguity.sql` (already applied remotely, was untracked).
- Known accepted nits (no churn): `deep_link` column vs `route` field naming in the notification center normalizer; unused `downloadFromNetwork` param in referenceAutoSeed.

Post-review health: 84 unit tests pass, `tsc --noEmit` clean, `expo lint` clean, `deno check` clean on notify-event.

Final state summary: Ordered backlog loop is complete through Sprint 5 and J1-J3; all item implementations have path-scoped commits on `polish-sprints`. Remaining blockers are verification/environment blockers already recorded on I1/I3/I7 (native face matcher/dev-client limits); J3's schema is now live, but a live unread-row/dot smoke still needs a disposable authenticated notification row. Remote Supabase migrations were applied on 2026-07-06, `send-push`/`notify-event` were deployed, no PR was opened, and no push was performed.

## Remote migration state

- No unapplied polish migrations remain on the linked Supabase project as of 2026-07-06.
- Applied on 2026-07-06: `20260705120000_goal_definition_age_windows.sql`, `20260706120000_push_tokens.sql`, `20260706123000_notification_preferences_and_events.sql`, `20260706130000_notifications_center.sql`, `20260706133000_fix_notification_event_key_ambiguity.sql`.
- Applied on 2026-07-06 (Suggested-Firsts tracks): `20260706202414_digest_quality_highlights.sql` (W2), `20260706220747_suggested_firsts_notification_category.sql` (Y1), `20260706230000_digest_quality_highlights_order_fix.sql` (W2 review fix — supersedes 202414's ordering).
- Deployed on 2026-07-06: `send-push` and `notify-event` Edge Functions (both active, `verify_jwt=true`).
- **Pending redeploy:** `notify-event` has an uncommitted-to-prod copy change (the `suggested_firsts` default title/body, additive/forward-compat). Not on Y1's critical path (Y1 delivers via local notification); redeploy when convenient.

## Tunable constants introduced

- Goal age windows (days): in `FIRST_GOAL_DEFINITIONS` (`src/rituals.js`) and the A1 migration — smile 42-70, laugh 90-135, roll 120-195, food 165-240, crawl 210-320, word 270-430, steps 300-560.
- `CATCHUP_DISMISS_DAYS = 30` (`src/firstsModel.js`) — catch-up nudge dismissal window.
- `MONTHVERSARY_BUCKET_MONTHS = [1,2,3,6]`, `MONTHVERSARY_WINDOW_DAYS = 1`, `MONTHVERSARY_MAX_PER_BUCKET = 6`, `MONTHVERSARY_MAX_AGE_DAYS = 730` (`src/onThisDay.js`).
- `AUTO_SEED_MONTH_SAMPLE_LIMIT = 30`, `AUTO_SEED_CLUSTER_SIMILARITY = 0.55`, `AUTO_SEED_MIN_BUCKET_COVERAGE = 0.6` (`src/referenceAutoSeedModel.js`) — I1 birthday reference auto-seed gates.
- `FOREGROUND_AUTO_SCAN_STALE_MS = 24h`, `BACKGROUND_AUTO_INGEST_MIN_INTERVAL_MINUTES = 720`, `AUTO_INGEST_ATTEMPT_DEBOUNCE_MS = 15s` (`src/foregroundAutoIngestModel.js`, `src/useForegroundAutoIngest.js`) — I3 foreground/background auto-ingest freshness/schedule/debounce guards.
- `ICLOUD_QUEUE_MAX_ITEMS = 200`, `ICLOUD_QUEUE_MAX_AGE_MS = 14d` (`src/iCloudRetryQueue.js`) — I4 local iCloud-original retry queue bounds.
- `AUTO_SAVE_CAPTURE_QUALITY_FLOOR = 0.25` (`src/scanQualityModel.js`) — I7 low-quality match review floor for silent auto-save.
- `POST_SAVE_NUDGE_MAX_PER_DAY = 2` (`src/postSaveNudgeModel.js`) — C2 post-save assistant question daily cap.
- `PHOTO_STACK_SESSION_GAP_MS = 30m`, `PHOTO_STACK_NEAR_DUPLICATE_DISTANCE = 0.18`, `PHOTO_STACK_KEEP_BASE = 1`, `PHOTO_STACK_KEEP_EVERY = 10`, `PHOTO_STACK_KEEP_MAX = 3` (`src/photoStackModel.js`) — I8 review stack clustering/session and default keep-count values.
- `NOTIFICATION_DAILY_HARD_CAP = 2`, `DEFAULT_QUIET_HOURS_START = 21:00`, `DEFAULT_QUIET_HOURS_END = 08:00` (`src/notificationSettingsModel.js`, `supabase/functions/notify-event/cadence.ts`) — J2 non-transactional push cap and quiet hours.
- `NOTIFICATION_CENTER_DAYS = 30` (`src/notificationCenterModel.js`) — J3 Activity center retention window.

## Items

### Pre-sprint

| Item | Status | Commit | Verification |
|---|---|---|---|
| E: /moment/[momentId] ProtectedRoute | done | 81a5310 | Follows exact `app/timeline.jsx` pattern; tsc + lint clean. |

### Sprint 1 — "the app knows Reuben" (A1, A2, B2, B3, A4, B1, H1)

| Item | Status | Commit | Verification |
|---|---|---|---|
| A1 next-goal age ranking | done | b38bcba | Unit tests (`tests/unit/firstsModel.test.js`): 11-month-old + zero firsts → next = First word, never smile; catch-up state when all windows passed. Sim-verified: hero "Coming up: first word and first steps.", Next family goal "First word · 9-14 months" for the 11-month-old test family. Migration applied remotely 2026-07-06. |
| A2 past-window goal states | done | 9d4e6f3, cb83877 | Unit tests: `goalWindowState`/`goalTimingCaption`, `selectCatchupGoal` honors 30-day dismissals and retires saved firsts. Sim-verified on iPhone 16e: past goals show "From around 4-6 months — add it whenever you remember it", in-window show "Happening around now", no "someday" on placeholder rows (date label dropped for not-done rows, cb83877). Dismissal persistence unit-tested; UI dismiss = B1 card's "Not yet". |
| B2 digest cover fallback | done | e73df3f, 949fe8e | Unit tests (`tests/unit/digestCover.test.js`): cover → milestone photo → recent shared → null hides block. Sim-verified: digest card shows a real photo instead of gray tiles; strip also filters URL-less media (949fe8e). |
| B3 plural counts | done | e901114 | `countLabel` on Today + DigestDetail metrics; sim-verified "1 milestone" singular. |
| A4 month-versary on-this-day | done | f214ad5 | Unit tests (`tests/unit/onThisDay.test.js`): bucket day-of-month math + 29th-31st clamping, birthday-bounded buckets, prior-year-only annual matches, labels. `listSharedTaggedPage` gained `capturedOnOrAfter`/`capturedBefore`. Segment hidden when no matches. |
| B1 day-card nudge slot | done | f31b971 | Unit tests (`tests/unit/dayCardNudge.test.js`): priority review > catchup > prompt > digest > fallback; pluralized copy; seeded composer route; answered/snoozed suppression. Sim-verified: day card shows one catch-up question ("Did we ever save Reuben's first smile?" + "Not yet"), age string appears once (header only), day 347 kept. |
| H1 segmented control placement | done | 3428d28 | Sim-verified: control no longer renders between the day card and prompt card; it sits directly above the timeline/places content. Empty "On this day" segment hidden (with A4). |
| Sprint 1 review | done | d9493e6 | Full-diff review; fix: bumped ritual-home cache version v1→v2 (payload shape changed). Screenshot pass surfaced the B2 strip gap (949fe8e) and A2 someday label (cb83877). |

**Sprint 1 summary:** Goal ranking, placeholder captions, and the Today nudge slot are now age-aware end to end, backed by a remote-applied migration plus client-side fallbacks. Digest cover/counts and the segmented control no longer look broken (fallback chain, singular labels, control adjacent to its content, empty "On this day" hidden). 26 unit tests green, tsc + lint clean, and Today/Firsts visually verified on the iPhone 16e simulator against the 11-month-old test family. SPRINT 1 COMPLETE.

### Sprint 2 — feel (G1, F1, F2, H2, H3 layers 1-3)

| Item | Status | Commit | Verification |
|---|---|---|---|
| G1 Today-screen cards pressable | done | 90c8c07 | `CI=true npm run lint` + `npm test` green. Simulator-verified on iPhone 16e: day nudge card opens seeded first composer, answered prompt card opens `/prompt`, digest card opens `/digest`, milestone teaser opens `/firsts`; all four expose button accessibility labels. Tunables: none. |
| F1 Empty Letters duplicate CTAs | done | cb282de | `CI=true npm run lint` + `npm test` green. Simulator-verified on iPhone 16e with zero letters: hero has no compose button, empty-state "Seal the first letter for Reuben" card keeps the single "Write the first letter" CTA, and the "Leave one more line for later" footer is hidden. Tunables: none. |
| F2 Firsts duplicate add affordances | done | e420777 | `CI=true npm run lint` + `npm test` green. Simulator-verified on iPhone 16e: hero no longer shows its duplicate "Add a first" CTA, header "+" remains for freeform adds, Next family goal preview opens a First word / 9-14 months seeded composer, and placeholder rows still open their own seeded composer. Tunables: none. |
| H2 animated SegmentedControl | done | d6c2ca5 | `CI=true npm run lint` + `npm test` green. Simulator-verified on iPhone 16e: Today Timeline↔Places and Library Photos→Places→Search use the sliding thumb and shared fade wrapper without blank content; Metro showed no H2 runtime errors. Tunables: none. |
| H3 motion vocabulary layers 1-3 | done | 9946d62 | `CI=true npm run lint` + `npm test` green. Simulator-verified on iPhone 16e: Today first-mount entrance settles into the expected card/grid layout, wrapped digest card remains tappable, photo rail/timeline/places content remains interactive, and H2 segment transitions still work. Layers covered: G1 press wrapper, H3 Today entrance stagger, H2 segment transitions. Tunables: none. |
| Sprint 2 review | done | 7bf6faf | Full-diff review; fix: inner "Not yet" and digest strip controls now stop propagation so nested card presses do not double-route. `CI=true npm run lint` + `npm test` green. Maestro/iPhone 16e smoke: Today visible and digest card still opens `/digest`; current fixture used cover fallback, so digest-strip inner routing was verified by code review. Tunables: none. |

**Sprint 2 summary:** Today, Letters, and Firsts now have one clear primary action per card/screen without duplicate CTAs or tiny-only targets. Shared segmented controls and first-mount motion are in place for Today/Library while preserving reduced-motion behavior and wrapped controls. Full-diff review found and fixed nested press propagation; lint, full tests, and iPhone 16e simulator smoke checks are green. SPRINT 2 COMPLETE.

### Sprint 3 — vault fills itself (I1, I3 phase 1, I4, I7)

| Item | Status | Commit | Verification |
|---|---|---|---|
| I1 bootstrap birthday reference | blocked | 4b383ed | Implemented setup-triggered auto-seed route, monthly/birth-window sampling, greedy clustering, auto-seed rollback, and confirm/manual fallback UI. `CI=true npm run lint` + `npm test` green; unit tests cover windows, tunables, clustering, confidence gates, and reference spread. Simulator/iPhone 16e verification blocked: after granting Photos and importing 11 temporary Reuben face photos across July 2025-May 2026, native `embedFace` failed every sampled image with `EFM_EMBED: undefined reason`, so the screen safely fell back to the manual picker and the Accept confirmation could not be verified. Tunables: `AUTO_SEED_MONTH_SAMPLE_LIMIT`, `AUTO_SEED_CLUSTER_SIMILARITY`, `AUTO_SEED_MIN_BUCKET_COVERAGE`. |
| I3 phase 1 foreground auto-ingest | blocked | 87908f9 | Implemented foreground/app-open incremental scan launcher gated by reference profile, photo permission, pending-change-or-24h-stale checkpoint, `Scan.isRunning`, and best-effort Low Power Mode; auto-save still uses the existing `Tags.setBaby` path. `CI=true npm run lint` + `npm test` green; unit tests cover reference-profile gating, pending-change start, and stale/missing checkpoint start. Simulator/iPhone 16e smoke verified Today launches with no foreground-hook runtime errors, but full Accept is blocked by I1/native reference setup: no local reference profile exists because `embedFace` fails with `EFM_EMBED: undefined reason`, so "take photo → kill app → reopen → N new moments" cannot be produced here. Constants: `FOREGROUND_AUTO_SCAN_STALE_MS`, `AUTO_INGEST_ATTEMPT_DEBOUNCE_MS`. |
| I4 iCloud-original retry queue | done | c477da8 | Implemented local family/user-scoped iCloud retry queue, targeted scan retries, scan wait/ready callbacks, upload-job persistence before iCloud resolution, PHImage progress handler, and Today/Library copy ("N photos are waiting for iCloud"). `CI=true npm run lint` + `npm test` green. Simulator/iPhone 16e verification: seeded a temporary AsyncStorage queue with 3 items, visually confirmed Today rendered "3 photos are waiting for iCloud", Maestro asserted the "Retry iCloud photos" accessibility label, then cleared the seed and relaunched. Constants: `ICLOUD_QUEUE_MAX_ITEMS`, `ICLOUD_QUEUE_MAX_AGE_MS`. |
| I7 native capture-quality scoring | blocked | 92bfff7 | Implemented native `VNDetectFaceCaptureQualityRequest` metrics plus face-size ratio and Laplacian sharpness, carried quality fields through JS match objects/calibration records, and added the 0.25 auto-save quality floor so low-quality high-score matches remain in review. `CI=true npm run lint` + `npm test` green; unit tests cover the tunable floor and review routing policy. Simulator/iPhone 16e smoke verified the app still launches, but Accept is blocked: this repo has no generated `ios/` project/workspace to compile the Swift module locally, the running dev-client binary cannot contain the new native code, and the existing simulator native matcher still fails reference setup with `EFM_EMBED: undefined reason`, so a deliberately blurred face-match test cannot be verified here. Tunable: `AUTO_SAVE_CAPTURE_QUALITY_FLOOR`. |
| Sprint 3 review | done | 9a08467 | Full-diff review; fixes: made native capture-quality scoring best-effort so it cannot break face matching, and made I1 auto-seed request network-backed asset details. `CI=true npm run lint` + `npm test` green; Maestro/iPhone 16e smoke verified Today still launches. |

**Sprint 3 summary:** Auto-seed, foreground ingest, iCloud retry handling, and native quality metadata are implemented with local fallbacks and no remote migrations. I4 is fully verified; I1/I3/I7 remain blocked only on native reference/matcher verification in this simulator/dev-client state. 38 unit tests, lint, and iPhone 16e smoke are green after full-diff review. SPRINT 3 COMPLETE WITH BLOCKERS.

### Sprint 4 — assistant follow-through (C1, C2, C3, A3, I2, I8)

| Item | Status | Commit | Verification |
|---|---|---|---|
| C1 review filter labels | done | 364f266 | Renamed only the visible review chips from confidence jargon to "Sure it's {babyName}" / "Double-check these"; filter keys and score thresholds unchanged. `CI=true npm run lint` + `npm test` green. Simulator/iPhone 16e opened `/review`, but the current fixture stayed in scanner warm-up with no match batch, so the chip branch could not be visually reached; verification is source-render-path review plus gates. Tunables: none. |
| C2 save follow-up nudge | done | 5f36f4c | Added one post-save toast-sheet chosen by first-match priority, with AsyncStorage day caps and per-moment dismissal. Unit tests (`tests/unit/postSaveNudgeModel.test.js`) cover first candidate, voice, letter, dismissed moments never re-showing, and `POST_SAVE_NUDGE_MAX_PER_DAY = 2`. `CI=true npm run lint` + `npm test` green. Simulator/iPhone 16e verified: selected one photo in the native picker, saved a photo-only moment, saw exactly one "Moment saved" question ("Could this be a First? (first word · around now)" in this fixture; first-steps case covered by unit test), tapped "Not now", and returned to Today. |
| C3 named prompt response status | done | 2394f2f | Replaced both prompt response counters with named status copy from `promptState.responses`, `partnerAnswered`, `membersById`, and the current user id; no partner answer content is shown. `CI=true npm run lint` + `npm test` green. Simulator/iPhone 16e verified by saving today's prompt response: card rendered "Saved for today." with "You answered · your co-parent hasn't yet" instead of "1 parent answered" (fixture has no second member name available). Tunables: none. |
| A3 prompt rotation | done | 03fc0dd, 3a04e4f | Added age-banded prompt pools with 14 drafted prompts per band plus shared generic filler; drafted copy is flagged for founder review. Rotation is family-seeded and day-indexed, with birthday passed through Today, prompt sheet, save, and snooze paths; cache bumped to v3. Unit tests (`tests/unit/dailyPrompts.test.js`) verify no back-to-back repeats over 120 days, 10-month-olds use the 6-12m band and never newborn prompts, deterministic same-day selection, >=14 prompts per band, shared fallback with no birthday, 30 family seeds over 700 days, and birthday-boundary no-repeat. Sprint review stress check: 50 family seeds over 900 days produced zero repeats. `CI=true npm run lint` + `npm test` green. Tunables: none. |
| I2 reference learning copy | done | cd5b8c5 | Added the honest reference-screen line: "{babyName}'s face model gets sharper every time you keep or remove a photo." to manual, auto-seeding, and auto-confirm states; no trust/matcher behavior changed. `CI=true npm run lint` + `npm test` green. Simulator/iPhone 16e verified with Maestro: loaded current Metro bundle, opened `/reference`, and asserted "face model gets sharper" was visible. Tunables: none. |
| I8 burst/photo-shoot clustering | done | a6e009e | Added review-time stack clustering for similar photo sessions, quality-ranked covers/default keeps, inline expansion, and folded-shot promotion without treating default-folded shots as negative calibration examples. `scanController` now preserves optional future feature vectors for near-duplicate clustering while falling back to session grouping. Unit tests (`tests/unit/photoStackModel.test.js`) verify a 40-shot shoot renders as <=4 stacks, >30m gaps split sessions, cover/default keeps rank by quality, expansion includes every frame, folded promotion selects the shot for saving, and keep-count tuning. `CI=true npm run lint` + `npm test` green; simulator/iPhone 16e `/review` smoke passed with Maestro. |
| Sprint 4 review | done | 3a04e4f | Full-diff review found and fixed an A3 prompt-repeat chain at age-band/birthday boundaries; added long-range and birthday-boundary tests. Rechecked I8 selection so default-folded photos are not recorded as negative examples unless explicitly skipped. `CI=true npm run lint` + `npm test` green after the review fix. |

**Sprint 4 summary:** Assistant follow-through now has parent-facing review labels, one post-save nudge, named prompt status copy, age-banded deterministic daily prompts, reference-learning copy, and review stacks for burst/photo-shoot imports. A3 prompt pools are drafted and flagged for founder review; I8 stack constants are named tunables and tested against the 40-shot Accept path. Sprint review fixed a real prompt-repeat edge case; 55 unit tests, lint, and iPhone 16e Maestro smoke checks are green. SPRINT 4 COMPLETE.

### Sprint 5 — hero moments + consistency (H3 layer 4, I3 phase 2, I5, I6, I9, A5-A7, B4-B7, C4-C5, D1-D6, F3, G2)

| Item | Status | Commit | Verification |
|---|---|---|---|
| H3 layer 4 first-saved hero moment | done | 45c06bc | Added a reduced-motion-gated Firsts hero ceremony: after the first real data load, newly completed goal keys animate the matching path segment from empty to filled and briefly plant a flag. `CI=true npm run lint` + `npm test` green. Simulator/iPhone 16e verified with Maestro: saved seeded "First word", asserted "1 of 7 goals complete", captured the planted flag/filling segment, then confirmed the segment remains filled after the ceremony clears. Tunables: none. |
| I3 phase 2 background auto-ingest | done | 6dddbff | Added an Expo BackgroundTask/TaskManager worker for opportunistic background scans using the existing `startLibraryScan`/`Tags.setBaby` auto-save path, with lazy native-module loading so the current dev-client keeps launching before a rebuild. Added `app.config.js` wrapper to append the background-task plugin and BG processing config without touching the already-dirty `app.json`. Unit test covers background gate/cadence; `CI=true npm run lint` + `npm test` green. Verified `expo config --type introspect` resolves `UIBackgroundModes: processing` and `BGTaskSchedulerPermittedIdentifiers: com.expo.modules.backgroundtask.processing`; iPhone 16e simulator launched Today without a native-module crash. Native background execution itself is not simulator-verifiable, and the current dev-client must be rebuilt before registration runs for real. Tunable: `BACKGROUND_AUTO_INGEST_MIN_INTERVAL_MINUTES = 720`. |
| I5 Library reads as all child photos | done | 8a1d00f | Reframed Library as "{child}'s photos" with month/age archive sections, grouped moment tiles with best media on top/count badges, an explicit device camera-roll Browse card, and "Added by the assistant" recent-auto-save copy. `CI=true npm run lint` + `npm test` green. Simulator/iPhone 16e verified with Maestro: title "Reuben's photos.", "Device camera roll" + "Browse camera roll", and "Month by month." all visible; current fixture had no recent-auto-save rows, so that conditional render path was verified by source review. Tunables: none. |
| I6 Photos deletion reconciliation | done | f588c5d | Media-library changes now persist exact `deletedAssetIds`; scan startup marks matching owned `moment_media.metadata` with `localAssetStatus: deleted_from_device`/`localAssetDeletedAt` without deleting cloud media, and poster-only video promotion is suppressed with "still in the vault" copy when the local source is gone. Unit tests (`tests/unit/localAssetDeletion.test.js`) cover preserving cloud paths + deletion status/timestamp. `CI=true npm run lint` + `npm test` (58 tests) green. Simulator/iPhone 16e launched Today without runtime errors; real Photos deletion-event marking is source-path verified because the current fixture has no safe disposable saved local asset to delete. Tunables: none. |
| I9 curation policy | done | e59c01f | Added stack policy: higher quality becomes default cover, pinned/parent picks outrank quality, below-floor siblings fold out of default saves while staying expandable/promotable, and collapsed stack copy shows "Kept sharpest N of M · see rest" (or parent-pick copy). Unit tests (`tests/unit/photoStackModel.test.js`) cover pinned override, below-floor folding, expansion, and promotion; `CI=true npm run lint` + `npm test` (60 tests) green. Simulator/iPhone 16e `/review` smoke rendered "Warming up the scanner" without runtime errors. Tunables: none new; reuses `AUTO_SAVE_CAPTURE_QUALITY_FLOOR`. |
| A5 age label format consistency | done | 85f9205 | Central `formatAge` now spells out mixed units with commas: "11 months, 14 days old" and "1 year, 3 months" instead of `13d`/`3m`. `CI=true npm run lint` + `npm test` (60 tests) green. Simulator/iPhone 16e Today header visually verified "11 months, 14 days old". Tunables: none. |
| A6 timezone age math consistency | done | 45aee99 | Extracted pure `ageModel` and changed `ageAt` to parse birthday ISO dates at local midnight; Today's `daysSince` now uses the same local-calendar-day diff. Unit tests (`tests/unit/ageModel.test.js`) cover local-midnight parsing, shared day-count math, and spelled-out age labels. `CI=true npm run lint` + `npm test` (63 tests) green. Simulator/iPhone 16e Today verified "11 months, 13 days old" paired with "day 348" (previous UTC parse showed 14 days). Tunables: none. |
| A7 stale seeded age comment | done | 5c0f05e | Seeded first-compose now defaults `happened_at` to the latest day in the keyed goal's age window, clamped to today, and the picker shows "Roughly when it happened is fine." Unit tests (`tests/unit/firstComposeSeedModel.test.js`) cover past-window, current/future, and missing-window defaults. `CI=true npm run lint` + `npm test` (66 tests) green. Simulator/iPhone 16e verified seeded First smile opened with Wednesday, October 1, 2025 for the 6-8 week window plus the helper copy. Tunables: none. |
| B4 empty-week digest card | done | 277492b | Added shared `digestHasContent` rule and hid Today's digest card when `moment/milestone/voice/letter` content totals zero; `digestUnread` uses the same rule. Unit tests (`tests/unit/digestModel.test.js`) cover empty hidden and each non-empty count visible. `CI=true npm run lint` + `npm test` (68 tests) green. Simulator/iPhone 16e smoke verified the current non-empty digest card still renders; empty branch verified by unit helper + Today render guard. Tunables: none. |
| B5 "For you, today" ranking | done | 4c47132 | Renamed the recent-photo rail header and no-age fallback chip to "Recent" so the UI no longer implies personalization. `CI=true npm run lint` + `npm test` (68 tests) green. Simulator/iPhone 16e Maestro verified "Recent" visible and "For you, today" not visible. Tunables: none. |
| B6 milestone teaser unfinished placeholder | done | 43d8212 | Added `buildFirstsSummary` so Today ignores `done === false` firsts, counts only completed firsts, and carries the matched shared photo for the teaser thumbnail; ritual-home cache bumped to v4. Unit tests (`tests/unit/firstsSummaryModel.test.js`) cover unfinished placeholder filtering and attached-photo selection. `CI=true npm run lint` + `npm test` (70 tests) green. Simulator/iPhone 16e launched and scrolled Today with no B6 runtime errors; current fixture did not expose a completed teaser, so the thumbnail branch is verified by unit + source render path. Tunables: none. |
| B7 scan banner copy | done | df1d3b9 | Replaced scan-review infrastructure language with parent-facing photo copy: "N new photos look like Reuben — take a look.", plus a softer waiting caption. Unit tests (`tests/unit/scanBannerCopyModel.test.js`) verify plural/singular copy and absence of "media that needs a parent." `CI=true npm run lint` + `npm test` (72 tests) green. Simulator/iPhone 16e launched Today and the scan-updates tap completed, but the active review banner cleared before it could be captured, so visible copy is verified by unit + render-source path. Tunables: none. |
| C4 add-sheet secondary actions back stack | done | b24d074 | Changed Add Sheet secondary actions from `router.replace` to `router.push` so closing the secondary sheet returns to Add. `CI=true npm run lint` + `npm test` (72 tests) green. Simulator/iPhone 16e Maestro verified: open Add, swipe to secondary actions, tap "Answer today's prompt", see "today's note", tap Cancel, and return to Add with "Answer today's prompt" still visible. Tunables: none. |
| C5 digest detail empty next step | done | ca18f0a | Added the empty-state "Add a moment from this week" CTA and filtered URL-less representative rows out of the grid so they fall through to the empty branch. `CI=true npm run lint` + `npm test` (72 tests) green. Simulator/iPhone 16e launched `/digest`; current live fixture had representative rows and refreshed over the temporary empty cache before the CTA could be captured, so the empty branch is verified by source render path plus the live digest smoke. Tunables: none. |
| D1 someday capitalization | done | f098b19 | Aligned `FirstsScreen` missing-date fallback with Today's `Someday` capitalization. `CI=true npm run lint` + `npm test` (72 tests) green. `rg` verified no lowercase `someday` fallback remains in the two cited screens; simulator/iPhone 16e opened Firsts cleanly. Tunables: none. |
| D2 prompt placeholder tone | done | 662d2c9 | Standardized prompt textarea placeholder to the single copy "A few lines are enough." for voice and non-voice states. `CI=true npm run lint` + `npm test` (72 tests) green. `rg` verified the old "Add a few lines, optional." branch is gone; simulator/iPhone 16e opened `/prompt` without regression, though the current saved response filled the textarea and hid the placeholder visually. Tunables: none. |
| D3 tag normalization | done | be3c360 | Added shared tag helpers so moment tags trim, strip leading `#`, lowercase, and dedupe on create/update; Moment detail and Library pills render capitalized labels. Unit tests (`tests/unit/tagModel.test.js`) cover "First, first, #FIRST" → `first` plus display capitalization. `CI=true npm run lint` + `npm test` (74 tests) green. Simulator/iPhone 16e opened Library cleanly with the new formatter import. Tunables: none. |
| D4 milestone teaser sentence case | done | 13cc7e3 | Sentence-cased only the Today milestone teaser display/accessibility title; stored first titles remain unchanged. Unit test (`tests/unit/milestoneTitleModel.test.js`) covers "Reuben Crawled today!" → "Reuben crawled today!". `CI=true npm run lint` + `npm test` (75 tests) green. Simulator/iPhone 16e Today smoke loaded cleanly; current home fixture still did not expose the completed milestone teaser branch, so display branch is verified by unit + source render path. Tunables: none. |
| D5 Library singular counts | done | c6e972d | Replaced Library visible count strings with shared singular/plural helpers for saved moments, moments, photos, videos, and voice notes. `CI=true npm run lint` + `npm test` (75 tests) green. Simulator/iPhone 16e opened Library cleanly; current fixture was empty, so singular branches are verified by source path plus `rg` confirming no raw "1 saved moments" style count remains. Tunables: none. |
| D6 voice-only tile layout | done | 803a2c8 | Voice-only archive tiles now use their own centered mic + "Voice" + one-line title layout and suppress the image/video overlay caption, so the title cannot overlap light-on-light. `CI=true npm run lint` + `npm test` (75 tests) green. Simulator/iPhone 16e verified Library opens, Search has a real 1-voice-note fixture row, and the Voice filter row renders without overlap; the month-grid voice tile branch is source-verified because the current Photos grid area stayed blank after scrolling/waiting. Tunables: none. |
| F3 duplicate CTA audit | done | 5af5c64 | Removed remaining same-destination composer CTAs found by the audit: Today's unanswered prompt now has one "Answer prompt" action instead of two `/prompt` buttons, and empty Firsts no longer adds a second freeform `/first-compose` button beyond the header add/seeded rows. `CI=true npm run lint` + `npm test` (75 tests) green. Simulator/iPhone 16e smoke verified Today and Firsts render cleanly; active fixture showed answered prompt and non-empty Firsts, so removed branches are source-verified. Tunables: none. |
| G2 Letters/Library hero-card press audit | done | 5444b38 | Letters hero already has no inner button after F1. Library camera-roll card is now a whole-card press target with a chevron and no nested browse button. `CI=true npm run lint` + `npm test` (75 tests) green. Simulator/iPhone 16e verified the card renders without the inner CTA; Maestro point tap fired the card and removed the collapsed card, though the expanded local-camera-roll branch rendered empty in this fixture. Tunables: none. |
| Sprint 5 review | done | 6b8846e | Full-diff review; fixes: Search/Export now open legacy archive photo records via the shared record opener, and Library/local archive grids use explicit responsive tile sizes plus placeholder-backed thumbnails so saved records cannot render as blank hairline rows. `CI=true npm run lint` + `npm test` (75 tests) green. Simulator/iPhone 16e verified Library month grid renders real tiles/placeholders and Today/Firsts launch cleanly. Tunables: none. |

**Sprint 5 summary:** Hero-moment motion, background ingest registration, Library archive reframing, deletion reconciliation, curation policy, and consistency/copy sweeps are implemented and verified with focused unit coverage plus simulator smokes.
The sprint review fixed two Library correctness issues: legacy archive records no longer become disabled in Search/Export, and month/local grids now have stable visible tiles even when thumbnails fail.
Lint, full tests, and iPhone 16e screenshots for Library/Today/Firsts are green after the review fix. SPRINT 5 COMPLETE.

### Notifications workstream (J1-J3)

| Item | Status | Commit | Verification |
|---|---|---|---|
| J1 notification infrastructure | done | 2917806 | Added `expo-notifications@~56.0.19`, config plugin/default channel, owner-only `push_tokens` migration (applied remotely 2026-07-06), native-safe token registration/launch refresh/sign-out delete, value-moment prompt hooks, protected notification route handling, and `send-push` with Expo tickets/receipts/token pruning. Verified `CI=true npm run lint`, `npm test` (78 tests), `deno check supabase/functions/send-push/index.ts`, and `expo config --type introspect --json` showing `expo-notifications` + iOS `aps-environment`. Simulator/iPhone 16e: current pre-rebuild dev-client launches cleanly via lazy native guard; `/digest` deep link and cold-start scheme open through `AppGate` to the protected digest sheet, not a blank screen. APNs/FCM token retrieval still requires the next EAS rebuild/credentials. Tunables: none. |
| J2 event catalog and cadence | done | ed46591 | Added category defaults/preferences/quiet hours, partner-activity client hooks, event outbox/delivery logs, prompt/First/letter SQL triggers, weekly-digest enqueueing, and `notify-event` cadence dispatch. Verified `CI=true npm run lint`, `npm test` (81 tests), `deno check supabase/functions/send-push/index.ts supabase/functions/notify-event/index.ts supabase/functions/notify-event/cadence.ts`, and `deno test supabase/functions/notify-event/cadence_test.ts` (one partner batch/day, category-off stops send, hard cap). Simulator/iPhone 16e verified Settings → Rituals → Notifications shows `7 on · quiet 9:00 PM-8:00 AM`, quiet-hour controls, and category switches including Partner activity; `/prompt` route allow-list covered by notification route tests. Migration applied remotely 2026-07-06; `notify-event` deployed. |
| J3 in-app notification center | done | bf3f05a | Added owner-only `notifications` migration (applied remotely 2026-07-06), `send-push` row writes before Expo send, 30-day Activity center reads, Today bell + unread dot path, `/activity` ProtectedRoute sheet, grouped rows, H3 row press feedback, `/moment/[id]` route allow-list, mark-all-read on open, and footer to J2 notification preferences. Verified `CI=true npm run lint`, `npm test` (84 tests), `deno check supabase/functions/send-push/index.ts supabase/functions/notify-event/index.ts supabase/functions/notify-event/cadence.ts`, `deno test supabase/functions/notify-event/cadence_test.ts`, and `git diff --check`. Unit tests cover center grouping/normalization/icon fallback and notification route allow-list including `/moment/123`; simulator/iPhone 16e verified Today bell placement, Activity sheet/empty state as one line, footer navigation to "Push notifications", and no numeric badge. Live schema verified via REST after migration; live unread row/dot smoke still needs a disposable authenticated notification row. Tunable/retention constant: `NOTIFICATION_CENTER_DAYS = 30`. |

**Notifications summary:** Push registration, event cadence/preferences, and the in-app Activity center are implemented with client fallback paths retained. J3 review tightened missing-table fallbacks so permission/runtime errors are not hidden as schema misses. Lint, full mobile tests, Deno checks/tests, Supabase migration checks, and Edge Function deployment checks are green; live unread rows still need a disposable authenticated row for a full remote smoke. NOTIFICATIONS WORKSTREAM COMPLETE.

### Sprint S-A — Suggested Firsts end-to-end (S1-S4, Track S)

Source of truth: `docs/polish-backlog.md` section S + approved plan `~/.claude/plans/pure-munching-sunset.md`. Principle: assistant-first, parent-approved — the app drafts, the parent confirms; copy never claims certainty and is asserted verbatim in tests.

| Item | Status | Commit | Verification |
|---|---|---|---|
| S1 compose-sheet preselect params | done | 169b9b8 | `seedAssetId/seedAssetOwnerUserId/seedAssetUri/seedDate/seedNote` params on `/first-compose`; `seedPhotoFromParams`/`mergeSeedIntoCandidates`/`normalizeSeedDateParam` in `firstComposeSeedModel.js`. Seed merges to rail front, reusing the saved archive row when one matches (save then reuses the existing upload). Unit tests: 14 in `firstComposeSeedModel.test.js` (own vs partner asset, dedupe, date validation). |
| S2 suggestion model + store | done | 169b9b8 | `firstSuggestionModel.js` (pure) + `firstSuggestionStore.js` (AsyncStorage `olw:first-suggestions:v1:{familyId}:{userId}`). Window math (window start → min(window end, today); past-window stays with A2 catch-up), quality-cascade ranking reusing `photoStackModel.qualityValue`/`featureDistance` (now exported), non-near-duplicate alternates (feature distance < 0.18, else 10-min gap), keep/not_this/choose_another feedback, 30-day dismissal, 7-day Today snooze, 24 h regen throttle. 14 unit tests incl. verbatim guardrail copy ("Possible first smile", "Around Oct 1", "Worth a look", "Nothing is saved until you keep it."). |
| S3 targeted generation | done | 169b9b8 | `firstSuggestionScanner.js`: due goals (cap 2/run), pages `fetchPhotosPage` inside the goal window (cap 240 assets), scores via `matchAgainstReferenceProfile`, persists ≤1 suggestion/goal, stamps `lastGeneratedAt` even on null. Silent no-op without native matcher / library permission / reference profile (fallback matcher scores 0.5 < 0.65 min). Triggered from Firsts screen after `firstsLoaded`, `InteractionManager.runAfterInteractions`-deferred. Native-path scan needs the dev-client on device (same I1/I7 environment blocker). |
| S4 SuggestedFirstCard | done | 169b9b8 | Card on Firsts between hero and list: eyebrow Worth a look, "Possible first roll", "Around Jul 6 · from your photo library", primary (96pt) + alternates (68pt, tap = choose_another promote), Keep / Not this, footer guardrail line. Keep routes through `keepRouteForSuggestion` → S1-seeded compose. Display-time done-goal filter covers partner-saved staleness. `__DEV__` fixture: long-press header "+" seeds from real archive photos. Maestro flows `.maestro/suggested-first-keep.yaml` + `suggested-first-not-this.yaml` both green on iPhone 16e (keep → prefilled compose → save → goal complete; not-this hides and survives relaunch). |

Verification (whole sprint): `npm test` (tsc + 112 unit tests) green, `CI=true npx expo lint` clean, both Maestro flows pass on iPhone 16e (iOS 26.0), screenshot pass of Firsts card + seeded compose sheet. SPRINT S-A COMPLETE.

**Tunable constants introduced (S):** `FIRST_SUGGESTION_MIN_SCORE = 0.65` (mirrors `REVIEW_THRESHOLD`, not importable — supabase client), `FIRST_SUGGESTION_MAX_ALTERNATES = 5`, `FIRST_SUGGESTION_MIN_ALTERNATES = 2`, `FIRST_SUGGESTION_ALTERNATE_TIME_GAP_MS = 10m`, `FIRST_SUGGESTION_REGEN_INTERVAL_MS = 24h`, `FIRST_SUGGESTION_DISMISS_DAYS = 30`, `FIRST_SUGGESTION_SNOOZE_DAYS = 7` (`src/firstSuggestionModel.js`); `FIRST_SUGGESTION_SCAN_CAP = 240`, `FIRST_SUGGESTION_GOALS_PER_RUN = 2` (`src/firstSuggestionScanner.js`).

### Sprint S-B — Today surface + trust calibration (S5, S6)

| Item | Status | Commit | Verification |
|---|---|---|---|
| S5 Today suggested-first nudge | done | e82add0 | `selectDayCardNudge` gains `firstSuggestion` between review and catchup (`Worth a look · Possible first smile — 3 photos to look at` → `/firsts`, plural via `countLabel`). TodayScreen reads the device-local store on focus (`selectTodaySuggestion` honors the 7-day snooze); `useRitualHomeData` exposes `goalRows` (cache v4→v5 — payload shape changed). Card dismiss "Not now" = `snoozeFirstSuggestion` (Today-only; Firsts card unaffected). Unit tests: priority order review > suggested-first > catchup > prompt > digest, photo-count copy singular/plural. Maestro `today-suggested-nudge.yaml` green on iPhone 16e: seed → Today nudge shows → Not now snoozes (card falls back) → Firsts card still present. Known limitation: the nested "Not now" pressable is flattened out of the a11y/XCUITest tree exactly like catchup's "Not yet" (N3 tracks unflattening); the Maestro flow taps by point on the pinned device. |
| S6 trust calibration | done | e82add0 | `suggestionTrustForDetector` + per-detector counters recorded in `applySuggestionFeedback`: base minScore 0.65 → 0.75 after 2 not-this with zero keeps → detector quiet 60 days after 4; one keep resets the counter and re-enables. Scanner gates generation on `trust.enabled` and passes `trust.minScore` to `buildFirstSuggestion`. Deliberately separate from face-match negativeExamples. Unit test walks the full raise→disable→expiry→keep-reset ladder. |

Verification (whole sprint): `npm test` (tsc + 114 unit tests) green, `expo lint` clean, Maestro flow green on iPhone 16e. SPRINT S-B COMPLETE.

**Tunable constants introduced (S-B):** `FIRST_SUGGESTION_HIGH_CONFIDENCE_SCORE = 0.75`, `FIRST_SUGGESTION_TRUST_RAISE_AFTER = 2`, `FIRST_SUGGESTION_TRUST_DISABLE_AFTER = 4`, `FIRST_SUGGESTION_TRUST_DISABLE_DAYS = 60` (`src/firstSuggestionModel.js`).

### Sprint UV — suggested notes + prompt starters (U1, V1)

| Item | Status | Commit | Verification |
|---|---|---|---|
| U1 suggested note in first-compose | done | 3ecfa8c | `captionTemplateModel.js`: `suggestedFirstNote` composes only date + computed age + time-derived scene label ("Jul 6 — 11 months, 13 days old. Midday outing."); the labeler's generic 'Family outing' fallback is filtered out (a note must not claim what metadata doesn't show). Ghost row under the compose note field with `Use`; hidden once the note is non-empty; never auto-inserted. Unit tests assert exact templates and part-dropping. Maestro `first-note-suggestion.yaml` green on iPhone 16e: row shows on a seeded first, Use fills the note, offer disappears. |
| V1 prompt starter | done | 3ecfa8c | `promptStarterModel.js`: `promptStarterForToday` counts photos captured on the local day and names the latest time of day ("Today we saved 3 moments — one from this afternoon."); empty string when nothing saved (no filler). `useRitualHomeData` exports `readCachedSharedPhotos`; PromptSheetScreen shows a ghost "Start from today's moments" button (hidden once the answer field has text) that inserts the starter. Unit tests cover counts, singular, time-of-day buckets, off-day/junk rows. Sim smoke not feasible today (today's prompt is already answered so the button is correctly hidden); covered by unit tests. |

Verification (whole sprint): `npm test` (tsc + 118 unit tests) green, `expo lint` clean, Maestro U1 flow green on iPhone 16e. SPRINT UV COMPLETE.

### Sprint W — quality-ranked digest highlights (W1, W2)

| Item | Status | Commit | Verification |
|---|---|---|---|
| W1 quality metadata at upload | done | 95e8a10 | `mediaUploadMetadataModel.js` (pure) wraps the metadata objects in all three photoSync upload paths (image, video, poster-only) so scan-produced `captureQuality`/`recognitionScore`/`faceCount` ride into `moment_media.metadata` (jsonb, no migration). Keys added only when the scan produced them — unit test caught and fixed a `Number(null) === 0` coercion that would have written `captureQuality: 0` for missing signals. |
| W2 digest representative media ranking | done | 95e8a10 | Migration `20260706202414_digest_quality_highlights.sql` replaces only the `v_representative_media` block of `assemble_weekly_digest`: milestone-linked media first, then `captureQuality` desc (regex-guarded numeric cast), then recency + sort_order exactly as before (historical rows fall back via `-1`). `supabase db reset --local --no-seed` + `db lint` green; seeded psql smoke verified pick order `milestone-low-q → plain-high-q → plain-mid-q → plain-no-metadata` (milestone wins despite lowest quality; quality beats recency). **Applied remotely 2026-07-06** (version 20260706202414; local file renamed to match). DigestDetailSheetScreen needed no change. |

Verification (whole sprint): `npm test` (tsc + 120 unit tests) green, `expo lint` clean, local db reset + lint + seeded RPC smoke, remote migration applied. SPRINT W COMPLETE.

### Sprint XY — suggested letters + suggested notifications (X1, Y1)

| Item | Status | Commit | Verification |
|---|---|---|---|
| X1 suggested letter after first-save | done | cce101e | `firstSavedLetterNudge` (in `postSaveNudgeModel.js`) seeds letter-compose from facts only: title `About your first smile`, body `On October 1, 2025, at 2 months old, we saved your first smile.` — a fact about the archive, never a claim about the world (locked by unit test regex). Wired into `FirstComposeSheetScreen` save path for newly-completed firsts, gated by the shared post-save daily cap (`canShowPostSaveNudge`, `POST_SAVE_NUDGE_MAX_PER_DAY = 2`). Extracted `PostSaveNudgeSheet` to its own file so both AddSheet and compose reuse it (`savedLabel` prop varies "Moment saved"/"First saved"). Maestro `first-saved-letter-nudge.yaml` green on iPhone 16e: seed → Keep → Save → "First saved · Leave one line for the eighteenth-birthday letter?" (screenshot confirmed); cap-suppression verified live (daily count of 2 correctly hides the nudge). |
| Y1 suggested-firsts local notification | done | cce101e | Suggestions are device-local, so this is a **local** notification on the generating device (not a family push). `suggestedFirstNotifierModel.js` (pure): copy "Three possible first-smile photos are ready to review." (count spelled out, milestone hyphenated, "possible" guardrail), quiet-hours wrap-past-midnight check, per-suggestion-id de-dupe, category-off suppression. `suggestedFirstNotifier.js` (impure): AsyncStorage store + `expo-notifications` scheduler (no-op without native/permission). Scanner fires it for the freshest suggestion, passing loaded preferences. New `suggested_firsts` category added to `notificationSettingsModel`, both migration check constraints (`20260706220747`, applied remotely), and `notify-event` cadence/copy (forward-compat). Sim-verified: Notifications settings row now reads **"8 on"** (was 7). **Pending follow-up:** `notify-event` redeploy (copy-only, additive; not on Y1's critical path since delivery is local); actual local-notification fire needs the native push module (same J1/dev-client environment blocker). |

Verification (whole sprint): `npm test` (tsc + 126 unit tests) green, `expo lint` clean, `deno check` clean on notify-event index+cadence, local db reset + lint, migration applied remotely (20260706220747), Maestro X1 flow green on iPhone 16e. SPRINT XY COMPLETE (with recorded notify-event redeploy follow-up).

### Post-implementation review pass (2026-07-06, S–XY)

Four parallel adversarial reviewers (Suggested-Firsts core, compose/post-save, Today/notifier/settings, SQL/data) + independent verification. One confirmed bug found and fixed; all other findings triaged as false-positives or by-design.

- **W2 CONFIRMED BUG, FIXED (`20260706230000_digest_quality_highlights_order_fix.sql`):** `assemble_weekly_digest` ordered `representative_media` by `row_number() over ()` (empty window), whose value Postgres does not guarantee to follow the subquery's `ORDER BY`; `jsonb_agg(... order by rank)` then re-sorted by that non-deterministic rank, so milestone-linked and higher-quality media did NOT reliably rank first. Found via an adversarial 6-moment seeded smoke (earlier 4-row smoke coincidentally passed). Fix ranks with an explicit `row_number() OVER (ORDER BY <criteria>)` CTE, takes top 4, aggregates by that rank. Re-verified locally: scrambled 6-moment case yields `milestone(0.80) → q099 → q095 → q030` (milestone wins despite lowest quality; quality beats recency); historical no-metadata case falls back to pure recency (`newest → middle → oldest`). `db reset --local` + lint green; **applied remotely 2026-07-06** (version 20260706230000).
- **Triaged as NOT bugs (verified against code):** (1) `event.stopPropagation?.()` on the Today "Not now"/"Not yet" pressables — React Native's touch responder does not bubble to parent Pressables, so no double-fire; the catchup pattern predates this work (f31b971) and is sim-verified. (2) `seedPhotoFromParams` "ownership bypass" — the scanner always stamps `ownerUserId = current user`, no app path emits cross-user params, and both members are family writers; theoretical only. (3) "Duplicate upload" on photo re-select — `uploadForTag` upserts with `onConflict`, idempotent. (4) Snooze asymmetry (Today snooze vs Firsts card) — by design per the approved plan; permanent removal is "Not this" (30-day dismissal), honored by both selectors. (5) Quiet-hours `start==end` disabled, `photoCount>5` digit fallback, `undefined preferences` default-on — all correct as written. (6) Stale suggestion id after choose_another — cosmetic; no consumer parses the id (all use `primary.assetId`), test locks it intentionally.

Post-review health: 126 unit tests pass, `tsc --noEmit` clean, `expo lint` clean, `deno check` clean, local db reset + lint clean.

**Tunable constants introduced (XY):** `SUGGESTED_FIRSTS_CATEGORY = 'suggested_firsts'`, `SUGGESTED_FIRSTS_ROUTE = '/firsts'` (`src/suggestedFirstNotifierModel.js`); reuses `NOTIFICATION_DAILY_HARD_CAP = 2`, `DEFAULT_QUIET_HOURS_START/END` and `POST_SAVE_NUDGE_MAX_PER_DAY = 2`.

## Notes

### Website acquisition funnel repair (2026-07-14)

- Self-checkout now asks only for a preselected plan and email; profile and child-stage details are deferred to onboarding.
- Consent-granted, bounded UTM campaign/creative attribution is allowlisted into Stripe Checkout and subscription metadata.
- Checkout success now verifies the Stripe session and waits for webhook-provisioned claim state before showing a code or recording completion. The self-purchase path opens the app with the code prefilled and supports configured store-install links; pending claims remain explicit and retryable.
- Mobile redemption analytics now classify website, gift, and partner codes from the authoritative RPC response instead of treating every code as a gift.
- Website analytics now has explicit allow/deny controls and a persistent preferences entry point.
- Deployment, live payment testing, public store URLs, and production credential changes remain intentionally pending owner operations.

- Unit tests: `node --test` under `apps/mobile/tests/unit/` (`npm run test:unit`; `npm test` = tsc + unit). No RN test framework existed before.
- Pre-existing staged files on master (.nvmrc, .serena/, app.json, eas.json, docs/*) carried onto the branch uncommitted; item commits are path-scoped so they are never swept in.
- Known minor: after reading the digest, Today's "story is ready" nudge can persist up to the 30s refresh TTL before clearing.
- B1 keeps the standalone prompt card below the nudge slot per backlog spec; F3 (Sprint 5) may revisit the duplication when the nudge is the prompt.
- Sim verification: dev-client build on iPhone 16e simulator + Metro at :8092; deep-link `com.jessekrim.ourlittleworld://expo-development-client/?url=http://localhost:8092` to load the branch bundle.

### Walkthrough fixes — Book navigation and print-draft clarity (2026-07-09)

- Updated mobile shell/header so nested Book sections can show an explicit back button; verified Firsts and Letters on iPhone Air show the back affordance and keep Book selected in the tab bar.
- Updated Book to show the native vertical scroll indicator, reveal a Jump to top control after scrolling, reset scroll position when switching Book segments, and land Book Preview at the top of Export instead of preserving the prior scroll offset.
- Reframed Book Preview/Export copy as a printable draft: parents still choose favorites, edit captions, and approve layout before anything is print-ready.
- Verification: `pnpm --filter @ourlittleworld/mobile test` (tsc + 224 unit tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, `git diff --check`, `maestro test --udid 6BB2E649-971D-4B3F-9FD5-665402BC79A0 /tmp/olw-book-jump-top-smoke.yaml`, and `maestro test --udid 6BB2E649-971D-4B3F-9FD5-665402BC79A0 /tmp/olw-book-preview-smoke.yaml`.
- Expo MCP screenshot/tap was attempted but blocked by multiple booted iOS simulators; per-device `simctl` screenshots and Maestro on iPhone Air covered the visual/runtime checks.

### PRD acceptance audit — source copy cleanup (2026-07-09)

- Audited `docs/assistant-curated-baby-book-prd.md`: all 42 PRD tasks are checked complete, with no remaining unchecked loop task. Updated the PRD status from planned to implementation complete with final end-to-end QA pending.
- Cleaned stale raw web home copy in `apps/web/content/pageContent.ts` so the source text, not only the exported replacement chain, carries the likely camera-roll discovery, parent approval, and private book-growth positioning. Exported `pageContent.home` now reads directly from `rawPageContent.home`.
- Verification: `pnpm --filter @ourlittleworld/web test`, `pnpm --filter @ourlittleworld/web build`, `git diff --check`, a node guardrail scan for stale/present home-page phrases, and a node checkbox audit reporting `{ total: 42, counts: { x: 42 }, open: 0 }`.
- Follow-up: final full-product end-to-end QA is still pending; the audit did not re-run every mobile PRD scenario in this continuation.

### PRD guardrail audit — Letters framing cleanup (2026-07-09)

- Removed remaining broad/public old Letters framing from App Store copy, notification category copy, and generated App Store screenshots: letters are now described as kept/written in the private baby book, while sealed-letter wording is limited to existing sealed-letter compatibility states.
- Regenerated `apps/mobile/app-store/screenshots/iphone-65/*.png` and `apps/mobile/app-store/screenshots/ipad-pro-129/*.png`; visually checked the updated iPhone Letters screenshot and confirmed the badge now says `kept`.
- Verification: `python3 apps/mobile/app-store/generate_screenshots.py`, `node --test apps/mobile/tests/unit/notificationSettings.test.js`, `pnpm --filter @ourlittleworld/mobile test` (tsc + 224 unit tests), `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`, ASC metadata JSON parse, and guardrail `rg` for old `time-capsule letters` / `seals a letter` phrases in touched public surfaces.
- Expo MCP was attempted again, but `expo_router_sitemap` is still connected to a different Expo project, so it was not used as evidence for this repo.

### PRD full-gate audit — broad verification and runtime smokes (2026-07-09)

- Ran the PRD section 14 broad gates against the current handoff: `pnpm test` (web typecheck plus mobile tsc + 224 unit tests), `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm db:reset:migrations`, `deno check supabase/functions/notify-event/index.ts supabase/functions/notify-event/cadence.ts supabase/functions/send-push/index.ts`, `deno test supabase/functions/notify-event/cadence_test.ts`, and `git diff --check`; all passed.
- Re-audited PRD task state with a node checkbox script: `{ total: 42, counts: { x: 42 }, open: 0 }`.
- Re-ran Expo MCP route inspection; it still reports a different Expo project (`CoachingQuestions`, mentor routes, etc.), so Expo MCP remains invalid evidence for this repo until the MCP connection is reattached to this project.
- Added deterministic Maestro runtime smokes on iPhone Air (`6BB2E649-971D-4B3F-9FD5-665402BC79A0`): `/tmp/olw-book-jump-top-deterministic.yaml` scrolls Book Export, verifies `Jump to top`, taps it, and verifies `Printable book draft.` returns; `/tmp/olw-firsts-open-after-prompt.yaml` verifies Firsts shows `Go back` and returns to `Reuben's book.`; `/tmp/olw-letters-back-smoke.yaml` verifies Letters shows `Go back` and returns to `Reuben's book.`.
- Added top-level navigation smoke `/tmp/olw-top-level-nav-smoke-v2.yaml`: verifies Today opens, Book opens as `Reuben's book.`, and Add opens the progressive `Save a moment` sheet.
- Note: older temporary Book smokes failed because they assumed the simulator was already scrolled with `Jump to top` visible; the deterministic scroll-first flow replaced that precondition and passed. The first Firsts deep-link attempt hit iOS's `Open in "Our Little World"?` confirmation prompt; accepting it and rerunning the back-button assertion passed.
- Note: the first top-level nav smoke asserted the Add tab would expose text `Add`; the product actually opens the sheet as `Save a moment`, which is the intended progressive Add copy. The corrected assertion passed.
- Remaining gap before marking the full PRD complete: section 15's seven manual QA scenarios have strong model/test coverage and targeted simulator evidence, but they have not all been re-run end to end in one controlled fixture with brand-new, large-library, connected-first/letter, save-flow, dismissal, calibrated-auto-save, and export states.

### PRD section 15 manual-QA evidence matrix (2026-07-09)

- Ran a targeted model verifier for the section 15 behavior lanes: `node --test apps/mobile/tests/unit/addMomentModel.test.js apps/mobile/tests/unit/postSaveNudgeModel.test.js apps/mobile/tests/unit/dayCardNudge.test.js apps/mobile/tests/unit/bookHomeModel.test.js apps/mobile/tests/unit/bookCollectionsModel.test.js apps/mobile/tests/unit/momentConnectionChips.test.js apps/mobile/tests/unit/photoIngestionTrustModel.test.js apps/mobile/tests/unit/autoSaveCorrectionModel.test.js apps/mobile/tests/unit/firstSuggestionModel.test.js apps/mobile/tests/unit/assistantFeedbackTransparencyModel.test.js apps/mobile/tests/unit/archiveExportModel.test.js apps/mobile/tests/unit/visionSceneLabeler.test.js` passed 79 tests.
- Current simulator fixture evidence: Book top screenshot `/tmp/olw_current_book_top.png` shows `Reuben's book.`, current chapter/readiness copy, Firsts and Letters cards, and Book Preview before utility controls; tapping the visible Book Preview card by point in `/tmp/olw-book-preview-card-current-point.yaml` opened `Printable book draft.` at the top.
- Scenario 1, brand-new family/no photos: covered by `bookHomeModel` empty-archive tests and `dayCardNudge` fallback tests; still needs a real brand-new-family simulator pass for Today empty state and Firsts/Letters reachability.
- Scenario 2, 500 photos/no firsts: current fixture has roughly 497 photos and proves Book does not open with utility/admin noise; `visionSceneLabeler` tests prove no raw coordinate primary titles. It is not a no-firsts fixture, so review/suggested-first behavior still needs a controlled large-library/no-firsts pass.
- Scenario 3, several firsts and one letter: `bookCollectionsModel`, `bookHomeModel`, and `momentConnectionChips` tests prove first/letter summaries and connected moment links. Current fixture has several firsts but no saved letters, so a runtime connected-first/letter fixture remains missing.
- Scenario 4, photo-only save: `addMomentModel` proves media-only save eligibility with title/place/tags secondary, and `postSaveNudgeModel` proves exactly one context-preserving nudge. Runtime save was not run in this pass to avoid mutating the current family/archive data.
- Scenario 5, assistant suggestion dismissal: `firstSuggestionModel` tests prove `Not this` dismisses/excludes without immediate repeat, and `assistantFeedbackTransparencyModel` proves it does not become a child-identity or face-match negative. Runtime dismissal was not re-run in this pass.
- Scenario 6, calibrated auto-save: `photoIngestionTrustModel` and `autoSaveCorrectionModel` tests prove first scan review-first, clean review readiness, active auto-save copy, assistant-added state, removal/correction, and trust lowering/pausing. Native calibrated scan runtime still needs a controlled library/dev-client pass.
- Scenario 7, export/print preview: covered by `archiveExportModel` tests plus current simulator Book Preview/Export smokes; export is framed as an ownership/trust feature and the printable book draft copy says parents choose favorites, edit captions, and approve layout before print readiness.
- Generated artifact cleanup: `deno.lock` was produced by the Deno verifier and removed because it is untracked generated output.

### PRD section 15 repeatable verifier (2026-07-09)

- Added `apps/mobile/tests/unit/prdManualQaScenarios.test.js`, a named seven-scenario verifier for the section 15 manual QA lanes: brand-new/no photos, 500-photo/no-firsts, several firsts plus one letter, photo-only save, assistant suggestion dismissal, calibrated auto-save, and export/print preview.
- The verifier composes existing pure models instead of seeding or mutating the current simulator archive. It checks the product constraints that matter most for the walkthrough: no fabricated baby feelings/firsts, parent approval language, no raw coordinate place titles, review-first photo trust, auto-save pause after corrections, Photos originals not deleted, and printable-book draft limits.
- Verification: `node --test apps/mobile/tests/unit/prdManualQaScenarios.test.js` passed 7 tests; `pnpm --filter @ourlittleworld/mobile test` passed tsc plus 231 unit tests; `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` passed; `git diff --check` passed.
- Follow-up: this closes the repeatable model-level acceptance gap. Fully controlled runtime fixtures are still needed before calling section 15 end-to-end complete for brand-new family, large-library/no-firsts, connected first/letter, save-flow mutation, dismissal, calibrated native scan, and export states in one simulator run.

### PRD runtime QA smokes — Book walkthrough fixes (2026-07-09)

- Added committed Maestro smokes for the user walkthrough fixes: `apps/mobile/.maestro/book-navigation-smoke.yaml`, `apps/mobile/.maestro/book-export-scroll-smoke.yaml`, and `apps/mobile/.maestro/top-level-today-add-book.yaml`.
- Updated the older Suggested Firsts Maestro flows to deep-link to `/firsts` instead of tapping a removed Firsts bottom tab, preserving the PRD bottom-nav contract (`Today`, `Add`, `Book`) while keeping Firsts reachable from Book.
- Runtime verification on iPhone Air `6BB2E649-971D-4B3F-9FD5-665402BC79A0`: `maestro test --udid 6BB2E649-971D-4B3F-9FD5-665402BC79A0 apps/mobile/.maestro/book-navigation-smoke.yaml` passed and proved Book home cards expose `Open Firsts`, `Open Letters`, `Open Book preview`, plus explicit `Go back` on Firsts and Letters.
- Runtime verification on the same simulator: `maestro test --udid 6BB2E649-971D-4B3F-9FD5-665402BC79A0 apps/mobile/.maestro/book-export-scroll-smoke.yaml` passed and proved `library?segment=export` lands at `Printable book draft.`, shows `Build draft PDF` and `Private summary`, reveals `Jump to top` after scroll, and returns to the top.
- Runtime verification on the same simulator: `maestro test --udid 6BB2E649-971D-4B3F-9FD5-665402BC79A0 apps/mobile/.maestro/top-level-today-add-book.yaml` passed and proved the top-level loop is Today -> Book -> Add with `Save a moment` opening from Add.
- Expo MCP was rechecked with `expo_router_sitemap`; it still reports the unrelated Mentors app (`CoachingQuestions`, mentor routes), so MCP remains invalid evidence for this repo until reattached. `git diff --check` passed after the Maestro flow updates.
- Follow-up: these smokes strengthen runtime coverage for scenarios 1, 3, and 7 around navigation and export clarity, but they do not replace controlled data fixtures for brand-new/no-photos, large-library/no-firsts, connected first+letter, save mutation, suggestion dismissal, and native calibrated scan.

### PRD runtime QA smokes — Suggested Firsts dismissal and Today surface (2026-07-09)

- Made the dev-only Suggested Firsts seeder repeatable by letting `saveGeneratedSuggestions` clear stale dismissed/snoozed state for explicitly reset goal keys. Production generation still keeps dismissal behavior; the reset is only used by the Firsts header long-press QA fixture.
- Updated `apps/mobile/.maestro/today-suggested-nudge.yaml` to match the current Today priority model. In the active simulator fixture, a blocking repair card owns the main day-card slot, so the suggested first appears in Tonight as `Check: Possible first smile may belong with Firsts` and routes back to Firsts.
- Runtime verification on iPhone Air `6BB2E649-971D-4B3F-9FD5-665402BC79A0`: `maestro test --udid 6BB2E649-971D-4B3F-9FD5-665402BC79A0 apps/mobile/.maestro/suggested-first-not-this.yaml` passed and proved `Not this` hides the suggestion immediately and after app relaunch.
- Runtime verification on the same simulator: `maestro test --udid 6BB2E649-971D-4B3F-9FD5-665402BC79A0 apps/mobile/.maestro/today-suggested-nudge.yaml` passed and proved Today surfaces the seeded possible first and the `Check` action returns to Firsts with the suggestion still visible.
- Verification: `node --test apps/mobile/tests/unit/firstSuggestionModel.test.js apps/mobile/tests/unit/prdManualQaScenarios.test.js` passed 22 tests; `pnpm --filter @ourlittleworld/mobile test` passed tsc plus 231 unit tests; `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` passed; `git diff --check` passed.
- Follow-up: scenario 5 now has runtime evidence for immediate/relaunch dismissal. Scenario 2 has runtime evidence that Today can surface a suggested first, but a clean no-blocking large-library/no-firsts fixture is still needed to prove it owns the primary Today slot.

### PRD runtime QA smokes — Suggestion handoff to compose (2026-07-09)

- Extracted `applyGeneratedSuggestionsToState` as a pure helper and added unit coverage for the QA reset path, so the dev-only seeder's stale dismissal/snooze clearing is covered by tests instead of only by Maestro.
- Runtime verification on iPhone Air `6BB2E649-971D-4B3F-9FD5-665402BC79A0`: `maestro test --udid 6BB2E649-971D-4B3F-9FD5-665402BC79A0 apps/mobile/.maestro/first-note-suggestion.yaml` passed. The flow seeds a possible first, taps `Keep`, verifies the prefilled `Suggested first` compose sheet, uses the metadata-only suggested note, verifies the offer disappears, then cancels without saving a new first.
- Verification: `node --test apps/mobile/tests/unit/firstSuggestionModel.test.js apps/mobile/tests/unit/prdManualQaScenarios.test.js` passed 23 tests; `pnpm --filter @ourlittleworld/mobile test` passed tsc plus 232 unit tests; `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` passed; `git diff --check` passed.
- Follow-up: this strengthens runtime evidence that accepted assistant suggestions carry context into parent approval. The photo-only Add save path itself is still model-covered only in this pass because a runtime save would mutate the active family/archive fixture.

### PRD runtime QA smokes — Book manual-QA fixtures (2026-07-09)

- Added a dev-only, non-mutating Book QA fixture path in `LibraryScreen`: `qa=empty` and `qa=large-no-firsts` render controlled Book data only under `__DEV__`, with no writes to the active family archive.
- Added `libraryManualQaFixtures.js` and `libraryManualQaFixtures.test.js` to cover empty Book state, 500 saved/book-ready photo rows with zero firsts/letters, quiet upload/iCloud utility state, and human place labels (`At home`, `At the park`) without raw coordinates.
- Added committed Maestro smoke `apps/mobile/.maestro/book-manual-qa-fixtures.yaml`. Runtime verification on iPhone Air `6BB2E649-971D-4B3F-9FD5-665402BC79A0` passed: empty Book shows the first-chapter copy and Firsts/Letters entry points; large-no-firsts exposes Book entry cards without repair noise; Export shows the 500 count and printable draft copy; Places shows human labels.
- Verification: `node --test apps/mobile/tests/unit/libraryManualQaFixtures.test.js apps/mobile/tests/unit/bookHomeModel.test.js apps/mobile/tests/unit/prdManualQaScenarios.test.js` passed 19 tests; `pnpm --filter @ourlittleworld/mobile test` passed tsc plus 236 unit tests; `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` passed; `git diff --check` passed; `maestro --device 6BB2E649-971D-4B3F-9FD5-665402BC79A0 test apps/mobile/.maestro/book-manual-qa-fixtures.yaml` passed.
- Follow-up: section 15 runtime coverage now includes controlled brand-new/no-photos and large-library/no-firsts Book states. Remaining runtime gaps are connected first+letter fixture, photo-only Add save mutation, and native calibrated auto-save; Expo MCP is still attached to another project and was not used as evidence.

### PRD runtime QA smokes — Connected first and letter fixture (2026-07-09)

- Extended the dev-only manual QA fixture set with `qa=connected-first-letter`, which creates two parent-approved moments, two completed firsts, and one open letter linked to the first-smile moment without writing rows to the family archive.
- Wired the same fixture into `MomentDetailScreen` for `/moment/[momentId]?qa=connected-first-letter`, so Moment detail can render linked First and Letter chips from controlled data while production loading still uses the real store.
- Added committed Maestro smoke `apps/mobile/.maestro/book-connected-story-links.yaml`. Runtime verification on iPhone Air `6BB2E649-971D-4B3F-9FD5-665402BC79A0` passed: Book shows First and Letter context in the chapter, and the synthetic `Morning smile` moment exposes `First: First smile` and `Letter: For your first birthday` story-link chips.
- Verification: `node --test apps/mobile/tests/unit/libraryManualQaFixtures.test.js` passed 5 tests; `pnpm --filter @ourlittleworld/mobile test` passed tsc plus 237 unit tests; `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` passed; `git diff --check` passed; `maestro --device 6BB2E649-971D-4B3F-9FD5-665402BC79A0 test apps/mobile/.maestro/book-connected-story-links.yaml` passed.
- Follow-up: section 15 runtime coverage now includes controlled connected first+letter evidence. Remaining runtime gaps are photo-only Add save mutation and native calibrated auto-save; both need either a disposable family/dev fixture that can mutate safely or a deeper non-mutating QA harness.

### PRD runtime QA smokes — Photo-only Add dry-run fixture (2026-07-09)

- Added a dev-only `qa=photo-only` Add fixture that preloads a single image asset into the Add sheet and runs the normal save/post-save decision flow in dry-run mode, avoiding writes to the current family archive.
- Added `apps/mobile/src/addManualQaFixtures.js`, unit coverage, and committed Maestro smoke `apps/mobile/.maestro/add-photo-only-dry-run.yaml`. Runtime verification on iPhone Air `6BB2E649-971D-4B3F-9FD5-665402BC79A0` passed: Add opens as `Save a moment`, the photo-only save is enabled, `Save moment` shows `Moment saved`, and the one context-preserving voice nudge appears with `Open moment` plus `Not now`.
- Verification: `node --test apps/mobile/tests/unit/addManualQaFixtures.test.js apps/mobile/tests/unit/addMomentModel.test.js apps/mobile/tests/unit/postSaveNudgeModel.test.js` passed 17 tests; `maestro --device 6BB2E649-971D-4B3F-9FD5-665402BC79A0 test apps/mobile/.maestro/add-photo-only-dry-run.yaml` passed; `pnpm --filter @ourlittleworld/mobile test` passed tsc plus 239 unit tests; `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` passed; `git diff --check` passed.
- Follow-up: section 15 runtime coverage now includes a non-mutating photo-only Add save path. The remaining native runtime gap is calibrated auto-save against a controlled device photo library/dev-client state.

### PRD calibrated auto-save verifier hardening (2026-07-09)

- Added `scanAutoSaveModel.js` as the pure scan auto-save gate used by runtime code: first scans stay review-first, clean review history can earn trust, parent opt-in is required before auto-save, malformed thresholds fall back to the internal default, and low-quality/borderline/duplicate matches remain in review.
- Wired `scanController` to use `selectScanAutoSaveMatches` for its queue selection and `recognitionTrust` to use `buildScanAutoSaveGate` for `bucketForScore` and `getAutoSaveConfig`, so the tested model now owns the scan decision path instead of living only in PRD scenario tests.
- Extended section 15 calibrated auto-save coverage in `prdManualQaScenarios.test.js`: first scan produces no auto-save plan; active auto-save marks only the clear high-quality match for assistant save; low-quality and borderline matches remain for review; the durable source remains `scan-auto-save`.
- Verification: `node --test apps/mobile/tests/unit/scanAutoSaveModel.test.js apps/mobile/tests/unit/prdManualQaScenarios.test.js apps/mobile/tests/unit/photoIngestionTrustModel.test.js apps/mobile/tests/unit/scanQualityModel.test.js` passed 27 tests; `pnpm --filter @ourlittleworld/mobile test` passed tsc plus 244 unit tests; `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` passed; `git diff --check` passed; `maestro --device 6BB2E649-971D-4B3F-9FD5-665402BC79A0 test apps/mobile/.maestro/top-level-today-add-book.yaml` passed.
- Follow-up: this closes the model/runtime-decision evidence gap for calibrated auto-save. A true native scan against a disposable controlled photo library remains the only unproven hardware/dev-client evidence: first review batch, parent opt-in, later clear-match auto-save through `Tags.setBaby`, and removal/correction on real local assets.

### PRD native calibrated auto-save dry-run smoke (2026-07-09)

- Added a dev-only `/native-auto-save-smoke` route and committed Maestro flow that run against real simulator Photos, native face embedding/matching, `scanController`, and a dry-run auto-save sink without writing to the active family archive.
- Seeded the iPhone Air simulator with scratch face/control assets outside the repo and verified the smoke route can select the controlled target assets from Photos.
- Fixed iOS simulator Vision failures by using the default face-detection revision and forcing Vision requests to CPU only in simulator builds. Device builds keep the normal Vision request path.
- Fixed targeted `ph://` Photos lookup fallback in `fetchMediaScanCandidatesByIds`, so a normalized-id miss no longer prevents the raw Photos id from being tried.
- Runtime verification on iPhone Air `6BB2E649-971D-4B3F-9FD5-665402BC79A0`: `maestro --device 6BB2E649-971D-4B3F-9FD5-665402BC79A0 test apps/mobile/.maestro/native-auto-save-smoke.yaml` passed after rebuilding and installing the native app.
- Verification: `node --check apps/mobile/src/photos.js apps/mobile/src/NativeAutoSaveSmokeScreen.js`; `xcodebuild -workspace apps/mobile/ios/OurLittleWorld.xcworkspace -scheme OurLittleWorld -configuration Debug -destination 'id=6BB2E649-971D-4B3F-9FD5-665402BC79A0' -derivedDataPath apps/mobile/ios/build/DerivedData build`; `xcrun simctl install 6BB2E649-971D-4B3F-9FD5-665402BC79A0 apps/mobile/ios/build/DerivedData/Build/Products/Debug-iphonesimulator/OurLittleWorld.app`; `node --test apps/mobile/tests/unit/scanAutoSaveModel.test.js apps/mobile/tests/unit/prdManualQaScenarios.test.js apps/mobile/tests/unit/photoIngestionTrustModel.test.js apps/mobile/tests/unit/scanQualityModel.test.js` passed 27 tests; `pnpm --filter @ourlittleworld/mobile test` passed TypeScript plus 244 unit tests; `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` passed; `git diff --check` passed after this log update.
- Follow-up: real Supabase upload/removal through `Tags.setBaby` was intentionally not run on the active family. Use a disposable family/account before claiming real-write coverage for calibrated auto-save and correction removal.

### PRD completion audit — broad gates and combined runtime smokes (2026-07-09)

- Re-audited `docs/assistant-curated-baby-book-prd.md`: all 42 task checkboxes are complete, with no unchecked, in-progress, or blocked task.
- Ran the broad PRD gates against the current handoff: `pnpm test` passed web typecheck plus mobile TypeScript and 244 unit tests; `pnpm lint` passed web ESLint and mobile Expo lint; `pnpm typecheck` passed web/mobile TypeScript; `pnpm build` passed the web production build; `pnpm db:reset:migrations` reset the local Supabase database and found no schema lint errors; `deno check supabase/functions/notify-event/index.ts supabase/functions/notify-event/cadence.ts supabase/functions/send-push/index.ts` passed; `deno test supabase/functions/notify-event/cadence_test.ts` passed 3 tests; `git diff --check` passed.
- Removed the untracked `deno.lock` generated by Deno verification so generated verifier output does not remain in the worktree.
- Hardened the Suggested Firsts Maestro flows to scroll to the seeded `Possible first` card before asserting or tapping it. In a combined run after Book/Add flows, the card can sit below the hero or preserved scroll position even though the dev seeder works.
- Runtime verification on iPhone Air `6BB2E649-971D-4B3F-9FD5-665402BC79A0`: one sequential Maestro command passed all 10 committed PRD smokes in 1m 15s: `book-navigation-smoke`, `book-export-scroll-smoke`, `top-level-today-add-book`, `book-manual-qa-fixtures`, `book-connected-story-links`, `add-photo-only-dry-run`, `suggested-first-not-this`, `today-suggested-nudge`, `first-note-suggestion`, and `native-auto-save-smoke`.
- Completion boundary at this point: implementation, model coverage, broad gates, and non-mutating runtime QA were complete. The later local disposable-family real-write smoke below closes the remaining `Tags.setBaby` upload and assistant-added removal/correction evidence gap without touching a real family archive.

### PRD final real-write QA — local disposable family (2026-07-09)

- Added a dev-only `/real-auto-save-write-smoke` route guarded to local Supabase targets only. It refuses to run against remote Supabase, creates a disposable local auth user and family, redeems a local QA gift entitlement, picks a still simulator photo, writes it through `Tags.setBaby` with `source: scan-auto-save`, verifies `photo_tags`, `moment_media`, and storage objects, removes it through `removeAutoSavedMemory`, and verifies row/storage cleanup plus the correction/negative-example calibration row.
- Added `apps/mobile/src/supabaseQaGuard.js` and unit tests so the remote-write refusal is covered without depending on the route UI.
- Added repeatable local seed SQL at `apps/mobile/scripts/seed-local-real-write-smoke.sql`; run it before the real-write Maestro flow with `supabase db query --local -f apps/mobile/scripts/seed-local-real-write-smoke.sql`.
- Runtime verification on iPhone Air `6BB2E649-971D-4B3F-9FD5-665402BC79A0`: started a temporary local-env Metro server on port 8093 with `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and the local anon key from `supabase status -o env`; `maestro --device 6BB2E649-971D-4B3F-9FD5-665402BC79A0 test apps/mobile/.maestro/real-auto-save-write-smoke.yaml` passed. The temporary Metro server was stopped afterward.
- Final verification: `node --check apps/mobile/src/RealAutoSaveWriteSmokeScreen.js apps/mobile/src/supabaseQaGuard.js`; `node --test apps/mobile/tests/unit/supabaseQaGuard.test.js apps/mobile/tests/unit/scanAutoSaveModel.test.js apps/mobile/tests/unit/prdManualQaScenarios.test.js` passed 14 tests; `supabase db query --local -f apps/mobile/scripts/seed-local-real-write-smoke.sql -o json` confirmed the local QA code was available; the real-write Maestro smoke passed; `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed; the PRD checkbox audit reported 42/42 complete and 0 open; port 8093 had no remaining listener after stopping the temporary Metro server.

### Layered app icon and launch bloom (2026-07-11)

- Added an iOS Icon Composer document at `apps/mobile/assets/brand/our-little-world.icon`, kept Android on its existing adaptive icon, and made the six 1024px source layers reproducible through `generate-brand-assets.py`.
- Reworked the native splash to show the cream badge shell, then hand off at the same 240-point center to a React Native bloom: heart and sprout rise from the bottom, leaves and flower dots open, the terracotta ring resolves, and the wordmark settles below. Reduced Motion shows the completed mark without the bloom sequence.
- Runtime verification on iPhone Air `6BB2E649-971D-4B3F-9FD5-665402BC79A0`: rebuilt and installed the native app with `expo run:ios`, captured timed simulator frames across the bloom, and confirmed the native badge and React mark stay aligned with sharp 1024px layers and no framing jump.
- Verification: `python3 apps/mobile/scripts/generate-brand-assets.py`; `pnpm --filter @ourlittleworld/mobile exec eslint src/LaunchScreen.js`; `pnpm --filter @ourlittleworld/mobile exec tsc --noEmit`; `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`; `pnpm --filter @ourlittleworld/mobile test` passed TypeScript plus 249 unit tests; the native iPhone Air build passed with 0 errors; `git diff --check` passed.

### Birthday-first discovery progress and recovery (2026-07-11)

- Confirmed the reported screen was running the birthday-reference bootstrap, but the bootstrap analyzed as many as 30 sampled photos per month sequentially and exposed only an indefinite spinner. It now reports sampling and face-analysis counts, a staged percentage, and on-device privacy copy while preserving the existing confidence and parent-confirmation gates.
- Birthday setup now analyzes up to three sampled photos concurrently. The screen names the flow as step 1 of 2, keeps `Choose one photo instead` in the first viewport, cancels the automatic run when selected, clears auto-seeded references, and gives a clear manual fallback when no repeated face is found.
- Added pure progress-copy/percentage coverage and a dev-only, non-mutating `progressPreview=1` fixture with committed Maestro flow `apps/mobile/.maestro/birthday-discovery-progress.yaml`.
- Verification: `node --test apps/mobile/tests/unit/referenceAutoSeedModel.test.js` passed 7 tests; `pnpm --filter @ourlittleworld/mobile typecheck` passed; `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` passed; final `pnpm --filter @ourlittleworld/mobile test` passed TypeScript plus 261 unit tests; `maestro --device 6BB2E649-971D-4B3F-9FD5-665402BC79A0 test apps/mobile/.maestro/birthday-discovery-progress.yaml` passed on iPhone Air; scoped `git diff --check` passed. Expo MCP was exposed but still attached to a different Expo project, so it was not valid runtime evidence for this screen.
- Verification note: a global `git diff --check` is currently blocked by unrelated trailing whitespace in the user's concurrent Letter compose/detail edits; those files were not changed or cleaned as part of this task.

### Dark-mode discovery and letter studio (2026-07-11)

- Replaced static light-palette styling in the birthday-discovery progress panel with active theme surfaces, borders, text, spinner, and progress colors.
- Rebuilt Letter compose as a private writing studio with optional writing starters, a larger editor, protected draft dismissal, photo/video library and camera capture, original voice recording, and editable on-device iOS transcription. The saved-letter view now renders image/video attachments and voice playback.
- Added letter-owned media and voice persistence without creating timeline moments. New parent constraints require each attachment to belong to exactly one moment or letter; RLS keeps letter attachments writer-only while preserving circle access to explicitly shared moment media.
- Visual verification used a temporary development-only preview route on a dark-mode iPhone 16 Pro simulator; the clean capture confirmed readable contrast, stable two-column tools, unclipped starter labels, and a spacious editor. The preview route and temporary Maestro flow were removed afterward. Expo MCP could not resolve this repo's dynamic bundle config, so direct simulator and Maestro inspection were used.
- Verification: focused dark-mode/letter tests passed 8 tests; `pnpm --filter @ourlittleworld/mobile test` passed TypeScript plus 264 unit tests; `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` passed; `pod install` integrated `ExpoLetterTranscriber`; the iPhone 16 Pro simulator `xcodebuild` passed with the module linked; scoped `git diff --check` passed. The new migration and pgTAP additions were not executed because the local Supabase service at `127.0.0.1:54322` was unavailable and `supabase start` hung waiting on Docker; the verifier processes were stopped and no database reset was attempted.

### Discovery reference-selection correction (2026-07-11)

- Corrected the product model that treated chronological position as quality: likely-child cluster membership now uses identity evidence only; quality is retained from native Vision and applied afterward to choose the strongest reference per age bucket and a separately persisted confirmation representative. The deterministic representative score is capture quality 28%, sharpness 18%, usable face size 16%, complete bounds 10%, frontality 10%, exposure 6%, one-face preference 6%, and identity centrality 6%, renormalized over available signals. Recency is limited to a 0.025 close-tie preference when both candidates have measured visual quality; missing metrics fall back to identity, face count, and stable asset id rather than newest.
- Replaced newest-30-per-month sampling with a maximum 456-candidate temporal spread: birth-window slices, up to 12 evenly spaced monthly age windows split into four subwindows and queried from both chronological directions, plus both directions of seven recent daily slices. Candidate ids are deduplicated and native analysis remains capped at three concurrent images. This is bounded for power-user libraries and remains entirely on device, but does not yet cache prior analyses; diagnostic output records only aggregate candidate/face/query counts, cache hits, duration, reference-bucket count, and a coarse representative-quality band.
- Added explicit `representativeReferenceId` local persistence and migration. Reopening and chronological sorting preserve it, adding a newer low-quality reference cannot replace it, removing it chooses the next deterministic eligible reference, and the compatibility mirror follows the explicit representative. Future matching chooses from the complete age-diverse set using age affinity, quality, identity confidence, parent confirmation/keeps, trusted source, and diversity; displayed/newest/last status provides no bonus.
- Verification: targeted Discovery tests passed 20/20; full `pnpm --filter @ourlittleworld/mobile test` passed TypeScript plus 277 unit tests; `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` passed; the iPhone 16 Pro simulator `xcodebuild` passed; and scoped `git diff --check` passed. On iPhone Air, first-time Discovery completed its real native analysis against the authorized simulator library and safely showed manual fallback because it could not establish a repeated face across three age buckets. Aggregate diagnostics were 2 eligible candidates analyzed, 2 faces found, 114 bounded metadata queries, 0 cache hits, and 1,009 ms scan time; host RSS sampling during a separate run peaked about 191 MB above the simulator process baseline, with full-resolution Photos requests already capped to 1280px and three concurrent analyses. Expo MCP screenshot capture remained unavailable because multiple simulators were booted, so Maestro, a temporary Metro log session, and direct simulator capture were used.
- Remaining real-library verification: the large personal library from the report is on the paired physical iPhone, which was locked when queried, while the available simulator libraries contain only 6 and 10 photos. No source photos or unrelated state were changed, and no private imagery or identifiers were committed/logged. A final large-library run still needs that phone unlocked (or an authorized large simulator library) to compare the selected portrait, verify age-bucket retention and reopen persistence visually, and record representative-quality/runtime aggregates. Tunables: cluster similarity 0.55, minimum month coverage 0.60, max 12 age windows/references, candidate cap 456, concurrency 3, recency tie margin 0.025.

### Moment detail and milestone flow correction (2026-07-12)

- Replaced the ambiguous two-column `Story links` tiles with full-width, sentence-level sections: `Add to the story` contains explicit actions (`Mark a first`, `Write letter`, and `Add a note` only when context is missing), while `Connected to this moment` contains only saved First/Letter/weekly-recap relationships. Voice, place, and book-ready state are no longer duplicated as pseudo-links.
- Removed the always-present `Shared with co-parents` card from photo detail. Family-circle visibility remains available from the existing ellipsis action menu, including invite/keep-private behavior.
- Added a photo-focus state to Moment detail. Tapping a still photo minimizes the details and changes the photo to uncropped `contain` presentation; the visible handle supports native pan gestures down from details and up from photo focus, and also remains tappable and accessible. Changing moments resets to the normal detail state.
- Corrected `Set as milestone`: it no longer inserts a completed First before confirmation. It opens an unsaved draft seeded with the moment title/note/photo and capture date. The linked moment date is rendered as a non-editable fact, the already-selected photo is summarized once instead of showing the archive picker, the redundant Source card is removed, Save performs the create, and Cancel returns without a write. Existing linked Firsts still reopen for editing.
- Verification: `node --test apps/mobile/tests/unit/momentConnectionChips.test.js apps/mobile/tests/unit/momentMilestoneModel.test.js apps/mobile/tests/unit/firstComposeSeedModel.test.js` passed 20 focused tests; full `pnpm --filter @ourlittleworld/mobile test` passed TypeScript plus 281 unit tests; `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` and scoped diff checks passed. On the authorized iPhone Air simulator, committed non-mutating smoke `apps/mobile/.maestro/moment-detail-story-and-photo.yaml` passed: revised actions rendered with no co-parent card; photo tap, handle swipe-down, and sheet swipe-up were reversible; the milestone draft showed the inherited fixed date/photo with no Source or photo picker; and Cancel returned without saving. Private simulator screenshots stayed outside the repo.

### Private family world product reset (2026-07-15)

- Recovered the decision path from sessions `019f4461-86f9-70a2-b9dc-67a34d12de58`, `019f4250-32a1-7651-9afc-5ffa907233eb`, and `019f3a10-1cd2-7730-ac1a-6ea5fc9fd917`. The Book-centered navigation was a recent product-direction choice, not a storage or authorization constraint; existing moments, letters, voice media, family writer access, and review flows support a private family-space model.
- Restored the parent-facing loop to `Today` → `Add` → `Our World`. Add now begins with photos/moment, note to each other, voice note, or letter to baby; each route reduces the composer to the relevant inputs. Parent notes reuse durable text-only moments in the authorized shared timeline and emit a content-free co-parent activity notification.
- Reframed the first Our World viewport around moments, media, voices, Firsts, Letters, and notes. Search, photo review, places, and export remain available, while print/photo-book work is explicitly a secondary future extra. Removed book-production language from ordinary onboarding, save, review, recap, deletion, and reminder paths.
- Added `docs/private-family-world-prd.md` as the active direction and marked the July 8 baby-book PRD as a historical implementation record. Internal `book*` data/model names remain temporarily for compatibility.
- Verification: `pnpm --filter @ourlittleworld/mobile test` passed TypeScript plus 288 unit tests; `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` passed; and `git diff --check` passed. On the signed-in local-only iPhone 16e simulator, `top-level-today-add-book.yaml` passed Today → Our World → Add and the intention chooser, while `book-navigation-smoke.yaml` passed the readable full-width parent-note/voice cards plus Firsts and Letters navigation. Expo/local screenshots verified updated onboarding, the Add chooser, the parent-note composer, and the Our World empty state. Expo JavaScript error-log collection returned no errors. The disposable auto-save fixture initially lacked its local QA entitlement seed after Supabase restart; the local seed was restored without a reset or production access.

### Best-photo-first capture and review (2026-07-15)

- Added a reusable, bounded on-device candidate pass that scores recent or date-relevant likely-child photos, ranks measured quality first, and suppresses visual lookalikes before presenting them. Add Moment, First compose, and Letter compose now lead with these distinct candidates and keep the native Photos picker as a one-tap full-library choice.
- Corrected review-stack behavior so a lookalike burst defaults to one best frame regardless of burst size. Expanded stacks still expose every original and allow a parent to promote a different frame. Older native builds without visual fingerprints now fall back to a three-second burst gap instead of incorrectly folding an entire 30-minute photo session.
- Extended the iOS matcher result with the already-computed candidate feature vector, avoiding a second Vision analysis while enabling visual comparison in JavaScript. Candidate analysis stays on device, is bounded to 48 recent images, and is cached briefly per family/window.
- Verification: `node --test tests/unit/photoStackModel.test.js tests/unit/bestPhotoCandidateModel.test.js tests/unit/firstSuggestionModel.test.js` passed 29 focused tests; `pnpm --filter @ourlittleworld/mobile test` passed TypeScript plus all 293 unit tests; and `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` passed. Fresh iOS Debug and Release simulator builds succeeded, and the Release app installed and launched. Expo MCP remained attached to a different project, while the available simulator had no authenticated family session, so the signed-in candidate rails could not be visually exercised without creating remote account data; no account or family was created for this check.

### Event-first family space and two-parent libraries (2026-07-16)

- Timeline and Search now fold only uncaptioned photo-only records captured inside the conservative three-second burst window, choose the clearest representative, and expose the hidden saved frames on demand. Places render one representative per saved event, weekly recaps show one representative per moment, and the prompt composer can place one clear already-saved photo from the relevant day beside the writing starter.
- Interrupted uploads now retry quietly from both the local queue and the current writer's incomplete cloud rows with a five-minute cooldown. Technical error strings were removed from the parent surface; one calm Retry card remains only when background recovery cannot finish.
- Added a production two-parent library contract and implementation. Each writer independently authorizes and scans their own phone, maintains their own child reference/trust/checkpoint state, and can mutate only their own aggregate `family_library_connections` row. The partner-visible panel shows connection health but never camera-roll items, asset ids, face data, fingerprints, candidates, or rejects. The shared archive remains the union of saved contributions.
- Added explicit moment-open receipts for family writers plus honest Added by, Read/Seen by, reacted, and replied labels. Short private replies remain attached to the canonical moment. Reactions and replies emit content-free partner activity and never treat push delivery as a read.
- Verification: 19 focused tests passed; full `pnpm --filter @ourlittleworld/mobile test` passed TypeScript plus all 300 unit tests; `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` passed; `deno check supabase/functions/notify-event/index.ts` passed; and scoped diff checks passed. The three additive migrations executed successfully inside one rollback-only local transaction. The normal local migration runner was not used because the existing database ledger contains remote-only July 13-14 versions absent from this checkout; no history repair or remote change was attempted. A fresh Debug iOS simulator build succeeded. Its Expo dev launcher hit the same pre-JavaScript SwiftUI/AttributeGraph crash previously observed on this multi-project simulator, so signed-in visual checks remain outstanding; this was a launcher failure before the app bundle connected to Metro, not a runtime failure in these screens.

### Day-by-day first-year curation and video viewing (2026-07-16)

- Added `dailyCurationModel.js` as the shared day-first policy. It groups the complete
  scan by local calendar day, keeps one strongest eligible baby photo as the daily
  anchor, then retains every additional distinct standout and special video without
  an arbitrary per-day count cap. Missing eligible photos remain honest gaps. For the
  July 23, 2025 birthday, July 16, 2026 is modeled as inclusive first-year day 359.
- Scan auto-save selection now waits until all photo pages and sampled videos have
  finished, preventing an early weak frame from winning before the best daily
  representative is known. Review defaults use the same daily policy while preserving
  parent picks, skips, native-picker escape, review-first trust, and correction paths.
- Corrected duplicate evidence: the native face-crop feature print remains identity
  evidence only. A cheap whole-image plus selected-face perceptual fingerprint now
  drives near-duplicate suppression, so separate photos cannot fold merely because
  they contain the same baby. Older builds without a perceptual fingerprint use only
  the conservative three-second burst fallback.
- Video candidates now collapse multiple sampled frames back to the source asset,
  retain the strongest frame, and record sampled/matching-frame presence. Review and
  calibrated auto-save attempt full playable video first and use poster-only fallback
  only when media policy requires it. Moment detail pages horizontally through every
  saved photo and video, shows position in the set, pauses off-screen videos, and keeps
  native controls plus full-screen playback.
- Our World now shows honest first-year photo-day coverage and a recent horizontal
  day rail. `Open all 365 days` leads to a virtualized first-year list with a card for
  every elapsed day, neutral gap rows, and all saved standouts/videos for populated
  days. Coverage is built only from saved photo/video records and therefore combines
  both parents' approved contributions without reading either unsaved camera roll.
  Its archive read now uses stable 500-row pagination up to 5,000 curated moments, so
  standouts cannot silently push early first-year days past the old 500-moment screen
  limit. The general timeline keeps a bounded recent render window while the daily
  album owns full first-year browsing. The active PRD, current product state, and
  architecture now carry the durable day-first contract and explicitly avoid
  unvalidated smile-classification claims.
- Verification: focused daily, archive-pagination, duplicate, video,
  upload-metadata, best-photo, and suggested-first tests passed;
  `pnpm --filter @ourlittleworld/mobile test` passed TypeScript plus all 309 unit
  tests; `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint` passed; the
  full Debug iOS simulator build and the focused
  `ExpoFaceMatcher` Swift build passed. The installed Debug app connected to Metro and
  reached the React launch surface, but the ad-hoc simulator artifact had no keychain
  entitlement, so SecureStore errors prevented a signed-in Our World/video visual
  pass. No signing credentials, production data, or remote services were changed.

### Curated family world production release (2026-07-16)

- Committed the private-family-world mobile release as `0eb1304` and pushed
  `polish-sprints` to GitHub. Unrelated web checkout, billing, and agent-rule work
  remained outside the release commit.
- Applied only migrations `20260716120000`, `20260716121500`, and
  `20260716122500` to the linked production Supabase project. Verified the three
  resulting tables, their row-level security, 11 total policies, and their migration
  ledger entries. No older migration-history entries were repaired or replayed.
- Deployed production `notify-event` version 21 from the clean release commit and
  verified it active.
- EAS production build `09e41664-fe66-4d1e-af81-f2254269744b` completed as app
  version 1.1.0, build 1.1.6. Submission
  `441a1be2-ea8f-473a-b3b7-c90b18e505da` was accepted by App Store Connect and
  entered Apple processing for TestFlight.
- Release verification from a clean detached worktree passed TypeScript, all 309
  release unit tests, Expo lint, public Expo configuration, and the production iOS
  build. Apple distribution credentials and the push-enabled App Store provisioning
  profile were validated by EAS.

### Physical-device child-identity correction (2026-07-17)

- Diagnosed build 1.1.6 screenshots that showed unrelated adults, an app screenshot,
  and illustrated babies in Reuben's scan review. These were current device-library
  candidates, not records pulled from the shared family archive. The shipped matcher
  admitted the maximum score from any selected reference and then applied an
  age/quality boost, so one stale or polluted learned reference could create a false
  positive and even label it a clear match.
- Replaced max-of-references admission with conservative raw-score consensus. A
  parent-confirmed representative and another age-diverse reference must agree;
  single-reference enrollment uses a stricter raw gate; and score boosts no longer
  determine identity admission. The v2 reference profile intentionally does not
  migrate the old learned profile.
- Review opens on clear matches, preselects daily anchors only from clear identity
  matches, and keeps uncertain candidates optional. Daily defaults and automatic
  saves can no longer teach the reference profile; only an explicit parent keep can.
  Automatic saving no longer grows identity references without parent confirmation.
- Replaced the narrow reference reset with `Restart photo discovery`, which resets
  local references, calibration, scan progress, in-memory results, recent automatic
  saves, and the current parent's aggregate device status while preserving saved
  family moments. For `jesse.krim@gmail.com`, production reset the calibration,
  checkpoint, and library-connection rows. A follow-up provenance audit found 47
  context-free media/moment rows created automatically by the affected matcher; all
  47 and their 94 private storage objects were removed so the corrected scan can
  reassess them. The 21 parent-reviewed media rows and 23 remaining family moments
  were verified preserved, with no automatic-match media left in the archive.
- Verification: `pnpm --filter @ourlittleworld/mobile test -- --runInBand` passed
  TypeScript plus all 317 unit tests; `CI=true pnpm --filter @ourlittleworld/mobile
  exec expo lint` passed; and the scoped `git diff --check` passed. Physical-device
  before/after validation requires a new native build because build 1.1.6 still
  contains the old matcher and local AsyncStorage profile.
- Corrective EAS production build `f730684b-990a-4626-a781-fbc5df8c4b53`
  completed successfully as app version 1.1.0, build 1.1.7, from isolated commit
  `e60c983`. Submission `bca8b377-b6d3-4f55-bdb9-86b0c7991497` completed
  successfully; App Store Connect may still need to finish normal TestFlight
  processing before the build appears to testers.

### Jesse production account fresh-test reset (2026-07-17)

- At the explicit request to clear all data for `jesse.krim@gmail.com`, deleted the
  account's single-member Reuben family and every family-scoped row through database
  cascades. No partner account or partner-owned record existed in that family.
- Removed all 124 objects under the family's production `family-photos` storage
  prefix. The family had no Cloudflare Stream media requiring a separate deletion.
- Removed the one Codex-created QA gift purchase, redemption, and billing event,
  all explicitly labeled `reset_for_gift_flow_test`. No real purchase record was
  deleted. Historical legacy tables referenced by old migrations are absent from
  the current production schema and therefore contained no remaining rows to clear.
- Preserved the confirmed authentication identity so Jesse can sign in with the same
  email. Post-reset verification returned zero family memberships, families created,
  notifications, billing events, gift redemptions, partner grants, and partner-code
  redemptions for the user. A delete-and-reinstall of build 1.1.7 is still recommended
  before the physical-device test so iOS also clears the prior install's local cache.
