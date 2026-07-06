# Sprint Progress — Polish Backlog

Loop state: IN PROGRESS. Working branch: `polish-sprints`. Source of truth: `docs/polish-backlog.md`.

## Unapplied migrations (write to supabase/migrations/, NEVER apply to remote)

- `supabase/migrations/20260705120000_goal_definition_age_windows.sql` (A1) — adds `target_age_min_days`/`target_age_max_days` to `goal_definitions` + seeds windows. Client falls back to `FIRST_GOAL_DEFINITIONS` constants until applied (select of missing columns errors → fallback path).

## Tunable constants introduced

- Goal age windows (days): in `FIRST_GOAL_DEFINITIONS` (`src/rituals.js`) and the A1 migration — smile 42-70, laugh 90-135, roll 120-195, food 165-240, crawl 210-320, word 270-430, steps 300-560.
- `CATCHUP_DISMISS_DAYS = 30` (`src/firstsModel.js`) — catch-up nudge dismissal window.
- `MONTHVERSARY_BUCKET_MONTHS = [1,2,3,6]`, `MONTHVERSARY_WINDOW_DAYS = 1`, `MONTHVERSARY_MAX_PER_BUCKET = 6`, `MONTHVERSARY_MAX_AGE_DAYS = 730` (`src/onThisDay.js`).
- `AUTO_SEED_MONTH_SAMPLE_LIMIT = 30`, `AUTO_SEED_CLUSTER_SIMILARITY = 0.55`, `AUTO_SEED_MIN_BUCKET_COVERAGE = 0.6` (`src/referenceAutoSeedModel.js`) — I1 birthday reference auto-seed gates.
- `FOREGROUND_AUTO_SCAN_STALE_MS = 24h`, `AUTO_INGEST_ATTEMPT_DEBOUNCE_MS = 15s` (`src/foregroundAutoIngestModel.js`, `src/useForegroundAutoIngest.js`) — I3 foreground auto-ingest freshness/debounce guards.
- `ICLOUD_QUEUE_MAX_ITEMS = 200`, `ICLOUD_QUEUE_MAX_AGE_MS = 14d` (`src/iCloudRetryQueue.js`) — I4 local iCloud-original retry queue bounds.
- `AUTO_SAVE_CAPTURE_QUALITY_FLOOR = 0.25` (`src/scanQualityModel.js`) — I7 low-quality match review floor for silent auto-save.

## Items

### Pre-sprint

| Item | Status | Commit | Verification |
|---|---|---|---|
| E: /moment/[momentId] ProtectedRoute | done | 81a5310 | Follows exact `app/timeline.jsx` pattern; tsc + lint clean. |

### Sprint 1 — "the app knows Reuben" (A1, A2, B2, B3, A4, B1, H1)

| Item | Status | Commit | Verification |
|---|---|---|---|
| A1 next-goal age ranking | done | b38bcba | Unit tests (`tests/unit/firstsModel.test.js`): 11-month-old + zero firsts → next = First word, never smile; catch-up state when all windows passed. Sim-verified: hero "Coming up: first word and first steps.", Next family goal "First word · 9-14 months" for the 11-month-old test family. Migration written, NOT applied. |
| A2 past-window goal states | done | 9d4e6f3, cb83877 | Unit tests: `goalWindowState`/`goalTimingCaption`, `selectCatchupGoal` honors 30-day dismissals and retires saved firsts. Sim-verified on iPhone 16e: past goals show "From around 4-6 months — add it whenever you remember it", in-window show "Happening around now", no "someday" on placeholder rows (date label dropped for not-done rows, cb83877). Dismissal persistence unit-tested; UI dismiss = B1 card's "Not yet". |
| B2 digest cover fallback | done | e73df3f, 949fe8e | Unit tests (`tests/unit/digestCover.test.js`): cover → milestone photo → recent shared → null hides block. Sim-verified: digest card shows a real photo instead of gray tiles; strip also filters URL-less media (949fe8e). |
| B3 plural counts | done | e901114 | `countLabel` on Today + DigestDetail metrics; sim-verified "1 milestone" singular. |
| A4 month-versary on-this-day | done | f214ad5 | Unit tests (`tests/unit/onThisDay.test.js`): bucket day-of-month math + 29th-31st clamping, birthday-bounded buckets, prior-year-only annual matches, labels. `listSharedTaggedPage` gained `capturedOnOrAfter`/`capturedBefore`. Segment hidden when no matches. |
| B1 day-card nudge slot | done | f31b971 | Unit tests (`tests/unit/dayCardNudge.test.js`): priority review > catchup > prompt > digest > fallback; pluralized copy; seeded composer route; answered/snoozed suppression. Sim-verified: day card shows one catch-up question ("Did we ever save Reuben's first smile?" + "Not yet"), age string appears once (header only), day 347 kept. |
| H1 segmented control placement | done | 3428d28 | Sim-verified: control no longer renders between the day card and prompt card; it sits directly above the timeline/places content. Empty "On this day" segment hidden (with A4). |
| Sprint 1 review | done | d9493e6 | Full-diff review; fix: bumped ritual-home cache version v1→v2 (payload shape changed). Screenshot pass surfaced the B2 strip gap (949fe8e) and A2 someday label (cb83877). |

**Sprint 1 summary:** Goal ranking, placeholder captions, and the Today nudge slot are now age-aware end to end, backed by one unapplied migration plus client-side fallbacks. Digest cover/counts and the segmented control no longer look broken (fallback chain, singular labels, control adjacent to its content, empty "On this day" hidden). 26 unit tests green, tsc + lint clean, and Today/Firsts visually verified on the iPhone 16e simulator against the 11-month-old test family. SPRINT 1 COMPLETE.

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

All todo. A3 prompt pools: to be drafted by agent, flagged for founder review.

### Sprint 5 — hero moments + consistency (H3 layer 4, I3 phase 2, I5, I6, I9, A5-A7, B4-B7, C4-C5, D1-D6, F3, G2)

All todo.

### Notifications workstream (J1-J3)

All todo.

## Notes

- Unit tests: `node --test` under `apps/mobile/tests/unit/` (`npm run test:unit`; `npm test` = tsc + unit). No RN test framework existed before.
- Pre-existing staged files on master (.nvmrc, .serena/, app.json, eas.json, docs/*) carried onto the branch uncommitted; item commits are path-scoped so they are never swept in.
- Known minor: after reading the digest, Today's "story is ready" nudge can persist up to the 30s refresh TTL before clearing.
- B1 keeps the standalone prompt card below the nudge slot per backlog spec; F3 (Sprint 5) may revisit the duplication when the nudge is the prompt.
- Sim verification: dev-client build on iPhone 16e simulator + Metro at :8092; deep-link `com.jessekrim.ourlittleworld://expo-development-client/?url=http://localhost:8092` to load the branch bundle.
- Sprint 1 re-review before Sprint 2: no changes needed; `CI=true npm run lint` and `npm test` were green.
