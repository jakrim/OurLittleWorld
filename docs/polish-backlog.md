# Polish & Focus Backlog — Our Little World

Generated July 5, 2026 from a code-level review of `apps/mobile`. Every item below was
verified against the actual source (file:line cited). Companion to
`tmp/our-little-world-current-app-prd-qa.html`.

**Operating principle:** do a few things exceptionally well. The core loop is
Today → review/approve → Firsts/Letters payoff. Everything here either makes that loop
age-aware, removes friction from it, or removes noise around it. The app knows the
child's birthday from setup — **any surface that ignores it is a bug, not a style choice.**

Priorities: **P0** = violates the age-awareness promise or looks broken in daily use.
**P1** = core-loop friction / missed magic. **P2** = consistency and cleanup.
Size: S (< half day), M (a day or two), L (multi-day).

Conventions: numeric values marked **(tunable)** are starting points, not decisions —
ship behind a constant and adjust from real libraries. Lines marked **Accept:** are the
done-criteria for the item. Where an item had an either/or, the chosen option is stated;
alternatives are noted only if worth revisiting.

---

## A. Age & timeline awareness (the big theme)

### A1. "Next family goal" ignores the child's age — P0 · M
- `src/FirstsScreen.js:230` — `next: goalRows.find((goal) => !goal.completed)` picks the
  first incomplete goal in static sort order. An 11-month-old gets
  **"Next family goal: First smile · 6-8 weeks."**
- `src/rituals.js:18-68` — `FIRST_GOAL_DEFINITIONS` only has `targetAgeLabel` as display
  text ("6-8 weeks"); there is no machine-readable age window anywhere (client or
  `goal_definitions` table).
- **Fix:** migration adds int columns `target_age_min_days` / `target_age_max_days` to
  `goal_definitions`; same fields on the client fallback `FIRST_GOAL_DEFINITIONS` and
  mapped through `Firsts.listGoalDefinitions` (`rituals.js:169-188`). Seed windows,
  derived from the existing labels, intentionally generous (all **tunable**):
  smile 42-70, laugh 90-135, roll 120-195, food 165-240, crawl 210-320, word 270-430,
  steps 300-560. Compute child age in days from `family.babyBirthday` (in scope at
  `FirstsScreen.js:29`). "Next" = earliest incomplete goal whose `maxDays` ≥ child age.
  Edge rule: if every incomplete goal's window has passed, `next` = null and the hero
  shows catch-up framing ("A few firsts are still worth writing down."). Hero copy
  (`FirstsScreen.js:76`) adapts by state: goals ahead → "Coming up: first words and
  first steps."; all passed → catch-up framing; all complete → existing copy.
- **Accept:** with an 11-month-old and zero saved firsts, "Next family goal" shows
  First word or First steps (never First smile), and the hero copy names it.

### A2. Past-window goals say "someday · Suggested around 6-8 weeks" — P0 · S (with A1)
- `src/FirstsScreen.js:166` — placeholder rows always render
  `Suggested around {target_age_label}`; `formatDate` returns `'someday'` for null dates
  (`FirstsScreen.js:274-277`). For an 11-month-old, five of seven goals are in the past
  but still framed as future.
- **Fix:** three states per goal, from A1's windows: **past-window** (age >
  `maxDays`) → "From around 6-8 weeks — add it whenever you remember it" (a *prompt to
  record a memory*, not a todo); **current-window** → "Happening around now";
  **future** → "Suggested around 10-18 months."
- Today catch-up card rules: show at most ONE catch-up goal at a time, oldest window
  first ("Did we ever save Reuben's first laugh?"). "Not yet" dismisses that goal for
  30 days **(tunable)**; saving the first retires it. Card slot is B1's nudge slot —
  not an additional card.
- **Accept:** an 11-month-old sees no "someday · 6-8 weeks" rows anywhere; dismissed
  catch-up goals do not reappear next launch.

### A3. Daily prompts are age-blind, only 10 exist, and can repeat back-to-back — P1 · M
- `src/dailyPrompts.js:1-42` — one static pool of 10 generic prompts.
- `src/dailyPrompts.js:60-64` — prompt = `hash(familyId:date) % 10`; independent hashes
  per day mean the same prompt can land on consecutive days, and a family cycles the
  whole pool in ~2 weeks.
- **Fix:** age-banded pools (0-3m, 3-6m, 6-12m, 12m+) keyed off `babyBirthday`; band
  chosen by child age on the prompt date. Each band needs ≥ 14 prompts **(copywriting
  task — flag it in the sprint, it's the long pole)**; generic prompts stay as shared
  filler. Rotation: shuffle the band's pool with a PRNG seeded by `familyId`, index by
  `daysSinceEpoch % pool.length` — deterministic across devices, no repeat until the
  pool exhausts. No migration needed: responses already store `prompt_key`/`prompt_text`
  per row (`rituals.js:122-135`), so historical answers are unaffected.
- **Accept:** same prompt never appears two days running; a 10-month-old never gets a
  newborn-band prompt; both parents' devices show the same prompt on the same day.

### A4. "On this day" is structurally empty for the entire first year — P0 · M
- `src/useRitualHomeData.js:47-51` — matches only exact month+day in *prior years*, and
  only within the 120 most recent shared photos (`:92`). A baby under 1 has no prior
  years: the segment can never show anything for the app's most important cohort —
  exactly what the home screen screenshot shows ("No matching moments from this date
  yet.").
- **Fix:** for children under 2, month-versaries: buckets at 1, 2, 3, and 6 months ago
  **(tunable)**, matching the same day-of-month ±1 day (clamp the 29th-31st to the last
  day of shorter months), up to 6 photos per bucket, labeled "Reuben, one month ago
  today." Prefer real annual matches once they exist.
- Data dependency (verified): `listSharedTaggedPage` (`photoSync.js:763-773`) has **no
  date filter today** — add `capturedOnOrAfter` / `capturedBefore` params to the
  `photo_tags` query (already ordered/indexed by `creation_time`) and call once per
  bucket. Do NOT keep filtering the recent-120 slice — older matches silently vanish
  as the archive grows.
- If every bucket is empty, hide the segment entirely instead of the empty ghost card
  (`src/TodayScreen.js:342-351`).
- **Accept:** an 11-month-old family with 3+ months of photos sees at least one
  month-versary row; a brand-new family sees no "On this day" segment at all.

### A5. Age label format is inconsistent: "11 months 13d", later "1 year 3m" — P2 · S
- `src/photos.js:355-370` — months spelled out but days abbreviated (`13d`); after age
  one, months abbreviate (`3m`). For a keepsake brand: "11 months, 13 days" — or warmer,
  "almost 1 year."

### A6. Age math vs day counter can disagree across timezones — P2 · S
- `src/photos.js:330` — `ageAt` parses `birthdayISO` with `new Date(iso)` → **UTC**
  midnight; `src/TodayScreen.js:680` — `daysSince` parses `` `${isoDate}T00:00:00` `` →
  **local** midnight. West-of-UTC users can see "day 347" disagree with the formatted age
  on the same card. Normalize both to local-midnight parsing.

### A7. First-compose accepts stale seeded ages without comment — P2 · S
- `src/FirstComposeSheetScreen.js:18-28` — seed params (`title`, `targetAge`, `goalKey`)
  prefill the form verbatim; `targetAge=6-8 weeks` for an 11-month-old passes without
  acknowledgment. After A1, default the happened-at date into the goal's window (or
  today, whichever is earlier) and add helper copy "roughly when it happened is fine."

---

## B. Today screen (screenshot-visible polish)

### B1. The child's age is shown three times in the first two cards — P1 · S
- Header subtitle "11 months 13d old" (`TodayScreen.js:148`), then the Today card repeats
  the identical string (`:164`) plus a bare "11" badge (ambiguous next to "day 347",
  `:160-166`). The card spends prime real estate saying nothing new.
- **Fix:** keep age in the header only. The day card becomes the single assistant-nudge
  slot with this priority order (show the first that applies, one per day):
  1. review matches waiting (`Scan.useScanState` already on Today) → "12 photos are
     waiting for a look";
  2. catch-up first from A2 → "Did we ever save Reuben's first laugh?";
  3. today's prompt unanswered → the prompt itself;
  4. unread current-week digest → "This week's story is ready";
  5. fallback (nothing pending): keep "day 347" + one age line — never an empty card.
- **Accept:** the identical age string never appears twice on screen; the day card
  always shows exactly one action or the fallback.

### B2. Digest cover renders a large empty gray box — P0 · S
- `src/TodayScreen.js:284-297` — when no representative media has a URL, a fixed
  `aspectRatio: 1.8` `PhotoPlaceholder` fills the card. Happens whenever the week's
  content is a voice note / milestone without image media
  (`src/rituals.js:471-487` + `:462-469` both come up empty). Your screenshot: "A week
  with a first worth saving" over a giant gray rectangle — the *payoff* surface looks
  broken.
- **Fix:** fallback chain — milestone's attached photo → any recent shared photo → hide
  the cover block entirely (headline + counts still make a good card). Never render the
  bare placeholder here.

### B3. "1 moments", "1 milestones" — P0 · S (trivial)
- `src/TodayScreen.js:299-302` — static plural labels under counts. Singularize when the
  value is 1 ("1 moment"). Same treatment anywhere `Metric` is reused.

### B4. Digest card renders even for a completely empty week — P2 · S
- `src/useRitualHomeData.js:251` — `digest` defaults to `WeeklyDigests.build()`, so a
  brand-new family sees "A quiet week, still worth keeping." + gray box + 0/0/0/0.
- **Fix (decided):** hide the digest card entirely when
  `momentCount + milestoneCount + voiceNoteCount + letterCount === 0`. No starter CTA
  here — the empty-state invitation is B1-slot-5's job; two cards selling the same
  action is an F-section violation.

### B5. "For you, today" is just the 12 most recent photos — P2 · S
- `src/useRitualHomeData.js:58` — `recentPhotos: shared.slice(0, 12)`; chip label says
  "For you" (`TodayScreen.js:697`). Personalization language without personalization.
  Rename to "Recent" until there's real selection logic (best-shot, on-this-week, etc.).

### B6. Milestone teaser can surface an unfinished placeholder — P2 · S
- `src/useRitualHomeData.js:60-63` — `latest: firsts[0]` doesn't filter `done === false`,
  and `MilestoneTeaser` (`TodayScreen.js:382-409`) renders it under the "Milestone"
  eyebrow with no photo even when the first has one attached. Filter to done firsts;
  show the attached photo as the teaser thumbnail.

### B7. Scan banner copy — P2 · S
- `src/TodayScreen.js:639` — "Tap to review the media that needs a parent." reads like
  infrastructure. Assistant voice: "12 new photos look like Reuben — take a look."

---

## C. Core loop: capture → review → payoff

### C1. Review filters expose confidence jargon — P1 · S
- `src/ReviewMatchesScreen.js:319-322` — chips read "High · 24 / Borderline · 7". The
  PRD's own principle: parents never see scores/thresholds. Rename: "Sure it's Reuben" /
  "Double-check these" (labels only; keep internals).

### C2. Saving a moment ends the story — no follow-through — P1 · M
- `src/AddSheetScreen.js:147` — after save, `router.replace('/timeline')` and the story
  ends. This is the single best slot for the assistant to earn its keep.
- **Rules (decided):** one dismissible question rendered as a toast-sheet after save
  completes, chosen by first-match priority; max 1 per save, max 2 per day
  **(tunable)**; a dismissed question never repeats for that moment:
  1. **First candidate** — child age is inside an incomplete goal window (A1 data) AND
     the moment has a photo → "Could this be a First? (first steps · around now)".
  2. **Voice** — moment has photos but no voice note and no note text → "Add a
     20-second voice note while it's fresh?"
  3. **Letter line** — moment is linked to a First OR contains a voice note → "Leave
     one line for the eighteenth-birthday letter?" (prefills letter compose with
     date/age context).
  No ML anywhere — save event + child age + A1's windows.
- **Accept:** saving a photo-only moment for a child inside the first-steps window
  shows exactly one question; dismissing it and re-opening the moment never re-asks.

### C3. "1 parent answered" doesn't invite the second parent — P1 · S/M
- `TodayScreen.js:191` shows the count; `partnerAnswered` already exists
  (`useRitualHomeData.js:34`) and member names are in `membersById`.
- **Scope (decided):** this item is copy-only — replace the counter with names:
  "You answered · Dana hasn't yet" / "Dana answered too". No "nudge" button yet: there
  is no push infrastructure in the app, so the button would have nothing to do. A real
  remind action is blocked on the notifications workstream (the missing P1 system —
  tracked as its own future PRD section, not this item). Do not show the partner's
  answer content; only whether they answered.
- **Accept:** with one response saved, the card names who answered instead of
  "1 parent answered."

### C4. Add-sheet secondary actions break the back stack — P2 · S
- `src/AddSheetScreen.js:56-63` — `router.replace(action.route)`: Add → Prompt → back
  lands on Timeline, not Add. Use `push` so back returns where the user was.

### C5. Digest detail empty state has no next step — P2 · S
- `src/DigestDetailSheetScreen.js:107-112` — "No representative media landed in this week
  yet." + disabled gray tiles. Add a CTA ("Add a moment from this week") or drop the
  tile grid when empty.

---

## D. Copy & consistency sweep

| # | Issue | Where |
|---|---|---|
| D1 | `'someday'` vs `'Someday'` capitalization | `FirstsScreen.js:275` vs `TodayScreen.js:707` |
| D2 | Prompt placeholder tone shifts when voice attached ("optional" vs "enough") — pick one: "A few lines are enough." | `PromptSheetScreen.js:140` |
| D3 | Tags saved with only `trim()` — no lowercase, no dedupe, so "First, first" stores both. Normalize: trim → lowercase → dedupe on save; render capitalized. | `MomentDetailScreen.js:205` |
| D4 | User-entered first titles render as-is in Milestone teaser ("Reuben Crawled today!") — fine, but consider sentence-casing display | `TodayScreen.js:391` |
| D5 | "1 saved moments" — no singular handling in Library subtitle and counts | `LibraryScreen.js:289`, `:337`, `:810` |
| D6 | Voice-only tile: mic + "Voice" label at `:437-440`, then the title caption overlays in `onPrimary` (light-on-light) at `:446` — the overlap in the screenshots. Give voice tiles their own layout (label below icon, single-line title). | `LibraryScreen.js:437-446` |

All S. Batch these in one pass.

---

## F. Redundant CTAs — one screen, one primary action

The pattern: every screen stacks two or three buttons that all route to the same
composer. Each duplicate dilutes the one that matters and makes screens read like
menus instead of invitations.

### F1. Empty Letters screen has THREE identical CTAs — P1 · S
- `src/LettersScreen.js:77-85` — hero "Write a letter"
- `src/LettersScreen.js:150-158` — empty state "Write the first letter"
- `src/LettersScreen.js:116-132` — footer "Leave one more line for later" + "+" button
- All three push `/letter-compose`. With zero letters, the screen is 100% buttons.
- **Fix:** empty state keeps ONE CTA (the "Seal the first letter for Reuben" card — it
  has the emotional copy). Hero card drops its button and becomes pure promise copy;
  footer card renders only when at least one letter exists ("one more line" implies a
  first line was written).

### F2. Firsts screen has three "add" affordances — P1 · S
- `src/FirstsScreen.js:63-72` — header "+" button; `:103-111` — hero "Add a first"
  button; `:169-173` — per-row "+" icon on every placeholder.
- **Fix:** per-row tap already opens the seeded composer — that's the meaningful entry
  (keep it, it carries goal context). Keep the header "+" for freeform adds. Drop the
  hero button; after A1 the hero's job is showing the age-relevant next goal, which is
  tappable itself.

### F3. Audit the rest with the same rule — P2 · S
- Today: digest card has a small quiet "Read digest" button (`TodayScreen.js:304-312`)
  AND should be card-tappable (see G1) — once the card is tappable, the button goes.
- Rule of thumb going forward: a card is either tappable OR carries a button, never
  both, and no screen shows two buttons with the same destination.

---

## G. Pressability — cards that look tappable must be tappable

Today's cards are informational containers with tiny buttons inside. Parents tap the
card. Nothing happens. Every one of these should navigate on card-press (whole card =
hit target, per Apple HIG), with the inner button removed or kept only as a visual cue.

### G1. Today-screen cards are not pressable — P1 · S/M
| Card | Code | Should open |
|---|---|---|
| Day/age card | `TodayScreen.js:157-168` (plain `Card`) | The B1 nudge's target; until B1 ships, `/firsts` |
| Digest card | `:251-313` (only "Read digest" button) | `/digest` |
| Milestone teaser | `:382-435` (only "Open firsts" button) | `/firsts` (done state) / `/first-compose` (empty state) |
| Prompt answered card | `:182-203` (only "Edit" button) | `/prompt` |
- **Fix:** wrap each `Card` in `Pressable` with `accessibilityRole="button"`, add the
  press-scale feedback from H3. S per card; M for the set with proper hit-target QA.

### G2. Same audit on Letters/Library hero cards — P2 · S
- Letters hero card (`LettersScreen.js:70-86`) and Library camera-roll card are also
  button-in-card patterns. Apply the same rule after G1 sets the pattern.

---

## H. Motion — the app has an animation library and zero animations

**Finding:** `react-native-reanimated@4.3.1` is in `apps/mobile/package.json:75` but
**no file in `src/` imports it**. The only motion in the product is a selection haptic.
A `useReducedMotion` hook already exists (`src/ui/useReducedMotion.js`) — the
accessibility gate is built, unused.

### H1. Today's segmented control changes content the user cannot see — P0 · S
- Control renders at `TodayScreen.js:170-178`; the content it switches renders at
  `:322-354` — *after* the prompt card, digest card, and milestone teaser. Tapping
  "Places" or "On this day" changes pixels below the fold. It looks broken.
- **Fix (decided):** move the `SegmentedControl` down so it renders directly above the
  content it switches (immediately before the rail/timeline block at `:322`); prompt,
  digest, and milestone cards stay above it in their current order. Additionally, hide
  the "On this day" segment until A4 ships content for it (a segment that is always
  empty is worse than no segment). Rejected for now: converting Places/On-this-day to
  pushed sub-screens — revisit only if the segments grow their own navigation depth.

### H2. SegmentedControl has no animated selection — P1 · S
- `src/ui/SegmentedControl.js:35-39` — active state is an instant background swap.
- **Fix:** animated sliding thumb (reanimated `withSpring` on translateX) + 150ms
  cross-fade of the outgoing/incoming content. One shared component upgrade fixes
  Today, Library, and every other segment user.

### H3. Define the motion vocabulary once, apply everywhere — P1 · M
Small, restrained, keepsake-brand-appropriate set — this is the "wow" without the
circus:
1. **Press feedback:** 0.97 scale + spring-back on every Pressable card/tile (one
   `AnimatedPressable` wrapper in `ui/`, adopted by G1 cards).
2. **List/section entrance:** stagger fade-up (~30ms/item) on Today cards and grids on
   first mount only.
3. **Segment transitions:** H2.
4. **Hero moments (the actual wow):** saving a First (flag plants, progress segment
   fills along the goal path), sealing a letter (envelope closes), digest reveal
   (cover photo scales in). These three are the emotional peaks of the product and
   currently ship with zero ceremony.
5. Everything gated by the existing `useReducedMotion` hook.
- Layer 1-3 are mechanical (M total). Layer 4 is design work — do one (First saved) end
  to end first, learn, then the other two.

---

## I. Photo pipeline — from "tool the parent operates" to "vault that fills itself"

Verified state of the pipeline: scan already filters to photos taken after the
birthday (`ScanProgressScreen.js:72-76` via `sinceMsForScan`). The reference system is
already a multi-reference, age-weighted profile — up to 12 references, each tagged with
age-at-capture, weighted by age proximity to the candidate photo
(`recognitionReferences.js:220-232`: ±30d → 1.14×, >1yr apart → 0.84×), and every
accepted save feeds back as a trusted reference (`:189-213`). Negative examples are
kept. **The intelligence exists; the UX in front of it is manual at every step.**

### I1. Bootstrap the reference from the birthday — kill the face picker — P1 · M
- Today the profile is seeded ONLY by the parent manually picking a photo
  (`ReferencePhotoScreen.js:65` ImagePicker → `:85` embedFace → `:105`
  addReferenceImage). But once we have birthday + photo permission (both collected in
  Setup), the app can find the baby itself.
- **Fix:** job kicked off when Setup completes (requires `isNative` && photo permission
  granted — otherwise route straight to the existing manual picker):
  1. Sample up to 30 photos **(tunable)** per calendar month of the child's life
     (newest first within each bucket), plus the birth window (days 0-14).
  2. `embedFace` each; skip photos with zero faces.
  3. Greedy-cluster embeddings at cosine ≥ 0.55 **(tunable — calibrate on real
     libraries before shipping)**.
  4. The baby = the cluster that appears in ≥ 60% **(tunable)** of non-empty month
     buckets. Confidence gate: if fewer than 3 non-empty buckets or no cluster clears
     60%, fall back to the manual picker — never guess.
  5. Seed the profile with one reference per age band via `addReferenceImage`
     (`source: 'auto-seed'`), then confirm: **"Is this Reuben?"** [best photo] →
     Yes / Pick a different photo (→ manual picker, which also clears the auto seeds).
- Why monthly sampling beats birth-window-only: late installers (an 11-month-old's
  newborn photos age-weight to 0.84× against today's photos), newborn face detection is
  Vision's weakest case, and multi-age seeding is exactly what the weighting system was
  built for.
- Keep the manual picker as fallback: no native matcher, denied permission, wrong-face
  correction, twins/siblings (the confirm step is what catches multiple children).
- **Accept:** fresh install with birthday + permission on a real library reaches "Is
  this Reuben?" showing the right face without opening a picker; answering "Pick a
  different photo" lands in today's picker flow with no auto-seed residue.

### I2. The reference UX hides the system's intelligence — P2 · S
- `ReferencePhotoScreen` presents "pick one clear photo" as the whole story; parents
  have no idea the model improves as they save (trusted references) or that removing
  auto-saves teaches it. One line of honest copy: "Reuben's face model gets sharper
  every time you keep or remove a photo." Pair with C1's jargon cleanup.

### I3. New photos require a manual tap to enter the vault — P1 · phase 1 M, phase 2 L
- Verified: change detection is a **foreground-only** listener
  (`mediaLibraryChanges.js:140-178`) that writes a pending flag; Today renders a banner
  ("Photo library changed · tap to scan updates", `TodayScreen.js:600-620`); nothing
  scans until the parent taps; the scan is a foreground singleton that dies with the
  app (`scanController.js:1-28`). **No background task exists anywhere** — no
  expo-task-manager, no background fetch in the repo.
- The incremental plumbing already exists: `extraAssetIds` targets just the new photos
  (`scanController.js:297,445-450`), checkpoints avoid rescans, calibrated auto-save
  (≥0.9) already uploads silently.
- **Phase 1 (foreground auto-ingest):** on app open / foreground, auto-start the
  incremental scan when ALL of: a reference profile exists, photo permission granted,
  and (a pending change exists OR >24h since last checkpoint). Guardrails: defer while
  a manual scan is running (`Scan.isRunning`) and in Low Power Mode; scanning is local
  CPU only — uploads happen solely through the existing auto-save path, which already
  runs the quota reserve/finalize ledger (verify this in review: auto-save's `saveFn`
  is the same `Tags.setBaby` used by manual review). Banner flips from chore ("tap to
  scan") to payoff ("4 new moments of Reuben — take a look"). Uncalibrated families
  still get review-first; calibrated families get true zero-tap ingestion.
- **Accept (phase 1):** take a photo, kill the app, reopen → within seconds Today
  shows "N new moments" with no scan tap; airplane-mode reopen degrades gracefully
  (scan runs, uploads queue).
- **Phase 2 (background ingest):** iOS BGProcessingTask via expo-task-manager for
  overnight scans (device charging, app backgrounded). No guaranteed schedule from iOS
  — treat as opportunistic top-up, with phase 1 as the reliable path. Android:
  WorkManager equivalent. This is what makes "it just fills itself" literally true.

### I4. iCloud-optimized originals will silently fail the pipeline — P1 · M
- Scan and upload need local URIs; with "Optimize iPhone Storage" many originals are
  iCloud-only placeholders. The PRD's QA notes iCloud download failure for PhotoDetail;
  the scan path needs the same care: request download with progress, park failures in a
  retry queue instead of dropping them, and say so ("3 photos are waiting for iCloud").
  Test profile: large library + optimized storage + poor network.

### I5. Library should read as "all of Reuben's photos," not "what you operated" — P2 · M
- The saved-vs-camera-roll split (`LibraryScreen`, camera roll behind an explicit
  Browse) is right for privacy and cost. But once I1 + I3 land, saved-archive coverage
  approaches "every baby photo," and Library's framing should follow: month/age
  sections as the primary grid, burst/duplicate grouping (best shot on top — PRD's
  best-shot selection), and the correction queue framed as "recently added by the
  assistant" rather than a repair tool.

### I6. Deletions in the Photos app are counted but never reconciled — P2 · S
- The change observer tallies `deletedCount` (`mediaLibraryChanges.js:28,38`) but
  nothing updates saved moments whose local asset vanished — poster-only video
  promotion, exports, and re-scans all assume the asset may still exist. Reconcile on
  scan: mark moments whose source asset is gone (cloud copy still safe — that's the
  pitch: "deleted from your phone, still in the vault").

### I7. Quality scoring — the native module is one Vision request away — P1 · S/M
- Verified: `ExpoFaceMatcherModule.swift` runs `VNDetectFaceRectanglesRequest` (:167)
  and `VNGenerateImageFeaturePrintRequest` (:180). It does NOT yet run
  `VNDetectFaceCaptureQualityRequest` — Apple's purpose-built "how good is this face
  photo" score (sharpness, expression, eyes, lighting), designed exactly for ranking
  near-identical shots. Adding it is a few lines in the same request-handler pass;
  return `captureQuality` per face alongside the existing `faceCount`/`primaryBox`.
- Cheap companions in the same pass: face-size ratio (tiny faces rank down),
  Laplacian sharpness on the face crop. All on-device, zero cloud, zero privacy change.
- Caveat to encode in the API comment: `captureQuality` is only meaningful comparing
  shots of the *same subject* — exactly our single-baby case; never treat it as an
  absolute "is this a good photo" score across subjects.
- First use, no UI needed (Sprint 3, before clustering exists): an **absolute**
  auto-save floor — matches with `captureQuality` < 0.25 **(tunable)** are routed to
  review instead of auto-saving. Demoted to review, never dropped: the parent still
  sees them. The relative "sharper sibling wins" logic arrives with I8's clusters.
- **Accept:** a deliberately blurred test shot that clears the face-match threshold
  lands in review, not the vault.

### I8. Burst/photo-shoot clustering — fold 24 near-identical shots into one — P1 · M/L
- The monthly-photo-shoot problem: dozens of frames of the same setup. Two signals we
  already have cluster them: `creationTime` proximity and feature-print distance (the
  "embeddings" ARE `VNFeaturePrintObservation`s; `computeDistance` is Apple's intended
  near-duplicate detector).
- **Mechanics (starting values, all tunable):** a gap > 30 min splits sessions; within
  a session, photos whose feature-print distance clears the near-dupe threshold join a
  sub-cluster (calibrate the threshold on a real photo-shoot set before shipping —
  distance scale is opaque, so derive it empirically from known duplicate pairs).
  Rank each sub-cluster by I7 quality. Default keep-count: top 1, plus 1 more per 10
  shots in the cluster, capped at 3.
- **Presentation is the product decision: never silently discard.** A cluster renders
  as a *stack* — best shot is the cover, "+23 similar" folded behind, expandable.
  Review screen shows stacks instead of 24 tiles (the 5000-match QA case gets easier,
  not harder). Vault saves the cover (or top 2-3 for big shoots) by default; folded
  shots stay browsable on-device and can be promoted into the vault with one tap.
- Bonus: fewer uploads = quota lasts longer; feeds the smart-import estimate with
  honest numbers ("142 photos → about 31 worth keeping").
- **Accept:** a 40-shot monthly photo shoot renders in review as ≤ 4 stacks, expanding
  a stack shows every frame, and promoting a folded shot moves it into the vault.

### I9. Curation policy — replace with better, never fight the parent — P2 · M
- "Replace only the best ones" needs rules, not vibes:
  1. If a higher-quality shot lands in an existing cluster, it becomes the cover; the
     old cover folds into the stack — nothing is deleted, cloud copies stay.
  2. A parent-chosen photo is `pinned`: the model never demotes it. Parent taste
     outranks capture quality, always (the blurry photo where grandma is laughing IS
     the best photo).
  3. Below-floor shots (blur + eyes closed + a better sibling in-cluster) are excluded
     from auto-save and digest/first-look candidate pools, but remain in the expanded
     stack. Deleting originals is never our call — that's the Photos app's job.
  4. Every quality decision is visible and reversible: "We kept the sharpest 3 of 24 —
     see the rest."

---

## J. Notifications — the missing system (verified absent, with a head start)

**Verified state:** zero user-facing push. No `expo-notifications` in
`apps/mobile/package.json` or `app.json`, no push-token code anywhere in `src/` or
`supabase/functions/`. (The `apple-notifications` / `google-notifications` edge
functions are store *billing* webhooks — App Store Server Notifications and Google
RTDN — not user push.) **Head start:** pg_cron already runs
`assemble_due_weekly_digests` daily per family with a configurable digest day
(`supabase/migrations/20260622181500_scheduled_weekly_digest_cron.sql`) — the
scheduled trigger moments exist server-side; they just have nowhere to deliver.

### J1. Infrastructure — P1 · M
- Client: add `expo-notifications`; APNs/FCM via EAS credentials. **Permission timing
  (decided):** ask after the first value moment (first review save or first digest
  view), never at install — pair the ask with the payoff it enables ("Want to know
  when next week's story is ready?").
- Token registry: `push_tokens` table (`user_id`, `family_id`, `expo_push_token`,
  `platform`, `updated_at`), RLS owner-only; register on sign-in, refresh on launch,
  delete on sign-out.
- Delivery: one `send-push` edge function wrapping the Expo Push API (handle receipts +
  token pruning). Callers: pg_cron jobs (pattern already proven in the repo) and DB
  webhooks for event-driven sends.
- Every notification deep-links to its route (`/digest`, `/prompt`, `/review`,
  `/letters`). QA the cold-start path through the `AppGate` ladder — a push must never
  strand a signed-out or unentitled user on a blank screen (route-guard P0 is a
  prerequisite).

### J2. Event catalog and cadence — P1 · M (with J1)
Defaults chosen for a calm keepsake brand — **hard cap 2/day per user (tunable),
transactional excluded**; every category individually toggleable:
| Category | Trigger | Default |
|---|---|---|
| Weekly digest ready | hook into `assemble_due_weekly_digests` (family digest day) | ON |
| Daily prompt | scheduled at family-configured hour; suppressed if answered/snoozed | ON |
| Partner activity | partner answered prompt / saved a First / sealed a letter — **batched, max 1/day** | ON |
| New moments found | after background ingest (I3 phase 2) — "4 new moments of Reuben" | ON when auto-ingest on |
| Tonight's picks | daily at 20:00 family-local (section M) — "Tonight's picks are ready" | ON once M ships |
| Letter openable | open_on date reached | ON |
| Circle joined | invite redeemed | ON |
| Billing/quota | grace period, storage near cap | transactional, always on |
- Preferences UI: extend the existing ritual-settings surface with per-category
  toggles + quiet hours (default 21:00-08:00 local, **tunable**).
- This unblocks C3's real "remind partner" action (C3 ships copy-only until J lands).
- **Accept:** partner answers the prompt → my device gets ONE batched notification (not
  one per event), tapping it opens `/prompt`, and toggling the category off stops it.

### J3. In-app notification center — the UI design — P1 · M
Where it sits, what it looks like, how it navigates. Decided so any agent can build it:
- **Placement:** a bell icon button (44pt, same style as the settings button) in the
  `AppShell` header on Today, between the Search pill and the gear. Unread state = a
  small coral dot on the bell — **no numeric badges anywhere** (calm brand). App-icon
  badge count: off by default.
- **Route:** `/activity`, presented as a sheet like the other sheet routes
  (`NativeSheet` treatment), wrapped in `ProtectedRoute`.
- **Layout:** rows grouped by day ("Today", "Yesterday", then dates). Each row: a
  category glyph in a soft circle (same iconography as the source feature), one-line
  title ("Dana answered today's prompt"), relative timestamp, and a 40pt thumbnail when
  the event has media ("4 new moments found"). Rows are whole-row pressable (G-section
  rule) and use H3 press feedback + entrance stagger.
- **On press:** identical deep link to the push equivalent (`/prompt`, `/digest`,
  `/review`, `/letters`, `/moment/[id]`). Opening the sheet auto-marks everything read
  — no per-row read management, no swipe actions in v1.
- **Footer row:** "Notification settings" → the J2 preferences surface.
- **Empty state:** "Quiet for now. We'll let you know when something's worth it." —
  single line, no illustration box.
- **Data:** the `send-push` function writes one row per delivered notification to a
  `notifications` table (`user_id`, `category`, `title`, `body`, `deep_link`,
  `created_at`, `read_at`; RLS owner-only). The center reads the last 30 days. In-app
  rows are written even when the push permission is denied — the center works without
  push consent.
- **Accept:** every push has a matching row in the center; bell dot appears on a new
  row and clears on open; tapping a row lands on the same screen its push would.

---

## K. Multi-child — "+ New Baby" (founder-confirmed direction)

The scenario to design for: a family has a three-year-old, then a new baby arrives.
One tap on "New Baby," and both children live in the same family, same circle, same
subscription — easy to move between. Verified current state: the schema is
single-child (`families.baby_name` one text column, `schema.sql:10`; letters
`audience` locked to `'child'`), and 24 client files read `babyName`/`babyBirthday` —
sizable but tractable because nearly all read via `FamilyContext`.

### K1. Schema migration — L (do the design now, before scale)
- New table `children` (`id` uuid pk, `family_id` fk, `name`, `birthday` date,
  `avatar_asset` nullable, `created_at`). Backfill: one row per family from
  `families.baby_name`/`baby_birthday`.
- Add nullable `child_id` fk to `moments`, `firsts`, `letters`, `photo_tags`,
  `memories`; backfill all existing rows to the family's first child. Keep
  `families.baby_name` during transition; drop in a later migration.
- Stays family-level in v1: `daily_prompt_responses` (one prompt per family),
  `weekly_digests` (one digest per family with per-child sections),
  billing/entitlements (one plan covers all children — the pricing lever lives in
  `docs/business-roadmap.md`).

### K2. Client shim + child switcher — M/L
- `FamilyContext` gains `children[]` and `activeChildId` (persisted per device in
  AsyncStorage). During migration, `family.babyName`/`family.babyBirthday` become
  derived getters of the active child — the 24 call sites keep working unchanged;
  refactor them opportunistically.
- **Switcher UI (decided):** the header identity (avatar + "Reuben's world") becomes
  pressable → a small sheet listing children (avatar, name, age) + a "New baby" row.
  Today, Firsts, Letters, Library all scope to the active child. v1 is
  one-active-child-at-a-time; an "everyone" combined view is v2 — do not build it
  speculatively.
- **"New Baby" flow:** name + birthday (reuse Setup's form), then offer the I1
  reference bootstrap scoped to the new child (sampling from their birthday forward).
  A newborn's sibling already has a profile — the confirm step ("Is this Mia?") is
  what keeps the two children's references separate.
- Recognition: reference-profile storage keys gain a child segment
  (`olw:reference-set:v2:{familyId}:{userId}:{childId}`; migrate existing keys to the
  first child). v1 scan runs against the active child's profile; scoring one pass
  against all children's profiles and tagging per child is v2.
- **Accept:** family with a 3-year-old adds a newborn in under a minute; each child
  has separate firsts progress, timeline, age display, and reference profile;
  switching children is two taps from anywhere; existing single-child families
  migrate with zero visible change.

---

## L. Letters v2 — kill the 18-year lock (founder-confirmed direction)

The "sealed until eighteen" framing is retired. Letters become **ongoing letters to
your child that we keep** — sealing until a date is an option, not the premise.
Verified constraints to remove: `open_on date NOT NULL` (`schema.sql:210`), UI copy
referencing "eighteen" throughout LettersScreen/compose, and compose defaulting
`open_on` to birthday + 18y.

### L1. Schema + model — S
- Migration: `open_on` → nullable. `null` = open letter (readable in the vault
  anytime). Non-null keeps today's sealed behavior exactly — existing letters are
  unchanged. `child_id` arrives via K1.
- Visibility (decided): letters are visible to both co-parents once written (family
  vault semantics), never to the circle. Sealed letters hide the body from everyone
  until `open_on`, as today.

### L2. Compose + list UX — M
- Compose gains one question: **"When should this open?"** → "Keep it open" (default)
  / "Seal until a date" (picker with quick chips: next birthday, 18th birthday,
  custom). All "eighteen" copy is replaced; the frame is "letters for later, kept
  safe" — the hero (`LettersScreen.js:74-75`) becomes "Letters to Reuben, kept as
  long as you need."
- List shows open letters as readable rows (author, date, first line) and sealed ones
  with today's lock treatment.

### L3. Email delivery — S now, M later
- **Now (nearly free, verified):** `mail.js` already detects installed mail clients
  and opens compose. Letter detail gains "Send a copy by email" → prefilled composer
  (subject "A letter for {child}", body = letter text + date + child's age when
  written). Family settings gains an optional "{child}'s email address" field to
  prefill the recipient — exactly the his-own-Gmail pattern, without us running mail
  infrastructure.
- **Later (server email):** scheduled delivery ("email this on their 18th birthday")
  needs a transactional email provider via an edge function — defer until demand is
  proven; the vault + manual send covers the promise meanwhile.
- **Accept:** write an open letter → partner can read it immediately; "Send a copy by
  email" opens the mail composer fully prefilled; existing sealed letters still
  unlock on their date.

---

## M. "Tonight" — the parents' evening feed (founder-requested)

The observed behavior to productize: parents spend evenings together scrolling the
best photos and videos — recent and old. Give that ritual a home, and make adding a
line of context to a featured photo nearly effortless.

### M1. Selection — the day's picks — M
- **Up to 20 items per day** (founder-set ceiling; all proportions **tunable**),
  deterministic per `familyId + date` (seeded like A3's prompts) so **both parents see
  the identical set** — that's what makes it a shared ritual rather than two feeds.
- Mix (best-judgment defaults, new-leaning because new parents shoot daily):
  ~60% recent — the best of the last 7 days (rank by I7 `captureQuality` once
  available; until then reactions + recency); ~25% lookbacks — A4's month-versary
  buckets and "this week, N months ago"; ~15% deep cuts — older moments weighted by
  reactions + quality. **Include at least one video whenever any qualifies** (recent
  first, else a lookback video); videos autoplay muted in the pager, tap for sound.
- Quality over quota: if the library can't fill 20 *good* items, show fewer — never
  pad with mediocre shots (respect I7's floor once it exists). Never repeat an item
  shown in the last 30 days.

### M2. The viewing experience — M/L
- Full-screen horizontal pager (one item per page), media edge-to-edge, chrome
  minimal: age chip ("7 months, 2 days") top-left, close top-right.
- **The commentary bar is the point:** persistently docked at the bottom — one-line
  field ("Add a line about this…") + mic button. One tap, type or talk, auto-saves.
  No modals, no save buttons.
- Partner presence: their line appears under yours on the same pick ("Dana — 'that
  laugh'"); reactions reuse the existing `moment_reactions`. Quiet dot on picks the
  partner already annotated.
- End card after the last pick: "That's tonight. {N} kept close." — then close. **No
  streaks, no gamification** — the calm brand is the moat here.
- Data: new `moment_comments` table (`id`, `moment_id`, `family_id`,
  `author_user_id`, `body` nullable, `voice_path` nullable, `created_at`; RLS: family
  writers insert/read, author deletes). Comments render on MomentDetail too.
- Entry points: a "Tonight" card on Today appearing after 19:00 local **(tunable)**
  with a fanned preview of tonight's covers, plus J2 notification category
  "Tonight's picks are ready" (default ON, sends at 20:00 family-local, before quiet
  hours).
- Dependencies: A4 (lookback buckets); J (notification); I7 improves selection but a
  reactions+recency v1 ships without it. Buildable after Sprint 3.
- **Accept:** both parents' devices show the same picks the same evening; from the
  notification, adding a line to a pick takes two taps + typing; the partner's line
  is visible on the other device by morning; a moment annotated in Tonight shows the
  comment in MomentDetail.

---

## N. Widget, Live Photos, accessibility, adaptive layout (founder-confirmed)

### N1. The widget — "a photo frame that updates itself" — P1 · L (after M ships)
The marketable story: **a new photo of your baby, every morning, without opening
anything.** This is the screenshot people show other parents. Three surfaces, one
WidgetKit extension:
- **Home Screen widget (the hero surface — small/medium/large):** full-color daily
  photo from Tonight's selection engine (M1), overlaid with the age chip ("11 months,
  13 days") in brand type on a soft scrim. The WidgetKit timeline carries 3-4 entries
  per day (morning / midday / evening) so the frame *changes during the day* — the
  reason to glance twice. Evening entry = tonight's cover; tapping after 19:00 opens
  the Tonight pager, otherwise the moment's detail.
- **StandBy (iOS 17+, the marketing moment):** the medium widget makes the charging
  iPhone a **nightstand photo frame of your baby**. Zero extra work beyond the medium
  widget, and it's the single most demoable frame for the App Store page and ads —
  "your nightstand, but it's Reuben."
- **Lock Screen accessories (design for the constraint):** accessory widgets are
  tiny and tinted — no full-color photos. So: `accessoryCircular` = the day counter
  ("347"), `accessoryRectangular` = name + age + today's nudge ("Reuben · 11 mo 13 d ·
  3 new moments"). Glanceable love + a reason to unlock into the app.
- **Mechanics:** app writes the day's pre-rendered images + metadata to the shared
  App Group container whenever Tonight's selection computes (app open or background
  refresh); widget never touches the network — private by construction, and say so.
  Config options (long-press → Edit Widget): choose child (K-ready), choose content
  (Today's pick / This week's best / On this day).
- **Why it matters commercially:** it's the zero-permission retention surface (no
  push consent needed), it markets itself on every glance, and it's organically
  viral — "what widget is that?" **Accept:** widget shows a different photo morning
  vs evening without the app being opened; StandBy renders full-bleed; lock-screen
  accessories stay legible in tinted mode; tap deep-links correctly through the gate.

### N2. Live Photos — they should stay alive in the vault — S verify + M support
- **Verified:** zero Live Photo handling anywhere in `src/` (no `mediaSubtypes` /
  live-photo checks) — they're silently treated as stills today.
- **v1 (verify + preserve, pairs with Sprint 3's pipeline work):** confirm picker,
  scan, resize, quota, and export treat the still correctly (no double-count, no
  lost still). Detect and store `isLivePhoto` in media metadata so the archive knows
  which memories have motion, even before we play it.
- **v2 (the delight, pairs with M):** capture the paired ~3s motion clip on save;
  long-press in MomentDetail and Tonight plays the motion + sound — "the photo that
  moves" is exactly the emotional register of this product. Quota: count the still
  only in v1; motion clips ride the existing video policy in v2.
- **Accept (v1):** saving a Live Photo stores a correct still, flags it, and charges
  quota once. **Accept (v2):** long-press on a flagged memory plays motion in
  MomentDetail and the Tonight pager.

### N3. Accessibility pass — S/M · scheduled with Sprint 5 (confirmed)
- Labels are consistently present (verified across every screen read), but VoiceOver
  traversal and Dynamic Type are untested — retest specifically after G1 makes whole
  cards pressable and M adds a custom pager.
- Standing rule from now on: every new component (AnimatedPressable, stacks, pager,
  widget config) ships with label + role + Dynamic Type tested, not retrofitted.
- **Gate:** every G1 card reads as one button with a sensible label; Tonight is fully
  traversable; type scales to XXL without clipped copy on Today/Firsts/Letters.

### N4. Adaptive layout — we already ship on iPad, so own it — discipline now · track later
- **Verified:** `app.json` has `supportsTablet: true` — iPad users can install TODAY
  and get an unaudited stretched phone layout. Orientation is locked portrait. So
  this is not "add iPad support"; it's "own the layout we already ship."
- **Founder direction:** the product should work across screen sizes — iPad and
  landscape awareness now, desktop compatibility later.
- **Discipline starting now (free):** no hardcoded screen-width assumptions; layout in
  flex/percentage containers (mostly true already); every Sprint 1-5 change gets a
  quick look at iPhone SE width and iPad width. Content column max-width (~640pt)
  centered on wide screens as the v1 iPad answer — a readable column beats a
  stretched one.
- **Track (after Sprint 5): iPad/landscape audit** — breakpoint system in `ui/`
  (compact/regular), two-pane opportunities where they're natural (Library grid +
  detail; Tonight pager is already full-screen-friendly), unlock landscape on iPad
  first (phone stays portrait).
- **Desktop (decided direction):** arrives via the web, not macOS Catalyst — it's the
  K4 web viewer grown up (circle view first, then parent read-write). Note it in
  `docs/business-roadmap.md` sequencing; nothing to build in the app now beyond the
  layout discipline above.
- **Accept (discipline):** no screen breaks at iPhone SE or on iPad; **Accept
  (track):** iPad shows the centered-column or two-pane layout, rotates cleanly, and
  nothing renders as a stretched phone screen.

---

## S. Suggested Firsts — assistant-first, parent-approved (founder-directed)

Principle: **the app does the searching, sorting, dating, titling, and drafting;
parents confirm, correct, or dismiss.** Manual creation stays as the fallback. No
generative AI anywhere — template text from real metadata only, and copy never claims
certainty ("Possible first smile", never "We found the first smile"). Copy strings
live in model constants and are asserted verbatim in unit tests. Full design:
`~/.claude/plans/pure-munching-sunset.md`; suggestion pipeline documented in
`docs/architecture.md`.

Architecture: suggestions are per-device, per-user local state (AsyncStorage,
`olw:first-suggestions:v1:{familyId}:{userId}`). They become shared family data only
when a parent taps Keep (existing `Firsts.create` path — zero schema change).
Generation runs on-device (native face matcher; photos may not be uploaded).

- **S1 — compose-sheet preselect params.** `/first-compose` accepts `seedAssetId`,
  `seedAssetOwnerUserId`, `seedAssetUri`, `seedDate`, `seedNote`; the seeded photo is
  merged to the front of the rail, reusing a saved archive row when one matches.
  **Accept:** push with seeds opens the sheet photo-selected + date-filled; existing
  entry points unchanged. *(shipped, Sprint S-A)*
- **S2 — suggestion model + local store.** `firstSuggestionModel.js` (pure) +
  `firstSuggestionStore.js`: window math, quality-cascade ranking with
  non-near-duplicate alternates, keep/not-this/choose-another feedback, 30-day
  dismissals, 24 h regen throttle. *(shipped, Sprint S-A)*
- **S3 — targeted generation.** `firstSuggestionScanner.js` pages the library inside
  each due goal's age window (cap 240 assets, 2 goals/run), scores via
  `matchAgainstReferenceProfile`, persists at most one suggestion per goal; silent
  no-op without native matcher/permission/reference profile. Triggered from Firsts
  screen focus, deferred. Background-task hookup deferred. *(shipped, Sprint S-A)*
- **S4 — review card on Firsts.** "Worth a look · Possible first smile · Around Oct 1 ·
  from your photo library" with photo strip (tap alternate = choose another), Keep /
  Not this, footer "Nothing is saved until you keep it." Keep opens the compose sheet
  fully drafted; display-time filter hides done goals. Dev fixture: long-press the
  header "+" (`__DEV__` only). Maestro: `.maestro/suggested-first-*.yaml`.
  *(shipped, Sprint S-A)*
- **S5 — Today surface.** `dayCardNudge` slot between review and catch-up:
  "Possible first smile — 3 photos to look at" → `/firsts`. Dismiss = 7-day soft
  snooze (Today only, Firsts card unaffected). *(shipped, Sprint S-B)*
- **S6 — trust calibration.** Per-detector min-score raises after repeated not-this
  with zero keeps (0.65 → 0.75 after 2; disabled 60 days after 4; one keep resets).
  Deliberately does NOT feed face-match negativeExamples — "not this" means "not that
  milestone", not "not my child". *(shipped, Sprint S-B)*

**Track T — detectors (iOS-only, needs new dev build; re-rank only, wording stays
"Possible…"):** T1 smile via `CIDetectorSmile` on the shortlist; T2 solid-food via
`VNClassifyImageRequest` allowlist; T3 video frames for roll/crawl/steps ("from a
video around Nov 3"). `laugh`/`word` get no photo detectors — catch-up card only.

**Same-spirit tracks (order: U → W → X/Y → Z):**
- **U1 suggested notes:** one template sentence ("Oct 1 — 7 weeks old. Midday
  outing.") from age/date/scene labels, offered under the compose note field, never
  auto-inserted. *(shipped, Sprint UV)*
- **V1 prompt starters:** starter line from that day's saved moments in the prompt
  sheet; absent when nothing was saved (no filler). *(shipped, Sprint UV)*
- **W1+W2 digest highlights:** persist captureQuality/recognitionScore into
  `moment_media.metadata` at upload; digest SQL prefers milestone-linked media, then
  quality, falling back to recency for historical rows. *(shipped, Sprint W)*
- **X1 suggested letters:** post-first-save nudge seeds letter compose with facts
  only ("On October 1, at 7 weeks old, we saved your first smile." — a fact about
  the archive, never a claim about the world). *(shipped, Sprint XY)*
- **Y1 suggested notifications:** local notification on the generating device
  ("Three possible first-smile photos are ready to review"), real `suggested_firsts`
  preference category, quiet hours + daily cap respected; never twice per suggestion. *(shipped, Sprint XY)*
- **Z1 suggested moments:** group same-day unattached photos (session gap + geo
  cluster) into "looks like one moment" Library banner; reversible grouping.
- **Z2 suggested cleanup:** per-device "tuck away" of near-repeats (never deletes,
  never touches the partner's view) — founder confirms semantics before build.
- **R photo-book spreads:** deferred with the book itself; W1/W2 keep the data
  flowing so it's cheap later.

---

## E. Non-issues (so nobody chases them)

- **Floating gray gear button in screenshots:** not app code. It's the `expo-dev-client`
  dev-menu bubble (dependency at `apps/mobile/package.json:53`); it does not appear in
  TestFlight/App Store builds. The in-app settings button is the header one only.
- **`/moment/[momentId]` route guard:** separately tracked P0 from the PRD review —
  `app/moment/[momentId].jsx` exports the screen bare; wrap in `ProtectedRoute` like
  `app/timeline.jsx` does. Do it immediately; it does not wait for a sprint.

---

## Suggested order of work

1. **Sprint 1 — "the app knows Reuben" (A1, A2, B2, B3, A4, B1, H1):** one migration for
   goal age windows + one FirstsScreen ranking function + digest cover fallback + plural
   fix + month-versary fallback + day-card consolidation + segment/content restructure.
   Small, mostly independent changes; together they remove every "the app doesn't know
   my baby" and every "this looks broken" moment in the screenshots.
2. **Sprint 2 — feel (G1, F1, F2, H2, H3 layers 1-3):** make cards pressable, cut
   duplicate CTAs, animate the segmented control, add press feedback and entrance
   motion. This sprint is what makes the app feel *finished* rather than functional.
3. **Sprint 3 — the vault fills itself (I1, I3 phase 1, I4, I7):** birthday-bootstrapped
   reference ("Is this Reuben?" replaces the face picker), foreground auto-ingest of
   new photos, iCloud-original handling, and the native quality score with an auto-save
   quality floor. This is the product's core promise — "we find the moments" — actually
   delivered without the parent operating machinery.
4. **Sprint 4 — assistant follow-through + curation (C1, C2, C3, A3, I2, I8):**
   post-save nudges, partner nudge, age-banded prompts, review-language cleanup, and
   burst/photo-shoot stacks in review + vault. Deepens the loop that already exists
   instead of adding a surface.
5. **Sprint 5 — hero moments + consistency (H3 layer 4, I3 phase 2, I5, I6, I9, A5-A7,
   B4-B7, C4-C5, D1-D6, F3, G2):** the three celebration animations, background ingest,
   Library reframing, cover-replacement policy, then the batchable small items.

Route guard fix (E, second bullet) doesn't wait for a sprint — do it immediately.

**Parallel workstream — Notifications (J1-J3):** infra + center UI that doesn't touch
the sprint surfaces; can run alongside Sprints 2-3 and should land before Sprint 4 so
C3's partner nudge, I3 phase 2's "new moments found," and M's "Tonight" have a
delivery channel.

**Feature tracks after the sprints (founder-confirmed, specs above):**
- **Track L — Letters v2:** small enough to slot into Sprint 4 (L1+L3 are S; L2 is the
  copy/UX pass F1 already touches).
- **Track M — "Tonight":** build after Sprint 3 (wants A4's buckets + J's delivery;
  ships v1 without I7).
- **Track N1 — Widget:** immediately after M ships (it's powered by M's selection
  engine); the StandBy demo is the launch-marketing asset.
- **Track K — Multi-child:** K1 schema design decision now (it shapes I1/I5/L1 and
  the widget's child picker); implementation after Sprint 5 or when a real
  second-baby family needs it, whichever comes first.
- **Folded into sprints:** N2 v1 (Live Photo verify) rides Sprint 3's pipeline work;
  N2 v2 (motion playback) rides Track M; N3 (accessibility) rides Sprint 5; N4's
  layout discipline applies to every sprint starting now, with the iPad/landscape
  audit as a track after Sprint 5.

Business-level context (pricing, Android strategy, compliance, metrics, print
revenue) lives in `docs/business-roadmap.md`.
