# Business Roadmap & Missing Features — Our Little World

July 5, 2026. Companion to `docs/polish-backlog.md` (engineering) — this doc covers
what to build and decide from a *business* standpoint. Facts below marked "verified"
were checked against the code, not assumed.

---

## 1. What the business already has (stronger than most seed-stage apps)

- **Mature billing:** App Store + Play verification, Stripe checkout, gift codes,
  partner-grant codes, entitlement ledger, storage-quota reserve/finalize accounting.
  Two plans (Family/Vault) with real quota differentiation.
- **A real cost model:** thumbnail-only list hydration, SQLite caching, poster-only
  video path, Cloudflare Stream for playable video. Per-family storage economics are
  measurable today via `family_storage_usage`.
- **A built-in growth loop nobody is pulling yet:** view-only circle invites
  (grandparents, aunts) + gift subscriptions (`gift_redemptions` exists). The
  grandparent-pays motion is the natural GTM for this category and the pieces are
  already live.

## 2. The long-custody promise IS the business model

**Direction change (founder, July 5):** the "sealed until eighteen" letters framing is
retired — letters become ongoing letters to your child that we keep, with optional
sealing and email delivery (full spec: backlog section L; `open_on NOT NULL` is the
one schema constraint to relax, and `mail.js` already makes send-by-email nearly
free). The *custody* commitment stays and still drives these decisions:

- **Pricing must carry long-horizon storage.** Model per-family lifetime storage cost
  (the quota ledger gives real numbers) before offering any "lifetime" plan. Be
  cautious with lifetime pricing in general — this is exactly the product where it
  goes wrong.
- **Define the lapsed-subscription policy NOW, in writing:** memories are never
  deleted for non-payment. Recommended: lapse → read-only vault (no new uploads,
  everything viewable and exportable). This is both the ethical position and the best
  win-back mechanic — the vault keeps growing in emotional value while lapsed.
  Tracked policy: `docs/export-lapsed-subscription-policy.md`.
- **Export as a trust feature, not a leak:** "your memories are always yours, export
  everything anytime" *reduces* purchase anxiety and increases conversion. The export
  builder already exists; guarantee its completeness (photos, videos, voice, letters,
  firsts, prompts, metadata) and say so on the purchase screen while disclosing
  current local preview limits.
- **Continuity:** what happens to the account if something happens to the parents is
  a real question for this product (the letters are FOR the child). A lightweight
  legacy-contact answer eventually belongs on the roadmap; acknowledging the question
  in the FAQ builds trust immediately.

## 3. Churn reality: baby apps age out

Category churn concentrates at months 18-36 as "baby" fades. Counters, in order of
leverage:

1. **Multi-child support (K1 below)** — second baby = re-activation, not churn.
2. **Age-band content** — the A1/A3 architecture (age-windowed goals, age-banded
   prompts) extends naturally to toddler and school-age bands. The vault doesn't end
   at age two; the content just has to keep up.
3. **Physical products (K5)** — the annual printed book is both revenue and an
   emotional re-commitment event.
4. **Hero rituals with long arcs** — letters, yearly "on this day," first-day-of-school
   firsts. The product's own mechanics fight age-out if fed content bands.
5. **"Tonight" (backlog section M)** — the founder-requested daily evening feed is the
   strongest daily-retention mechanic in the plan: a shared parents' ritual with a
   daily notification, built on the app's own curation instead of a social feed.

## 4. Missing key features, ranked

### K1. Multi-child support — CONFIRMED, spec'd · L
- **Founder-confirmed direction (July 5):** "+ New Baby" flow; a family with a
  three-year-old and a newborn must work naturally. Full executable spec now lives in
  **backlog section K** (children table + backfill, `child_id` FKs, FamilyContext
  shim over the 24 call sites, header child-switcher, per-child reference profiles).
- Pricing note: multi-child is the natural Family→Vault upsell lever; one plan covers
  all children (decided).

### K2. Notifications — engineering plan exists (backlog section J)
- Verified absent (no user push anywhere). Without it, digest, prompts, and partner
  rituals depend on the parent remembering the app exists. Highest-leverage retention
  system in the backlog. Run as the parallel workstream alongside Sprints 2-3.

### K3. Android is currently the app without the magic — decide, don't drift
- **Verified:** the native face matcher has an `ios/` implementation only
  (`modules/expo-face-matcher/` contains no `android/`). On Android the matcher falls
  back to uniform scores — no auto-discovery, no assistant. That's the core value prop.
- Decision to make explicitly: **iOS-first launch** (recommended — the category skews
  iOS and the differentiator works there) with Android when an ML Kit face pipeline
  can reach parity. What to avoid: silently shipping Android with the magic missing
  and earning 2-star reviews from the exact word-of-mouth audience (grandparents get
  circle invites on Android TODAY — make the circle view-only experience work
  everywhere even if capture stays iOS-first; see K4).

### K4. Web read-only viewer for the circle · M/L
- Grandparents without the right phone (or any smartphone) are the circle's biggest
  segment. A minimal web viewer (shared moments, digest, firsts timeline — view-only,
  magic-link auth) removes the platform barrier from the growth loop and is the
  natural landing surface for gift-subscription buyers.
- **Founder direction (July 5): this is also the path to desktop.** Desktop
  compatibility arrives via the web viewer grown up (circle view first, then parent
  read-write) — not macOS Catalyst. The mobile app's job meanwhile is layout
  discipline (backlog N4: `supportsTablet` is already true, so the iPad layout we
  ship gets owned, not ignored).

### K5. Printed photo book · M (integration) — new revenue line, timing decided
- **Founder decision (July 5):** yes to print (monthly or yearly cadence TBD), but
  only after the app is in a great spot — no build yet, keep the code ready.
- **Code-readiness verified:** the export builder (`archiveExport.js`) produces
  HTML → PDF via expo-print — a real starting point. **The catch: uploads are resized
  to 1800px JPEG (`moments.js:22` `FULL_MAX_DIM`).** At 300dpi print that's ~6 inches —
  fine for small/medium book layouts, below grade for full-page spreads.
- **Decision recorded so nothing forecloses it:** the print pipeline pulls
  *originals from the device at order time* (PHAsset originals are on the parent's
  phone/iCloud; no server storage cost, no pipeline change now). Implication for the
  backlog: I6's deleted-asset reconciliation matters more (a deleted original caps
  that photo at 1800px), and I8's keep-the-best curation directly feeds book quality.
  Optional future: Vault-tier original-resolution storage as a premium feature.

### K6. Pregnancy / "before they were born" mode · S/M
- `formatAge` already handles `beforeBirth`. A light pre-birth mode (bump photos,
  letters to the unborn child, due-date countdown) moves acquisition upstream to where
  the category's search volume actually is (expecting parents), and day-0 users arrive
  with the birthday already set.

### K7. Compliance & trust table stakes · M — required before scale
- **In-app account deletion** — App Store requirement (Guideline 5.1.1(v)).
  **Verified absent:** zero matches for account-deletion code anywhere in
  `apps/mobile/src`. Concrete task: a Settings → "Delete account" flow (export-first
  offer → confirm → edge function that deletes auth user + cascades family data when
  sole member, or removes membership when not) — the `families`/`members` cascade
  rules already exist in schema; the flow and function do not.
  Tracked implementation task: **K7/J3 Delete account flow**, specified in
  `docs/account-deletion-policy.md` with sole-writer, co-parent, circle-member, gift,
  billing, auth, storage/media, and legal-retention handling.
- Data-protection review for a child-data product (GDPR/COPPA posture, retention
  policy, processor list). The privacy-first architecture (on-device matching) is a
  marketing asset — get it documented and audited so it can be claimed loudly.
- App Store privacy nutrition labels accuracy pass.

### K8. Metrics & funnel instrumentation · M — before any paid acquisition
- **Foundation implemented July 11, 2026:** privacy allowlists, a consent-aware
  dedicated PostHog HTTP transport, initial mobile product events, and website
  acquisition/checkout events now exist. Production delivery remains gated on a
  dedicated Our Little World provider project, consent policy, and test-event
  readback. Minimum set still to complete: activation (reference confirmed + first
  scan + ≥5 saves in week 1), weekly ritual completion (prompt, digest open, review
  clear rate), W4/W12/W52 retention, circle invites sent/accepted, gift conversion,
  paywall view→trial→pay. The backlog's Sprint 1-3 changes all need these to prove
  themselves.

## 5. What NOT to build (protecting the focus)

Per the operating principle — few things exceptionally well:
- No social feed, no public profiles, no discovery. Private is the moat.
- No health/growth tracking (weight, feeding, sleep) — crowded category, different
  product, dilutes the vault promise.
- No generative-AI art or avatars. AI stays in service of *finding and organizing
  real memories* (the assistant), never fabricating them.

## 6. Sequencing recommendation

1. Now (parallel with backlog Sprints 1-3): K2 notifications, K7 compliance pass,
   K8 metrics.
2. Next quarter: K1 multi-child schema decision + migration plan, K4 web viewer,
   K6 pregnancy mode.
3. Revenue expansion: K5 printed book once I7/I8 curation ships.
4. K3 Android: explicit go/no-go with an ML Kit parity spike, not a drift decision.
