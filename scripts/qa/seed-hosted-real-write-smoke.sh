#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

: "${OLW_QA_PROJECT_REF:?Set the isolated Supabase QA project ref.}"
: "${OLW_QA_DATABASE_URL:?Set the isolated Supabase QA session-pooler database URL.}"
: "${OLW_QA_PURCHASE_CODE:?Set the synthetic hosted-QA purchase code.}"
: "${OLW_QA_SUPABASE_URL:?Set the isolated Supabase QA URL.}"
: "${OLW_QA_SERVICE_ROLE_KEY:?Set the isolated Supabase QA service role key.}"
: "${OLW_QA_USER_EMAIL:?Set the synthetic hosted-QA user email.}"
: "${OLW_QA_USER_PASSWORD:?Set the synthetic hosted-QA user password.}"

if [[ "$OLW_QA_PROJECT_REF" == 'baxgullapuksjbzkogii' ]]; then
  printf 'Refusing to seed production.\n' >&2
  exit 1
fi
db_identity="$(node -e "const u=new URL(process.env.OLW_QA_DATABASE_URL); console.log([u.hostname,u.username].join('|'))")"
if [[ "$db_identity" != *"$OLW_QA_PROJECT_REF"* ]]; then
  printf 'Database URL does not identify the requested QA project.\n' >&2
  exit 1
fi
qa_api_host="$(node -e "console.log(new URL(process.env.OLW_QA_SUPABASE_URL).hostname)")"
if [[ "$qa_api_host" != "$OLW_QA_PROJECT_REF.supabase.co" ]]; then
  printf 'Supabase URL does not identify the requested QA project.\n' >&2
  exit 1
fi

for command_name in curl jq; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 2
  }
done

users_json="$(curl -fsS \
  -H "apikey: $OLW_QA_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $OLW_QA_SERVICE_ROLE_KEY" \
  "$OLW_QA_SUPABASE_URL/auth/v1/admin/users?per_page=1000")"
qa_user_id="$(jq -r --arg email "$OLW_QA_USER_EMAIL" \
  '.users[]? | select((.email | ascii_downcase) == ($email | ascii_downcase)) | .id' \
  <<<"$users_json" | head -n 1)"
qa_user_payload="$(jq -cn \
  --arg email "$OLW_QA_USER_EMAIL" \
  --arg password "$OLW_QA_USER_PASSWORD" \
  '{email: $email, password: $password, email_confirm: true, user_metadata: {qa_fixture: true}}')"
if [[ -n "$qa_user_id" ]]; then
  curl -fsS -X PUT \
    -H "apikey: $OLW_QA_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $OLW_QA_SERVICE_ROLE_KEY" \
    -H 'Content-Type: application/json' \
    --data "$qa_user_payload" \
    "$OLW_QA_SUPABASE_URL/auth/v1/admin/users/$qa_user_id" >/dev/null
else
  curl -fsS -X POST \
    -H "apikey: $OLW_QA_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $OLW_QA_SERVICE_ROLE_KEY" \
    -H 'Content-Type: application/json' \
    --data "$qa_user_payload" \
    "$OLW_QA_SUPABASE_URL/auth/v1/admin/users" >/dev/null
fi

psql "$OLW_QA_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -v qa_code="$OLW_QA_PURCHASE_CODE" \
  -v qa_email="$OLW_QA_USER_EMAIL" \
  -f scripts/qa/seed-hosted-real-write-smoke.sql
printf 'Hosted QA entitlement is ready.\n'
