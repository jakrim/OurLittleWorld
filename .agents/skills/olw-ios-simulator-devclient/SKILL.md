---
name: olw-ios-simulator-devclient
description: Build and drive the Our Little World Expo dev client on an iOS simulator on the outpost Mac, including the known openiap/Pods compile workaround, and run the backend-free evidence lanes (grounded First copy, supabaseQaGuard refusal) when hosted or local Supabase credentials are unavailable. Complements olw-hosted-e2e, which covers the hosted synthetic QA golden path.
---

# iOS simulator dev-client testing (Our Little World)

Use `olw-hosted-e2e` when hosted QA credentials exist. Use this skill for the build
mechanics and for the lanes that still produce real runtime evidence with no backend.

## Build the dev client

`apps/mobile/ios` is generated and gitignored, so a fresh clone needs a prebuild:

```bash
cd apps/mobile
npx expo prebuild --platform ios          # ~5-10 min, installs Pods
xcodebuild -workspace ios/OurLittleWorld.xcworkspace -scheme OurLittleWorld \
  -configuration Debug -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath /Volumes/devbox/workspace/olw-derived build
```

Always pass an explicit `-derivedDataPath` inside the workspace: `~/Library/Developer/Xcode`
has been wiped mid-session on this box more than once.

**Known blocker (generated Pods, not app code):** `openiap`'s
`Pods/openiap/packages/apple/Sources/Helpers/StoreKitTypesBridge.swift` fails with
`'PricingTerms'/'BillingPlanType' is not a member type of struct 'StoreKit.Product.SubscriptionInfo'`
against Xcode 26.x. Workaround (generated output only — never commit, re-apply after any
prebuild/pod install):

```bash
sed -i '' 's/#if compiler(>=6.3)/#if compiler(>=99.0)/g' \
  apps/mobile/ios/Pods/openiap/packages/apple/Sources/Helpers/StoreKitTypesBridge.swift
```

If this ever stops working, the alternative is pinning/upgrading the `expo-iap`/openiap pod.

## Run it

```bash
xcrun simctl boot <iPhone 17 udid>; open -a Simulator
xcrun simctl install booted /Volumes/devbox/workspace/olw-derived/Build/Products/Debug-iphonesimulator/OurLittleWorld.app
cd apps/mobile && npx expo start --port 8092 --dev-client   # needs apps/mobile/.env
xcrun simctl launch booted com.jessekrim.ourlittleworld
xcrun simctl openurl booted "ourlittleworld://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8092"
```

Accept the "Allow local network" prompt. `EXPO_PUBLIC_*` values are inlined at bundle time, so
changing them requires restarting Metro and re-opening the dev-client URL — batch tests by env.
Build number is not surfaced in the UI; verify it with
`plutil -p <built .app>/Info.plist | grep CFBundleVersion`.

## Backend-free evidence lanes

- **Dev QA route bypass:** `ProtectedRoute` returns children when `params.qa` is a synthetic
  fixture name (`src/manualQaRuntime.js`), so
  `ourlittleworld://first-compose?qa=photo-first` renders the compose sheet signed out.
  `today?qa=...` is not in that set and still redirects to the auth wall.
- **Rendering compose content offline:** the screen needs a family and one shared photo. Add
  temporary env-gated (`EXPO_PUBLIC_OLW_TEST_FIXTURE=1`) early returns in
  `FamilyContext.FamilyProvider` (fixture family with `babyBirthday`) and
  `photoSync.listSharedTagged` / `listSharedTaggedChronological` (one row with
  `asset_id`, `asset_owner_user_id`, `creation_time`). Never touch the screen under test;
  revert with `git checkout --` afterwards.
- **Trust/copy changes deserve a differential control:** swap in the pre-fix files
  (`git show <fix-commit>~1:<path> > <path>`), repeat the identical taps, show the old string
  reappears, then restore. A single "the bad string is absent" screenshot is weak evidence.
- **supabaseQaGuard is testable without a backend:** point `EXPO_PUBLIC_SUPABASE_URL` at a
  synthetic `https://<fake-ref>.supabase.co` and deep-link
  `ourlittleworld://real-auto-save-write-smoke`. With `EXPO_PUBLIC_OLW_QA_PROJECT_REF` unset or
  mismatched the screen refuses ("not an approved QA target") before any auth/write; with it
  matching, the flow proceeds and fails at sign-in (DNS). That proves the guard is target-based.
  Never use the production ref (`baxgullapuksjbzkogii`) in either direction.
- Metadata/copy models (`mediaUploadMetadataModel.js`, `captionTemplateModel.js`,
  `visionSceneLabeler.js`) import no React Native and can be imported directly by a node
  harness — good for asserting allowlist behavior and pre/post-fix diffs deterministically.
  This is module-level proof only; DB row contents still require a backend.

## Devin Secrets Needed

- Hosted QA lane (see `docs/hosted-qa-runbook.md`): `OLW_QA_PROJECT_REF`,
  `OLW_QA_DATABASE_URL`, `OLW_QA_SUPABASE_URL`, `OLW_QA_SERVICE_ROLE_KEY`,
  `OLW_QA_PURCHASE_CODE`, `OLW_QA_USER_EMAIL`, `OLW_QA_USER_PASSWORD`, plus
  `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` and
  `EXPO_PUBLIC_MEDIA_GATEWAY_URL` for the QA Worker. Without these, hosted auth, real Keep
  writes, storage, DB metadata and correction cleanup cannot be exercised at all.
- Local disposable stack is not an alternative on this Mac (`kern.hv_support=0`).
