# Our Little World — Architecture

How the app works inside and out. Keep this current when structure changes; item-level
history lives in `docs/sprint-progress.md`, the backlog in `docs/polish-backlog.md`.

## Monorepo

- `apps/mobile` — Expo React Native app (expo-router, plain JS, dev-client builds).
- `apps/web` — web companion (minimal).
- `packages/shared` — shared utilities.
- `supabase/` — migrations (source of truth for schema) + edge functions (Deno).
- `workers/media-gateway` — Cloudflare Worker mediating media playback (HMAC session
  tokens; Stream/R2/Supabase storage routing).

## Mobile app conventions

- **Screens:** `apps/mobile/app/*.jsx` are thin expo-router wrappers around
  `apps/mobile/src/*Screen.js` components. Protected routes wrap in `ProtectedRoute`.
- **Pure model files:** all decision logic lives in `src/*Model.js` files with no RN
  imports, unit-tested with `node --test` (`tests/unit/*.test.js`; `npm test` = tsc +
  unit). Copy strings that carry product guarantees are exported constants asserted
  verbatim in tests.
- **Local persistence:** AsyncStorage stores wrap the pure models
  (`postSaveNudgeStore`, `catchupDismissals`, `firstSuggestionStore`,
  `recognitionReferences`); SQLite (`mediaDb.js`) caches the media index and upload
  queue. Server state is Supabase via `rituals.js`, `moments.js`, `photoSync.js`.
- **Contexts:** `AuthContext`, `FamilyContext`, `BillingContext`. Aggregated Today
  data via `useRitualHomeData` (cached, 30 s TTL).

## Media pipeline (on-device first)

- **Scanning:** `scanController.js` pages the photo library (`photos.js`,
  expo-media-library), overlapping page fetch with scoring; video frames sampled at
  8/35/68%. Checkpoints in Supabase `scan_checkpoints`; background runs via
  `backgroundAutoIngestTask.js`.
- **Face matching:** native module `modules/expo-face-matcher` (iOS Vision) provides
  embeddings, captureQuality, faceSizeRatio, sharpness. `faceMatcher.js` wraps it with
  a graceful no-native fallback (uniform 0.5 scores). Multi-reference age-weighted
  profile in AsyncStorage (`recognitionReferences.js`), calibrated by keep/skip
  feedback (`recognitionTrust.js`, `REVIEW_THRESHOLD = 0.65`).
- **Quality/curation:** `scanQualityModel.js` (auto-save floor 0.25),
  `photoStackModel.js` (session gap 30 min, near-duplicate cosine distance < 0.18,
  quality cascade `qualityValue`: captureQuality → sharpness → faceSizeRatio).
- **Upload/storage:** `photoSync.js` uploads resized full+thumb JPEGs to the private
  `family-photos` bucket as `photo_tags` rows; moments media in `moment_media`
  (Supabase storage, Cloudflare Stream for video, R2 for large originals). Playback is
  mediated by `workers/media-gateway` with short-lived session tokens
  (`create-media-session` edge function).
- **Places/scenes:** `visionSceneLabeler.js` clusters by rounded lat/lon and infers
  time-of-day/keyword scene labels.

## Rituals & content surfaces

- **Firsts:** `FIRST_GOAL_DEFINITIONS` (`rituals.js`) with age windows, mirrored in
  `goal_definitions` table; `firsts` rows carry `goal_key`, `moment_id`, photo refs.
  `firstsModel.js` builds display rows + catch-up selection; compose sheet
  (`FirstComposeSheetScreen.js`) is seedable via route params (title/goal + S1 seed
  params below).
- **Daily prompts:** age-banded deterministic pools (`dailyPrompts.js`), responses in
  `daily_prompt_responses`.
- **Weekly digest:** SQL RPC `assemble_weekly_digest` on pg_cron; `weekly_digests`
  rows with `representative_media` JSONB; client model `digestModel.js`.
- **Letters:** `letters` table (sealed until `open_on`); compose accepts seeded
  title/body params.
- **Notifications:** push tokens + per-category `notification_preferences`,
  `notification_events` outbox → `notify-event` edge function (quiet hours, 2/day
  cap, partner batching, family-local timezone) → `send-push`; in-app center in
  `notifications` table. Adding a category touches both check constraints, cadence
  defaults, settings model, and event copy.
- **Today:** one assistant nudge at a time via `dayCardNudge.js`
  (review > catchup > prompt > digest; suggested-first slots between review and
  catchup when S5 ships).

## Suggested Firsts pipeline (Track S — assistant-first, parent-approved)

Direction: the app searches, sorts, dates, titles, and drafts; parents confirm,
correct, or dismiss. No generative AI — template text from real metadata only; copy
never claims certainty ("Possible first smile"). Design doc:
`~/.claude/plans/pure-munching-sunset.md`; backlog section S.

Flow (all on-device, per-user):

1. **Trigger** — Firsts screen focus (after data load, interaction-deferred) calls
   `firstSuggestionScanner.generateFirstSuggestions`.
2. **Eligibility** — `firstSuggestionModel.shouldGenerateForGoal`: goal incomplete,
   window started (`suggestionWindowForGoal`: birth+minDays → min(birth+maxDays,
   today)), not dismissed < 30 days, not generated < 24 h. Cap 2 goals/run.
3. **Scan** — `fetchPhotosPage` inside the window (≤ 240 assets/goal), scored with
   `matchAgainstReferenceProfile`. Silent no-op without the native matcher, library
   permission, or a reference profile.
4. **Build** — `buildFirstSuggestion`: filter score ≥ `FIRST_SUGGESTION_MIN_SCORE`
   (0.65) and captureQuality ≥ 0.25; rank by the photoStack quality cascade; primary +
   up to 5 non-near-duplicate alternates (feature distance ≥ 0.18, else > 10 min
   apart). Suggestion carries guarded copy ("Possible first roll", "Around Jul 6").
5. **Store** — `firstSuggestionStore` (AsyncStorage
   `olw:first-suggestions:v1:{familyId}:{userId}`): suggestions by goal, feedback
   counters, excluded assets, dismissals, snoozes, generation stamps. Device-local by
   design; nothing is shared until Keep.
6. **Review** — `SuggestedFirstCard` on Firsts (one at a time, oldest window first,
   done goals filtered at display time). Keep → `keepRouteForSuggestion` opens the
   compose sheet fully drafted via S1 seed params (`seedAssetId`,
   `seedAssetOwnerUserId`, `seedAssetUri`, `seedDate`, `seedNote`); saving uses the
   normal `Firsts.create` path (photo uploads via `uploadForTag` if local-only).
   Not this → 30-day goal dismissal + asset exclusion. Tapping an alternate promotes
   it (choose_another).
7. **Feedback** — counters feed S6 trust calibration (per-detector min-score raises
   after repeated not-this; deliberately separate from face-match negative examples).

Dev/testing: long-press the Firsts header "+" (`__DEV__` only) seeds a fixture from
real archive photos; Maestro flows in `apps/mobile/.maestro/`.

## Verification workflow

- `cd apps/mobile && npm test` (tsc + node --test), `CI=true npx expo lint`.
- Simulator: dev-client on iPhone 16e + Metro at :8092; Maestro for repeatable flows.
- Supabase changes: `supabase db reset --local` + lint before remote apply; edge
  functions `deno check`/`deno test`.
