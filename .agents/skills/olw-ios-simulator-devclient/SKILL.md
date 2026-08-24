---
name: olw-ios-simulator-devclient
description: Build and run the Our Little World Expo dev client on an iOS simulator and execute the hosted synthetic QA real-write golden path end to end (bootstrap, seed, run, DB/storage verification, cleanup).
---

# iOS simulator dev client + hosted QA golden path

Complements `.agents/skills/olw-hosted-e2e/SKILL.md` (safety/proof rules) with the concrete
mechanics that keep breaking on fresh/reset boxes.

## Dev client build (fresh clone or wiped box)

1. `pnpm install` at the repo root (node via Homebrew; `nvm` may be absent).
2. `apps/mobile/ios` is gitignored → `cd apps/mobile && npx expo prebuild --platform ios`.
3. Known blocker: generated `apps/mobile/ios/Pods/openiap/packages/apple/Sources/Helpers/StoreKitTypesBridge.swift`
   may not compile against the installed Xcode (`'PricingTerms' is not a member type of
   StoreKit.Product.SubscriptionInfo`). Workaround in generated output only:
   `sed -i '' 's/#if compiler(>=6.3)/#if compiler(>=99.0)/g' <that file>`. Never commit it.
4. Build to a workspace-persistent derived-data path (`~/Library` caches get wiped):
   `xcodebuild -workspace ios/OurLittleWorld.xcworkspace -scheme OurLittleWorld -configuration Debug \
    -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' \
    -derivedDataPath /Volumes/devbox/workspace/olw-derived build`
5. Verify the build number you are claiming: `plutil -p <derived>/Build/Products/Debug-iphonesimulator/OurLittleWorld.app/Info.plist | grep CFBundleVersion`.
6. `xcrun simctl boot <iPhone 17 udid>; open -a Simulator; xcrun simctl install booted <app>`.
7. Metro: `npx expo start --port 8092 --dev-client`; point the client at it with
   `xcrun simctl openurl booted "ourlittleworld://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8092"`.
   Dismiss the iOS "local network" prompt and the dev-menu sheet before screenshotting.
8. Synthetic Photos fixtures: generate a PPM in node, `sips -s format jpeg`, then
   `xcrun simctl addmedia booted <files>`. Never add real family media.

## Hosted QA golden path

- Env lives outside the repo (e.g. `/Volumes/devbox/workspace/olw-test/hosted-qa.env`);
  `set -a; . <file>; set +a`. Only the `EXPO_PUBLIC_*` subset may go into `apps/mobile/.env`
  (`grep '^EXPO_PUBLIC_' <file> > apps/mobile/.env`) — service-role key and DB URLs never do.
  Delete `apps/mobile/.env` when done; never commit either file.
- `pnpm qa:hosted:bootstrap` needs `node`, `psql` and the Supabase CLI. The CLI may be missing
  on a reset box: `npm i -g supabase`. Expected receipt: `QA_SCHEMA_READY` (93 migrations,
  max version `20260821120000`).
- `pnpm qa:hosted:seed` creates/reset the synthetic account, fixture family and the one-time
  entitlement code. **The entitlement is single-use**: a second harness run fails with
  "This gift code has already been used or expired" — re-run the seed before every run.
- `EXPO_PUBLIC_OLW_QA_AUTORUN_REAL_WRITE=1` makes `app/index.jsx` render
  `RealAutoSaveWriteSmokeScreen` on launch (autorun); set it to `0` and restart Metro to reach
  the normal parent journey. The harness session persists, so the app then opens signed in.
- The direct DB host `db.<ref>.supabase.co` is usually **not resolvable** from this box (IPv6);
  use the session-pooler URL (`OLW_QA_DATABASE_URL`) for all `psql` work.

## Getting independent DB evidence

The harness deletes its own row through the correction path, so a 3s polling loop usually
misses it. Instead run a single `psql` `DO $$ ... $$` block that loops with
`pg_sleep(0.25)` and `raise notice`s the first row it sees (media/tag `upload_status`,
UUID-shape of `local_identifier`, `jsonb_object_keys(metadata)`, storage object count), start it
just before tapping Run, then re-query after the run to prove cleanup (expect 0/0/0).

Expected live-row metadata key set for an image Keep: `source, fullPath, thumbPath,
captureQuality` — and none of `localAssetId, pickerAssetId, recognitionCandidateId,
recognitionScore, recognitionFrameTimeMs, faceCount, visualFingerprint, identityEvidence`.

## Historical cleanup migration

Being recorded as applied proves nothing. Test it adversarially inside a transaction:
insert a synthetic legacy `moment_media` row with `recognitionFrameTimeMs` + `posterError`,
replay the `update` statement from
`supabase/migrations/20260821120000_strip_private_shared_media_metadata.sql`, assert the keys
disappear while `source`/`fullPath` survive, then `rollback`.
Schema gotchas: `moments(family_id, author_user_id, captured_at)`, `moment_media` uses
`media_type` + uuid `full_object`, `families.created_by` (no `owner_user_id`).

## Untestable on a simulator (report as gates, not passes)

Native `ExpoFaceMatcherModule` upright-orientation fix (needs EXIF-rotated device assets and a
reference face profile), the video/Stream Keep poster path, StoreKit purchases. Parent-facing
"Find memories" discovery yields no candidates without a baby face profile.

## Devin Secrets Needed

`OLW_QA_PROJECT_REF`, `OLW_QA_DATABASE_URL`, `OLW_QA_SUPABASE_URL`, `OLW_QA_SERVICE_ROLE_KEY`,
`OLW_QA_PURCHASE_CODE`, `OLW_QA_USER_EMAIL`, `OLW_QA_USER_PASSWORD`, plus
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_MEDIA_GATEWAY_URL`.
Never point at the production ref `baxgullapuksjbzkogii`.
