-- Production orchestration for the privacy-safe lifecycle exporter plus a
-- service-role-only contact readback that never returns an email or contact ID.

create table if not exists public.marketing_measurement_dispatch_runs (
  request_id bigint primary key,
  dispatched_at timestamptz not null default now()
);

alter table public.marketing_measurement_dispatch_runs enable row level security;
revoke all on table public.marketing_measurement_dispatch_runs
  from public, anon, authenticated;
grant select, insert, delete on table public.marketing_measurement_dispatch_runs
  to service_role;

create or replace function public.dispatch_marketing_measurement_export()
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

  delete from public.marketing_measurement_dispatch_runs
  where dispatched_at < now() - interval '7 days';

  issued_at := floor(extract(epoch from clock_timestamp()))::bigint::text;
  request_nonce := encode(extensions.gen_random_bytes(16), 'hex');
  signed_payload := issued_at || '.' || request_nonce;
  request_token := signed_payload || '.' || encode(
    extensions.hmac(signed_payload, worker_token, 'sha256'),
    'hex'
  );

  select net.http_post(
    url := 'https://baxgullapuksjbzkogii.supabase.co/functions/v1/export-lifecycle-events',
    body := jsonb_build_object('source', 'pg_cron', 'batch_size', 20),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-olw-worker-secret', request_token
    ),
    timeout_milliseconds := 60000
  ) into queued_request_id;

  insert into public.marketing_measurement_dispatch_runs (request_id, dispatched_at)
  values (queued_request_id, now());

  return queued_request_id;
end
$$;

revoke all on function public.dispatch_marketing_measurement_export()
  from public, anon, authenticated, service_role;

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'our-little-world-lifecycle-measurement-export';

  perform cron.schedule(
    'our-little-world-lifecycle-measurement-export',
    '*/5 * * * *',
    $schedule$select public.dispatch_marketing_measurement_export();$schedule$
  );
end
$$;

create or replace function public.marketing_lifecycle_contact_health(target_email_hash text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with selected_contact as (
    select contact.id
    from public.marketing_contacts contact
    where contact.email_hash = target_email_hash
    limit 1
  ), provider as (
    select
      state.provider_status,
      state.sync_state,
      state.audience_id = '333fbdbba0' as lifecycle_audience_matches
    from public.marketing_contact_provider_state state
    join selected_contact on selected_contact.id = state.contact_id
  ), lifecycle as (
    select
      state.lifecycle_state,
      state.activated_at is not null as activated,
      state.converted_at is not null as converted
    from public.marketing_lifecycle_contact_state state
    join selected_contact on selected_contact.id = state.contact_id
  ), event_groups as (
    select jsonb_agg(jsonb_build_object(
      'event_name', grouped.event_name,
      'lifecycle_state', grouped.lifecycle_state,
      'delivery_state', grouped.delivery_state,
      'count', grouped.event_count
    ) order by grouped.event_name, grouped.delivery_state) as events
    from (
      select event.event_name, event.lifecycle_state, event.delivery_state, count(*) as event_count
      from public.marketing_lifecycle_events event
      join selected_contact on selected_contact.id = event.contact_id
      group by event.event_name, event.lifecycle_state, event.delivery_state
    ) grouped
  )
  select jsonb_build_object(
    'contact_found', exists(select 1 from selected_contact),
    'provider_status', (select provider_status from provider),
    'provider_sync_state', (select sync_state from provider),
    'lifecycle_audience_matches', coalesce((select lifecycle_audience_matches from provider), false),
    'lifecycle_state', (select lifecycle_state from lifecycle),
    'activated', coalesce((select activated from lifecycle), false),
    'converted', coalesce((select converted from lifecycle), false),
    'events', coalesce((select events from event_groups), '[]'::jsonb)
  );
$$;

revoke all on function public.marketing_lifecycle_contact_health(text)
  from public, anon, authenticated;
grant execute on function public.marketing_lifecycle_contact_health(text)
  to service_role;
