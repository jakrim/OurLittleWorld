#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

pnpm --filter @ourlittleworld/mobile exec node --test \
  tests/unit/candidateLedgerModel.test.js \
  tests/unit/tonightEnrichmentModel.test.js \
  tests/unit/familyLibrarySyncModel.test.js \
  tests/unit/analyticsEventsModel.test.js \
  tests/unit/privateRecapShareModel.test.js

if ! command -v maestro >/dev/null 2>&1; then
  printf '%s\n' \
    'ACTION REQUIRED: deterministic privacy/persistence tests passed, but Maestro is not installed.' \
    'Install Maestro, boot the configured development build, then rerun pnpm smoke:mobile.' >&2
  exit 2
fi

if [[ -z "${OLW_SMOKE_DEV_CODE:-}" ]]; then
  printf '%s\n' \
    'ACTION REQUIRED: set OLW_SMOKE_DEV_CODE from the authorized local test profile.' \
    'The value is used by Maestro only and must not be logged or committed.' >&2
  exit 2
fi

maestro test -e OLW_SMOKE_DEV_CODE="$OLW_SMOKE_DEV_CODE" apps/mobile/.maestro/smoke-primary.yaml
