# PRD: The Private Family World

Date: July 16, 2026
Status: Active product direction
Primary app: `apps/mobile`

## Product Decision

Our Little World is the private digital place where parents keep the life they are
building with their baby. It is not primarily a book builder. A printable or physical
book may eventually be produced from the family record, but that is an optional output,
not the navigation model, daily habit, or measure of whether a memory matters.

The product succeeds when a parent can quickly add something meaningful, their
co-parent can find and respond to the family's shared life, and both parents can return
months or years later to see the details, photos, voices, and letters they chose to keep.

## Parent Jobs

Parents need one private space where they can:

- save and review photos and videos without turning every item into a designed page;
- write notes to each other about their baby and shared life;
- write open or future-dated letters to their baby;
- record voice notes and preserve the original audio;
- record Firsts and everyday moments with dates and context;
- browse, search, and revisit the record as a timeline, by month, or through durable
  collections;
- approve assistant-found photos and suggestions before they become family history.

No feature may fabricate a memory, date, relationship, feeling, milestone, or child
intent. Parents remain the authors and final authority.

## Navigation Contract

The primary memory loop is:

1. **Today** — a photo-first view of what needs light attention now. When strong
   local candidates exist, it leads to Tonight; otherwise it remains honest about the
   available next step.
2. **Tonight** — a short parent-led review of up to seven strong candidates. Keep,
   Skip, and Another are explicit decisions; weak candidates never pad the queue.
3. **Our World** — the durable family space: timeline, photos, notes, voices, Firsts,
   and Letters. Search and export are utilities inside this space.

**Add** remains a compact escape hatch, not a competing daily loop. Its intention
chooser opens photos or a moment, a note to each other, a voice note, or a letter to
baby. Firsts and photo review remain immediately reachable.

The word `Book` must not be used as a top-level destination or as the default promise
for saving an item. Existing internal `book*` models and analytics names may remain for
compatibility until a deliberate migration; they do not define the parent-facing
information architecture.

## Core Flows

### Add to your world

Opening Add first asks what the parent wants to keep. Each intention then shows only
the fields needed for that job:

- a moment supports media, optional voice, text, date, place, and tags;
- a note to each other is a fast, text-first shared entry and sends a content-free
  co-parent activity notification;
- a voice note opens directly into recording with optional context;
- a letter opens the richer letter studio with text, media, voice, and optional future
  opening date.

Partner notes are stored as durable text moments in the shared family timeline in the
first release. This reuses the existing writer-only family authorization boundary and
does not invent a parallel source of truth.

### Return to your world

Our World leads with the family record, not readiness for printing. It must make notes,
voices, Firsts, Letters, recent media, timeline, and month browsing easy to recognize.
Photo review, search, places, and exports are secondary utilities. The empty state
invites a meaningful first contribution rather than promising a finished book.

Saved-photo presentation is event-first. Timeline and search fold an uncaptioned
three-second burst around its clearest representative while preserving an explicit
way to reveal the other saved frames. Places show one representative per saved event,
and weekly recaps show at most one representative per moment. Parent-authored context,
voices, and distinct events must never disappear into a visual stack.

### Two-parent photo libraries

There is no single designated family camera roll and no wholesale camera-roll sync.
Each parent independently chooses Photos access on their own phone, builds their own
on-device child reference profile, and scans only that authorized library. One parent
cannot grant access to, inspect, retry, or revoke the other parent's library.

The shared cloud family record is the union of memories each parent explicitly saves,
plus clear matches saved under that same parent's separately earned and enabled
auto-save setting. The app may show family writers aggregate connection health—such
as not connected, scanning, ready, or needs permission—but never shares local asset
identifiers, face data, visual fingerprints, rejected candidates, or camera-roll rows.
If both parents possess the same burst, each device curates before upload and the
family presentation folds any remaining same-time duplicates without deleting either
parent's saved original.

### A day-by-day childhood, curated for the parents

The assistant organizes likely-child media by the baby's local calendar day. For each
eligible day it keeps one strongest photo as the daily anchor, even when that photo is
less polished than neighboring days. A day is eligible only when the authorized
library contains a photo that meets the likely-child identity boundary; the app must
not fabricate a photo, imply one was taken, or turn an honest gap into parent guilt.

One photo per day is a floor, not a ceiling. After suppressing true visual lookalikes,
the app also keeps every distinct standout from that day. There is no arbitrary daily
photo cap: separate smiles, expressions, people, places, and events must be allowed to
remain separate memories. A calibrated on-device expression signal may strengthen
this selection, but the product must not label a baby as smiling until that detector
has been validated. Measured quality, identity confidence, distinctness, and parent
picks provide the current safe selection evidence.

Videos are sampled across their duration rather than judged from one poster frame.
A video may be selected when the child is present across enough sampled frames or a
strong clear match makes it a worthwhile moment. Selected videos save as playable
media by default; poster-only storage is a disclosed quota fallback, not the default
experience. A saved moment containing several photos or videos must be horizontally
swipeable, show position within the set, and retain native playback controls and
full-screen video.

For a child born July 23, 2025, July 16, 2026 is inclusive day 359 of the first year.
Our World shows honest first-year photo-day coverage toward 365 and a recent day rail.
Opening the day-by-day album shows every elapsed first-year day in a virtualized list,
including neutral gap rows, and places all saved standouts and videos beside that
day's anchor.
Both parents' separately authorized contributions count toward the same canonical
family coverage; neither parent receives access to the other's unsaved camera roll.

### Printing and export

Export exists for ownership and portability. Any photo-book preview is an experimental
secondary utility with disclosed limits. Physical printing cadence, layout, purchasing,
and fulfillment are not planned product commitments and must not shape daily capture.

## Delivery Plan

### Phase 1 — Restore the product center (implemented July 15, 2026)

- Rename the third tab and related screens from Book to Our World.
- Replace the generic Add composer with the four-intention chooser.
- Add a fast parent-to-parent note flow and privacy-safe notification.
- Give voice notes a direct entry path.
- Make moments, media, voices, Firsts, and Letters the first Our World viewport.
- Demote print/export tooling and remove book-centric copy from routine flows,
  onboarding, deletion warnings, photo review, recaps, and reminders.
- Add model tests for intent routing and preserve existing trust checks.
- Put clear, distinct likely-child photos ahead of the full camera roll in moment,
  First, and letter capture. Collapse a true burst to one best frame by default,
  retain the other originals for recovery, and keep the native picker one tap away.

### Phase 2 — Make the shared space feel alive (in progress)

- Show who added a moment, explicit moment-open/read state, and lightweight reactions
  while retaining the canonical timeline entry and content-free push payloads.
- Continue the existing full-photo focus into a swipeable media viewer with date
  grouping and a clear route back to its moment.
- Continue surfacing review queues and newly added photos inside Our World without
  overwhelming Today.
- Extend the existing media/First filters with notes, letters, people, place, and date.
- Fold lookalike bursts throughout timeline and search, make Places event-first, keep
  one representative per weekly-recap event, and put a relevant saved photo beside
  prompt writing starters.
- Retry interrupted uploads quietly and expose one parent-safe repair action only when
  automatic recovery still leaves work behind.
- Show each parent's independent photo-library connection without exposing either
  camera roll to the other parent.
- Curate at the end of the complete scan so one best eligible photo anchors each local
  day, distinct standouts and special videos survive, and an early weak frame cannot
  win merely because it was scanned first.
- Show first-year photo-day coverage and recent day representatives in Our World.
- Make multi-media moments swipeable and make full playable video the normal save and
  watching path, with poster-only fallback only when media policy requires it.

### Phase 3 — Deepen durable family expression

- Harden voice playback, upload recovery, accessibility, and optional on-device
  transcription.
- Improve letter discovery and revisiting without weakening sealed-letter privacy.
- Add co-parent presence and activity states that reveal no private content in push
  payloads.
- Validate empty, new, active, multi-caregiver, large-library, lapsed, light, and dark
  personas with deterministic fixtures.

### Deferred

- Physical-book layout, printing cadence, checkout, and fulfillment.
- A wholesale rename of internal `book*` models or historical analytics events.
- Public family feeds or social sharing. The product remains private by default.

## Acceptance Criteria

- A new parent can explain the photo-first Today → Tonight → Our World loop without
  seeing the word Book in top-level navigation; Add is visibly a compact escape hatch.
- Add exposes photos/moment, parent note, voice note, and letter in one tap.
- Text-only parent notes save without media and appear in the shared timeline.
- Voice notes can stand alone and remain playable through the saved moment.
- Firsts and Letters remain durable, easy-to-find collections.
- Routine save, review, delete, and recap copy describes a family world or record, not
  book production.
- Export/print controls are visibly secondary and disclose that physical printing is a
  future extra.
- Mobile tests, lint, and a signed-in simulator navigation smoke pass before release.
- Each writer can connect and scan only their own device library; both writers can see
  the resulting saved family record and aggregate connection state.
- Timeline, search, Places, recaps, and prompts prefer distinct event representatives
  without deleting saved originals or hiding parent-authored context.
- Every eligible day has a default daily photo anchor; days without an eligible baby
  photo remain honest gaps.
- A daily anchor does not suppress additional distinct standout photos or special
  videos from the same day, and no arbitrary daily count cap discards them.
- Video selection uses evidence from multiple sampled frames, and saved multi-media
  moments support swipe navigation, native controls, and full-screen playback.
- First-year progress uses inclusive local calendar days and combines only saved
  contributions from both independently authorized parent libraries.
