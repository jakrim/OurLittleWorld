# Our Little World product contract

This document contains product and privacy truths that should survive releases.
It intentionally excludes dependency versions, route and migration inventories,
build state, branches, provider status, and recent implementation narration.

## Purpose and primary loop

Our Little World is the private digital place where parents keep the life they
are building with their baby: photos, videos, words to each other, voice notes,
Firsts, and letters to their child. A printable book may be an output; it is not
the organizing center of the daily product.

- **Today** opens photo-first, helping parents notice what matters and leading to a
  calm **Tonight** review only when strong private candidates exist.
- **Tonight** is the short parent-led review: Keep, Skip, or Another decides what
  enters the family record; no queue is padded to create a ritual.
- **Our World** is the durable shared payoff: timeline, media, collections,
  Firsts, Letters, and family archive utilities.

**Add** is a compact escape hatch, not a competing daily loop. It begins with the
parent's intention—media/moment, note, voice, or letter.

Do not create a second owner for these jobs. Search, places, export, and printing
are utilities inside the family world, not competing daily loops.

## Parent authority

- Never fabricate memories, dates, milestones, family relationships, feelings,
  developmental history, child identity, or child intent.
- Suggestions use uncertainty and approval language. A suggestion is not a saved
  memory, a confirmed First, or a fact.
- Assistance can reduce sorting work but cannot take authorship or final approval
  away from a parent.
- A gap remains an honest gap. Never pad a review, collection, day, or book with
  weak or invented material.
- Letters and custody promises must be supported by export/ownership behavior;
  marketing cannot promise indefinite platform custody.

## Private before Keep

Unsaved discovery candidates, local asset identifiers, face/identity evidence,
fingerprints, selection rationale, drafts, rejects, unavailable items, private
queue/session state, and local voice paths stay on the authorized parent's device.
They must not enter shared storage, analytics, error telemetry, notifications, or
another caregiver's device. Only an explicit Keep enters the canonical shared
moment/upload path.

Photo-library authorization is per parent and per device. The family archive is
the union of deliberately kept contributions, never a mirror of a camera roll.
Family-visible connection state contains only safe aggregates.

## Identity, review, and persistence

- Identity matching is consensus-first. One reference or a score boost cannot
  turn a weak resemblance into a clear match.
- Only parent-kept material may improve future references. Uncertain candidates
  remain optional and outside default saves.
- Review and scan progress are independent and survive termination. Rescanning
  cannot erase Keep/Skip decisions.
- Shared writes use opaque identifiers and idempotent canonical IDs. A partial
  Keep resumes the same transaction; it does not unlock Skip or create a
  replacement memory.
- Videos remain playable media when policy allows; poster-only fallback is
  explicit. Parents may always choose a different item through the native picker.

## Family access and lifecycle

- Server-side authorization, not hidden UI, enforces family membership, role,
  writer entitlement, Circle/read-only scope, and lapsed access.
- Lapsed families receive the policy-defined read experience but cannot bypass
  write gates through storage, Edge Functions, direct API calls, or retries.
- Deleting an author account must not cascade away co-owned family history.
- Export and deletion cover the real schema and media graph, retain required
  audit/legal boundaries, and never expose another family's data.
- Separately authored text, voice, reactions, and replies keep their ownership;
  one caregiver cannot overwrite another's contribution.

## Data minimization and derived context

Analytics is consent-gated and content-free. Use only allowlisted fixed enums and
coarse buckets. Do not send authored text, media, IDs, paths, exact dates,
birthdays, locations, confidence values, face evidence, or private queue state.

Collections and contextual copy derive only from parent-kept records and explicit
facts such as stored dates, parent-entered places, confirmed Firsts, media type,
and attribution. Each derivation must be reversible and source-linked. Changing
or deleting a source invalidates dependent context rather than leaving stale
prose. Exact media digests and recognition evidence remain private.

## Source-of-truth routing

| Question | Authoritative source |
| --- | --- |
| Dependencies and framework behavior | package manifests, lockfile, diagnostics |
| Navigation, feature behavior, analytics | current source plus exercised flow |
| Data/RLS/migration order | current schema, migrations, and local reset tests |
| Architecture and privacy boundary | `docs/architecture.md` plus focused policy documents |
| Intended work and temporary status | active PRD and `docs/sprint-progress.md` |
| Build/release/provider state | app/build config, Git, provider CLI/API, generated receipt |

Update this contract only when a durable product or trust rule changes. Record
temporary release state and evidence in an active PRD or generated report.
