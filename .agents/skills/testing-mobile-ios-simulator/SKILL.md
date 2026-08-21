---
name: testing-mobile-ios-simulator
description: How to get the OurLittleWorld Expo app running on an iOS simulator and exercise auth-gated screens (Firsts compose, Add, Today) when no Supabase backend is available.
---

# Testing apps/mobile on the iOS simulator

## Build the dev client (Expo Go will not work)

The app depends on native modules (`ExpoFaceMatcher`, expo-dev-client), so a dev-client
build is required.

```bash
pnpm install
cd apps/mobile
npx expo prebuild --platform ios   # if ios/ is missing
# Build to a derived-data path INSIDE the persistent workspace: ~/Library caches
# (DerivedData, and even the Homebrew prefix) can be wiped mid-session on these boxes,
# which silently destroys an hour-long build.
xcodebuild -workspace ios/OurLittleWorld.xcworkspace -scheme OurLittleWorld \
  -configuration Debug -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath /Volumes/devbox/workspace/olw-derived build
xcrun simctl boot "iPhone 17"; open -a Simulator
xcrun simctl install booted /Volumes/devbox/workspace/olw-derived/Build/Products/Debug-iphonesimulator/OurLittleWorld.app
```

Known build blocker: with recent Xcode, `Pods/openiap/.../StoreKitTypesBridge.swift` fails
(`'PricingTerms' is not a member type of struct 'StoreKit.Product.SubscriptionInfo'`) because
the code is guarded by `#if compiler(>=6.3)` but the SDK lacks the API. Workaround (generated
output only, never commit): `chmod +w` the file and change the guards to `#if compiler(>=99.0)`.
Verify the shipped build number with
`plutil -p .../OurLittleWorld.app/Info.plist | grep CFBundleVersion`.

## Point the dev client at Metro

`pnpm dev:mobile` serves Metro on 8092 and requires `apps/mobile/.env` (copy `.env.example`).
Typing a URL into the dev-launcher via computer-use keyboard is unreliable (`:` and `/` get
mangled). Deep-link instead:

```bash
xcrun simctl openurl booted "ourlittleworld://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8092"
```

## Reaching auth-gated screens with no backend

A local Supabase stack may be impossible on boxes without hardware virtualization
(`sysctl kern.hv_support` = 0): colima+QEMU/TCG image pulls can run for hours. Plan for a
backend-free lane:

- `ProtectedRoute` (`src/navigation/RouteGuards.js`) renders children when `params.qa` is a
  synthetic manual-QA fixture and the manual-QA runtime is on (dev build, or
  `EXPO_PUBLIC_OLW_MANUAL_QA=true` in `apps/mobile/.env`). Fixture names live in
  `src/manualQaRuntime.js` (`photo-first`, `empty`, `large-no-firsts`,
  `connected-first-letter`, `collections`).
- Works: `xcrun simctl openurl booted "ourlittleworld://first-compose?qa=photo-first"`.
- Does NOT work: `ourlittleworld://today?qa=photo-first` still redirects to `/welcome`, so the
  authenticated Today/timeline browse needs a real session.
- Screens that read `FamilyContext` (baby name/birthday) or `photoSync` shared-photo rows show
  nothing offline. A temporary env-gated fixture (`EXPO_PUBLIC_OLW_TEST_FIXTURE=1`) injected
  into `src/FamilyContext.js` and `src/photoSync.js` is an effective harness — keep it out of
  the file under test, and `git checkout --` both files plus `rm apps/mobile/.env` afterwards.

## Differential (adversarial) UI checks

To prove a copy/behavior fix is real, swap only the changed screen for its pre-fix version and
let Metro fast-refresh:
`git show <fix-commit>~1:apps/mobile/src/<Screen>.js > /tmp/base.js && cp /tmp/base.js apps/mobile/src/<Screen>.js`,
re-run the same taps, then restore. Fast refresh resets screen state, so re-do the selection taps.

## What still cannot be tested without a backend

Real photo/video Keep + manual Add uploads, `moment_media.metadata` row inspection, and the
native `ExpoFaceMatcherModule` orientation path (needs EXIF-rotated library assets plus a
reference face profile). Cover the metadata allowlist / `classifyPosterErrorCode` behavior with
a `node --input-type=module` harness importing `src/mediaUploadMetadataModel.js` directly, and
report the DB assertions as untested.

## Devin Secrets Needed

None for the backend-free lane. A full end-to-end run would need a disposable local Supabase
stack (`supabase start` + `pnpm db:reset:migrations`), `EXPO_PUBLIC_OLW_DEV_LOGIN_EMAIL`, and
`OLW_SMOKE_DEV_CODE` for `pnpm smoke:mobile` (Maestro). Never use production Supabase creds.
