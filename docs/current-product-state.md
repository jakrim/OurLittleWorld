# Our Little World — Current Product State

Last updated: July 11, 2026

## Product Thesis

Our Little World is a private, parent-approved baby book that helps families turn everyday photos, videos, notes, firsts, and letters into a durable family story with less work. The assistant may surface likely moments and helpful prompts, but parents remain the authority and no memory, date, milestone, relationship, feeling, or child intent may be fabricated.

## Current Product Loop

`Today` helps parents notice, capture, review, and approve worthwhile moments. `Add` supports intentional creation. `Book` is the durable payoff through Firsts, Letters, Library, timeline, and related memory surfaces. The experience should make these connections obvious rather than presenting a collection of unrelated features.

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
- Family authorization, analytics payloads, account deletion, export, lapsed-subscription access, and media privacy are release-critical behavior.
- Letters and long-term promises must be supported by export/ownership behavior; marketing cannot promise indefinite platform custody.

## Active Product Direction

- Center the experience on Today, Add, and Book while keeping Firsts and Letters reachable.
- Reduce parent work without taking authorship away from the family.
- Make empty states and early-life onboarding joyful and immediately understandable.
- Use predictive assistance to surface candidates, not manufacture memories.
- Keep gift purchase, redemption, subscription, export, and deletion behavior consistent across mobile and web.

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

- `docs/assistant-curated-baby-book-prd.md`: primary product transformation PRD.
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
