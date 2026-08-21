# Deterministic smoke testing

The canonical command is `pnpm smoke:mobile`. It runs privacy/persistence model
tests first, then the Maestro family journey against a development build.

## Fixture contract

Use a synthetic test family and synthetic media only. The preferred backend is
the persistent, data-less hosted QA project prepared by
[`hosted-qa-runbook.md`](hosted-qa-runbook.md); localhost remains supported.
The real-write route uses ordinary Supabase password signup/session behavior and
refuses every remote project except the exact QA ref compiled into a development
build. It never accepts the production project. The separate primary UI smoke
still uses `dev-login` when signed out; that proves navigation and backend access,
not the customer OTP email-delivery path.

Start the app and target backend, then run:

```bash
OLW_SMOKE_DEV_CODE='<from authorized local profile>' pnpm smoke:mobile
```

The journey covers cold launch, deterministic development login when signed out,
Today/Add/Our World navigation, parent-approved dry-run save, Firsts/Letters/
Library fixture persistence, a moment error-safe detail flow, and light/dark
appearance. Focused tests cover local queue persistence, idempotent Keep,
analytics allowlisting, lapsed writes, and unavailable/retry behavior.

For a release candidate, additionally run the supported real-write smoke against
the designated non-production fixture family, restart the app, and verify the
same record through the backend and Our World. Never point fixture or development
login paths at a production family. A Maestro pass is not proof of production
deployment, provider delivery, native orientation, or a physical-device gate.

If Maestro, the dev build, test environment, or authorized fixture access is
missing, the command exits with an actionable message after deterministic tests.
Report that UI/backend journey as blocked rather than verified.
