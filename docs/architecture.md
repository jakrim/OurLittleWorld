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
- **Multi-child readiness:** the production schema is still single-child until
  backlog K1, but PRD-era pure models accept optional `childId` through
  `childScopeModel.js` where data boundaries matter. See
  `docs/multi-child-readiness.md` for the exact K1 schema, event, digest, prompt,
  recognition, and RLS migration points.
- **Analytics contract:** no analytics SDK is installed yet. Event names, triggers,
  allowed values, required properties, and forbidden content fields are defined in
  `docs/analytics-events.md`; `analyticsEventsModel.js` and `analytics.js` enforce
  the allowlist before any future transport emits an event.
- **Assistant feedback boundaries:** `assistantFeedbackTransparencyModel.js` defines
  which assistant loop a parent action can affect. Face-match corrections, First
  suggestion `Not this`, photo-stack choices, caption draft use, and book-readiness
  actions stay separate; First suggestion feedback is device-local per family/user and
  does not become a child-identity or face-match negative example.
- **Account deletion:** destructive deletion is not implemented yet. The required
  Settings flow, backend role handling, auth deletion, storage/media deletion,
  billing/gift retention, and legal-retention policy are tracked in
  `docs/account-deletion-policy.md`.
- **Export and lapsed subscriptions:** `docs/export-lapsed-subscription-policy.md`
  is the source for the trust copy: memories are never deleted for non-payment;
  lapsed subscriptions become a read-only vault with saved memories viewable and
  exportable while new uploads and assistant discovery pause. Current local export
  previews disclose video-poster and voice-reference limitations.

## Media pipeline (on-device first)

- **Scanning:** `scanController.js` pages the photo library (`photos.js`,
  expo-media-library), overlapping page fetch with scoring; video frames sampled at
  8/35/68%. Checkpoints in Supabase `scan_checkpoints`; background runs via
  `backgroundAutoIngestTask.js`.
- **Birthday-first setup:** `referenceAutoSeed.js` builds a maximum 456-candidate
  sample instead of taking the newest 30 in each month. It covers the birth window,
  at most 12 evenly spaced age windows split into four subwindows, both chronological
  ends of each subwindow, and the most recent seven days. Asset ids are deduplicated
  before native analysis, which is capped at three concurrent images. This makes
  older portraits reachable in a library with thousands of photos while keeping
  CPU, decoded-image memory, and battery work bounded; it is intentionally not an
  exhaustive or cached library index yet. Photos and face embeddings stay on device.
  Identity embeddings alone establish the likely-child cluster. Within that cluster,
  deterministic quality scoring ranks capture quality (28%), sharpness (18%), usable
  face size (16%), complete bounds (10%), frontality (10%), exposure (6%), one-face
  preference (6%), and cluster centrality (6%), renormalizing across signals that are
  actually available. Recency applies only inside a 0.025 score tie when both faces
  have measured visual quality. The strongest face in each age bucket forms a
  maximum 12-reference age-diverse set, while one separately scored representative
  is shown for parent confirmation.
- **Face matching:** native module `modules/expo-face-matcher` (iOS Vision) provides
  embeddings, capture quality, face bounds/size, sharpness, yaw/roll, and brightness.
  `faceMatcher.js` wraps it with a graceful no-native fallback (uniform 0.5 scores).
  The local AsyncStorage profile persists `representativeReferenceId` explicitly;
  reopening or chronological sorting cannot silently change the confirmed image,
  and legacy profiles choose and persist a deterministic fallback. Matching still
  uses up to four age-relevant references from the full age-diverse set. Selection
  and influence are derived from age affinity, measured quality, identity confidence,
  parent confirmation/keeps, trusted source, and age diversity—never array position,
  newest status, or which image is displayed. The profile is calibrated by keep/skip
  feedback (`recognitionTrust.js`, `REVIEW_THRESHOLD = 0.65`). Clean review history
  earns the parent-facing auto-save setting; `Auto-save clear matches` remains
  opt-in and scan auto-save config is supplied only when trust is earned and the
  parent setting is on.
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
  params below). Promoting a saved moment opens an unsaved First draft: the moment's
  capture date and photo are inherited and read-only, title/note remain editable,
  Save creates the First, and Cancel creates nothing.
- **Moment detail:** photo detail separates clear story-building actions from existing
  story connections. The default co-parent audience is not repeated as a card; family
  circle sharing remains in the action menu. Tapping the photo or dragging the detail
  handle down minimizes the detail sheet for an uncropped photo view, and dragging the
  handle up restores the scrollable details.
- **Daily prompts:** age-banded deterministic pools (`dailyPrompts.js`), responses in
  `daily_prompt_responses`; `missedPromptModel.js` and `DailyPrompts.listMissed`
  provide the 7-day catch-up window, and `/prompt?promptDate=YYYY-MM-DD` saves
  answers against the original prompt date/key/text. `secondParentStateModel.js`
  owns prompt answer status and digest view-status copy; digest read state is still
  local-device only until server-backed viewer rows exist.
- **Weekly digest:** SQL RPC `assemble_weekly_digest` on pg_cron; `weekly_digests`
  rows with `representative_media` JSONB; client model `digestModel.js`.
  `bookWorthinessModel.js` separates saved archive items from book-ready highlights
  with an explicit eligibility score, and digest representative media plus Book
  print readiness prefer book-ready moments before archive-only auto-saves.
- **Private recap sharing:** `privateRecapShareModel.js` builds native-share payloads
  for selected digest/book-preview summaries only. Public recap links are not enabled;
  future links require server-issued opaque tokens, selected snapshot scope, revocation,
  and no writer/app/archive-wide permissions.
- **Read-only circle viewer:** `docs/read-only-circle-viewer-spec.md` defines the
  web-first grandparent/circle viewer. Circle access is RLS-enforced as selected
  content only: shared moments/media, explicitly shared digests, explicitly shared
  firsts, or firsts linked to shared moments. Letters, prompt answers, unshared memory
  notes, and unshared bucket objects remain writer-only.
- **Letters:** `letters` table with open letters by default (`open_on` null) and
  existing optional sealed-until-date rows when `open_on` is set; compose accepts
  seeded title/body/source params.
- **Notifications:** push tokens + per-category `notification_preferences`,
  `notification_events` outbox → `notify-event` edge function (quiet hours, 2/day
  cap, partner batching, family-local timezone) → `send-push`; in-app center in
  `notifications` table. Adding a category touches both check constraints, cadence
  defaults, settings model, and event copy.
- **Today:** one assistant nudge at a time via `dayCardNudge.js`
  (blocking repair > photo trust > review > suggested first > catchup > prompt >
  book readiness > digest > fallback). `bookReadinessNudgeModel.js` scores moment and
  month readiness as media plus durable parent context, then supplies at most one
  gentle "add one line" candidate from cached Book data. `tonightModel.js` adds the
  compact evening ritual from already-loaded prompt, review, suggested-first,
  recent-photo, and digest signals, suppressing items already owned by the primary
  Today card.

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

Adjacent same-spirit surfaces (all metadata-only, no generative text):
`captionTemplateModel.js` (U1 suggested notes plus F3 `factsOnlyContextDraft` for
Add/Moment note suggestions), `promptStarterModel.js` (V1 prompt starters),
`mediaUploadMetadataModel.js` + `assemble_weekly_digest` quality ranking (W1/W2
digest highlights), `firstSavedLetterNudge` in `postSaveNudgeModel.js` (X1 letter
starter, facts-only), and `suggestedFirstNotifierModel.js` +
`suggestedFirstNotifier.js` (Y1 — a *local* notification on the generating device,
since suggestions are device-local; `suggested_firsts` is a real notification
category with quiet-hours/de-dupe gating).

## Verification workflow

- `cd apps/mobile && npm test` (tsc + node --test), `CI=true npx expo lint`.
- Simulator: dev-client on iPhone 16e + Metro at :8092; Maestro for repeatable flows.
- Supabase changes: `supabase db reset --local` + lint before remote apply; edge
  functions `deno check`/`deno test`.
