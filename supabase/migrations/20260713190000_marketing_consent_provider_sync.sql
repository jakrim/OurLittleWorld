-- Durable, consent-safe marketing contact synchronization.
--
-- Marketing consent remains separate from transactional gift fulfillment.  All
-- public entry points below are SECURITY DEFINER RPCs granted only to the
-- service role.  The browser must never receive provider credentials, audience
-- identifiers, worker tokens, or direct table access.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Email identity is the SHA-256 digest of the complete normalized address.  Do
-- not reuse redemption-code normalization here: punctuation is meaningful in
-- an email local part.
create or replace function public.marketing_email_hash(target_email text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
  select encode(
    extensions.digest(lower(btrim(target_email)), 'sha256'),
    'hex'
  );
$$;

revoke all on function public.marketing_email_hash(text) from public, anon, authenticated;
grant execute on function public.marketing_email_hash(text) to service_role;

-- Rehash existing rows as one locked operation.  Prefixing the legacy values
-- first prevents a transient unique-index conflict if an old broken hash happens
-- to equal another row's final hash.  The guard aborts without exposing either
-- address if two stored rows would resolve to the same canonical identity.
do $$
begin
  lock table public.marketing_contacts in share row exclusive mode;

  if exists (
    select 1
    from public.marketing_contacts
    group by public.marketing_email_hash(email)
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'marketing_contact_rehash_collision';
  end if;

  update public.marketing_contacts
  set email_hash = 'legacy-v1:' || id::text;

  update public.marketing_contacts
  set email = lower(btrim(email)),
      email_hash = public.marketing_email_hash(email);
end
$$;

alter table public.marketing_contacts
  add column if not exists first_consented_at timestamptz,
  add column if not exists consent_revoked_at timestamptz,
  add column if not exists suppression_reason text;

update public.marketing_contacts
set first_consented_at = coalesce(first_consented_at, consented_at, created_at)
where marketing_consent = true
  and first_consented_at is null;

-- Normalize the only invalid legacy consent combination before enforcing it.
-- A cleaned/suppressed address may retain legal consent while delivery remains
-- blocked, but an unsubscribed contact must never remain marketable locally.
update public.marketing_contacts
set marketing_consent = false,
    consent_revoked_at = coalesce(consent_revoked_at, updated_at, now()),
    suppression_reason = coalesce(suppression_reason, 'legacy_unsubscribed')
where status = 'unsubscribed'
  and marketing_consent = true;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.marketing_contacts'::regclass
      and conname = 'marketing_contacts_email_hash_v2_check'
  ) then
    alter table public.marketing_contacts
      add constraint marketing_contacts_email_hash_v2_check
      check (email_hash ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.marketing_contacts'::regclass
      and conname = 'marketing_contacts_suppression_reason_check'
  ) then
    alter table public.marketing_contacts
      add constraint marketing_contacts_suppression_reason_check
      check (
        suppression_reason is null
        or suppression_reason ~ '^[a-z][a-z0-9_:-]{0,79}$'
      );
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.marketing_contacts'::regclass
      and conname = 'marketing_contacts_unsubscribed_consent_check'
  ) then
    alter table public.marketing_contacts
      add constraint marketing_contacts_unsubscribed_consent_check
      check (status <> 'unsubscribed' or marketing_consent = false);
  end if;
end
$$;

-- This trigger protects direct legacy inserts during a coordinated rollout and
-- makes a caller-supplied legacy hash harmless.  The atomic signup RPC still
-- validates its supplied hash so client/server normalization disagreements fail
-- closed instead of merging contacts.
create or replace function public.normalize_marketing_contact_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  new.email := lower(btrim(new.email));

  if char_length(new.email) not between 3 and 320
     or new.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using
      errcode = '22023',
      message = 'invalid_marketing_email';
  end if;

  new.email_hash := public.marketing_email_hash(new.email);

  -- A legacy service-role upsert must not silently undo a durable opt-out or
  -- suppression.  Only the provider-confirmation reconciliation path sets the
  -- transaction-local escape hatch used for a verified reconfirmation.
  if tg_op = 'UPDATE'
     and coalesce(current_setting('olw.marketing_provider_reconfirmed', true), '') <> 'true' then
    if old.status = 'suppressed' and new.status <> 'suppressed' then
      new.status := old.status;
      new.marketing_consent := old.marketing_consent;
      new.consented_at := old.consented_at;
      new.first_consented_at := old.first_consented_at;
      new.consent_revoked_at := old.consent_revoked_at;
      new.consent_source := old.consent_source;
      new.suppression_reason := old.suppression_reason;
    elsif old.status = 'unsubscribed' and new.status = 'subscribed' then
      new.status := old.status;
      new.marketing_consent := old.marketing_consent;
      new.consented_at := old.consented_at;
      new.first_consented_at := old.first_consented_at;
      new.consent_revoked_at := old.consent_revoked_at;
      new.consent_source := old.consent_source;
      new.suppression_reason := old.suppression_reason;
    end if;
  end if;

  return new;
end
$$;

revoke all on function public.normalize_marketing_contact_identity() from public, anon, authenticated;

drop trigger if exists marketing_contacts_normalize_identity on public.marketing_contacts;
create trigger marketing_contacts_normalize_identity
  before insert or update of email, email_hash, status, marketing_consent
  on public.marketing_contacts
  for each row execute procedure public.normalize_marketing_contact_identity();

create table if not exists public.marketing_consent_events (
  id                    uuid primary key default gen_random_uuid(),
  event_key             text not null unique,
  contact_id            uuid not null references public.marketing_contacts(id) on delete restrict,
  event_type            text not null,
  consent_granted       boolean not null,
  effect_applied        boolean not null,
  consent_source        text not null,
  consent_version       text not null,
  occurred_at           timestamptz not null,
  attribution           jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  check (event_key ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$'),
  check (event_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  check (consent_source ~ '^[a-z][a-z0-9_:-]{1,79}$'),
  check (consent_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'),
  check (jsonb_typeof(attribution) = 'object')
);

create index if not exists marketing_consent_events_contact_occurred_idx
  on public.marketing_consent_events(contact_id, occurred_at desc, created_at desc);

create table if not exists public.marketing_contact_provider_state (
  contact_id               uuid primary key references public.marketing_contacts(id) on delete restrict,
  provider                 text not null default 'mailchimp',
  audience_id              text not null default '333fbdbba0',
  provider_status          text not null default 'unknown',
  provider_member_hash     text,
  sync_state               text not null default 'pending',
  welcome_idempotency_key  text not null unique,
  welcome_eligible_at      timestamptz,
  welcome_enrolled_at      timestamptz,
  last_synced_at           timestamptz,
  last_provider_event_at   timestamptz,
  last_status_event_at     timestamptz,
  last_identity_event_at   timestamptz,
  last_error_code          text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (provider = 'mailchimp'),
  check (audience_id ~ '^[A-Za-z0-9]{1,40}$'),
  check (provider_status in (
    'unknown', 'pending', 'subscribed', 'unsubscribed', 'cleaned',
    'complained', 'transactional', 'archived'
  )),
  check (provider_member_hash is null or provider_member_hash ~ '^[0-9a-f]{32}$'),
  check (sync_state in ('pending', 'processing', 'synced', 'retry', 'blocked')),
  check (welcome_enrolled_at is null or welcome_eligible_at is not null),
  check (last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_:-]{0,79}$')
);

create index if not exists marketing_contact_provider_state_health_idx
  on public.marketing_contact_provider_state(sync_state, updated_at);

create table if not exists public.marketing_sync_outbox (
  id                         uuid primary key default gen_random_uuid(),
  contact_id                 uuid not null references public.marketing_contacts(id) on delete restrict,
  idempotency_key            text not null unique,
  source_event_key           text not null,
  sync_action                text not null,
  state                      text not null default 'pending',
  attempt_count              integer not null default 0,
  available_at               timestamptz not null default now(),
  claimed_at                 timestamptz,
  claim_token                uuid,
  completed_at               timestamptz,
  completed_provider_status  text,
  last_error_code            text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$'),
  check (char_length(source_event_key) between 1 and 200),
  check (sync_action in ('upsert', 'reconfirm', 'suppress', 'reconcile')),
  check (state in ('pending', 'processing', 'retry', 'completed', 'terminal', 'canceled')),
  check (attempt_count between 0 and 8),
  check (state <> 'processing' or claim_token is not null),
  check (completed_provider_status is null or completed_provider_status in (
    'unknown', 'pending', 'subscribed', 'unsubscribed', 'cleaned',
    'complained', 'transactional', 'archived'
  )),
  check (last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_:-]{0,79}$')
);

create index if not exists marketing_sync_outbox_due_idx
  on public.marketing_sync_outbox(available_at, created_at)
  where state in ('pending', 'retry', 'processing');

-- A locked contact may have only one outstanding provider mutation.  New
-- consent events can safely coalesce into that job because claim reads the
-- current canonical contact and attribution, not a stale payload snapshot.
create unique index if not exists marketing_sync_outbox_one_active_contact_idx
  on public.marketing_sync_outbox(contact_id)
  where state in ('pending', 'processing', 'retry');

create table if not exists public.marketing_provider_events (
  id                   uuid primary key default gen_random_uuid(),
  event_key            text not null unique,
  provider             text not null default 'mailchimp',
  audience_id          text not null default '333fbdbba0',
  event_type           text not null,
  provider_status      text not null,
  email_hash           text not null,
  old_email_hash       text,
  occurred_at          timestamptz not null,
  contact_id           uuid references public.marketing_contacts(id) on delete restrict,
  processing_status    text not null default 'received',
  quarantine_reason    text,
  processed_at         timestamptz,
  created_at           timestamptz not null default now(),
  check (event_key ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$'),
  check (provider = 'mailchimp'),
  check (audience_id ~ '^[A-Za-z0-9]{1,40}$'),
  check (event_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  check (provider_status in (
    'unknown', 'pending', 'subscribed', 'unsubscribed', 'cleaned',
    'complained', 'transactional', 'archived', 'unchanged'
  )),
  check (email_hash ~ '^[0-9a-f]{64}$'),
  check (old_email_hash is null or old_email_hash ~ '^[0-9a-f]{64}$'),
  check (processing_status in ('received', 'processed', 'ignored', 'quarantined')),
  check (quarantine_reason is null or quarantine_reason ~ '^[a-z][a-z0-9_:-]{0,79}$')
);

create index if not exists marketing_provider_events_contact_occurred_idx
  on public.marketing_provider_events(contact_id, occurred_at desc)
  where contact_id is not null;

create index if not exists marketing_provider_events_quarantine_idx
  on public.marketing_provider_events(created_at)
  where processing_status = 'quarantined';

-- Every historical email hash remains an alias for the same canonical contact.
-- This lets delayed webhooks resolve after an upemail event without retaining
-- another copy of the old raw address.
create table if not exists public.marketing_contact_email_aliases (
  email_hash       text primary key,
  contact_id       uuid not null references public.marketing_contacts(id) on delete restrict,
  is_current       boolean not null default true,
  first_seen_at    timestamptz not null default now(),
  retired_at       timestamptz,
  check (email_hash ~ '^[0-9a-f]{64}$'),
  check (is_current or retired_at is not null)
);

create index if not exists marketing_contact_email_aliases_contact_idx
  on public.marketing_contact_email_aliases(contact_id, is_current, first_seen_at);

create unique index if not exists marketing_contact_email_aliases_one_current_idx
  on public.marketing_contact_email_aliases(contact_id)
  where is_current = true;

-- Request hashes must be a one-way HMAC or digest produced by the Edge
-- function.  Never place a raw IP address, user-agent, or email in this table.
create table if not exists public.marketing_signup_rate_limits (
  request_hash       text not null,
  window_started_at timestamptz not null,
  window_seconds    integer not null,
  request_count     integer not null default 1,
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now(),
  primary key (request_hash, window_started_at, window_seconds),
  check (request_hash ~ '^[0-9a-f]{64}$'),
  check (window_seconds between 60 and 86400),
  check (request_count between 1 and 1001)
);

create index if not exists marketing_signup_rate_limits_expiry_idx
  on public.marketing_signup_rate_limits(expires_at);

-- Request IDs contain no contact data or credentials.  They correlate pg_net
-- responses with scheduled dispatches for aggregate health reporting.
create table if not exists public.marketing_sync_dispatch_runs (
  request_id      bigint primary key,
  status          text not null default 'queued',
  status_code     integer,
  error_code      text,
  dispatched_at  timestamptz not null default now(),
  completed_at    timestamptz,
  check (status in ('queued', 'succeeded', 'failed', 'timed_out')),
  check (status_code is null or status_code between 100 and 599),
  check (error_code is null or error_code ~ '^[a-z][a-z0-9_:-]{0,79}$')
);

create index if not exists marketing_sync_dispatch_runs_status_idx
  on public.marketing_sync_dispatch_runs(status, dispatched_at desc);

create or replace function public.track_marketing_contact_email_alias()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  existing_contact_id uuid;
begin
  -- A contact has exactly one current hash, while every earlier hash remains a
  -- permanent lookup alias for delayed provider events.
  update public.marketing_contact_email_aliases
  set is_current = false,
      retired_at = coalesce(retired_at, now())
  where contact_id = new.id
    and email_hash <> new.email_hash
    and is_current = true;

  select contact_id into existing_contact_id
  from public.marketing_contact_email_aliases
  where email_hash = new.email_hash
  for update;

  if existing_contact_id is not null and existing_contact_id <> new.id then
    raise exception using
      errcode = '23505',
      message = 'marketing_email_alias_collision';
  end if;

  insert into public.marketing_contact_email_aliases (
    email_hash,
    contact_id,
    is_current,
    first_seen_at,
    retired_at
  ) values (
    new.email_hash,
    new.id,
    true,
    now(),
    null
  )
  on conflict (email_hash) do update
  set is_current = true,
      retired_at = null;

  return new;
end
$$;

revoke all on function public.track_marketing_contact_email_alias()
  from public, anon, authenticated;

drop trigger if exists marketing_contacts_track_email_alias
  on public.marketing_contacts;
create trigger marketing_contacts_track_email_alias
  after insert or update of email, email_hash
  on public.marketing_contacts
  for each row execute procedure public.track_marketing_contact_email_alias();

insert into public.marketing_contact_email_aliases (
  email_hash,
  contact_id,
  is_current,
  first_seen_at,
  retired_at
)
select email_hash, id, true, created_at, null
from public.marketing_contacts
on conflict (email_hash) do update
set is_current = true,
    retired_at = null;

drop trigger if exists marketing_contact_provider_state_updated
  on public.marketing_contact_provider_state;
create trigger marketing_contact_provider_state_updated
  before update on public.marketing_contact_provider_state
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists marketing_sync_outbox_updated
  on public.marketing_sync_outbox;
create trigger marketing_sync_outbox_updated
  before update on public.marketing_sync_outbox
  for each row execute procedure public.ool_set_updated_at();

-- Consent events are append-only even to the service role.  Corrections must be
-- represented by a later event so the audit history remains intelligible.
create or replace function public.reject_marketing_consent_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'marketing_consent_events_are_immutable';
end
$$;

revoke all on function public.reject_marketing_consent_event_mutation()
  from public, anon, authenticated;

drop trigger if exists marketing_consent_events_immutable
  on public.marketing_consent_events;
create trigger marketing_consent_events_immutable
  before update or delete on public.marketing_consent_events
  for each row execute procedure public.reject_marketing_consent_event_mutation();

-- Keep only acquisition dimensions that are already safe for analytics and
-- provider merge fields.  Unknown keys, URLs, email-like values, and oversized
-- strings are dropped server-side.
create or replace function public.sanitize_marketing_attribution(target_attribution jsonb)
returns jsonb
language plpgsql
stable
parallel safe
set search_path = pg_catalog
as $$
declare
  allowed_keys constant text[] := array[
    'campaign', 'angle', 'creative', 'channel', 'landing_page',
    'first_campaign', 'first_angle', 'first_creative', 'first_channel',
    'first_landing_page', 'last_campaign', 'last_angle', 'last_creative',
    'last_channel', 'last_landing_page'
  ];
  key_name text;
  value_text text;
  result jsonb := '{}'::jsonb;
begin
  if target_attribution is null then
    return result;
  end if;

  if jsonb_typeof(target_attribution) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'invalid_marketing_attribution';
  end if;

  foreach key_name in array allowed_keys loop
    value_text := btrim(target_attribution ->> key_name);
    if value_text is null or value_text = '' or char_length(value_text) > 120 then
      continue;
    end if;

    if key_name like '%landing_page' then
      if value_text ~ '^/[A-Za-z0-9/_-]*$' then
        result := result || jsonb_build_object(key_name, value_text);
      end if;
    elsif position('://' in value_text) = 0
       and position('@' in value_text) = 0
       and value_text ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$' then
      result := result || jsonb_build_object(key_name, value_text);
    end if;
  end loop;

  return result;
end
$$;

revoke all on function public.sanitize_marketing_attribution(jsonb)
  from public, anon, authenticated;

create or replace function public.merge_marketing_attribution(
  current_attribution jsonb,
  incoming_attribution jsonb
)
returns jsonb
language plpgsql
stable
parallel safe
set search_path = pg_catalog
as $$
declare
  current_safe jsonb := public.sanitize_marketing_attribution(current_attribution);
  incoming_safe jsonb := public.sanitize_marketing_attribution(incoming_attribution);
  result jsonb;
  key_name text;
begin
  result := current_safe || incoming_safe;

  foreach key_name in array array[
    'first_campaign', 'first_angle', 'first_creative', 'first_channel',
    'first_landing_page'
  ] loop
    if current_safe ? key_name then
      result := jsonb_set(result, array[key_name], current_safe -> key_name, true);
    end if;
  end loop;

  return result;
end
$$;

revoke all on function public.merge_marketing_attribution(jsonb, jsonb)
  from public, anon, authenticated;

create or replace function public.marketing_provider_status_rank(target_status text)
returns smallint
language sql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
  select case target_status
    when 'subscribed' then 1
    when 'pending' then 2
    when 'unsubscribed' then 3
    when 'transactional' then 3
    when 'archived' then 3
    when 'cleaned' then 4
    when 'complained' then 5
    else 0
  end::smallint;
$$;

revoke all on function public.marketing_provider_status_rank(text)
  from public, anon, authenticated, service_role;

-- Internal helper.  The caller must hold the contact row lock; that lock makes
-- the partial one-active-job invariant deterministic under concurrent signups.
create or replace function public.enqueue_marketing_contact_sync(
  target_contact_id uuid,
  target_source_event_key text,
  target_sync_action text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  inserted_id uuid;
begin
  if target_sync_action not in ('upsert', 'reconfirm', 'suppress', 'reconcile') then
    raise exception using errcode = '22023', message = 'invalid_marketing_sync_action';
  end if;

  insert into public.marketing_contact_provider_state (
    contact_id,
    sync_state,
    welcome_idempotency_key
  ) values (
    target_contact_id,
    'pending',
    'olw-launch-welcome-v1:' || target_contact_id::text
  )
  on conflict (contact_id) do nothing;

  insert into public.marketing_sync_outbox (
    contact_id,
    idempotency_key,
    source_event_key,
    sync_action,
    state,
    available_at
  )
  select
    target_contact_id,
    'marketing-sync-v1:' || encode(
      extensions.digest(target_sync_action || ':' || target_source_event_key, 'sha256'),
      'hex'
    ),
    target_source_event_key,
    target_sync_action,
    'pending',
    now()
  where not exists (
    select 1
    from public.marketing_sync_outbox
    where contact_id = target_contact_id
      and state in ('pending', 'processing', 'retry')
  )
  on conflict (idempotency_key) do nothing
  returning id into inserted_id;

  if inserted_id is not null then
    update public.marketing_contact_provider_state
    set sync_state = 'pending',
        last_error_code = null
    where contact_id = target_contact_id;
  end if;

  return inserted_id is not null;
end
$$;

revoke all on function public.enqueue_marketing_contact_sync(uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.record_marketing_signup(
  target_email text,
  target_email_hash text,
  target_consent_source text,
  target_attribution jsonb,
  target_event_key text,
  target_consent_version text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  normalized_email text := lower(btrim(target_email));
  canonical_hash text;
  safe_attribution jsonb;
  contact_row public.marketing_contacts%rowtype;
  existing_event public.marketing_consent_events%rowtype;
  event_type text;
  effect_applied boolean;
  sync_action text;
  sync_queued boolean := false;
  created_contact boolean := false;
  replay_event record;
begin
  if char_length(normalized_email) not between 3 and 320
     or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'invalid_marketing_email';
  end if;

  canonical_hash := public.marketing_email_hash(normalized_email);
  if lower(coalesce(target_email_hash, '')) <> canonical_hash then
    raise exception using errcode = '22023', message = 'marketing_email_hash_mismatch';
  end if;

  if target_consent_source !~ '^web_[a-z0-9_-]{1,60}$' then
    raise exception using errcode = '22023', message = 'invalid_marketing_consent_source';
  end if;

  if target_event_key !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$' then
    raise exception using errcode = '22023', message = 'invalid_marketing_event_key';
  end if;

  if target_consent_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$' then
    raise exception using errcode = '22023', message = 'invalid_marketing_consent_version';
  end if;

  safe_attribution := public.sanitize_marketing_attribution(target_attribution);

  select * into contact_row
  from public.marketing_contacts
  where email_hash = canonical_hash
  for update;

  if not found then
    insert into public.marketing_contacts (
      email,
      email_hash,
      status,
      marketing_consent,
      consented_at,
      first_consented_at,
      consent_source,
      attribution
    ) values (
      normalized_email,
      canonical_hash,
      'subscribed',
      true,
      now(),
      now(),
      target_consent_source,
      safe_attribution
    )
    on conflict (email_hash) do nothing
    returning * into contact_row;

    if found then
      created_contact := true;
    else
      select * into strict contact_row
      from public.marketing_contacts
      where email_hash = canonical_hash
      for update;
    end if;
  end if;

  if created_contact then
    -- Provider delivery can precede the first local signup.  Once the new
    -- contact's hash alias exists, replay any durable suppression immediately
    -- so a complaint or cleaned address cannot briefly become marketable.
    for replay_event in
      select pending_event.*
      from public.marketing_provider_events pending_event
      where pending_event.processing_status = 'quarantined'
        and pending_event.quarantine_reason = 'contact_not_found'
        and pending_event.event_type <> 'upemail'
        and canonical_hash in (
          pending_event.email_hash,
          coalesce(pending_event.old_email_hash, pending_event.email_hash)
        )
      order by pending_event.occurred_at, pending_event.event_key
    loop
      perform public.reconcile_marketing_provider_event(
        replay_event.event_key,
        replay_event.email_hash,
        replay_event.provider_status,
        replay_event.event_type,
        replay_event.occurred_at,
        replay_event.old_email_hash,
        null
      );
    end loop;

    select * into strict contact_row
    from public.marketing_contacts
    where id = contact_row.id
    for update;
  end if;

  select * into existing_event
  from public.marketing_consent_events
  where event_key = target_event_key;

  if found then
    if existing_event.contact_id <> contact_row.id then
      raise exception using errcode = '23505', message = 'marketing_event_key_conflict';
    end if;

    return jsonb_build_object(
      'accepted', true,
      'duplicate', true,
      'contact_id', contact_row.id,
      'contact_status', contact_row.status,
      'marketing_consent', contact_row.marketing_consent,
      'eligible', contact_row.status = 'subscribed' and contact_row.marketing_consent = true,
      'sync_state', (
        select sync_state from public.marketing_contact_provider_state
        where contact_id = contact_row.id
      ),
      'sync_queued', exists (
        select 1 from public.marketing_sync_outbox
        where contact_id = contact_row.id
          and state in ('pending', 'processing', 'retry')
      ),
      'welcome_eligible', exists (
        select 1 from public.marketing_contact_provider_state
        where contact_id = contact_row.id
          and welcome_eligible_at is not null
          and welcome_enrolled_at is null
      )
    );
  end if;

  if contact_row.status = 'subscribed' then
    event_type := case when created_contact then 'signup_granted' else 'signup_reconfirmed' end;
    effect_applied := true;
    sync_action := 'upsert';

    update public.marketing_contacts
    set marketing_consent = true,
        consented_at = coalesce(consented_at, now()),
        first_consented_at = coalesce(first_consented_at, consented_at, now()),
        consent_source = coalesce(consent_source, target_consent_source),
        consent_revoked_at = null,
        attribution = public.merge_marketing_attribution(attribution, safe_attribution)
    where id = contact_row.id
    returning * into contact_row;
  elsif contact_row.status = 'unsubscribed' then
    -- A prior opt-out requires provider reconfirmation.  Recording a checked box
    -- is valuable consent evidence but is not itself permission to force the
    -- Mailchimp member back to subscribed.
    event_type := 'signup_reconfirmation_requested';
    effect_applied := false;
    sync_action := 'reconfirm';

    update public.marketing_contacts
    set marketing_consent = false,
        attribution = public.merge_marketing_attribution(attribution, safe_attribution)
    where id = contact_row.id
    returning * into contact_row;
  else
    -- Cleaned addresses and complaints stay suppressed.  A later operator-safe
    -- process may resolve a false positive; a public form may not.
    event_type := 'signup_blocked_by_suppression';
    effect_applied := false;
    sync_action := null;

    update public.marketing_contacts
    set attribution = public.merge_marketing_attribution(attribution, safe_attribution)
    where id = contact_row.id
    returning * into contact_row;
  end if;

  insert into public.marketing_consent_events (
    event_key,
    contact_id,
    event_type,
    consent_granted,
    effect_applied,
    consent_source,
    consent_version,
    occurred_at,
    attribution
  ) values (
    target_event_key,
    contact_row.id,
    event_type,
    true,
    effect_applied,
    target_consent_source,
    target_consent_version,
    now(),
    safe_attribution
  );

  insert into public.marketing_contact_provider_state (
    contact_id,
    sync_state,
    welcome_idempotency_key,
    welcome_eligible_at,
    last_error_code
  ) values (
    contact_row.id,
    case when sync_action is null then 'blocked' else 'pending' end,
    'olw-launch-welcome-v1:' || contact_row.id::text,
    case when effect_applied then now() else null end,
    case when sync_action is null then 'local_contact_suppressed' else null end
  )
  on conflict (contact_id) do update
  set welcome_eligible_at = case
        when effect_applied
          then coalesce(public.marketing_contact_provider_state.welcome_eligible_at, excluded.welcome_eligible_at)
        else public.marketing_contact_provider_state.welcome_eligible_at
      end,
      sync_state = case
        when sync_action is null then 'blocked'
        else public.marketing_contact_provider_state.sync_state
      end,
      last_error_code = case
        when sync_action is null then coalesce(
          public.marketing_contact_provider_state.last_error_code,
          'local_contact_suppressed'
        )
        else public.marketing_contact_provider_state.last_error_code
      end;

  if sync_action is not null then
    sync_queued := public.enqueue_marketing_contact_sync(
      contact_row.id,
      target_event_key,
      sync_action
    );
  end if;

  return jsonb_build_object(
    'accepted', true,
    'duplicate', false,
    'contact_id', contact_row.id,
    'contact_status', contact_row.status,
    'marketing_consent', contact_row.marketing_consent,
    'eligible', effect_applied,
    'sync_state', (
      select sync_state from public.marketing_contact_provider_state
      where contact_id = contact_row.id
    ),
    'sync_action', sync_action,
    'sync_queued', sync_queued,
    'welcome_eligible', effect_applied
  );
end
$$;

revoke all on function public.record_marketing_signup(text, text, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.record_marketing_signup(text, text, text, jsonb, text, text)
  to service_role;

create or replace function public.consume_marketing_signup_rate_limit(
  target_request_hash text,
  target_limit integer,
  target_window_seconds integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  bucket_start timestamptz;
  observed_count integer;
  retry_after integer;
begin
  if target_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_marketing_rate_limit_hash';
  end if;
  if target_limit not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid_marketing_rate_limit';
  end if;
  if target_window_seconds not between 60 and 86400 then
    raise exception using errcode = '22023', message = 'invalid_marketing_rate_limit_window';
  end if;

  bucket_start := to_timestamp(
    floor(extract(epoch from now()) / target_window_seconds) * target_window_seconds
  );

  insert into public.marketing_signup_rate_limits (
    request_hash,
    window_started_at,
    window_seconds,
    request_count,
    expires_at
  ) values (
    target_request_hash,
    bucket_start,
    target_window_seconds,
    1,
    bucket_start + make_interval(secs => target_window_seconds * 2)
  )
  on conflict (request_hash, window_started_at, window_seconds) do update
  set request_count = least(
        public.marketing_signup_rate_limits.request_count + 1,
        target_limit + 1
      ),
      expires_at = excluded.expires_at
  returning request_count into observed_count;

  retry_after := greatest(
    0,
    ceil(extract(epoch from (
      bucket_start + make_interval(secs => target_window_seconds) - now()
    )))::integer
  );

  return jsonb_build_object(
    'allowed', observed_count <= target_limit,
    'limit', target_limit,
    'remaining', greatest(0, target_limit - observed_count),
    'retry_after_seconds', case when observed_count > target_limit then retry_after else 0 end
  );
end
$$;

revoke all on function public.consume_marketing_signup_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_marketing_signup_rate_limit(text, integer, integer)
  to service_role;

create or replace function public.claim_marketing_contact_sync(
  batch_size integer default 20,
  target_contact_id uuid default null
)
returns table (
  outbox_id uuid,
  claim_token uuid,
  outbox_idempotency_key text,
  contact_id uuid,
  email text,
  email_hash text,
  contact_status text,
  marketing_consent boolean,
  consented_at timestamptz,
  consent_source text,
  consent_version text,
  consent_event_type text,
  attribution jsonb,
  attempt_count integer,
  sync_action text,
  source_event_key text,
  provider text,
  audience_id text,
  provider_status text,
  provider_member_hash text,
  welcome_idempotency_key text,
  welcome_eligible boolean,
  welcome_enrolled boolean
)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  replay_event record;
begin
  -- Close the small commit race between a new local alias and a provider event
  -- that was quarantined while that alias was still invisible.  Replaying
  -- before claiming lets a suppression cancel the pending upsert safely.
  for replay_event in
    select pending_event.*
    from public.marketing_provider_events pending_event
    where pending_event.processing_status = 'quarantined'
      and pending_event.quarantine_reason = 'contact_not_found'
      and pending_event.event_type <> 'upemail'
      and exists (
        select 1
        from public.marketing_contact_email_aliases alias
        where alias.email_hash in (
            pending_event.email_hash,
            coalesce(pending_event.old_email_hash, pending_event.email_hash)
          )
          and (target_contact_id is null or alias.contact_id = target_contact_id)
      )
    order by pending_event.occurred_at, pending_event.event_key
    limit 100
  loop
    perform public.reconcile_marketing_provider_event(
      replay_event.event_key,
      replay_event.email_hash,
      replay_event.provider_status,
      replay_event.event_type,
      replay_event.occurred_at,
      replay_event.old_email_hash,
      null
    );
  end loop;

  -- A worker that dies on its final lease must not leave an unclaimable row
  -- holding the one-active-job index forever.
  update public.marketing_sync_outbox outbox
  set state = 'terminal',
      completed_at = now(),
      last_error_code = 'attempts_exhausted'
  where outbox.attempt_count >= 8
    and (
      outbox.state in ('pending', 'retry')
      or (
        outbox.state = 'processing'
        and outbox.claimed_at < now() - interval '15 minutes'
      )
    );

  update public.marketing_contact_provider_state provider_state
  set sync_state = 'blocked',
      last_error_code = 'attempts_exhausted'
  where exists (
    select 1
    from public.marketing_sync_outbox outbox
    where outbox.contact_id = provider_state.contact_id
      and outbox.state = 'terminal'
      and outbox.last_error_code = 'attempts_exhausted'
  )
    and not exists (
      select 1
      from public.marketing_sync_outbox active_outbox
      where active_outbox.contact_id = provider_state.contact_id
        and active_outbox.state in ('pending', 'processing', 'retry')
    );

  -- Cancel stale work whose canonical consent changed out of band.  A
  -- reconfirm job is valid only for a durable unsubscribe; an upsert is valid
  -- only while consent is active and the contact is not suppressed.
  update public.marketing_sync_outbox outbox
  set state = 'canceled',
      completed_at = now(),
      last_error_code = 'canonical_state_changed'
  from public.marketing_contacts contact
  where outbox.contact_id = contact.id
    and outbox.state in ('pending', 'retry')
    and (
      (outbox.sync_action = 'upsert'
        and (contact.status <> 'subscribed' or contact.marketing_consent = false))
      or (outbox.sync_action = 'reconfirm' and contact.status <> 'unsubscribed')
      or (outbox.sync_action = 'suppress' and contact.status <> 'suppressed')
    );

  return query
  with due as (
    select outbox.id
    from public.marketing_sync_outbox outbox
    join public.marketing_contacts contact on contact.id = outbox.contact_id
    where (
        outbox.state in ('pending', 'retry')
        or (outbox.state = 'processing' and outbox.claimed_at < now() - interval '15 minutes')
      )
      and outbox.available_at <= now()
      and outbox.attempt_count < 8
      and (target_contact_id is null or outbox.contact_id = target_contact_id)
      and (
        (outbox.sync_action = 'upsert'
          and contact.status = 'subscribed' and contact.marketing_consent = true)
        or (outbox.sync_action = 'reconfirm'
          and contact.status = 'unsubscribed' and contact.marketing_consent = false)
        or (outbox.sync_action = 'suppress' and contact.status = 'suppressed')
        or outbox.sync_action = 'reconcile'
      )
    order by outbox.available_at, outbox.created_at, outbox.id
    for update of outbox skip locked
    limit least(greatest(coalesce(batch_size, 20), 1), 50)
  ), claimed as (
    update public.marketing_sync_outbox outbox
    set state = 'processing',
        attempt_count = outbox.attempt_count + 1,
        claimed_at = now(),
        claim_token = gen_random_uuid(),
        last_error_code = null
    from due
    where outbox.id = due.id
    returning outbox.*
  ), provider_updated as (
    update public.marketing_contact_provider_state provider_state
    set sync_state = 'processing',
        last_error_code = null
    from claimed
    where provider_state.contact_id = claimed.contact_id
    returning provider_state.contact_id
  )
  select
    claimed.id,
    claimed.claim_token,
    claimed.idempotency_key,
    contact.id,
    contact.email,
    contact.email_hash,
    contact.status,
    contact.marketing_consent,
    coalesce(contact.consented_at, contact.created_at),
    coalesce(contact.consent_source, 'web_unknown'),
    latest_consent.consent_version,
    latest_consent.event_type,
    contact.attribution,
    claimed.attempt_count,
    claimed.sync_action,
    claimed.source_event_key,
    provider_state.provider,
    provider_state.audience_id,
    provider_state.provider_status,
    provider_state.provider_member_hash,
    provider_state.welcome_idempotency_key,
    (
      claimed.sync_action = 'upsert'
      and contact.status = 'subscribed'
      and contact.marketing_consent = true
      and provider_state.welcome_eligible_at is not null
      and provider_state.welcome_enrolled_at is null
    ),
    provider_state.welcome_enrolled_at is not null
  from claimed
  join provider_updated on provider_updated.contact_id = claimed.contact_id
  join public.marketing_contacts contact on contact.id = claimed.contact_id
  join public.marketing_contact_provider_state provider_state
    on provider_state.contact_id = contact.id
  left join lateral (
    select consent_event.consent_version, consent_event.event_type
    from public.marketing_consent_events consent_event
    where consent_event.contact_id = contact.id
    order by consent_event.occurred_at desc, consent_event.created_at desc
    limit 1
  ) latest_consent on true
  order by claimed.available_at, claimed.created_at, claimed.id;
end
$$;

revoke all on function public.claim_marketing_contact_sync(integer, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_marketing_contact_sync(integer, uuid)
  to service_role;

create or replace function public.complete_marketing_contact_sync(
  target_contact_id uuid,
  target_provider_status text,
  target_member_hash text,
  target_welcome_enrolled boolean,
  target_outbox_id uuid default null,
  target_claim_token uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  outbox_row public.marketing_sync_outbox%rowtype;
  contact_row public.marketing_contacts%rowtype;
  member_hash text;
  final_outbox_state text := 'completed';
  final_sync_state text := 'synced';
  final_error text := null;
  welcome_was_enrolled boolean := false;
begin
  if target_outbox_id is null or target_claim_token is null then
    raise exception using errcode = '22023', message = 'marketing_sync_claim_identity_required';
  end if;

  if target_provider_status not in (
    'unknown', 'pending', 'subscribed', 'unsubscribed', 'cleaned',
    'complained', 'transactional', 'archived'
  ) then
    raise exception using errcode = '22023', message = 'invalid_marketing_provider_status';
  end if;

  select * into outbox_row
  from public.marketing_sync_outbox
  where id = target_outbox_id
    and contact_id = target_contact_id
    and claim_token = target_claim_token
    and state = 'processing'
  for update;

  if not found then
    -- A provider retry may repeat completion after the first transaction
    -- committed.  Return durable state instead of manufacturing a second job.
    return coalesce((
      select jsonb_build_object(
        'completed', state = 'completed',
        'duplicate', true,
        'contact_id', target_contact_id,
        'outbox_state', state,
        'provider_status', completed_provider_status
      )
      from public.marketing_sync_outbox
      where id = target_outbox_id
        and contact_id = target_contact_id
        and claim_token = target_claim_token
    ), jsonb_build_object(
      'completed', false,
      'duplicate', true,
      'contact_id', target_contact_id,
      'outbox_state', 'missing'
    ));
  end if;

  select * into strict contact_row
  from public.marketing_contacts
  where id = target_contact_id
  for update;

  member_hash := lower(coalesce(nullif(btrim(target_member_hash), ''), encode(
    extensions.digest(contact_row.email, 'md5'),
    'hex'
  )));

  if member_hash !~ '^[0-9a-f]{32}$' then
    raise exception using errcode = '22023', message = 'invalid_marketing_provider_member_hash';
  end if;

  if target_provider_status = 'unsubscribed' then
    update public.marketing_contacts
    set status = case when status = 'suppressed' then status else 'unsubscribed' end,
        marketing_consent = false,
        consent_revoked_at = coalesce(consent_revoked_at, now()),
        suppression_reason = case
          when status = 'suppressed' then suppression_reason
          else 'mailchimp_unsubscribed'
        end
    where id = target_contact_id
    returning * into contact_row;

    insert into public.marketing_consent_events (
      event_key, contact_id, event_type, consent_granted, effect_applied,
      consent_source, consent_version, occurred_at, attribution
    ) values (
      'sync:' || outbox_row.id::text || ':unsubscribed',
      target_contact_id,
      'provider_revoked',
      false,
      true,
      'mailchimp_sync',
      'provider-sync-v1',
      now(),
      '{}'::jsonb
    ) on conflict (event_key) do nothing;
  elsif target_provider_status in ('cleaned', 'complained') then
    update public.marketing_contacts
    set status = 'suppressed',
        marketing_consent = case
          when target_provider_status = 'complained' then false
          else marketing_consent
        end,
        consent_revoked_at = case
          when target_provider_status = 'complained' then coalesce(consent_revoked_at, now())
          else consent_revoked_at
        end,
        suppression_reason = case
          when target_provider_status = 'complained' then 'mailchimp_complaint'
          when suppression_reason = 'mailchimp_complaint' then suppression_reason
          else 'mailchimp_cleaned'
        end
    where id = target_contact_id
    returning * into contact_row;

    final_sync_state := 'blocked';
    final_error := case
      when target_provider_status = 'complained' then 'provider_complaint'
      else 'provider_cleaned'
    end;

    insert into public.marketing_consent_events (
      event_key, contact_id, event_type, consent_granted, effect_applied,
      consent_source, consent_version, occurred_at, attribution
    ) values (
      'sync:' || outbox_row.id::text || ':' || target_provider_status,
      target_contact_id,
      'provider_suppressed',
      contact_row.marketing_consent,
      true,
      'mailchimp_sync',
      'provider-sync-v1',
      now(),
      '{}'::jsonb
    ) on conflict (event_key) do nothing;
  elsif target_provider_status = 'subscribed'
        and (contact_row.status <> 'subscribed' or contact_row.marketing_consent = false) then
    -- A GET/PUT response is not evidence that a prior local opt-out was
    -- reconfirmed.  Only a verified provider subscribe webhook may reactivate an
    -- unsubscribed (never suppressed) contact.
    final_outbox_state := 'terminal';
    final_sync_state := 'blocked';
    final_error := case
      when contact_row.status = 'suppressed' then 'provider_subscribed_local_suppression'
      else 'provider_subscribed_local_opt_out'
    end;
  elsif target_provider_status = 'pending' then
    -- The provider API call is complete, but a pending member is not yet
    -- marketable.  Preserve that distinction until a signed subscribe event
    -- enqueues the normal post-confirmation upsert.
    final_sync_state := 'pending';
    final_error := case
      when outbox_row.sync_action = 'reconfirm'
        then 'provider_reconfirmation_pending'
      else 'provider_confirmation_pending'
    end;
  elsif target_provider_status in ('unknown', 'transactional', 'archived') then
    final_outbox_state := 'terminal';
    final_sync_state := 'blocked';
    final_error := 'provider_status_not_marketable';
  end if;

  if coalesce(target_welcome_enrolled, false)
     and target_provider_status = 'subscribed'
     and contact_row.status = 'subscribed'
     and contact_row.marketing_consent = true then
    update public.marketing_contact_provider_state
    set welcome_enrolled_at = coalesce(welcome_enrolled_at, now())
    where contact_id = target_contact_id
      and welcome_eligible_at is not null
    returning welcome_enrolled_at is not null into welcome_was_enrolled;
  end if;

  update public.marketing_contact_provider_state
  set provider_status = target_provider_status,
      provider_member_hash = member_hash,
      sync_state = final_sync_state,
      last_synced_at = now(),
      last_error_code = final_error
  where contact_id = target_contact_id;

  update public.marketing_sync_outbox
  set state = final_outbox_state,
      completed_at = now(),
      completed_provider_status = target_provider_status,
      last_error_code = final_error
  where id = outbox_row.id;

  return jsonb_build_object(
    'completed', final_outbox_state = 'completed',
    'duplicate', false,
    'contact_id', target_contact_id,
    'outbox_id', outbox_row.id,
    'outbox_state', final_outbox_state,
    'provider_status', target_provider_status,
    'contact_status', contact_row.status,
    'marketing_consent', contact_row.marketing_consent,
    'welcome_enrolled', welcome_was_enrolled,
    'error_code', final_error
  );
end
$$;

revoke all on function public.complete_marketing_contact_sync(uuid, text, text, boolean, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_marketing_contact_sync(uuid, text, text, boolean, uuid, uuid)
  to service_role;

create or replace function public.fail_marketing_contact_sync(
  target_contact_id uuid,
  target_error_code text,
  target_retry_after_seconds integer,
  target_terminal boolean,
  target_outbox_id uuid default null,
  target_claim_token uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  outbox_row public.marketing_sync_outbox%rowtype;
  next_state text;
  retry_seconds integer;
  next_attempt_at timestamptz;
begin
  if target_outbox_id is null or target_claim_token is null then
    raise exception using errcode = '22023', message = 'marketing_sync_claim_identity_required';
  end if;

  if target_error_code !~ '^[a-z][a-z0-9_:-]{0,79}$' then
    raise exception using errcode = '22023', message = 'invalid_marketing_sync_error_code';
  end if;

  select * into outbox_row
  from public.marketing_sync_outbox
  where id = target_outbox_id
    and contact_id = target_contact_id
    and claim_token = target_claim_token
    and state = 'processing'
  for update;

  if not found then
    return coalesce((
      select jsonb_build_object(
        'failed', state in ('retry', 'terminal'),
        'duplicate', true,
        'contact_id', target_contact_id,
        'outbox_state', state,
        'attempt_count', attempt_count,
        'next_attempt_at', case when state = 'retry' then available_at else null end
      )
      from public.marketing_sync_outbox
      where id = target_outbox_id
        and contact_id = target_contact_id
        and claim_token = target_claim_token
    ), jsonb_build_object(
      'failed', false,
      'duplicate', true,
      'contact_id', target_contact_id,
      'outbox_state', 'missing'
    ));
  end if;

  if coalesce(target_terminal, false) or outbox_row.attempt_count >= 8 then
    next_state := 'terminal';
    next_attempt_at := null;
  else
    next_state := 'retry';
    retry_seconds := case
      when target_retry_after_seconds is not null
        then least(greatest(target_retry_after_seconds, 30), 86400)
      else least(3600, (30 * power(2, greatest(outbox_row.attempt_count - 1, 0)))::integer)
    end;
    next_attempt_at := now() + make_interval(secs => retry_seconds);
  end if;

  update public.marketing_sync_outbox
  set state = next_state,
      available_at = coalesce(next_attempt_at, available_at),
      claimed_at = null,
      completed_at = case when next_state = 'terminal' then now() else null end,
      last_error_code = target_error_code
  where id = outbox_row.id;

  update public.marketing_contact_provider_state
  set sync_state = case when next_state = 'terminal' then 'blocked' else 'retry' end,
      last_error_code = target_error_code
  where contact_id = target_contact_id;

  return jsonb_build_object(
    'failed', true,
    'duplicate', false,
    'contact_id', target_contact_id,
    'outbox_id', outbox_row.id,
    'outbox_state', next_state,
    'attempt_count', outbox_row.attempt_count,
    'next_attempt_at', next_attempt_at,
    'error_code', target_error_code
  );
end
$$;

revoke all on function public.fail_marketing_contact_sync(uuid, text, integer, boolean, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.fail_marketing_contact_sync(uuid, text, integer, boolean, uuid, uuid)
  to service_role;

create or replace function public.reconcile_marketing_provider_event(
  target_event_key text,
  target_email_hash text,
  target_provider_status text,
  target_event_type text,
  target_occurred_at timestamptz,
  target_old_email_hash text default null,
  target_email text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  provider_event public.marketing_provider_events%rowtype;
  contact_row public.marketing_contacts%rowtype;
  old_contact_id uuid;
  new_contact_id uuid;
  normalized_email text;
  computed_hash text;
  member_hash text;
  effective_provider_status text;
  durable_provider_status text;
  durable_status_event_at timestamptz;
  durable_identity_event_at timestamptz;
  apply_upemail_change boolean := false;
  replaying_event boolean := false;
  reconfirm_evidence boolean := false;
  replay_event record;
  v_quarantine_reason text;
  queued boolean := false;
begin
  if target_event_key !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$' then
    raise exception using errcode = '22023', message = 'invalid_marketing_provider_event_key';
  end if;
  if target_email_hash !~ '^[0-9a-f]{64}$'
     or (target_old_email_hash is not null and target_old_email_hash !~ '^[0-9a-f]{64}$') then
    raise exception using errcode = '22023', message = 'invalid_marketing_provider_email_hash';
  end if;
  if target_provider_status not in (
    'unknown', 'pending', 'subscribed', 'unsubscribed', 'cleaned',
    'complained', 'transactional', 'archived', 'unchanged'
  ) then
    raise exception using errcode = '22023', message = 'invalid_marketing_provider_status';
  end if;
  if target_event_type !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception using errcode = '22023', message = 'invalid_marketing_provider_event_type';
  end if;
  if target_occurred_at is null or target_occurred_at > now() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'invalid_marketing_provider_event_time';
  end if;

  select * into provider_event
  from public.marketing_provider_events
  where event_key = target_event_key
  for update;

  if found then
    if provider_event.email_hash <> target_email_hash
       or provider_event.old_email_hash is distinct from target_old_email_hash
       or provider_event.provider_status <> target_provider_status
       or provider_event.event_type <> target_event_type
       or provider_event.occurred_at <> target_occurred_at then
      update public.marketing_provider_events
      set processing_status = 'quarantined',
          quarantine_reason = 'event_key_payload_conflict',
          processed_at = now()
      where id = provider_event.id;

      return jsonb_build_object(
        'processed', false,
        'duplicate', true,
        'processing_status', 'quarantined',
        'reason', 'event_key_payload_conflict'
      );
    end if;

    if provider_event.processing_status = 'quarantined'
       and provider_event.quarantine_reason = 'contact_not_found'
       and provider_event.event_type <> 'upemail' then
      replaying_event := true;
      update public.marketing_provider_events
      set processing_status = 'received',
          quarantine_reason = null,
          processed_at = null
      where id = provider_event.id;
    else
      return jsonb_build_object(
        'processed', provider_event.processing_status = 'processed',
        'duplicate', true,
        'contact_id', provider_event.contact_id,
        'processing_status', provider_event.processing_status,
        'reason', provider_event.quarantine_reason
      );
    end if;
  end if;

  if not replaying_event then
    insert into public.marketing_provider_events (
      event_key,
      event_type,
      provider_status,
      email_hash,
      old_email_hash,
      occurred_at
    ) values (
      target_event_key,
      target_event_type,
      target_provider_status,
      target_email_hash,
      target_old_email_hash,
      target_occurred_at
    ) returning * into provider_event;
  end if;

  if target_email is not null then
    normalized_email := lower(btrim(target_email));
    computed_hash := public.marketing_email_hash(normalized_email);
    if char_length(normalized_email) not between 3 and 320
       or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       or computed_hash <> target_email_hash then
      v_quarantine_reason := 'upemail_hash_mismatch';
    else
      member_hash := encode(extensions.digest(normalized_email, 'md5'), 'hex');
    end if;
  elsif target_event_type = 'upemail' then
    v_quarantine_reason := 'upemail_missing_email';
  end if;

  if v_quarantine_reason is null and target_event_type = 'upemail' then
    if target_old_email_hash is null then
      v_quarantine_reason := 'upemail_missing_old_hash';
    else
      -- Resolve current or historical identities first, lock provider work, and
      -- only then lock contacts.  Completion uses the same outbox -> contact ->
      -- provider-state order, avoiding webhook/worker deadlocks.
      select alias.contact_id into old_contact_id
      from public.marketing_contact_email_aliases alias
      where alias.email_hash = target_old_email_hash;

      if old_contact_id is null then
        select id into old_contact_id
        from public.marketing_contacts
        where email_hash = target_old_email_hash;
      end if;

      select alias.contact_id into new_contact_id
      from public.marketing_contact_email_aliases alias
      where alias.email_hash = target_email_hash;

      if new_contact_id is null then
        select id into new_contact_id
        from public.marketing_contacts
        where email_hash = target_email_hash;
      end if;

      perform outbox.id
      from public.marketing_sync_outbox outbox
      where outbox.contact_id in (old_contact_id, new_contact_id)
        and outbox.state in ('pending', 'processing', 'retry')
      order by outbox.id
      for update;

      perform contact.id
      from public.marketing_contacts contact
      where contact.id in (old_contact_id, new_contact_id)
      order by contact.id
      for update;

      -- Re-resolve while the candidate contact rows are locked.  Alias updates
      -- are made by a trigger on those same rows.
      select alias.contact_id into old_contact_id
      from public.marketing_contact_email_aliases alias
      where alias.email_hash = target_old_email_hash;

      select alias.contact_id into new_contact_id
      from public.marketing_contact_email_aliases alias
      where alias.email_hash = target_email_hash;

      if old_contact_id is not null
         and new_contact_id is not null
         and old_contact_id <> new_contact_id then
        v_quarantine_reason := 'upemail_contact_collision';
      elsif old_contact_id is null and new_contact_id is null then
        v_quarantine_reason := 'contact_not_found';
      else
        select * into contact_row
        from public.marketing_contacts
        where id = coalesce(old_contact_id, new_contact_id);

        if old_contact_id is null and contact_row.email <> normalized_email then
          v_quarantine_reason := 'upemail_contact_collision';
          contact_row := null;
        else
          apply_upemail_change := contact_row.email <> normalized_email
            or contact_row.email_hash <> target_email_hash;
        end if;
      end if;
    end if;
  elsif v_quarantine_reason is null then
    select alias.contact_id into old_contact_id
    from public.marketing_contact_email_aliases alias
    where alias.email_hash = target_email_hash;

    if old_contact_id is null and target_old_email_hash is not null then
      select alias.contact_id into old_contact_id
      from public.marketing_contact_email_aliases alias
      where alias.email_hash = target_old_email_hash;
    end if;

    if old_contact_id is null then
      select id into old_contact_id
      from public.marketing_contacts
      where email_hash in (target_email_hash, coalesce(target_old_email_hash, target_email_hash))
      order by (email_hash = target_email_hash) desc
      limit 1;
    end if;

    if old_contact_id is null then
      v_quarantine_reason := 'contact_not_found';
    else
      perform outbox.id
      from public.marketing_sync_outbox outbox
      where outbox.contact_id = old_contact_id
        and outbox.state in ('pending', 'processing', 'retry')
      order by outbox.id
      for update;

      select * into contact_row
      from public.marketing_contacts
      where id = old_contact_id
      for update;
    end if;
  end if;

  if v_quarantine_reason is not null then
    update public.marketing_provider_events
    set contact_id = contact_row.id,
        processing_status = 'quarantined',
        quarantine_reason = v_quarantine_reason,
        processed_at = now()
    where id = provider_event.id;

    return jsonb_build_object(
      'processed', false,
      'duplicate', false,
      'contact_id', contact_row.id,
      'processing_status', 'quarantined',
      'reason', v_quarantine_reason
    );
  end if;

  -- Provider delivery is not ordered.  Status and identity have independent
  -- clocks: a newer profile/upemail must never hide an older unsubscribe, and a
  -- newer status event must not discard a delayed but valid identity change.
  select
    provider_status,
    last_status_event_at,
    last_identity_event_at
  into
    durable_provider_status,
    durable_status_event_at,
    durable_identity_event_at
  from public.marketing_contact_provider_state
  where contact_id = contact_row.id
  for update;

  if target_provider_status = 'unknown' then
    update public.marketing_provider_events
    set contact_id = contact_row.id,
        processing_status = 'ignored',
        quarantine_reason = 'unknown_provider_event',
        processed_at = now()
    where id = provider_event.id;

    return jsonb_build_object(
      'processed', false,
      'duplicate', replaying_event,
      'contact_id', contact_row.id,
      'processing_status', 'ignored',
      'reason', 'unknown_provider_event'
    );
  end if;

  if target_event_type = 'upemail'
     and durable_identity_event_at is not null
     and target_occurred_at < durable_identity_event_at then
    v_quarantine_reason := 'stale_identity_event';
  elsif target_provider_status <> 'unchanged'
        and durable_status_event_at is not null
        and (
          (
            target_occurred_at < durable_status_event_at
            and not (
              target_provider_status in ('cleaned', 'complained')
              and public.marketing_provider_status_rank(target_provider_status)
                > public.marketing_provider_status_rank(coalesce(durable_provider_status, 'unknown'))
            )
          )
          or (
            target_occurred_at = durable_status_event_at
            and public.marketing_provider_status_rank(target_provider_status)
              <= public.marketing_provider_status_rank(coalesce(durable_provider_status, 'unknown'))
          )
        ) then
    v_quarantine_reason := 'stale_status_event';
  end if;

  if v_quarantine_reason is not null then
    update public.marketing_provider_events
    set contact_id = contact_row.id,
        processing_status = 'ignored',
        quarantine_reason = v_quarantine_reason,
        processed_at = now()
    where id = provider_event.id;

    return jsonb_build_object(
      'processed', false,
      'duplicate', replaying_event,
      'contact_id', contact_row.id,
      'processing_status', 'ignored',
      'reason', v_quarantine_reason
    );
  end if;

  if apply_upemail_change then
    update public.marketing_contacts
    set email = normalized_email,
        email_hash = target_email_hash
    where id = contact_row.id
    returning * into contact_row;
  end if;

  if target_provider_status = 'unchanged' then
    effective_provider_status := coalesce(durable_provider_status, 'unknown');
  else
    effective_provider_status := target_provider_status;
  end if;

  insert into public.marketing_contact_provider_state (
    contact_id,
    provider_status,
    provider_member_hash,
    sync_state,
    welcome_idempotency_key,
    last_provider_event_at,
    last_status_event_at,
    last_identity_event_at
  ) values (
    contact_row.id,
    effective_provider_status,
    member_hash,
    'synced',
    'olw-launch-welcome-v1:' || contact_row.id::text,
    target_occurred_at,
    case when target_provider_status <> 'unchanged' then target_occurred_at else null end,
    case when target_event_type = 'upemail' then target_occurred_at else null end
  )
  on conflict (contact_id) do update
  set provider_status = excluded.provider_status,
      provider_member_hash = coalesce(excluded.provider_member_hash,
        public.marketing_contact_provider_state.provider_member_hash),
      last_provider_event_at = greatest(
        coalesce(public.marketing_contact_provider_state.last_provider_event_at, excluded.last_provider_event_at),
        excluded.last_provider_event_at
      ),
      last_status_event_at = case
        when target_provider_status = 'unchanged'
          then public.marketing_contact_provider_state.last_status_event_at
        else greatest(
          coalesce(public.marketing_contact_provider_state.last_status_event_at, excluded.last_status_event_at),
          excluded.last_status_event_at
        )
      end,
      last_identity_event_at = case
        when target_event_type <> 'upemail'
          then public.marketing_contact_provider_state.last_identity_event_at
        else greatest(
          coalesce(public.marketing_contact_provider_state.last_identity_event_at, excluded.last_identity_event_at),
          excluded.last_identity_event_at
        )
      end;

  if target_provider_status = 'unsubscribed' then
    update public.marketing_contacts
    set status = case when status = 'suppressed' then status else 'unsubscribed' end,
        marketing_consent = false,
        consent_revoked_at = coalesce(consent_revoked_at, target_occurred_at),
        suppression_reason = case
          when status = 'suppressed' then suppression_reason
          else 'mailchimp_unsubscribed'
        end
    where id = contact_row.id
    returning * into contact_row;

    update public.marketing_sync_outbox
    set state = 'canceled',
        completed_at = now(),
        last_error_code = 'provider_unsubscribed'
    where contact_id = contact_row.id
      and state in ('pending', 'processing', 'retry');

    update public.marketing_contact_provider_state
    set sync_state = 'synced',
        last_error_code = null
    where contact_id = contact_row.id;

    insert into public.marketing_consent_events (
      event_key, contact_id, event_type, consent_granted, effect_applied,
      consent_source, consent_version, occurred_at, attribution
    ) values (
      'provider:' || target_event_key,
      contact_row.id,
      'provider_revoked',
      false,
      true,
      'mailchimp_webhook',
      'provider-webhook-v1',
      target_occurred_at,
      '{}'::jsonb
    ) on conflict (event_key) do nothing;
  elsif target_provider_status in ('cleaned', 'complained') then
    update public.marketing_contacts
    set status = 'suppressed',
        marketing_consent = case
          when target_provider_status = 'complained' then false
          else marketing_consent
        end,
        consent_revoked_at = case
          when target_provider_status = 'complained'
            then coalesce(consent_revoked_at, target_occurred_at)
          else consent_revoked_at
        end,
        suppression_reason = case
          when target_provider_status = 'complained' then 'mailchimp_complaint'
          when suppression_reason = 'mailchimp_complaint' then suppression_reason
          else 'mailchimp_cleaned'
        end
    where id = contact_row.id
    returning * into contact_row;

    update public.marketing_sync_outbox
    set state = 'canceled',
        completed_at = now(),
        last_error_code = case
          when contact_row.suppression_reason = 'mailchimp_complaint' then 'provider_complaint'
          else 'provider_cleaned'
        end
    where contact_id = contact_row.id
      and state in ('pending', 'processing', 'retry');

    update public.marketing_contact_provider_state
    set sync_state = 'blocked',
        last_error_code = case
          when contact_row.suppression_reason = 'mailchimp_complaint' then 'provider_complaint'
          else 'provider_cleaned'
        end
    where contact_id = contact_row.id;

    insert into public.marketing_consent_events (
      event_key, contact_id, event_type, consent_granted, effect_applied,
      consent_source, consent_version, occurred_at, attribution
    ) values (
      'provider:' || target_event_key,
      contact_row.id,
      'provider_suppressed',
      contact_row.marketing_consent,
      true,
      'mailchimp_webhook',
      'provider-webhook-v1',
      target_occurred_at,
      '{}'::jsonb
    ) on conflict (event_key) do nothing;
  elsif target_provider_status = 'subscribed' then
    if contact_row.status = 'suppressed' then
      update public.marketing_contact_provider_state
      set sync_state = 'blocked',
          last_error_code = 'provider_subscribed_local_suppression'
      where contact_id = contact_row.id;
    elsif contact_row.status = 'unsubscribed' and target_event_type = 'subscribe' then
      -- A signed provider subscribe event is the confirmation boundary for an
      -- unsubscribed contact only when it follows a durable public reconfirm
      -- request and the matching provider job is in flight or reached pending.
      select exists (
        select 1
        from public.marketing_consent_events consent_event
        where consent_event.contact_id = contact_row.id
          and consent_event.event_type = 'signup_reconfirmation_requested'
          and consent_event.consent_granted = true
          and consent_event.occurred_at >= coalesce(contact_row.consent_revoked_at, '-infinity'::timestamptz)
          and exists (
            select 1
            from public.marketing_sync_outbox reconfirm_outbox
            where reconfirm_outbox.contact_id = contact_row.id
              and reconfirm_outbox.source_event_key = consent_event.event_key
              and reconfirm_outbox.sync_action = 'reconfirm'
              and (
                reconfirm_outbox.state = 'processing'
                or (
                  reconfirm_outbox.state = 'completed'
                  and reconfirm_outbox.completed_provider_status = 'pending'
                )
              )
          )
      ) into reconfirm_evidence;

      if reconfirm_evidence then
        perform set_config('olw.marketing_provider_reconfirmed', 'true', true);

        update public.marketing_contacts
        set status = 'subscribed',
            marketing_consent = true,
            consented_at = target_occurred_at,
            first_consented_at = coalesce(first_consented_at, target_occurred_at),
            consent_revoked_at = null,
            consent_source = 'mailchimp_reconfirmation',
            suppression_reason = null
        where id = contact_row.id
        returning * into contact_row;

        -- Limit the trigger escape hatch to the single verified transition even
        -- when an operator groups several RPC calls in one SQL transaction.
        perform set_config('olw.marketing_provider_reconfirmed', 'false', true);

        insert into public.marketing_consent_events (
          event_key, contact_id, event_type, consent_granted, effect_applied,
          consent_source, consent_version, occurred_at, attribution
        ) values (
          'provider:' || target_event_key,
          contact_row.id,
          'provider_reconfirmed',
          true,
          true,
          'mailchimp_reconfirmation',
          'provider-webhook-v1',
          target_occurred_at,
          '{}'::jsonb
        ) on conflict (event_key) do nothing;

        update public.marketing_contact_provider_state
        set welcome_eligible_at = coalesce(welcome_eligible_at, target_occurred_at),
            sync_state = 'pending',
            last_error_code = null
        where contact_id = contact_row.id;
      else
        update public.marketing_contact_provider_state
        set sync_state = 'blocked',
            last_error_code = 'subscribe_without_reconfirm_evidence'
        where contact_id = contact_row.id;
      end if;
    elsif contact_row.status = 'unsubscribed' then
      update public.marketing_contact_provider_state
      set sync_state = 'blocked',
          last_error_code = 'provider_subscribed_local_opt_out'
      where contact_id = contact_row.id;
    else
      update public.marketing_contact_provider_state
      set welcome_eligible_at = coalesce(welcome_eligible_at, contact_row.consented_at, target_occurred_at),
          sync_state = 'pending',
          last_error_code = null
      where contact_id = contact_row.id;
    end if;

    if contact_row.status = 'subscribed' and contact_row.marketing_consent = true then
      -- Replace a possibly in-flight reconfirm job.  Setting a Mailchimp tag is
      -- idempotent, and the stored welcome key plus a non-repeating journey
      -- prevents a second welcome enrollment.
      update public.marketing_sync_outbox
      set state = 'canceled',
          completed_at = now(),
          last_error_code = 'provider_event_superseded_job'
      where contact_id = contact_row.id
        and state in ('pending', 'processing', 'retry');

      queued := public.enqueue_marketing_contact_sync(
        contact_row.id,
        'provider:' || target_event_key,
        'upsert'
      );
    end if;
  elsif target_provider_status = 'pending' then
    update public.marketing_contact_provider_state
    set sync_state = 'synced',
        last_error_code = null
    where contact_id = contact_row.id;
  elsif target_provider_status in ('transactional', 'archived') then
    update public.marketing_contact_provider_state
    set sync_state = 'blocked',
        last_error_code = 'provider_status_not_marketable'
    where contact_id = contact_row.id;
  end if;

  update public.marketing_provider_events
  set contact_id = contact_row.id,
      processing_status = 'processed',
      quarantine_reason = null,
      processed_at = now()
  where id = provider_event.id;

  if target_event_type = 'upemail' and apply_upemail_change then
    -- A status event for Mailchimp's new address can arrive before upemail.  It
    -- was durably quarantined as contact_not_found; once the new alias exists,
    -- replay it in provider occurrence order so suppression cannot be lost.
    for replay_event in
      select pending_event.*
      from public.marketing_provider_events pending_event
      where pending_event.event_key <> target_event_key
        and pending_event.processing_status = 'quarantined'
        and pending_event.quarantine_reason = 'contact_not_found'
        and pending_event.event_type <> 'upemail'
        and exists (
          select 1
          from public.marketing_contact_email_aliases alias
          where alias.contact_id = contact_row.id
            and alias.email_hash in (
              pending_event.email_hash,
              coalesce(pending_event.old_email_hash, pending_event.email_hash)
            )
        )
      order by pending_event.occurred_at, pending_event.event_key
    loop
      perform public.reconcile_marketing_provider_event(
        replay_event.event_key,
        replay_event.email_hash,
        replay_event.provider_status,
        replay_event.event_type,
        replay_event.occurred_at,
        replay_event.old_email_hash,
        null
      );
    end loop;

    select * into contact_row
    from public.marketing_contacts
    where id = contact_row.id;
  end if;

  return jsonb_build_object(
    'processed', true,
    'duplicate', replaying_event,
    'contact_id', contact_row.id,
    'contact_status', contact_row.status,
    'marketing_consent', contact_row.marketing_consent,
    'provider_status', effective_provider_status,
    'sync_queued', queued,
    'processing_status', 'processed'
  );
end
$$;

revoke all on function public.reconcile_marketing_provider_event(text, text, text, text, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.reconcile_marketing_provider_event(text, text, text, text, timestamptz, text, text)
  to service_role;

create or replace function public.marketing_sync_health()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'contacts_total', (select count(*) from public.marketing_contacts),
    'contacts_active', (
      select count(*) from public.marketing_contacts
      where status = 'subscribed' and marketing_consent = true
    ),
    'contacts_unsubscribed', (
      select count(*) from public.marketing_contacts where status = 'unsubscribed'
    ),
    'contacts_suppressed', (
      select count(*) from public.marketing_contacts where status = 'suppressed'
    ),
    'outbox_pending', (
      select count(*) from public.marketing_sync_outbox where state = 'pending'
    ),
    'outbox_retry', (
      select count(*) from public.marketing_sync_outbox where state = 'retry'
    ),
    'outbox_processing', (
      select count(*) from public.marketing_sync_outbox where state = 'processing'
    ),
    'outbox_terminal', (
      select count(*) from public.marketing_sync_outbox where state = 'terminal'
    ),
    'dead_letter_count', (
      select count(*) from public.marketing_sync_outbox where state = 'terminal'
    ),
    'stale_processing', (
      select count(*) from public.marketing_sync_outbox
      where state = 'processing' and claimed_at < now() - interval '15 minutes'
    ),
    'oldest_due_at', (
      select min(available_at) from public.marketing_sync_outbox
      where state in ('pending', 'retry')
    ),
    'oldest_pending_at', (
      select min(available_at) from public.marketing_sync_outbox
      where state in ('pending', 'retry')
    ),
    'last_completed_at', (
      select max(completed_at) from public.marketing_sync_outbox
      where state = 'completed'
    ),
    'provider_blocked', (
      select count(*) from public.marketing_contact_provider_state where sync_state = 'blocked'
    ),
    'provider_confirmation_pending_count', (
      select count(*)
      from public.marketing_contact_provider_state
      where sync_state = 'pending'
        and last_error_code = 'provider_confirmation_pending'
    ),
    'provider_reconfirmation_pending_count', (
      select count(*)
      from public.marketing_contact_provider_state
      where sync_state = 'pending'
        and last_error_code = 'provider_reconfirmation_pending'
    ),
    'provider_pending_confirmation_total', (
      select count(*)
      from public.marketing_contact_provider_state
      where sync_state = 'pending'
        and last_error_code in (
          'provider_confirmation_pending',
          'provider_reconfirmation_pending'
        )
    ),
    'blocked_count', (
      select count(*) from public.marketing_contact_provider_state where sync_state = 'blocked'
    ),
    'provider_quarantined_events', (
      select count(*) from public.marketing_provider_events where processing_status = 'quarantined'
    ),
    'dispatch_queued', (
      select count(*) from public.marketing_sync_dispatch_runs where status = 'queued'
    ),
    'dispatch_failed_24h', (
      select count(*) from public.marketing_sync_dispatch_runs
      where status in ('failed', 'timed_out')
        and dispatched_at >= now() - interval '24 hours'
    ),
    'last_dispatch_at', (
      select max(dispatched_at) from public.marketing_sync_dispatch_runs
    ),
    'eligible_not_enrolled', (
      select count(*)
      from public.marketing_contact_provider_state provider_state
      join public.marketing_contacts contact on contact.id = provider_state.contact_id
      where contact.status = 'subscribed'
        and contact.marketing_consent = true
        and provider_state.welcome_eligible_at is not null
        and provider_state.welcome_enrolled_at is null
    ),
    'measured_at', now()
  );
$$;

revoke all on function public.marketing_sync_health()
  from public, anon, authenticated;
grant execute on function public.marketing_sync_health() to service_role;

-- Backfill only rows with durable, explicit, currently-active consent.  The
-- provider status remains unknown until the worker reads Mailchimp; `pending`
-- here refers to synchronization, not Mailchimp's double-opt-in member status.
insert into public.marketing_consent_events (
  event_key,
  contact_id,
  event_type,
  consent_granted,
  effect_applied,
  consent_source,
  consent_version,
  occurred_at,
  attribution
)
select
  'legacy-backfill-v1:' || contact.id::text,
  contact.id,
  'legacy_consent_backfill',
  true,
  true,
  case
    when contact.consent_source ~ '^[a-z][a-z0-9_:-]{1,79}$'
      then contact.consent_source
    else 'legacy_web_signup'
  end,
  'legacy-v1',
  coalesce(contact.consented_at, contact.created_at),
  public.sanitize_marketing_attribution(contact.attribution)
from public.marketing_contacts contact
where contact.status = 'subscribed'
  and contact.marketing_consent = true
  and contact.consented_at is not null
on conflict (event_key) do nothing;

insert into public.marketing_contact_provider_state (
  contact_id,
  provider_status,
  sync_state,
  welcome_idempotency_key,
  welcome_eligible_at
)
select
  contact.id,
  'unknown',
  'pending',
  'olw-launch-welcome-v1:' || contact.id::text,
  coalesce(contact.first_consented_at, contact.consented_at, contact.created_at)
from public.marketing_contacts contact
where contact.status = 'subscribed'
  and contact.marketing_consent = true
  and contact.consented_at is not null
on conflict (contact_id) do update
set welcome_eligible_at = coalesce(
      public.marketing_contact_provider_state.welcome_eligible_at,
      excluded.welcome_eligible_at
    );

insert into public.marketing_sync_outbox (
  contact_id,
  idempotency_key,
  source_event_key,
  sync_action,
  state,
  available_at
)
select
  contact.id,
  'marketing-sync-v1:' || encode(
    extensions.digest('upsert:legacy-backfill-v1:' || contact.id::text, 'sha256'),
    'hex'
  ),
  'legacy-backfill-v1:' || contact.id::text,
  'upsert',
  'pending',
  now()
from public.marketing_contacts contact
where contact.status = 'subscribed'
  and contact.marketing_consent = true
  and contact.consented_at is not null
  and not exists (
    select 1 from public.marketing_sync_outbox existing_outbox
    where existing_outbox.contact_id = contact.id
      and existing_outbox.state in ('pending', 'processing', 'retry')
  )
on conflict (idempotency_key) do nothing;

-- No table has a public policy.  New provider/consent tables are RPC-only.
alter table public.marketing_consent_events enable row level security;
alter table public.marketing_contact_provider_state enable row level security;
alter table public.marketing_sync_outbox enable row level security;
alter table public.marketing_provider_events enable row level security;
alter table public.marketing_contact_email_aliases enable row level security;
alter table public.marketing_signup_rate_limits enable row level security;
alter table public.marketing_sync_dispatch_runs enable row level security;

revoke all on table public.marketing_consent_events
  from public, anon, authenticated, service_role;
revoke all on table public.marketing_contact_provider_state
  from public, anon, authenticated, service_role;
revoke all on table public.marketing_sync_outbox
  from public, anon, authenticated, service_role;
revoke all on table public.marketing_provider_events
  from public, anon, authenticated, service_role;
revoke all on table public.marketing_contact_email_aliases
  from public, anon, authenticated, service_role;
revoke all on table public.marketing_signup_rate_limits
  from public, anon, authenticated, service_role;
revoke all on table public.marketing_sync_dispatch_runs
  from public, anon, authenticated, service_role;

-- Phase-one rollout compatibility: the currently deployed launch function uses
-- a service-role PostgREST upsert.  Retain only SELECT/INSERT/UPDATE until the
-- RPC-based Edge functions are deployed and verified; a follow-up hardening
-- migration revokes these grants.  The identity trigger already prevents that
-- legacy path from undoing an unsubscribe or suppression.
revoke all on table public.marketing_contacts
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.marketing_contacts to service_role;

comment on table public.marketing_consent_events is
  'Append-only evidence of marketing consent, revocation, reconfirmation, and suppression. Never infer consent from commerce or product access.';
comment on table public.marketing_contact_provider_state is
  'Mailchimp delivery state and exactly-once local welcome enrollment for one canonical marketing contact.';
comment on table public.marketing_sync_outbox is
  'Retryable marketing-provider work only. Transactional gift messages use transactional_email_outbox instead.';
comment on table public.marketing_provider_events is
  'Deduplicated Mailchimp webhook ledger. Email-change collisions are quarantined instead of merging contacts.';
comment on table public.marketing_contact_email_aliases is
  'Canonical and historical SHA-256 email identities used to resolve delayed provider events after upemail changes.';
comment on table public.marketing_signup_rate_limits is
  'Short-lived signup rate-limit buckets keyed only by a one-way request digest; never store a raw IP or email here.';
comment on table public.marketing_sync_dispatch_runs is
  'PII-free pg_net dispatch ledger reconciled by the owner-only website operational evaluator.';
comment on function public.record_marketing_signup(text, text, text, jsonb, text, text) is
  'Atomically records explicit signup consent, preserves opt-outs/suppression, and coalesces one provider sync job.';
comment on function public.claim_marketing_contact_sync(integer, uuid) is
  'Claims due marketing sync work generically or for one contact using FOR UPDATE SKIP LOCKED.';
comment on function public.reconcile_marketing_provider_event(text, text, text, text, timestamptz, text, text) is
  'Deduplicates provider events, reconciles consent/deliverability, and safely handles Mailchimp upemail changes.';

-- The token is generated inside Postgres and remains encrypted in Vault.  It is
-- not embedded in the migration, cron.job, repository, or Edge environment.
do $$
begin
  if not exists (
    select 1
    from vault.secrets
    where name = 'our-little-world-marketing-sync-worker-v1'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'our-little-world-marketing-sync-worker-v1',
      'Generated HMAC signing secret for pg_cron to invoke the OLW Mailchimp sync Edge function.'
    );
  end if;
end
$$;

create or replace function public.constant_time_bytea_equal(left_value bytea, right_value bytea)
returns boolean
language plpgsql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
declare
  difference integer := 0;
begin
  if length(left_value) <> length(right_value) then
    return false;
  end if;

  if length(left_value) = 0 then
    return true;
  end if;

  for index_value in 0..length(left_value) - 1 loop
    difference := difference |
      (get_byte(left_value, index_value) # get_byte(right_value, index_value));
  end loop;

  return difference = 0;
end
$$;

revoke all on function public.constant_time_bytea_equal(bytea, bytea)
  from public, anon, authenticated, service_role;

create or replace function public.verify_marketing_sync_worker_token(target_token text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  expected_token text;
  token_parts text[];
  issued_at bigint;
  signed_payload text;
begin
  token_parts := regexp_match(
    coalesce(target_token, ''),
    '^([0-9]{10})\.([0-9a-f]{32})\.([0-9a-f]{64})$'
  );

  if token_parts is null then
    return false;
  end if;

  issued_at := token_parts[1]::bigint;
  if abs(extract(epoch from now())::bigint - issued_at) > 300 then
    return false;
  end if;

  select decrypted_secret into expected_token
  from vault.decrypted_secrets
  where name = 'our-little-world-marketing-sync-worker-v1'
  limit 1;

  if expected_token is null then
    return false;
  end if;

  signed_payload := token_parts[1] || '.' || token_parts[2];

  return public.constant_time_bytea_equal(
    decode(token_parts[3], 'hex'),
    extensions.hmac(signed_payload, expected_token, 'sha256')
  );
end
$$;

revoke all on function public.verify_marketing_sync_worker_token(text)
  from public, anon, authenticated;
grant execute on function public.verify_marketing_sync_worker_token(text)
  to service_role;

-- Cron calls this owner-only dispatcher.  pg_net receives only a five-minute
-- HMAC request token; the Vault secret itself is never placed in cron.job, the
-- request queue, the repository, or Edge configuration.  The Edge function
-- must call verify_marketing_sync_worker_token using its service-role client
-- before claiming any rows.
create or replace function public.dispatch_marketing_contact_sync()
returns bigint
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  worker_token text;
  issued_at text;
  request_nonce text;
  signed_payload text;
  request_token text;
  queued_request_id bigint;
begin
  select decrypted_secret into worker_token
  from vault.decrypted_secrets
  where name = 'our-little-world-marketing-sync-worker-v1'
  limit 1;

  if worker_token is null then
    raise exception using errcode = '55000', message = 'marketing_sync_worker_token_missing';
  end if;

  delete from public.marketing_signup_rate_limits
  where expires_at < now();

  delete from public.marketing_sync_dispatch_runs
  where dispatched_at < now() - interval '7 days';

  issued_at := floor(extract(epoch from clock_timestamp()))::bigint::text;
  request_nonce := encode(extensions.gen_random_bytes(16), 'hex');
  signed_payload := issued_at || '.' || request_nonce;
  request_token := signed_payload || '.' || encode(
    extensions.hmac(signed_payload, worker_token, 'sha256'),
    'hex'
  );

  select net.http_post(
    url := 'https://baxgullapuksjbzkogii.supabase.co/functions/v1/sync-marketing-contacts',
    body := jsonb_build_object('source', 'pg_cron', 'batch_size', 2),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-olw-worker-secret', request_token
    ),
    timeout_milliseconds := 60000
  ) into queued_request_id;

  insert into public.marketing_sync_dispatch_runs (request_id, status, dispatched_at)
  values (queued_request_id, 'queued', now());

  return queued_request_id;
end
$$;

revoke all on function public.dispatch_marketing_contact_sync()
  from public, anon, authenticated, service_role;

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'our-little-world-marketing-contact-sync';

  perform cron.schedule(
    'our-little-world-marketing-contact-sync',
    '*/5 * * * *',
    $schedule$select public.dispatch_marketing_contact_sync();$schedule$
  );
end
$$;
