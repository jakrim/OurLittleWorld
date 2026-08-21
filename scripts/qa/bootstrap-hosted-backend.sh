#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

for command_name in node psql supabase; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 2
  }
done

: "${OLW_QA_PROJECT_REF:?Set the isolated Supabase QA project ref.}"
: "${OLW_QA_DATABASE_URL:?Set the isolated Supabase QA session-pooler database URL.}"

production_ref='baxgullapuksjbzkogii'
if [[ "$OLW_QA_PROJECT_REF" == "$production_ref" ]]; then
  printf 'Refusing to bootstrap the production project.\n' >&2
  exit 1
fi

db_identity="$(node -e "const u=new URL(process.env.OLW_QA_DATABASE_URL); console.log([u.hostname,u.username].join('|'))")"
if [[ "$db_identity" != *"$OLW_QA_PROJECT_REF"* ]]; then
  printf 'Database URL does not identify the requested QA project.\n' >&2
  exit 1
fi

# Data-less preview branches can also omit GoTrue's singleton instance row,
# which makes ordinary signup return a database 500 before app triggers run.
psql "$OLW_QA_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "
  insert into auth.instances (id, uuid, raw_base_config, created_at, updated_at)
  values (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000',
    null,
    now(),
    now()
  )
  on conflict (id) do nothing;
"

ready_state="$(psql "$OLW_QA_DATABASE_URL" -X -Atc "
  select case when
    (select max(version) from supabase_migrations.schema_migrations) = '20260821120000'
    and to_regclass('public.daily_prompt_responses') is not null
    and to_regclass('public.moments') is not null
    and exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'finalize_canonical_media_keep'
    )
  then 'ready' else 'pending' end;
")"
if [[ "$ready_state" == 'ready' ]]; then
  printf 'QA_SCHEMA_READY\n'
  exit 0
fi

# Supabase preview branches can occasionally record the first local migrations
# without restoring their tables. These three source migrations are idempotent;
# replaying them repairs that empty-branch condition before canonical migration
# history resumes.
psql "$OLW_QA_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260527000000_base_schema_and_storage.sql \
  -f supabase/migrations/20260527012000_ritual_feature_mvp.sql \
  -f supabase/migrations/20260527023000_spouse_letters.sql

stage="$(mktemp -d /private/tmp/olw-hosted-qa-core.XXXXXX)"
trap 'rm -rf -- "$stage"' EXIT
mkdir -p "$stage/supabase/migrations"
ln -s "$repo_root/supabase/config.toml" "$stage/supabase/config.toml"
for migration in supabase/migrations/*.sql; do
  name="$(basename "$migration")"
  version="${name%%_*}"
  if [[ "$version" -le 20260712090000 ]]; then
    ln -s "$repo_root/$migration" "$stage/supabase/migrations/$name"
  fi
done
supabase migration up --db-url "$OLW_QA_DATABASE_URL" --include-all --workdir "$stage" --yes

# This data-less app QA plane intentionally omits the historical marketing and
# website-operations block. Those migrations contain owner addresses, controlled
# provider probes, hard-coded production URLs, and recurring outbound jobs. They
# do not own a mobile family-memory feature.
qa_skips=()
for migration in supabase/migrations/*.sql; do
  name="$(basename "$migration")"
  version="${name%%_*}"
  if [[ "$version" -ge 20260713150000 && "$version" -le 20260714219000 ]]; then
    qa_skips+=("$version")
  fi
done
if [[ "${#qa_skips[@]}" -ne 42 ]]; then
  printf 'Unexpected QA-only migration skip count: %s\n' "${#qa_skips[@]}" >&2
  exit 1
fi
supabase migration repair "${qa_skips[@]}" \
  --status applied --db-url "$OLW_QA_DATABASE_URL" --yes
supabase migration up --db-url "$OLW_QA_DATABASE_URL" --include-all --yes

psql "$OLW_QA_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc \
  "select case when max(version) = '20260821120000' and count(*) = 93 then 'QA_SCHEMA_READY' else 'QA_SCHEMA_INCOMPLETE' end from supabase_migrations.schema_migrations;"
