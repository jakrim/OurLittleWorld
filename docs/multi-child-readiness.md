# Multi-Child Readiness

Status: readiness only. Full multi-child implementation remains backlog K1:
`children` table, backfill from `families.baby_name`/`families.baby_birthday`,
nullable `child_id` foreign keys, `FamilyContext` child switcher, and per-child
reference profiles.

## What I4 Changed

- `apps/mobile/src/childScopeModel.js` normalizes optional `childId`, recognizes
  current and future row shapes (`child_id`, `childId`, nested child, metadata), and
  filters child-owned rows while keeping legacy unscoped rows visible during the K1
  transition.
- PRD-era pure models now accept or preserve child scope where it affects boundaries:
  Add state, Book home and collections, moment connection routes, photo-ingestion
  trust state, auto-save correction targets, and private recap/share payload metadata.
- `bookHomeModel` and `bookCollectionsModel` can already exclude rows for another
  child when K1 backfills `child_id`, while unscoped rows still render so existing
  single-child families do not visibly change before migration.
- UI copy can remain one-child phrasing until the K1 header switcher lands; the
  model boundary is ready for `FamilyContext.activeChildId`.

## Future Migration Points

K1 should add `child_id` to:

- `moments`
- `firsts`
- `letters`
- `photo_tags`
- `memories`

Backfill all existing rows to each family's first child before enabling the new-baby
flow. Keep `families.baby_name` and `families.baby_birthday` as derived compatibility
fields until the client switcher has shipped everywhere.

Moment-scoped companion rows (`moment_media`, `voice_notes`, `moment_reactions`, and
`moment_tags`) can inherit child scope through `moments`. If any future query reads
those tables without joining `moments`, add direct `child_id` or route through a
child-scoped view.

## Surfaces That Stay Family-Level For V1

- `daily_prompt_responses`: one prompt per family unless product changes the K1 spec.
  If per-child prompt sections are introduced, add `child_id` and pass it through
  `buildPromptResponseSummary` and chapter context items.
- `weekly_digests`: one family digest with per-child sections. Current `shared_with`
  policy stays digest-level; a per-child digest payload should add `child_id` or a
  section-level child key before child-specific sharing copy ships.
- Billing and entitlements: one plan covers all children.
- Read-only circle access: keep selected-content RLS. When child-specific sharing is
  added, circle reads should remain limited to selected moments/media, selected
  firsts, and selected digest sections.

## Recognition And Events

- Reference profile storage keys should move to
  `olw:reference-set:v2:{familyId}:{userId}:{childId}` as planned in backlog K1.
- Recognition calibration, recent auto-save state, and negative examples should be
  keyed by `childId` once the storage shape exists. I4 already carries `childId` in
  the photo trust model and auto-save correction target/match payload.
- Analytics/notification payloads should include `child_id` only after J1 defines the
  non-content event contract. Do not include captions, prompt answers, generated
  summaries, or memory text in analytics.
