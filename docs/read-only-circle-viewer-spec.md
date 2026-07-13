# Read-Only Circle Viewer Spec

## Product Goal

Give grandparents and other trusted family-circle members a private, low-friction way
to see selected baby-book value without giving them writer access, the full app, or a
social feed. The first implementation should be web-first, matching the K4 roadmap:
magic-link or authenticated web access before any desktop parent workflow.

## Audience And Entry Points

- **Circle viewer:** a grandparent, aunt, uncle, or close family member invited with
  `family_members.role = 'circle'`. They can read selected content only.
- **Parent/writer:** a `creator` or `partner`. They choose what reaches the circle and
  keep full approval control.
- **Gift buyer:** a grandparent or family friend who may start from a private recap,
  a circle invite, or a web gift page and buy "the baby book they do not have time to
  make" for the family.

Entry points:

- Private digest/book-preview native share from the app.
- Family-circle invite flow, upgraded later to a web magic-link viewer.
- Web gift landing page that can explain the viewer before checkout.

## Viewer Scope

The viewer is read-only and should show:

- **Shared weekly digest:** only `weekly_digests` rows explicitly marked
  `shared_with: ["circle"]`.
- **Selected moments:** only `moments` rows explicitly marked
  `shared_with: ["circle"]`, plus their media, tags, reactions, and voice notes.
- **Firsts:** firsts explicitly marked `shared_with: ["circle"]`, or firsts linked to
  a moment already shared with the circle.
- **Gift upgrade path:** a quiet CTA such as "Gift a year of the baby book" that opens
  the web gift purchase flow. It must not expose billing settings, family entitlement
  internals, or writer controls.

The viewer must not show:

- Letters.
- Prompt answers outside a selected shared digest snapshot.
- Unshared camera-roll tags, unshared memory notes, or all uploaded family media.
- Add/edit/delete controls, invite management, account deletion, export controls, or
  billing owner settings.

## Backend Access Contract

The circle role is a read-only family role, not a reduced writer role.

- Writers (`creator`, `partner`) can read and write the normal family archive.
- Circle members can read only selected/shared content.
- Content selection is enforced by RLS, not by client filtering.
- Bucket access must match content RLS: circle members can sign only media under a
  shared moment path.
- A future public-link version must use opaque, revocable, server-issued tokens scoped
  to a selected recap or snapshot. It must not grant app-wide, writer, or archive-wide
  permissions.

Current policy primitives:

- `is_family_writer(family_id)` gates writer-only rows and mutations.
- `is_family_circle_member(family_id)` identifies read-only circle members.
- `is_shared_with_circle(shared_with)` treats `["circle"]` as the explicit selection
  marker.
- `is_moment_shared_with_circle(family_id, moment_id)` lets media, tags, reactions,
  voice notes, and linked firsts inherit visibility from a selected moment.

## Parent-Facing Copy Rule

Parent UI may say a moment or first is "shared with circle" only when the backend
policy already enforces circle-scoped reads for that content type. New digest/first
circle-sharing controls should not ship until they write the corresponding
`shared_with` marker and have RLS tests.

Allowed tone:

- "Shared with family circle"
- "View-only family can see this saved moment"
- "Only selected moments and recaps are visible"

Avoid:

- "Everyone can see the baby book"
- "Public recap link"
- "Family feed"
- Any copy implying circle members can browse the full archive.

## Web-First UX Shape

Initial web viewer:

1. Landing state validates magic-link/auth token and family membership.
2. Digest tab shows the newest shared digest first.
3. Moments tab shows selected shared moments in reverse chronological order.
4. Firsts tab shows selected firsts and firsts linked to shared moments.
5. Gift CTA opens checkout or gift-code purchase without requiring app install.

All screens should use family-safe language and preserve parent approval: shared
content is selected by a parent/writer, never auto-published from camera-roll scans.

## Acceptance Tests

Database coverage lives in `supabase/tests/read_only_circle_rls_test.sql`:

- Circle sees only selected moments and moment media.
- Circle sees only selected/shared digests.
- Circle sees selected firsts and firsts linked to shared moments.
- Circle cannot read letters, prompt answers, or unshared memory notes.
- Circle cannot insert moments or firsts.
- Writers still read the full family archive.
