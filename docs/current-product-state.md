# Our Little World — Current Product State

Last updated: July 18, 2026

## Product Thesis

Our Little World is the private digital place where parents keep the life they are building with their baby: photos, videos, notes to each other, voice notes, Firsts, and letters to their child. The assistant may surface likely moments and helpful prompts, but parents remain the authority and no memory, date, milestone, relationship, feeling, or child intent may be fabricated. A printable or physical book is an optional future output, not the organizing center of the product.

## Current Product Loop

`Today` helps parents notice, capture, review, and approve worthwhile moments. When strong private candidates exist, `Tonight's memories` is the primary calm review ritual: three to seven photos or videos, with Keep, Skip, or an optional one-line note. `Add` starts with the parent's intention: photos or a moment, a note to each other, a voice note, or a letter to baby. `Our World` is the durable payoff through the shared timeline, media, Firsts, Letters, and related memory surfaces. Search and export are utilities inside that world.

## Current Architecture

- `apps/mobile/`: Expo/React Native application.
- `apps/web/`: Next.js marketing, purchase, gift, privacy, and support surfaces.
- `supabase/`: database migrations and Edge Functions.
- `workers/media-gateway/`: Cloudflare media gateway.

## Trust Contracts

- Suggestions use uncertainty and parent-approval language such as “likely,” “possible,” and “worth a look.”
- First scan is review-first; later clear matches may auto-save only after calibrated trust is earned.
- Never imply camera-roll originals are deleted.
- Do not claim corrections train the matcher unless scoring actually consumes that feedback.
- Discovery separates likely-child identity, age-diverse recognition references, and
  the parent-confirmed representative photo; neither recency nor array order may stand
  in for face quality or matching trust.
- Identity admission is consensus-first: one learned reference cannot surface an
  unrelated face, score boosts cannot turn a weak resemblance into a clear match,
  and only a photo the parent deliberately keeps may become a future reference.
  Uncertain candidates remain optional and are never part of the default daily save.
- Photo-heavy choices are best-photo-first: likely-child candidates are ranked on
  device, true lookalike bursts default to one clear frame, the other originals remain
  recoverable, and the native library picker is always available when a parent wants
  a different photo.
- Curation is day-first across the complete scan: one strongest eligible baby photo
  anchors each local calendar day, while every additional distinct standout and
  special video may remain. One per day is a floor, not a cap. A missing eligible
  photo stays an honest gap, first-year coverage uses inclusive local days, and the
  app does not claim a smile classification without a validated expression signal.
  The dedicated 365-day view virtualizes every elapsed first-year day and keeps gap
  days visible without loading thousands of media tiles at once.
- Videos are evaluated from multiple sampled frames, save as playable media by
  default, and fall back to a poster only when media policy prevents the playable
  upload. Multi-media moments are swipeable with native and full-screen playback.
- Photo-library authorization is per parent and per device. Each writer scans only
  the Photos library they authorize on their own phone; the shared family record is
  the union of saved contributions, never a wholesale mirror of either camera roll.
  Family-visible connection state contains aggregates only and excludes local asset
  identifiers, face data, fingerprints, candidates, and rejected photos.
- Unsaved discovery candidates now persist in a family-and-parent-scoped SQLite
  ledger on the device. Scan checkpoints and review progress are independent;
  rescanning cannot erase Keep or Skip decisions, and queue/session state survives
  termination. Candidate identity evidence, fingerprints, selection reasons, drafts,
  rejects, and unavailable items never cross into Supabase or analytics. Only Keep
  enters the existing shared moment/upload path.
- Timeline and search fold only uncaptioned same-time bursts, Places and weekly recaps
  lead with one representative per event, and parent-authored context remains visible.
- Moment views are recorded only on an explicit open and support honest Added by,
  Read/Seen by, reaction, and private reply state between family writers.
- Family authorization, analytics payloads, account deletion, export, lapsed-subscription access, and media privacy are release-critical behavior.
- Letters and long-term promises must be supported by export/ownership behavior; marketing cannot promise indefinite platform custody.

## Active Product Direction

- Center the experience on Today, Add, and Our World, with Firsts and Letters as durable parts of the family space.
- Make parent-to-parent notes, letters to baby, voice notes, photo review, and media browsing first-class jobs.
- Reduce parent work without taking authorship away from the family.
- Make empty states and early-life onboarding joyful and immediately understandable.
- Use predictive assistance to surface candidates, not manufacture memories.
- Remove repetitive photo sorting from moment, First, letter, and review flows while
  keeping every save or replacement under parent control.
- Build the first 365 days as an honest day-by-day family album: automatically choose
  the daily anchor, preserve distinct standouts and special videos, and show combined
  saved-day coverage from both parents.
- Pace historical catch-up through a deterministic Tonight queue that resumes until
  complete, never pads with weak media, and stays secondary to repair and trust-safety
  actions when those need attention.
- Let both parents independently contribute from their own phone without turning
  either person's private camera roll into shared family data.
- Let either parent restart only their device's photo-discovery profile without
  deleting the family's already-saved moments, notes, or shared media.
- Keep gift purchase, redemption, subscription, export, and deletion behavior consistent across mobile and web without allowing monetization or print output to dominate daily use.

## Verification Personas

Maintain deterministic fixtures for:

- new family with no imported media;
- first-scan family awaiting review;
- active family with approved memories, firsts, and letters;
- multi-caregiver family with authorization boundaries;
- power user with a large photo library;
- lapsed subscriber and export/deletion flows;
- light and dark appearance on supported phone sizes.

## Active Execution Sources

- `docs/private-family-world-prd.md`: primary product direction and delivery plan.
- `docs/assistant-curated-baby-book-prd.md`: completed historical transformation record; its trust and assistant-curation capabilities remain supporting infrastructure.
- `docs/sprint-progress.md`: durable execution state and verification record.
- `docs/polish-backlog.md`: scoped polish work where still active.
- `docs/architecture.md`: system design.
- Trust-specific policy documents govern deletion, export, lapse, analytics, and access behavior.
- `docs/business-roadmap.md` is strategic context, not an automatic implementation queue.

## Source-of-Truth Order

1. New explicit user direction.
2. Trust and privacy policy documents for their domains.
3. Active PRD and sprint progress.
4. `AGENTS.md` and architecture guidance.
5. This summary.
6. Historical chats and designs as reference only.
