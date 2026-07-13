# PRD: Assistant-Curated Baby Book Transformation

Date: July 8, 2026
Status: Implementation complete; end-to-end QA passed with local disposable-family real-write coverage
Primary app: `apps/mobile`
Supporting surfaces: `apps/web`, App Store metadata, partner/gift flows

## 0. Agent Loop Instructions

This PRD is intended to be executable by any future agent and looped through to
completion.

Before starting a work session:

1. Read `AGENTS.md`.
2. Read this PRD completely.
3. Read `docs/architecture.md`, `docs/business-roadmap.md`, and
   `docs/polish-backlog.md`.
4. Inspect the relevant source files before editing. Do not assume the file shape from
   this PRD alone.
5. Pick the first unchecked task in the earliest incomplete workstream whose
   dependencies are satisfied.
6. Implement only that task's intended scope unless a shared helper is clearly needed.
7. Add or update pure model tests for decision logic.
8. For UI, navigation, routing, native-module, or runtime-log changes, verify in the
   running Expo app using local Expo MCP when the tools are exposed and the app can be
   run. If Expo MCP tools are unavailable, say so in the session notes and use the
   simulator, Maestro, screenshots, or CLI alternatives where practical.
9. Run the relevant verification commands listed in section 14.
10. Update this PRD by changing task status only after the acceptance criteria pass.
11. Add a short entry to `docs/sprint-progress.md` for meaningful product changes.

Task status format:

- `[ ]` not started
- `[~]` in progress
- `[x]` complete
- `[!]` blocked, with the blocker stated inline

Do not mark the full PRD complete until every P0/P1 acceptance criterion passes and
the final transformed experience can be demonstrated end to end.

## 1. Executive Summary

Our Little World should use Qeepsake as a category benchmark, not a product blueprint.
The goal is to solve the same parent job in our own way: a baby book that gets made
without becoming another chore.

Qeepsake's strong pattern is clear from its current official marketing: it uses
scheduled text/app prompts, age-relevant questions, missed-question catch-up,
milestone "Chapters," contributors, private family recaps, photo/video journaling,
and automatically formatted books:

- Qeepsake features page: https://qeepsake.com/features/
- Qeepsake busy-parent explanation: https://qeepsake.com/qeepsake-journaling-for-busy-parents/
- Qeepsake app feature overview: https://qeepsake.com/qeepsake-app-features/
- Qeepsake home/pricing/gifting cues: https://qeepsake.com/

Our Little World should do the same job with a stronger and easier model:

> The app notices likely memories in the camera roll, asks one gentle question at a
> time, lets parents approve everything, and turns the approved moments into a
> private baby book.

This is not a generic AI chat product. The assistant should work through photos,
metadata, age windows, prompts, firsts, letters, digests, book readiness, and private
family sharing. It should never invent memories or claim certainty about a child's
life.

Strategic note: the product should be legible to category leaders as a better way to
serve the baby-book job. That can make a future strategic acquisition more plausible,
but this is internal strategy only. Public positioning should never say "Qeepsake but
better" or directly compare against Qeepsake.

## 2. Product Positioning

### One-sentence pitch

Our Little World is a private baby book that finds likely moments in your camera roll,
if you allow photo access, and helps turn them into a keepsake you approve.

### Parent demo script

"You add your baby's name and birth date, and if you allow photo access the app starts
from the birthday onward to find the face that keeps showing up. You confirm what
belongs, answer one small question at a time, and the app turns approved photos,
firsts, voice notes, letters, and recaps into the baby book you meant to make."

### Differentiation vs. Qeepsake

Qeepsake makes journaling easier by sending prompts and formatting books. Our Little
World should make memory capture easier by combining prompts with an assistant that
uses the parent's actual camera roll, child age, saved firsts, voice notes, and family
archive context.

| Area | Qeepsake pattern | Our Little World better version |
| --- | --- | --- |
| Daily habit | Scheduled text/app prompts | One Today assistant action that can be a prompt, photo review, first, digest, or book-readiness nudge |
| Catch-up | Missed questions and backdated entries | Age-aware catch-up firsts, missed prompts, and photo suggestions from the relevant time window |
| Milestones | Chapters / milestone trackers | Firsts are linked to real moments, photos, voice, age, and letters |
| Book payoff | Automatically formatted books | Book-readiness surface that shows what is ready, what needs one line, and what can be printed/exported |
| Contributors | Family contributors and recap recipients | Private family circle with second-parent prompts, grandparent read-only view, and gift loop |
| AI/automation | Prompt and app workflow | On-device, parent-approved assistant that finds likely memories without fabricating them |

The table above is an internal strategy lens. Implementation should translate every
benchmark feature into Our Little World's model instead of recreating Qeepsake's UI.

## 3. Product Principles

1. One ritual, not many chores. A parent should open the app and know the one thing to
   do next.
2. Moments are the source of truth. Photos, voice, notes, firsts, letters, places,
   digests, and books should connect back to saved moments whenever possible.
3. Parent-approved assistant. The app can suggest, draft, and organize. The parent
   confirms what is true.
4. The book is always visible. The archive should feel like a baby book being built,
   not storage being managed.
5. Private by design. No public feed, likes, follower counts, discovery, or ad-style
   algorithm.
6. Metadata over fabrication. Use real dates, age, media, place, tags, and parent text.
   Do not invent emotional claims.
7. No guilt. Avoid streaks, completion pressure, and "goals complete" language that
   makes parents feel behind.
8. Few top-level concepts. Screens should explain the model by how they are arranged.

## 4. Scope

### In scope

- Information architecture simplification.
- Today as the central assistant queue.
- Book/Library reframing into the visible payoff.
- Firsts and Letters consolidation into book collections plus contextual nudges.
- Photo ingestion trust model: review first, then calibrated auto-save with easy
  correction.
- Add flow simplification and post-save follow-up.
- Predictive, parent-approved memory suggestions.
- Missed prompt and backdate support, translated into Our Little World's assistant
  model.
- Book readiness and export/print preparation.
- Family circle and gift loop hooks where they support the baby-book model.
- Copy, onboarding, App Store, and web positioning updates.
- Analytics events needed to prove activation and retention.

### Out of scope

- Public social feed.
- Health, feeding, sleep, or growth tracking.
- AI-generated art, avatars, or fabricated memories.
- Android capture parity until the native recognition pipeline can match iOS.
- Full print vendor integration until the in-app book readiness/export experience is
  excellent.

### What is context, not implementation

- Qeepsake references explain the validated parent job. They are not instructions to
  copy Qeepsake's UI, flow, or public positioning.
- Later growth work such as read-only web viewers, gifts, and acquisition strategy
  should not block the core Today/Add/Book transformation.
- Verification and agent-loop instructions are intentionally included because this PRD
  must be executable across multiple sessions.

## 5. Existing Systems To Build On

Use these systems instead of rebuilding from scratch:

- Today assistant queue: `src/dayCardNudge.js`
- Firsts model and age windows: `src/firstsModel.js`, `src/rituals.js`
- Suggested firsts: `src/firstSuggestionModel.js`, `src/firstSuggestionScanner.js`,
  `src/firstSuggestionStore.js`
- Birthday-based local reference seeding: `src/referenceAutoSeed.js`,
  `src/referenceAutoSeedModel.js`, `src/ReferencePhotoScreen.js`
- Post-save nudges: `src/postSaveNudgeModel.js`, `src/PostSaveNudgeSheet.js`
- Daily prompts: `src/dailyPrompts.js`, `src/PromptSheetScreen.js`
- Weekly digests: `src/digestModel.js`, `src/DigestDetailSheetScreen.js`
- Library/book archive: `src/LibraryScreen.js`, `src/archiveExport.js`
- Photo stack / curation helpers: `src/photoStackModel.js`, `src/scanQualityModel.js`
- Scan, review, and calibrated auto-save: `src/scanController.js`,
  `src/libraryScanLauncher.js`, `src/recognitionTrust.js`,
  `src/ReviewMatchesScreen.js`
- Places/scenes: `src/visionSceneLabeler.js`
- Notifications: `src/notificationSettingsModel.js`, `src/notificationEvents.js`,
  `src/pushNotifications.js`
- Marketing surfaces: `apps/web/content/pageContent.ts`,
  `apps/mobile/app-store/metadata.md`

## 6. Target Information Architecture

### Final bottom nav

The transformed app should use three top-level actions:

1. `Today` - the next best action and daily ritual.
2. `Add` - fast manual capture.
3. `Book` - the private baby book being built.

Settings, activity, invites, billing, notification center, and family management remain
available from header buttons or Book/Family entry points, but they should not compete
with the core three-part model.

### Route policy

- Keep existing routes for deep-link and implementation stability:
  - `/timeline` remains Today.
  - `/add` remains the add sheet.
  - `/library` remains the underlying Book route until a route rename is worth the
    migration.
  - `/firsts` and `/letters` remain reachable, but they are no longer bottom tabs.
- New labels can say `Book` while the route remains `/library`.
- Any removed bottom-tab surface must remain reachable from Today or Book.

## 7. Target User Journey

### New parent

1. Starts with the promise: "we find, you approve, the book grows."
2. Creates family and child profile.
3. Adds the baby's birth date and grants photo access if they want automatic
   discovery.
4. The app starts from the birth date, builds a local reference from recurring faces,
   and asks for confirmation only when needed.
5. Sees Today with one action, not a dashboard.
6. Saves or approves one moment in under 30 seconds.
7. Sees the moment appear in Book with age/date context.
8. Gets one optional follow-up: first, voice, letter, or book-ready line.

### Returning parent

1. Opens Today.
2. Handles one assistant card:
   - review likely photos,
   - answer today's prompt,
   - confirm a possible first,
   - add a line to make a month book-ready,
   - read/share a digest.
3. Leaves feeling the baby book moved forward.

### Grandparent / gift buyer

1. Understands the product as "the baby book they do not have time to make."
2. Can gift the first year or view a private read-only recap.
3. Does not need to understand scanning, prompts, storage, or export internals.

## 8. Workstreams

### A. Messaging And Product Framing

Goal: align app, web, App Store, onboarding, and empty states around one promise.

Outcome: a parent can explain the app as "it finds likely baby moments, I approve
them, and the baby book grows."

UI concept: onboarding and empty states use a simple three-beat story: finds,
approve, book grows. They do not introduce every feature name upfront.

- [x] A1. Replace feature-list positioning with the north-star pitch.
  - Files likely touched: `apps/web/content/pageContent.ts`,
    `apps/mobile/app-store/metadata.md`, `src/WelcomeScreen.js`.
  - Required copy idea: "finds likely moments in your camera roll, if you allow
    photo access" plus "you approve what gets kept."
  - Acceptance:
    - Welcome first screen, web hero, App Store promotional copy, and setup intro all
      include the same model: likely moments, parent approval, private book growth.
    - A parent can understand the product from the first screen without learning the
      terms Firsts, Letters, Digest, Places, or Export.
    - Web/App Store copy still includes privacy, no-feed, firsts, letters, voice, and
      book payoff.
    - Public copy does not overpromise background discovery on platforms or permission
      states where camera-roll access is unavailable.

- [x] A2. Add an internal category-benchmark note to web/app copy decisions, without
  naming Qeepsake publicly.
  - Acceptance:
    - Public copy emphasizes prompts plus assistant capture.
    - No public page makes a direct competitor comparison.
    - Category-benchmark language appears only in this PRD or internal notes, never in
      `apps/web`, App Store metadata, screenshots, or in-app copy.

- [x] A3. Update onboarding to teach the three-step model.
  - Steps:
    1. The app starts from the baby's birth date.
    2. You approve what belongs.
    3. The private book grows.
  - Acceptance:
    - Onboarding does not present the app as a generic scrapbook.
    - Photo access is framed as optional assistant discovery, not upload everything.
    - The copy does not imply parents must manually choose a reference photo before
      automatic discovery can work.
    - Manual reference-photo copy appears only after auto-seed is unavailable,
      declined, or cannot find a likely match.
    - Settings and fallback screens do not say "pick one clear photo before automatic
      discovery" unless the app is actually in manual fallback mode.

### B. Navigation And Screen Consolidation

Goal: make the app easy to explain by reducing top-level concepts.

Outcome: the app is navigable as Today, Add, Book. Firsts, Letters, Places, Search,
and Export become parts of the book experience or contextual actions.

UI concept: a three-item bottom nav with a prominent Add action. Book opens to an
emotional chapter/payoff view, with utility surfaces behind secondary controls.

- [x] B1. Change bottom nav to `Today`, `Add`, `Book`.
  - Files likely touched: `src/ui/BottomTabs.js`, `src/ui/AppShell.js`, screens passing
    `active`.
  - Sequencing:
    - Ship B2/B3 in the same PR or before B1 so Firsts and Letters do not disappear
      before Book links exist.
  - Acceptance:
    - Bottom nav has exactly three visible actions.
    - Add remains prominent.
    - `/firsts` and `/letters` are no longer bottom tabs.
    - No existing route crashes when opened directly.
    - Direct `/firsts` and `/letters` routes either highlight Book in the bottom nav or
      intentionally hide bottom nav with a clear back path; no screen passes an orphan
      active tab key.

- [x] B2. Reframe `LibraryScreen` as Book without a route migration.
  - Files likely touched: `src/LibraryScreen.js`.
  - Acceptance:
    - Header says `<Child>'s book` or equivalent, not only `<Child>'s photos`.
    - Empty state explains the baby book, not a saved archive.
    - The first viewport is a minimal Book home: header, current chapter/month
      progress, Firsts and Letters entry cards, then secondary utilities.

- [x] B3. Add Book entry cards for Firsts and Letters.
  - Implementation preference:
    - Keep `FirstsScreen` and `LettersScreen` intact initially.
    - Add Book cards that show counts/latest state and link to `/firsts` and `/letters`.
  - Acceptance:
    - A parent can find Firsts and Letters from Book in one tap.
    - Firsts and Letters no longer feel like separate products.

- [x] B4. Move utility surfaces behind secondary controls.
  - Utility surfaces: Places, Search, Export, upload repair, iCloud wait.
  - Acceptance:
    - Book first viewport shows emotional/book payoff before utility/admin panels,
      except blocking upload/iCloud/data-integrity issues that require immediate
      action.
    - Search and Export remain reachable.
    - Places, Search, Export, camera-roll browsing, and non-blocking repair details
      move behind secondary controls below the chapter payoff.
    - Upload/iCloud repair does not dominate the screen unless action is required.
  - Notes:
    - Added `bookUtilityVisibilityModel.js` to keep failed uploads and iCloud waits
      prominent while moving upload-progress notices and camera-roll change notices
      into secondary details.
    - `LibraryScreen` now shows Book home first, then any blocking iCloud/failed-upload
      action, then saved chapters/empty chapter payoff, then a `Book tools` panel for
      Places, Search, Export, camera roll, and background saving details. The utility
      segmented control appears only after a secondary utility surface is opened.

### C. Today As The Assistant Ritual

Goal: Today should answer "what should I do now?"

Outcome: Today is the daily parent habit. It surfaces the one most useful action and
does not ask parents to scan a dashboard.

UI concept: one assistant card at the top, optional supporting sections below. The
card changes based on review, suggested firsts, catch-up, prompts, book readiness, and
digest state.

- [x] C1. Extend the single day-card queue into the canonical assistant queue.
  - Build on `selectDayCardNudge`.
  - Model inputs must include pending review, suggested first, catch-up first, prompt,
    digest, blocking repair/data issue, and book-readiness nudge state.
  - Required priority order:
    1. Upload or data integrity issue that blocks saved memories.
    2. Photo review waiting.
    3. Suggested first with evidence.
    4. Catch-up first.
    5. Today's prompt.
    6. Book-readiness nudge.
    7. Unread digest.
    8. Gentle fallback.
  - Acceptance:
    - Today never shows multiple competing primary asks.
    - The card always has one clear action or no action.
    - Today does not render a second actionable prompt, digest, scan, or book-readiness
      card when that same action is already the primary assistant card.
    - Copy avoids infrastructure terms like confidence, threshold, queue, RPC, or
      upload exception.
    - Blocking repair copy is parent-safe, e.g. "Some memories did not finish saving",
      with raw exception text hidden behind details/logs.

- [x] C2. Create a "Tonight" ritual model.
  - Purpose: a daily evening surface built from the archive, not a social feed.
  - Initial no-schema version can derive from:
    - today's prompt,
    - pending review count,
    - best recent photo stack,
    - current first suggestion,
    - current week digest.
  - Files likely touched: new `src/tonightModel.js`, `src/TodayScreen.js`, tests.
  - V1 scope:
    - Pure model and compact Today section only.
    - No new schema, scheduled notification flow, or pager is required for this PRD.
  - Acceptance:
    - Pure model ranks up to three evening items.
    - Today can show a compact Tonight section when there is enough content.
    - No empty Tonight section renders for brand-new families.
  - Notes:
    - Added `tonightModel.js` with suppression support so Tonight does not duplicate
      the primary Today card or standalone actionable prompt/digest cards.
    - `TodayScreen` renders a compact Tonight section from existing prompt, review,
      first suggestion, recent saved photos, and digest inputs only when the model
      returns at least one item. No schema, notification, or pager was added.

- [x] C3. Add missed prompt catch-up.
  - Category benchmark: missed questions can be answered later.
  - Acceptance:
    - `DailyPrompts.listMissed({ days: 7 })` or equivalent returns unanswered prompts
      from the catch-up window.
    - Prompt compose can receive `/prompt?promptDate=YYYY-MM-DD` or equivalent route
      context.
    - Parents can answer a previous prompt from the last 7 days (tunable).
    - Prompt responses preserve original `prompt_key`, `prompt_text`, and prompt date.
    - Today only surfaces one missed prompt at a time.
  - Notes:
    - Added `missedPromptModel.js` with `MISSED_PROMPT_CATCHUP_DAYS = 7` and a
      current-parent unanswered filter that keeps partner-only answers eligible.
    - `DailyPrompts.listMissed`, `getForDate`, and dated `saveResponse` preserve the
      prompt key/text/date for historical answers; `PromptSheetScreen` accepts
      `/prompt?promptDate=YYYY-MM-DD`.
    - Today passes a single selected missed prompt into the existing assistant nudge
      queue, below the current unanswered daily prompt and above lower-payoff book
      nudges.

- [x] C4. Improve second-parent state.
  - Acceptance:
    - Prompt/digest copy names who answered or viewed, when known.
    - No "nudge partner" CTA appears unless notifications can actually deliver it.
    - If digest view state remains local-only, digest "who viewed" copy is deferred or
      softened until server-backed view state exists.
  - Notes:
    - Added `secondParentStateModel.js` so prompt answer status names known
      co-parents, avoids inventing a missing co-parent, and remains CTA-free.
    - Today and Digest detail now use local-only digest status copy such as
      `Unread on this device`, `Opened on this device`, and a detail-screen note that
      family-wide view names are not shown yet.
    - The model has a server-backed viewer-state branch for future use, but no digest
      UI claims who viewed until that data exists.

### D. Capture And Post-Save Follow-Through

Goal: adding a memory should be fast, then the assistant should connect it to the book.

Outcome: a parent can save a memory with almost no typing, and the app offers one
useful next step that makes the memory more durable.

UI concept: Add starts as a simple capture sheet. Context fields are progressive.
Post-save follow-up appears as one dismissible sheet.

- [x] D1. Make Add progressive.
  - Current add fields are useful but visually heavy.
  - Acceptance:
    - A parent can save with only photo/video, only voice, or only text.
    - Title, place, and tags are secondary "Add context" controls after media or text
      exists.
    - No field implies required work unless it is actually required.
    - Saved text-only, voice-only, video, and photo moments appear in relevant Today,
      Book, search, and detail surfaces through the same durable moment data path.

- [x] D2. Strengthen post-save nudges.
  - Build on `selectPostSaveNudge`.
  - Required nudge types:
    - possible first,
    - voice while fresh,
    - one-line letter,
    - book-ready caption.
  - Acceptance:
    - Max one nudge per save.
    - Daily cap remains enforced.
    - Dismissed nudges do not repeat for the same moment.
    - Routes preserve the saved moment context.
    - Letter and first nudges pass durable `sourceMomentId` and, when applicable,
      `sourceFirstId`.
    - Nudge age logic uses the saved moment's happened-at/captured-at date, not the
      current date.

- [x] D3. Add connected-story chips to Moment detail.
  - Chips:
    - First,
    - Letter,
    - Voice,
    - Digest,
    - Book-ready,
    - Place.
  - Acceptance:
    - Existing linked firsts and letters are visible from the moment.
    - Available next actions are contextual, not a generic menu.
    - Chips never claim an unconfirmed relationship.
    - Moment detail queries reverse links for firsts, letters, digest membership, voice,
      place, and book-readiness before rendering chips.

- [x] D4. Add backdating parity.
  - Category benchmark: earlier memories can be added later.
  - Acceptance:
    - Add and First compose make happened-at date easy to adjust.
    - Age labels update from happened-at date.
    - Copy says "roughly when it happened is fine."
    - Add and Moment edit support a `capturedAt`/happened-at override.
    - First, letter, digest, readiness, and post-save nudge logic use happened-at date
      consistently.

### E. Photo Ingestion And Trust

Goal: reduce parent work by saving clear matches automatically after trust is earned,
while making correction easier than item-by-item approval.

Outcome: first scan earns trust through review; later scans can auto-save
high-confidence matches; parents skip or remove the few strays instead of approving
the majority that belong.

UI concept: a trust ladder. Start with "Review what we found." After a clean batch,
graduate to "Assistant can save clear matches." Auto-saved photos appear in Book with
an obvious remove/undo path and copy that explains corrections can pause or lower
auto-save trust.

- [x] E1. Make the current ingestion philosophy explicit in product copy.
  - Current behavior to preserve:
    - First scan is review-first.
    - Review starts from "these likely belong" so parents remove mistakes.
    - Auto-save turns on only after clean calibration.
    - Removing an auto-save records a correction and disables/lowers trust.
  - Acceptance:
    - Scan, review, Today, and Book copy explain the model without exposing thresholds.
    - Parents never see "confidence score", "0.9", "calibration", or "threshold."
    - Copy says clear matches can be saved automatically only after review builds
      trust.
    - Copy does not say "review before anything uploads" on surfaces where calibrated
      auto-save may already be active.
    - Device originals are clearly never deleted when a parent removes a memory from
      the archive.

- [x] E2. Add an auto-save readiness / trust-state model.
  - Suggested pure model: `photoIngestionTrustModel.js`.
  - Inputs: import calibration, recent auto-saves, pending review count, auto-save
    errors, corrections.
  - Outputs:
    - `review_required`
    - `learning`
    - `auto_save_ready`
    - `auto_save_active`
    - `needs_correction_review`
    - parent-facing title/body/action copy.
  - Acceptance:
    - Internal tunables are documented but not shown in product copy: clean batch,
      high-confidence score, auto-save threshold, and capture-quality floor.
    - Unit tests cover first scan, clean review batch, rejected high-confidence match,
      small later batch, active auto-save, removed auto-save, auto-save error, and
      co-parent/new-device scope.
    - Today can consume this model for its top assistant card.
    - Book can consume this model for admin/trust alerts.
    - Trust does not accidentally turn off only because a later batch is clean but too
      small; use a rolling/cumulative trust model or explicitly document the reset
      behavior.

- [x] E3. Improve review UX around "skip strays" instead of "approve all."
  - Acceptance:
    - Review screen language says likely matches are selected unless removed.
    - The primary action communicates bulk save, e.g. "Keep selected" or "Save these."
    - Near-duplicate stacks keep only the best few by default, with a clear way to add
      more.
    - Rejecting visible items is easy and reversible before save.
    - Product copy avoids "delete" unless the action actually deletes an Our Little
      World memory; never imply deletion from the device camera roll.

- [x] E4. Improve auto-saved correction flows.
  - Acceptance:
    - Auto-saved photos are labeled "Added by the assistant" in Book/Today surfaces
      where relevant.
    - Every auto-saved item has a one-tap remove or "Not this" action within one
      screen of where it appears.
    - Removing an auto-saved item goes through one shared correction function from
      Recent Auto-Saves, Timeline, Moment detail, and any Book surface.
    - Removing an auto-saved item records a negative example and explains only what the
      system actually does: pause/lower auto-save trust unless matcher scoring is
      updated to consume negative examples.
    - If correction volume crosses a tunable threshold, auto-save pauses and Today
      asks the parent to review.

- [x] E5. Separate "saved to archive" from "book-worthy."
  - Rationale: automatic discovery may save many correct baby photos, but the book
    should promote the best moments, not every correct match.
  - Acceptance:
    - Auto-saved photos can enter the archive without all becoming digest/book
      highlights.
    - Book-readiness and digest models prefer quality, context, first links, voice,
      prompt answers, and parent-kept moments.
    - The UI can explain "saved in the archive" separately from "ready for the book."
    - The data model defines this separation explicitly as a flag, score, eligibility
      rule, or collection membership before UI depends on it.
  - Notes:
    - Added `bookWorthinessModel.js` with explicit `savedToArchive`, `bookEligible`,
      `bookScore`, archive source, labels, and reasons.
    - `bookHomeModel.js` now exposes archive stats separately from `bookReadyStats`;
      print/export readiness uses book-ready records and can enter `archive_only`
      when auto-saved items are saved but not highlight-worthy yet.
    - Weekly digest representative media prefers book-ready/high-score moments before
      falling back to archive-only media.
    - Book UI copy now distinguishes `Saved in archive` from `Ready for the book` and
      explains that book-ready highlights need parent context or quality.

- [x] E6. Add parent-facing auto-save setting after trust is earned.
  - Suggested labels:
    - `Review first`
    - `Auto-save clear matches`
  - Acceptance:
    - The setting is unavailable or explanatory before trust is earned.
    - Turning off auto-save does not delete saved memories.
    - Turning on auto-save uses the calibrated threshold and does not bypass quality
      floors.
    - Product decision is explicit: auto-save either turns on automatically after clean
      calibration, or the parent must opt into it after the app says it is ready.
  - Notes:
    - Product decision: parents must opt into `Auto-save clear matches` after review
      history earns trust; clean review history now produces `auto_save_ready` instead
      of silently enabling future auto-save.
    - Book's Photo assistant panel shows the `Review first` / `Auto-save clear
      matches` setting when ready or active, and explains before readiness that likely
      photos wait for review first.
    - Turning off auto-save only changes future scans. Saved memories stay in Book,
      Photos originals stay in Photos, and future auto-save config is still gated by
      earned trust plus the existing score setting and low-quality review floor.

### F. Predictive Assistant

Goal: the product feels easier than prompt-only baby-book products because it starts
from real media, deterministic facts, and parent approval.

Outcome: the app feels like it is helping make the baby book, not waiting for parents
to remember everything themselves.

UI concept: suggestions appear as reviewable cards with visible evidence and simple
actions: Keep, Not this, Choose another. No chat interface or generative claim is
required.

- [x] F1. Upgrade suggested firsts into an assistant review card.
  - Build on `firstSuggestionModel` and `FirstsScreen`.
  - Existing foundation:
    - Suggested firsts already have deterministic detection, feedback, and review UI.
      This task hardens copy, evidence, tests, and cross-screen routing rather than
      rebuilding the core detector.
  - Acceptance:
    - Suggested first copy says "Possible..." or "Worth a look."
    - Parent can Keep, Not this, or choose an alternate.
    - No suggestion saves without parent action.

- [x] F2. Add photo-stack suggestion model for "best of this moment."
  - Build on `photoStackModel`.
  - Acceptance:
    - Pure model groups near-duplicate/session photos.
    - It picks a recommended primary image using existing quality cascade.
    - UI lets parent keep the recommendation or choose another from scan review and,
      if implemented beyond scan review, from saved-moment/Book context.

- [x] F3. Add facts-only context drafts.
  - Build on `captionTemplateModel`, `promptStarterModel`, and existing metadata.
  - Acceptance:
    - Drafts can include date, child age, place label, first title, prompt text, and
      parent-provided tags.
    - Drafts cannot invent feelings, speech, intent, or "first ever" claims.
    - Tests lock wording for any product guarantee.
    - Facts-only drafts remain deterministic unless a separate privacy/product review
      explicitly approves generative AI.
  - Notes:
    - Added `factsOnlyContextDraft` in `captionTemplateModel.js` for deterministic,
      labeled facts from date, child age, place label, confirmed first title, prompt
      text, and parent-provided tags.
    - Add and Moment edit now show a parent-triggered `Suggested line` row only when
      the note is empty; nothing is inserted or saved until the parent taps `Use` and
      saves.
    - Unit tests lock exact wording and guard against invented feelings, speech,
      intent, or "first ever" claims.

- [x] F4. Add book-readiness nudges.
  - Definition: a moment/month is book-ready when it has enough media and at least one
    durable context item, such as a title, note, voice note, first link, prompt answer,
    or letter.
  - Acceptance:
    - Pure model scores moment and month readiness.
    - Today can surface one readiness nudge.
    - Book can show readiness without creating pressure.
  - Notes:
    - Added `bookReadinessNudgeModel.js` with pure moment and month readiness scores.
      It requires media plus durable parent context before calling a moment or month
      book-ready.
    - `useRitualHomeData` now builds one gentle Today nudge from cached Book records
      and chapter context; Today passes that candidate into the existing single-card
      nudge queue.
    - Book already shows neutral saved/media/book-ready chapter counts and archive vs.
      preview copy, so no extra pressure UI was added.

- [x] F5. Keep assistant feedback loops transparent.
  - Acceptance:
    - Parent feedback improves future suggestions.
    - Repeated "Not this" quiets a suggestion type.
    - Feedback about "not this first" is not treated as "not my child."
    - Assistant feedback types stay separate: face-match corrections, first
      suggestions, photo-stack choices, caption drafts, and book-readiness feedback do
      not silently train each other.
  - Notes:
    - Added `assistantFeedbackTransparencyModel.js` as the tested boundary map for
      face-match corrections, First suggestion feedback, photo-stack choices, caption
      drafts, and book-readiness actions.
    - First suggestion copy now says `Not this` only quiets First suggestions on this
      device; the existing S6 trust logic still raises the bar and then quiets the
      detector after repeated rejects.
    - Auto-save correction copy now says it records a photo-match correction for
      future scans, pauses auto-save for review, and keeps the original in Photos.

### G. Book Payoff

Goal: Book becomes the visible reason to keep using the app.

Outcome: Book shows the artifact being built: monthly chapters, saved firsts,
letters, voice, prompts, and export/print readiness.

UI concept: Book home leads with chapter/readiness cards, not a segmented utility
dashboard. Search, Places, and Export are available but secondary.

- [x] G1. Build Book home model.
  - Suggested pure model: `bookHomeModel.js`.
  - Inputs: moments, shared photos, firsts, letters, digests, child birthday.
  - Must be implemented before G2/G5 rely on Book-level business logic.
  - Outputs:
    - current month chapter,
    - latest saved moment,
    - firsts summary,
    - letters summary,
    - print/export readiness,
    - utility alerts.
  - Acceptance:
    - Unit tests cover empty, new, active, and mature archives.
    - UI can render Book from this model without duplicating business logic.
    - Inputs explicitly include prompt responses, voice notes, upload repair state,
      export limitations, and lapsed-subscription/export policy once finalized.

- [x] G2. Replace raw photo archive framing with chapters.
  - Acceptance:
    - Month sections read like chapters by child age and month.
    - Firsts, letters, prompt answers, and voice moments appear as part of the chapter,
      not separate databases.
    - Brand tone stays quiet and warm.

- [x] G3. Make Places human-readable.
  - Acceptance:
    - No first-visible card title is raw coordinates.
    - If no place name is known, use a human fallback like "At home", "Out and about",
      or "Unknown place" depending on available metadata.
    - Raw coordinates can appear only in a detail/debug context and never as a primary
      Places card title.

- [x] G4. Make technical repair states parent-safe.
  - Acceptance:
    - Upload failures say "Some memories did not finish saving" with Retry.
    - Raw exception text is hidden behind "Details" or logs.
    - Blocking repair issues may outrank other Today nudges.

- [x] G5. Print/export preview as trust feature.
  - Build on `archiveExport.js`.
  - Acceptance:
    - Export screen says memories are always exportable.
    - Preview includes photos, videos/posters, voice references, letters, firsts, and
      prompts where available, or clearly labels itself as a limited preview until
      those sections ship.
    - Export limitations are explicit and parent-readable.
    - Generated export HTML/PDF has tests or snapshots for required sections.

### H. Firsts And Letters As Book Collections

Goal: preserve the emotional strength of Firsts and Letters while reducing top-level
complexity.

Outcome: Firsts and Letters feel like meaningful parts of the book and assistant
ritual, not separate chores.

UI concept: Book cards and contextual chips/nudges launch Firsts and Letters. Their
standalone screens remain available but are no longer the primary navigation model.

- [x] H1. Remove pressure language from Firsts.
  - Acceptance:
    - Replace "goals complete" with "starter firsts saved" or equivalent.
    - Progress visuals feel optional, not like a checklist.
    - Past-window firsts read as catch-up memories, not missed tasks.
    - Remove or soften "goal path", "goals complete", and "family goals" language
      unless the context is clearly optional.

- [x] H2. Make Firsts visibly linked to moments.
  - Acceptance:
    - Saved first rows show source photo/moment when available.
    - Opening a first shows or links to the source moment.
    - Creating a first from a moment returns naturally to the moment/book context.
    - Firsts without source media still show a clear source/context affordance, not an
      empty placeholder.

- [x] H3. Make Letters an assistant-powered ritual.
  - Acceptance:
    - Letters can be started from a saved moment, first, digest, or Book card.
    - Empty Letters state has one primary CTA.
    - Existing "open_on" behavior is reconciled with the roadmap decision that letters
      are ongoing and optional sealing is future work.
    - H3 cannot be marked complete until sealed/unsealed behavior is explicitly
      migrated, or the optional-sealing migration is split into a named follow-up with
      temporary copy that does not contradict the roadmap.
  - Completion note:
    - `open_on` is nullable; `null` means open/readable by family writers. Existing
      dated letters remain sealed until their chosen date. The optional sealing picker
      and email delivery remain named follow-ups in `docs/polish-backlog.md` L2/L3.

### I. Family Circle, Gifts, And Growth

Goal: make the product easier to show and sell to other parents and grandparents.

Outcome: the product is easy to share as a private baby-book habit and easy to buy as
a gift for families who do not have time to make one.

UI concept: private recaps and gift surfaces show finished value, not setup steps or
storage features.

- [x] I1. Private recap share primitive.
  - Acceptance:
    - A parent can share a private digest/book preview without exposing the full app.
    - Copy is clear that this is private family sharing, not a feed.
    - Share links expose only selected recap/book-preview content and have an
      access-control model before public URLs ship.
  - Completion note:
    - This ships native share payloads only, with no public recap URL. The access
      model is codified in `privateRecapShareModel.js`; future links must use opaque
      revocable selected-content tokens and grant no app/archive-wide permissions.

- [x] I2. Grandparent/read-only viewer plan.
  - Implementation may be web-first per `docs/business-roadmap.md`.
  - Acceptance:
    - PRD or implementation spec exists for read-only circle viewer.
    - It includes digest, selected moments, firsts, and gift upgrade path.
    - Circle/read-only users can read only selected/shared content, proven by RLS or
      equivalent backend tests.
    - Parent-facing "shared with circle" copy must not ship ahead of backend policy
      enforcement.
  - Completion note:
    - `docs/read-only-circle-viewer-spec.md` defines the web-first circle viewer.
      `20260709150000_read_only_circle_viewer_policies.sql` enforces selected-content
      circle reads for shared moments/media, shared digests, and selected/linked
      firsts; letters, prompt answers, unshared memory notes, and unshared bucket
      objects stay writer-only. Coverage lives in
      `supabase/tests/read_only_circle_rls_test.sql`.

- [x] I3. Gift loop positioning.
  - Acceptance:
    - Web gift copy explains "the baby book they do not have time to make."
    - Gift path ties to first year, grandparents, photographers, doulas, employers, and
      client gifts.
    - Gift price/copy is sourced consistently across metadata, product pages, checkout,
      and app redemption.
  - Completion note:
    - Web gift metadata, Gift/Pricing rendered content, and checkout preview now share
      `giftOfferCopy` for Family/Vault gift-year labels. The app redemption panels
      share `GIFT_REDEMPTION_COPY`, and the Gift/Pricing pages explicitly cover the
      first-year gift path for grandparents, photographers, doulas, employers, and
      client gifts.

- [x] I4. Multi-child readiness.
  - Acceptance:
    - No new code assumes one child in a way that conflicts with the multi-child
      roadmap.
    - New models accept child id or are easy to adapt when child tables land.
    - Current one-child UI copy may remain, but new tables, events, and pure models
      should accept `childId` or document the exact future migration point.
  - Completion note:
    - Added `childScopeModel.js` and threaded optional `childId` through the
      PRD-era pure model boundaries for Add state, Book home/collections, moment
      connection route params, photo-ingestion trust, auto-save correction targets,
      and private share payload metadata. `docs/multi-child-readiness.md` records
      the exact K1 migration points for `children`, child-owned tables, family-level
      prompts/digests, recognition storage, analytics/events, and selected-content
      circle access.

### J. Metrics, Trust, And Compliance

Goal: measure whether the transformation works before paid acquisition.

Outcome: the team can tell whether the new model improves activation, weekly habit,
assistant acceptance, book opens, gift intent, and purchase conversion without
collecting private memory content.

UI concept: no analytics UI is required. Trust copy appears in onboarding, paywall,
settings, and export where it reduces parent anxiety.

- [x] J1. Define analytics event names before adding an SDK.
  - Deliverable: `docs/analytics-events.md` or equivalent internal spec.
  - Required events:
    - `onboarding_started`
    - `child_profile_created`
    - `reference_photo_confirmed`
    - `photo_permission_granted`
    - `assistant_review_opened`
    - `assistant_suggestion_kept`
    - `assistant_suggestion_dismissed`
    - `review_batch_saved`
    - `auto_save_enabled`
    - `auto_save_disabled`
    - `auto_saved_moment_removed`
    - `moment_saved`
    - `post_save_nudge_shown`
    - `post_save_nudge_accepted`
    - `prompt_answered`
    - `missed_prompt_answered`
    - `first_saved`
    - `letter_saved`
    - `digest_opened`
    - `book_opened`
    - `book_export_started`
    - `invite_sent`
    - `gift_started`
    - `gift_redeemed`
    - `purchase_started`
    - `purchase_completed`
  - Acceptance:
    - Event names, triggers, required properties, allowed values, and forbidden fields
      are documented before implementation.
  - Completion note:
    - `docs/analytics-events.md` now defines the analytics privacy contract, common
      event envelope, allowed shared enums, all required J1 events with triggers and
      event-specific properties, and J2 wrapper requirements for allowlisting and
      forbidden content fields. No SDK or event emission was added.

- [x] J2. Add privacy-safe instrumentation.
  - Acceptance:
    - No photo content, child name, prompt answer text, letter text, or voice content is
      sent to analytics.
    - Events include only IDs, counts, plan state, and coarse funnel state.
    - A central analytics wrapper enforces an allowlist and tests fail on content-like
      keys such as `name`, `caption`, `body`, `text`, `mediaUrl`, or `transcript`.
  - Completion note:
    - Added `analyticsEventsModel.js` and `analytics.js` as a no-SDK central wrapper.
      The model allowlists all J1 event names and event-specific properties, fills a
      privacy-safe common envelope, buckets counts, validates enum values, rejects
      unknown properties, rejects content-like keys including `name`, `caption`,
      `body`, `text`, `mediaUrl`, and `transcript`, and rejects unsafe string values
      such as URLs and emails before any transport can send. No provider SDK or event
      emission call sites were added.

- [x] J3. Account deletion policy.
  - Acceptance:
    - Settings includes account deletion or a tracked implementation task if not in
      this PRD's sprint.
    - Policy covers sole parent, co-parent, circle members, gift entitlements, billing
      records, auth deletion, storage/media deletion, and legal retention.
  - Completion note:
    - Added `docs/account-deletion-policy.md` and linked it from the K7 business
      roadmap and architecture docs as the tracked **K7/J3 Delete account flow**. The
      policy covers sole writer, co-parent/additional writer, circle/read-only
      member, redeemed and unredeemed gift handling, billing/legal record retention,
      Supabase auth deletion, app-owned storage/media deletion, backup/log retention,
      and the required copy rule that camera-roll originals are not deleted. No
      destructive deletion function or production Settings delete control was added
      in this pass.

- [x] J4. Export and lapsed-subscription policy.
  - Acceptance:
    - Purchase/paywall copy explains export and lapsed-subscription policy once product
      policy is finalized.
    - Export policy explicitly states whether lapsed families get read-only vault,
      export-only access, a grace period, or another model.
    - Export scope names photos, videos, voice, letters, firsts, prompts, and metadata,
      and labels any unsupported content before paid trust copy relies on it.
  - Notes:
    - Added `docs/export-lapsed-subscription-policy.md` as the durable policy: memories
      are never deleted for non-payment; lapsed subscriptions become a read-only vault
      where saved memories stay viewable/exportable while new uploads, assistant photo
      discovery, and auto-save pause.
    - Mobile purchase and Book export copy now use shared export policy copy. Web
      pricing, terms, and cancellation/refund pages mirror the same policy and disclose
      current preview limits: video posters instead of playable video files, voice
      references instead of full audio files, and no private share links or print
      fulfillment in the local preview.

## 9. Overall Acceptance Criteria

The transformation is complete when all are true:

1. A new parent can explain the app as "Today, Add, Book."
2. Bottom nav no longer exposes Firsts, Letters, and Library as equal concepts.
3. Today shows exactly one primary assistant action.
4. A parent can save a memory in under 30 seconds with no required title, tag, or
   place.
5. After saving, the app offers at most one useful follow-up.
6. Firsts and Letters are reachable from Book and contextual nudges.
7. Book shows the archive as chapters/readiness, not just photo storage.
8. Technical/admin states are parent-readable and do not dominate emotional surfaces.
9. Photo ingestion reduces parent work through review-first calibration, then
   high-confidence auto-save with easy correction.
10. Suggested assistant copy remains parent-approved, facts-only, and uncertainty-safe.
11. Web/App Store positioning matches the transformed product.

## 10. Design Requirements

- Keep the warm, premium visual identity.
- Avoid dashboards in emotional surfaces.
- One screen, one primary action.
- No visible debug/developer controls in production screenshots.
- No raw exception strings in parent-facing cards unless behind Details.
- No raw coordinate titles in the main Book flow.
- Button labels should state the parent action: "Keep this", "Add one line",
  "Review photos", "Print preview".
- Prefer "worth a look", "possible", "suggested", and "help make this book-ready" over
  "detected", "AI found", "complete", or "goal."

## 11. Copy Guardrails

Allowed:

- "Possible first steps"
- "This looks worth a look"
- "Around Jul 6"
- "Add one line to make July easier to remember"
- "We saved your first smile in the family archive"

Not allowed:

- "We found Reuben's first steps"
- "This was the first time he smiled"
- "Your baby felt happy"
- "AI knows this is important"
- "You are behind"

## 12. Technical Requirements

- Pure decision logic belongs in `src/*Model.js` files and must have unit tests.
- UI files should consume model outputs instead of duplicating ranking logic.
- Preserve existing routes until all deep links and tests are updated.
- New assistant features should be local/on-device first where possible.
- If server schema changes are required, add migrations and update Supabase reset/lint
  verification.
- Notification categories must update settings model, constraints, event copy, and
  quiet-hours/cadence behavior together.
- All new user-facing copy that encodes product guarantees should be testable or
  centralized.

## 13. Suggested Implementation Order

### Phase 1: Explain The Product

- A1, A2, A3
- B2, B3, B1
- E1
- H1

Outcome: parents can understand the app in one sentence and navigate it as Today, Add,
Book.

### Phase 2: Make The Loop Feel Magical

- C1, D1, D2, D3, D4
- E2, E3, E4
- F1, F2

Outcome: saving or approving one moment naturally creates firsts, letters, voice, and
book context.

### Phase 3: Turn Archive Into Book

- G1, G2, G3, G4, G5
- E5, E6
- F3, F4, F5
- H2, H3

Outcome: Book is the visible payoff, not a file browser.

### Phase 4: Beat The Category Benchmark In Our Own Model

- C2, C3, C4
- I1, I2, I3
- J1, J2, J3, J4

Outcome: prompts, catch-up, contributors, recaps, gifts, and books are easier and more
contextual than prompt-only baby-book products.

### Phase 5: Expansion Readiness

- I4
- Multi-child implementation from `docs/business-roadmap.md`
- Print vendor integration after book readiness is excellent

Outcome: the product is ready for siblings, older children, web viewers, and physical
book revenue.

## 14. Verification Commands

Run the narrowest relevant set during each task, and the full set before marking a
phase complete.

Mobile:

```sh
pnpm --filter @ourlittleworld/mobile test
CI=true pnpm --filter @ourlittleworld/mobile exec expo lint
```

Repo:

```sh
pnpm test
pnpm lint
pnpm typecheck
```

Database, when migrations change:

```sh
pnpm db:reset:migrations
```

Expo MCP/simulator verification:

```sh
pnpm --filter @ourlittleworld/mobile exec expo whoami || pnpm --filter @ourlittleworld/mobile exec expo login
pnpm dev:mobile:mcp
```

After starting or stopping the MCP-enabled Expo dev server, reconnect or restart the
Expo MCP connection in the AI tool if exposed. Use local Expo MCP for UI/navigation
verification when available.

## 15. Manual QA Scenarios

Current verification note: the scenarios below have unit/model coverage and passed
the committed Maestro smoke suite on July 9, 2026. The final calibrated auto-save
write boundary passed against local Supabase with a disposable auth user/family:
the smoke wrote one simulator photo through `Tags.setBaby`, verified local storage
and `scan-auto-save` metadata, removed it through the assistant-added correction
path, and verified the correction row without touching a real family archive.

Run these before declaring a phase complete:

1. Brand-new family, no photos saved.
   - Today has one clear next step.
   - Book empty state explains the baby book.
   - Firsts/Letters are reachable but not overwhelming.

2. Family with 500 photos and no firsts.
   - Today surfaces review or suggested first.
   - Book does not open with upload/admin noise unless blocking.
   - Places do not show raw coordinates as primary titles.

3. Family with several saved firsts and one letter.
   - Book shows firsts/letters as part of the archive.
   - Moment detail links to connected first/letter.
   - Today does not ask duplicate questions.

4. Parent saves one photo-only moment.
   - Save is possible without title/place/tags.
   - One post-save nudge appears.
   - Accepting the nudge carries moment context forward.

5. Parent dismisses an assistant suggestion.
   - Suggestion does not immediately repeat.
   - Feedback does not mark the child as a negative face match.

6. Calibrated auto-save.
   - First scan waits for review.
   - After a clean review batch, clear matches can auto-save.
   - Auto-saved items are visible as assistant-added.
   - Removing a stray records a correction and pauses or lowers auto-save trust.

7. Export/print preview.
   - Parent can understand what is included.
   - Export is framed as ownership/trust, not a hidden utility.

## 16. Non-Negotiables

- Do not fabricate memories.
- Do not create a public/social feed.
- Do not add more top-level tabs to solve discoverability.
- Do not expose model confidence to parents.
- Do not make the parent complete a checklist to feel successful.
- Do not hide export ownership language behind billing.
- Do not ship Android assistant claims until Android has real recognition parity.
