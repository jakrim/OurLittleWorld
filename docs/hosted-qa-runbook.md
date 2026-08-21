# Hosted app QA backend

This runbook creates a persistent, synthetic-only backend for remote agents and
simulators that cannot run Docker. It is not a production clone and must never
contain family media, identities, production accounts, provider credentials, or
customer exports.

## Safety contract

- Use a data-less Supabase preview branch or dedicated non-production project.
- Keep the project ref, database URL, service role, purchase code, and runtime
  secrets in the agent provider's encrypted secret store. Only the URL and anon
  key belong in a development build.
- `scripts/qa/bootstrap-hosted-backend.sh` rejects the production project ref and
  requires the database identity to match the requested QA ref.
- The bootstrap records—but does not execute—the historical marketing and
  website-operations migration block. Those 42 migrations contain controlled
  provider probes, owner contact data, hard-coded production routes, and outbound
  cron. The mobile/core schema continues through the current final migration.
- All media must be synthetic. Real family media and recognition evidence remain
  device-local and are never evidence artifacts.

## Prepare the database

Export these values without printing them:

```bash
export OLW_QA_PROJECT_REF='...'
export OLW_QA_DATABASE_URL='postgresql://...session-pooler...'
pnpm qa:hosted:bootstrap
```

The terminal line must be `QA_SCHEMA_READY`. Re-running the command is a no-op
after that exact schema is present.

Create a high-entropy synthetic purchase code in the secret store, then seed it:

```bash
export OLW_QA_PURCHASE_CODE='...'
export OLW_QA_SUPABASE_URL='https://<qa-ref>.supabase.co'
export OLW_QA_SERVICE_ROLE_KEY='...'
export OLW_QA_USER_EMAIL='synthetic-hosted-qa@example.test'
export OLW_QA_USER_PASSWORD='...'
pnpm qa:hosted:seed
```

## Deploy the narrow runtime

Deploy only the Edge Functions exercised by the app. At minimum for the image
Keep loop: `create-media-session`, `redeem-purchase-code`, and the shared code
they import. Video requires `create-stream-upload`,
`authorize-stream-playback`, the QA media Worker, and QA-only Cloudflare secrets.
Provider features such as StoreKit verification, push delivery, billing portal,
and Stream signing remain separate provider gates until their dedicated QA
credentials exist.

The QA Worker uses the `qa` Wrangler environment and `olw-originals-qa`. Its
session, deletion, and gateway-auth secrets must be new values shared only with
the QA Edge Functions. Production Worker secrets do not inherit into QA.

## Build and run

Configure the development build with:

```text
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_OLW_QA_PROJECT_REF
EXPO_PUBLIC_OLW_QA_PURCHASE_CODE
EXPO_PUBLIC_OLW_QA_USER_EMAIL
EXPO_PUBLIC_OLW_QA_USER_PASSWORD
EXPO_PUBLIC_OLW_QA_AUTORUN_REAL_WRITE=1
EXPO_PUBLIC_MEDIA_GATEWAY_URL
```

The seed command creates or refreshes one email-confirmed synthetic account with
the service role, removes only that account's prior `OLW Hosted QA` fixture
family, and resets the one-time entitlement code. The app then signs in through
the ordinary password-auth endpoint. The service role never enters the app or
the agent build.

The autorun flag is development-only. It makes the index route render the real
write harness directly so a remote simulator does not depend on custom-scheme
delivery. The harness still refuses every target except localhost or the exact
configured non-production project, then uses ordinary auth, Photos, RPC, storage,
and UI boundaries.

Seed only synthetic Photos into the simulator. Run the real-write Maestro flow,
then the primary journey. The real-write pass must show a real opaque Keep,
storage objects, correction removal, and no private recognition metadata. Restart
and separately verify the parent-facing Today → Tonight → Keep → Our World path.

## Proof boundaries

The hosted QA backend proves auth sessions, RLS, RPCs, storage, canonical image
Keep, replay, and shared-world reads. Recognition calibration and correction
examples remain device-local and are verified on the simulator, not by querying
shared storage. It does not by itself prove the native face
matcher, EXIF orientation, iCloud behavior, microphone/video fidelity, StoreKit,
push delivery, Stream playback, physical-device performance, or production.
