-- Privacy-minimized client error telemetry for the public marketing website.
-- No message text, stack trace, query string, IP address, email, or browser ID
-- is accepted or stored. Vercel remains the server-runtime log source.

create table if not exists public.website_operational_events (
  id                    bigint generated always as identity primary key,
  event_type            text not null check (event_type in (
    'client_error', 'unhandled_rejection', 'resource_error',
    'form_submit', 'form_success', 'form_error'
  )),
  path                  text not null,
  source_path           text not null default '',
  error_name            text not null,
  line_bucket           integer not null default 0 check (line_bucket between 0 and 100000),
  fingerprint           text not null,
  release               text not null default '',
  occurred_at           timestamptz not null default now(),
  check (path in (
    '/', '/story/', '/pricing/', '/gift/',
    '/for/unfinished-baby-book/', '/privacy/', '/terms/', '/refunds/',
    '/email-preferences/', '/checkout/', '/checkout/success/',
    '/checkout/gift-success/', '/partners/', '/api/health/', '/other/'
  )),
  check (source_path in (
    '', '/_next/static/*', '/assets/*', '/assets/brand/*',
    '/favicon.ico', '/apple-touch-icon.png', '/manifest.webmanifest',
    '/other-resource'
  )),
  check (error_name in (
    'Error', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError',
    'TypeError', 'URIError', 'AggregateError', 'DOMException',
    'AbortError', 'NetworkError', 'NotAllowedError', 'SecurityError',
    'PromiseRejection', 'UnknownError', 'OtherError',
    'IMG', 'SCRIPT', 'LINK', 'LaunchSignup'
  )),
  check (fingerprint ~ '^[a-f0-9]{64}$'),
  check (release = '' or release ~ '^[a-f0-9]{7,40}$')
);

create index if not exists website_operational_events_occurred_idx
  on public.website_operational_events (occurred_at desc);
create index if not exists website_operational_events_fingerprint_idx
  on public.website_operational_events (fingerprint, occurred_at desc);

alter table public.website_operational_events enable row level security;
revoke all on table public.website_operational_events from public, anon, authenticated;

comment on table public.website_operational_events is
  'Strictly minimized public-site error signals. Never store messages, stacks, URLs with queries, IPs, emails, or user identifiers.';

create or replace function public.record_website_operational_event(
  target_event_type text,
  target_path text,
  target_source_path text,
  target_error_name text,
  target_line_bucket integer,
  target_fingerprint text,
  target_release text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  safe_path text;
  safe_source_path text;
  safe_error_name text;
  safe_release text;
begin
  if target_event_type not in (
    'client_error', 'unhandled_rejection', 'resource_error',
    'form_submit', 'form_success', 'form_error'
  )
     or target_path !~ '^/[A-Za-z0-9._~!$&''()*+,;=:@%/-]*$'
     or (coalesce(target_source_path, '') <> '' and target_source_path !~ '^/[A-Za-z0-9._~!$&''()*+,;=:@%/-]*$')
     or target_error_name !~ '^[A-Za-z0-9_.:-]{1,80}$'
     or target_fingerprint !~ '^[a-f0-9]{64}$'
     or (coalesce(target_release, '') <> '' and target_release !~ '^[A-Za-z0-9_.:-]{1,80}$') then
    raise exception 'Invalid operational event';
  end if;

  -- Bucket every browser-supplied string before storage. Even a syntactically
  -- safe pathname or Error.name may contain a user-derived slug/name.
  safe_path := case regexp_replace(target_path, '/+$', '')
    when '' then '/'
    when '/story' then '/story/'
    when '/pricing' then '/pricing/'
    when '/gift' then '/gift/'
    when '/for/unfinished-baby-book' then '/for/unfinished-baby-book/'
    when '/privacy' then '/privacy/'
    when '/terms' then '/terms/'
    when '/refunds' then '/refunds/'
    when '/email-preferences' then '/email-preferences/'
    when '/checkout' then '/checkout/'
    when '/checkout/success' then '/checkout/success/'
    when '/checkout/gift-success' then '/checkout/gift-success/'
    when '/partners' then '/partners/'
    when '/api/health' then '/api/health/'
    else '/other/'
  end;

  safe_source_path := case
    when coalesce(target_source_path, '') = '' then ''
    when target_source_path like '/_next/static/%' then '/_next/static/*'
    when target_source_path like '/assets/brand/%' then '/assets/brand/*'
    when target_source_path like '/assets/%' then '/assets/*'
    when target_source_path in (
      '/favicon.ico', '/apple-touch-icon.png', '/manifest.webmanifest'
    ) then target_source_path
    else '/other-resource'
  end;

  safe_error_name := case
    when target_event_type in ('form_submit', 'form_success', 'form_error') then
      'LaunchSignup'
    when target_event_type = 'resource_error' and upper(target_error_name) in (
      'IMG', 'SCRIPT', 'LINK'
    ) then upper(target_error_name)
    when target_error_name in (
      'Error', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError',
      'TypeError', 'URIError', 'AggregateError', 'DOMException',
      'AbortError', 'NetworkError', 'NotAllowedError', 'SecurityError',
      'PromiseRejection', 'UnknownError'
    ) then target_error_name
    else 'OtherError'
  end;

  safe_release := case
    when lower(coalesce(target_release, '')) ~ '^[a-f0-9]{7,40}$'
      then lower(target_release)
    else ''
  end;

  insert into public.website_operational_events (
    event_type,
    path,
    source_path,
    error_name,
    line_bucket,
    fingerprint,
    release
  ) values (
    target_event_type,
    safe_path,
    safe_source_path,
    safe_error_name,
    least(greatest(coalesce(target_line_bucket, 0), 0), 100000),
    target_fingerprint,
    safe_release
  );
end
$$;

revoke all on function public.record_website_operational_event(text, text, text, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.record_website_operational_event(text, text, text, text, integer, text, text)
  to service_role;

create or replace function public.website_operational_health()
returns table (
  events_last_hour bigint,
  events_last_day bigint,
  distinct_errors_last_day bigint,
  form_attempts_last_day bigint,
  form_successes_last_day bigint,
  form_failures_last_day bigint,
  form_failure_rate_last_day numeric,
  latest_event_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    count(*) filter (where occurred_at >= now() - interval '1 hour'),
    count(*) filter (where occurred_at >= now() - interval '1 day'),
    count(distinct fingerprint) filter (
      where occurred_at >= now() - interval '1 day'
        and event_type in ('client_error', 'unhandled_rejection', 'resource_error', 'form_error')
    ),
    count(*) filter (where occurred_at >= now() - interval '1 day' and event_type = 'form_submit'),
    count(*) filter (where occurred_at >= now() - interval '1 day' and event_type = 'form_success'),
    count(*) filter (where occurred_at >= now() - interval '1 day' and event_type = 'form_error'),
    case
      when count(*) filter (where occurred_at >= now() - interval '1 day' and event_type = 'form_submit') = 0
        then 0::numeric
      else round(
        count(*) filter (where occurred_at >= now() - interval '1 day' and event_type = 'form_error')::numeric
        / count(*) filter (where occurred_at >= now() - interval '1 day' and event_type = 'form_submit'),
        4
      )
    end,
    max(occurred_at)
  from public.website_operational_events
$$;

revoke all on function public.website_operational_health() from public, anon, authenticated;
grant execute on function public.website_operational_health() to service_role;

-- Keep enough history for incident comparison without building a permanent
-- visitor-level log. The job is additive and safe to recreate.
do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'olw-prune-website-operational-events' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'olw-prune-website-operational-events',
    '17 4 * * *',
    $job$delete from public.website_operational_events where occurred_at < now() - interval '30 days'$job$
  );
end
$$;

-- Scheduled route checks keep only an opaque pg_net request ID, an allowlisted
-- target code, a coarse result, and timestamps. The checked URL, response
-- headers/body, and transport error text are deliberately not persisted here.
create table if not exists public.website_route_health_runs (
  request_id      bigint primary key check (request_id > 0),
  target_code     text not null check (target_code in (
    'website_health', 'launch_signup_health'
  )),
  status          text not null default 'queued' check (status in (
    'queued', 'succeeded', 'failed', 'timed_out'
  )),
  status_code     integer check (status_code is null or status_code between 100 and 599),
  error_code      text check (error_code is null or error_code ~ '^[a-z][a-z0-9_:-]{0,79}$'),
  dispatched_at   timestamptz not null default now(),
  completed_at    timestamptz,
  check (status = 'queued' or completed_at is not null)
);

create index if not exists website_route_health_runs_target_idx
  on public.website_route_health_runs (target_code, dispatched_at desc);
create index if not exists website_route_health_runs_status_idx
  on public.website_route_health_runs (status, dispatched_at desc);

-- The singleton supplies a deployment grace period, avoiding a false "missing"
-- alert before the first cron invocation has had a chance to complete.
create table if not exists public.website_operational_monitoring_state (
  singleton           boolean primary key default true check (singleton),
  installed_at        timestamptz not null default now(),
  last_evaluated_at   timestamptz
);

insert into public.website_operational_monitoring_state (singleton)
values (true)
on conflict (singleton) do nothing;

-- Alert rows contain a fixed code plus aggregate counters only. In particular,
-- there is no arbitrary message/detail column into which PII can leak.
create table if not exists public.website_operational_alerts (
  alert_code          text primary key check (alert_code in (
    'website_health_route_failed',
    'website_health_route_stale',
    'launch_signup_health_route_failed',
    'launch_signup_health_route_stale',
    'marketing_dispatch_failed',
    'marketing_dispatch_missing',
    'marketing_sync_cron_failed',
    'marketing_sync_cron_missing',
    'marketing_outbox_terminal',
    'marketing_outbox_overdue',
    'marketing_outbox_stale_processing',
    'marketing_provider_confirmation_pending',
    'marketing_provider_reconfirmation_pending',
    'website_form_failure_rate',
    'website_client_error_volume'
  )),
  scope_code          text not null check (scope_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  severity            text not null check (severity in ('warning', 'critical')),
  status              text not null check (status in ('open', 'resolved')),
  detail_code         text not null check (detail_code ~ '^[a-z][a-z0-9_:-]{0,79}$'),
  observed_count      bigint not null default 0 check (observed_count >= 0),
  sample_count        bigint not null default 0 check (sample_count >= 0),
  threshold_count     bigint not null default 0 check (threshold_count >= 0),
  opened_count        bigint not null default 1 check (opened_count > 0),
  trigger_count       bigint not null default 1 check (trigger_count > 0),
  first_opened_at     timestamptz not null default now(),
  last_opened_at      timestamptz not null default now(),
  last_triggered_at   timestamptz not null default now(),
  last_evaluated_at   timestamptz not null default now(),
  resolved_at         timestamptz,
  check (
    (status = 'open' and resolved_at is null)
    or (status = 'resolved' and resolved_at is not null)
  )
);

create index if not exists website_operational_alerts_open_idx
  on public.website_operational_alerts (severity, last_triggered_at desc)
  where status = 'open';

alter table public.website_route_health_runs enable row level security;
alter table public.website_operational_monitoring_state enable row level security;
alter table public.website_operational_alerts enable row level security;

revoke all on table public.website_route_health_runs
  from public, anon, authenticated, service_role;
revoke all on table public.website_operational_monitoring_state
  from public, anon, authenticated, service_role;
revoke all on table public.website_operational_alerts
  from public, anon, authenticated, service_role;

comment on table public.website_route_health_runs is
  'PII-free request/status ledger for the allowlisted OLW website and launch-signup health routes. Never persist response bodies, headers, URLs, or raw transport errors.';
comment on table public.website_operational_alerts is
  'Durable open/resolved aggregate alerts. Codes and numeric observations only; no arbitrary text or contact-level data.';

create or replace function public.set_website_operational_alert(
  target_alert_code text,
  target_scope_code text,
  target_severity text,
  target_is_open boolean,
  target_detail_code text,
  target_observed_count bigint,
  target_sample_count bigint,
  target_threshold_count bigint
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
begin
  if target_alert_code not in (
       'website_health_route_failed',
       'website_health_route_stale',
       'launch_signup_health_route_failed',
       'launch_signup_health_route_stale',
       'marketing_dispatch_failed',
       'marketing_dispatch_missing',
       'marketing_sync_cron_failed',
       'marketing_sync_cron_missing',
       'marketing_outbox_terminal',
       'marketing_outbox_overdue',
       'marketing_outbox_stale_processing',
       'marketing_provider_confirmation_pending',
       'marketing_provider_reconfirmation_pending',
       'website_form_failure_rate',
       'website_client_error_volume'
     )
     or target_scope_code !~ '^[a-z][a-z0-9_]{1,63}$'
     or target_severity not in ('warning', 'critical')
     or target_detail_code !~ '^[a-z][a-z0-9_:-]{0,79}$'
     or coalesce(target_observed_count, -1) < 0
     or coalesce(target_sample_count, -1) < 0
     or coalesce(target_threshold_count, -1) < 0 then
    raise exception using errcode = '22023', message = 'invalid_website_operational_alert';
  end if;

  if target_is_open then
    insert into public.website_operational_alerts (
      alert_code,
      scope_code,
      severity,
      status,
      detail_code,
      observed_count,
      sample_count,
      threshold_count
    ) values (
      target_alert_code,
      target_scope_code,
      target_severity,
      'open',
      target_detail_code,
      target_observed_count,
      target_sample_count,
      target_threshold_count
    )
    on conflict (alert_code) do update
    set scope_code = excluded.scope_code,
        severity = excluded.severity,
        status = 'open',
        detail_code = excluded.detail_code,
        observed_count = excluded.observed_count,
        sample_count = excluded.sample_count,
        threshold_count = excluded.threshold_count,
        opened_count = public.website_operational_alerts.opened_count
          + case when public.website_operational_alerts.status = 'resolved' then 1 else 0 end,
        trigger_count = public.website_operational_alerts.trigger_count + 1,
        last_opened_at = case
          when public.website_operational_alerts.status = 'resolved' then now()
          else public.website_operational_alerts.last_opened_at
        end,
        last_triggered_at = now(),
        last_evaluated_at = now(),
        resolved_at = null;
  else
    update public.website_operational_alerts
    set status = 'resolved',
        observed_count = target_observed_count,
        sample_count = target_sample_count,
        threshold_count = target_threshold_count,
        last_evaluated_at = now(),
        resolved_at = case when status = 'open' then now() else resolved_at end
    where alert_code = target_alert_code;
  end if;
end
$$;

revoke all on function public.set_website_operational_alert(
  text, text, text, boolean, text, bigint, bigint, bigint
) from public, anon, authenticated, service_role;

-- Reconcile pg_net without copying response content or error text. The same
-- pass covers the marketing dispatch ledger created by migration 190000.
create or replace function public.reconcile_website_operational_responses()
returns table (
  route_runs_updated bigint,
  marketing_runs_updated bigint
)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  affected_rows bigint;
begin
  route_runs_updated := 0;
  marketing_runs_updated := 0;

  update public.website_route_health_runs as health_run
  set status = case
        when coalesce(response.timed_out, false) then 'timed_out'
        when response.status_code between 200 and 299 then 'succeeded'
        else 'failed'
      end,
      status_code = case
        when response.status_code between 100 and 599 then response.status_code
        else null
      end,
      error_code = case
        when coalesce(response.timed_out, false) then 'request_timeout'
        when response.status_code between 200 and 299 then null
        when response.status_code between 500 and 599 then 'http_5xx'
        when response.status_code between 400 and 499 then 'http_4xx'
        when response.status_code between 300 and 399 then 'http_3xx'
        else 'transport_error'
      end,
      completed_at = greatest(health_run.dispatched_at, coalesce(response.created, now()))
  from net._http_response as response
  where health_run.request_id = response.id
    and health_run.status = 'queued';
  get diagnostics affected_rows = row_count;
  route_runs_updated := route_runs_updated + affected_rows;

  update public.website_route_health_runs
  set status = 'timed_out',
      error_code = 'response_missing',
      completed_at = now()
  where status = 'queued'
    and dispatched_at < now() - interval '15 minutes';
  get diagnostics affected_rows = row_count;
  route_runs_updated := route_runs_updated + affected_rows;

  update public.marketing_sync_dispatch_runs as dispatch_run
  set status = case
        when coalesce(response.timed_out, false) then 'timed_out'
        when response.status_code between 200 and 299 then 'succeeded'
        else 'failed'
      end,
      status_code = case
        when response.status_code between 100 and 599 then response.status_code
        else null
      end,
      error_code = case
        when coalesce(response.timed_out, false) then 'request_timeout'
        when response.status_code between 200 and 299 then null
        when response.status_code between 500 and 599 then 'http_5xx'
        when response.status_code between 400 and 499 then 'http_4xx'
        when response.status_code between 300 and 399 then 'http_3xx'
        else 'transport_error'
      end,
      completed_at = greatest(dispatch_run.dispatched_at, coalesce(response.created, now()))
  from net._http_response as response
  where dispatch_run.request_id = response.id
    and dispatch_run.status = 'queued';
  get diagnostics affected_rows = row_count;
  marketing_runs_updated := marketing_runs_updated + affected_rows;

  update public.marketing_sync_dispatch_runs
  set status = 'timed_out',
      error_code = 'response_missing',
      completed_at = now()
  where status = 'queued'
    and dispatched_at < now() - interval '15 minutes';
  get diagnostics affected_rows = row_count;
  marketing_runs_updated := marketing_runs_updated + affected_rows;

  return next;
end
$$;

revoke all on function public.reconcile_website_operational_responses()
  from public, anon, authenticated, service_role;

create or replace function public.dispatch_website_route_health_checks()
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  queued_request_id bigint;
begin
  -- Bound the aggregate ledger while retaining enough history for incidents.
  delete from public.website_route_health_runs
  where dispatched_at < now() - interval '30 days';

  select net.http_get(
    url := 'https://ourlittleworld.me/api/health/',
    headers := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) into queued_request_id;

  insert into public.website_route_health_runs (
    request_id, target_code, status, dispatched_at
  ) values (
    queued_request_id, 'website_health', 'queued', now()
  );

  select net.http_get(
    url := 'https://baxgullapuksjbzkogii.supabase.co/functions/v1/launch-signup',
    headers := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) into queued_request_id;

  insert into public.website_route_health_runs (
    request_id, target_code, status, dispatched_at
  ) values (
    queued_request_id, 'launch_signup_health', 'queued', now()
  );

  return 2;
end
$$;

revoke all on function public.dispatch_website_route_health_checks()
  from public, anon, authenticated, service_role;

create or replace function public.evaluate_website_operational_health()
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  monitoring_installed_at timestamptz;
  grace_complete boolean;
  target_record record;
  latest_dispatched_at timestamptz;
  latest_completed_status text;
  latest_status_code integer;
  latest_error_code text;
  stale_minutes bigint;
  dispatch_latest_at timestamptz;
  dispatch_latest_status text;
  dispatch_latest_status_code integer;
  dispatch_latest_error_code text;
  sync_job_id bigint;
  cron_latest_start timestamptz;
  cron_latest_completed_status text;
  terminal_count bigint;
  overdue_count bigint;
  stale_processing_count bigint;
  provider_confirmation_pending_count bigint;
  provider_reconfirmation_pending_count bigint;
  form_attempt_count bigint;
  form_failure_count bigint;
  client_error_count bigint;
  form_failure_threshold bigint;
  open_alert_count integer;
  active_alert record;
begin
  -- Prevent overlapping ten-minute evaluations from double-counting triggers.
  if not pg_try_advisory_xact_lock(722000, 10) then
    return 0;
  end if;

  perform public.reconcile_website_operational_responses();

  select installed_at into monitoring_installed_at
  from public.website_operational_monitoring_state
  where singleton = true;

  if monitoring_installed_at is null then
    insert into public.website_operational_monitoring_state (singleton)
    values (true)
    on conflict (singleton) do nothing
    returning installed_at into monitoring_installed_at;

    if monitoring_installed_at is null then
      select installed_at into monitoring_installed_at
      from public.website_operational_monitoring_state
      where singleton = true;
    end if;
  end if;

  grace_complete := now() >= monitoring_installed_at + interval '15 minutes';

  for target_record in
    select * from (values
      (
        'website_health'::text,
        'website_health_route_failed'::text,
        'website_health_route_stale'::text
      ),
      (
        'launch_signup_health'::text,
        'launch_signup_health_route_failed'::text,
        'launch_signup_health_route_stale'::text
      )
    ) as targets(target_code, failed_alert_code, stale_alert_code)
  loop
    select max(dispatched_at)
    into latest_dispatched_at
    from public.website_route_health_runs
    where target_code = target_record.target_code;

    select status, status_code, error_code
    into latest_completed_status, latest_status_code, latest_error_code
    from public.website_route_health_runs
    where target_code = target_record.target_code
      and status <> 'queued'
    order by completed_at desc nulls last, dispatched_at desc
    limit 1;

    perform public.set_website_operational_alert(
      target_record.failed_alert_code,
      target_record.target_code,
      'critical',
      latest_completed_status in ('failed', 'timed_out'),
      case
        when latest_error_code = 'response_missing' then 'response_missing'
        when latest_completed_status = 'timed_out' then 'request_timeout'
        when latest_status_code between 500 and 599 then 'http_5xx'
        when latest_status_code between 400 and 499 then 'http_4xx'
        when latest_status_code between 300 and 399 then 'http_3xx'
        else coalesce(latest_error_code, 'request_failed')
      end,
      case when latest_completed_status in ('failed', 'timed_out') then 1 else 0 end,
      1,
      1
    );

    stale_minutes := case
      when latest_dispatched_at is null then
        greatest(0, floor(extract(epoch from (now() - monitoring_installed_at)) / 60))::bigint
      else
        greatest(0, floor(extract(epoch from (now() - latest_dispatched_at)) / 60))::bigint
    end;

    perform public.set_website_operational_alert(
      target_record.stale_alert_code,
      target_record.target_code,
      'critical',
      grace_complete and (
        latest_dispatched_at is null
        or latest_dispatched_at < now() - interval '15 minutes'
      ),
      case when latest_dispatched_at is null then 'dispatch_missing' else 'dispatch_stale' end,
      stale_minutes,
      1,
      15
    );

    latest_dispatched_at := null;
    latest_completed_status := null;
    latest_status_code := null;
    latest_error_code := null;
  end loop;

  select max(dispatched_at)
  into dispatch_latest_at
  from public.marketing_sync_dispatch_runs;

  select status, status_code, error_code
  into dispatch_latest_status, dispatch_latest_status_code, dispatch_latest_error_code
  from public.marketing_sync_dispatch_runs
  where status <> 'queued'
  order by completed_at desc nulls last, dispatched_at desc
  limit 1;

  perform public.set_website_operational_alert(
    'marketing_dispatch_failed',
    'marketing_sync',
    'critical',
    dispatch_latest_status in ('failed', 'timed_out'),
    case
      when dispatch_latest_error_code = 'response_missing' then 'response_missing'
      when dispatch_latest_status = 'timed_out' then 'request_timeout'
      when dispatch_latest_status_code between 500 and 599 then 'http_5xx'
      when dispatch_latest_status_code between 400 and 499 then 'http_4xx'
      when dispatch_latest_status_code between 300 and 399 then 'http_3xx'
      else coalesce(dispatch_latest_error_code, 'request_failed')
    end,
    case when dispatch_latest_status in ('failed', 'timed_out') then 1 else 0 end,
    1,
    1
  );

  stale_minutes := case
    when dispatch_latest_at is null then
      greatest(0, floor(extract(epoch from (now() - monitoring_installed_at)) / 60))::bigint
    else
      greatest(0, floor(extract(epoch from (now() - dispatch_latest_at)) / 60))::bigint
  end;

  perform public.set_website_operational_alert(
    'marketing_dispatch_missing',
    'marketing_sync',
    'critical',
    grace_complete and (
      dispatch_latest_at is null
      or dispatch_latest_at < now() - interval '15 minutes'
    ),
    case when dispatch_latest_at is null then 'dispatch_missing' else 'dispatch_stale' end,
    stale_minutes,
    1,
    15
  );

  select jobid into sync_job_id
  from cron.job
  where jobname = 'our-little-world-marketing-contact-sync'
  limit 1;

  if sync_job_id is not null then
    select max(start_time) into cron_latest_start
    from cron.job_run_details
    where jobid = sync_job_id;

    select status into cron_latest_completed_status
    from cron.job_run_details
    where jobid = sync_job_id
      and status in ('succeeded', 'failed')
    order by start_time desc
    limit 1;
  end if;

  perform public.set_website_operational_alert(
    'marketing_sync_cron_failed',
    'marketing_sync_cron',
    'critical',
    cron_latest_completed_status = 'failed',
    'cron_run_failed',
    case when cron_latest_completed_status = 'failed' then 1 else 0 end,
    1,
    1
  );

  stale_minutes := case
    when cron_latest_start is null then
      greatest(0, floor(extract(epoch from (now() - monitoring_installed_at)) / 60))::bigint
    else
      greatest(0, floor(extract(epoch from (now() - cron_latest_start)) / 60))::bigint
  end;

  perform public.set_website_operational_alert(
    'marketing_sync_cron_missing',
    'marketing_sync_cron',
    'critical',
    sync_job_id is null or (
      grace_complete and (
        cron_latest_start is null
        or cron_latest_start < now() - interval '15 minutes'
      )
    ),
    case
      when sync_job_id is null then 'cron_job_missing'
      when cron_latest_start is null then 'cron_run_missing'
      else 'cron_run_stale'
    end,
    stale_minutes,
    1,
    15
  );

  select
    count(*) filter (where state = 'terminal'),
    count(*) filter (
      where state in ('pending', 'retry')
        and available_at < now() - interval '15 minutes'
    ),
    count(*) filter (
      where state = 'processing'
        and claimed_at < now() - interval '15 minutes'
    )
  into terminal_count, overdue_count, stale_processing_count
  from public.marketing_sync_outbox;

  perform public.set_website_operational_alert(
    'marketing_outbox_terminal',
    'marketing_sync_outbox',
    'critical',
    terminal_count > 0,
    'terminal_jobs_present',
    terminal_count,
    terminal_count,
    1
  );

  perform public.set_website_operational_alert(
    'marketing_outbox_overdue',
    'marketing_sync_outbox',
    'critical',
    overdue_count > 0,
    'due_jobs_over_15m',
    overdue_count,
    overdue_count,
    1
  );

  perform public.set_website_operational_alert(
    'marketing_outbox_stale_processing',
    'marketing_sync_outbox',
    'critical',
    stale_processing_count > 0,
    'processing_jobs_over_15m',
    stale_processing_count,
    stale_processing_count,
    1
  );

  select
    count(*) filter (
      where sync_state = 'pending'
        and last_error_code = 'provider_confirmation_pending'
    ),
    count(*) filter (
      where sync_state = 'pending'
        and last_error_code = 'provider_reconfirmation_pending'
    )
  into
    provider_confirmation_pending_count,
    provider_reconfirmation_pending_count
  from public.marketing_contact_provider_state;

  perform public.set_website_operational_alert(
    'marketing_provider_confirmation_pending',
    'marketing_provider_state',
    'warning',
    provider_confirmation_pending_count > 0,
    'initial_confirmation_pending',
    provider_confirmation_pending_count,
    provider_confirmation_pending_count,
    1
  );

  perform public.set_website_operational_alert(
    'marketing_provider_reconfirmation_pending',
    'marketing_provider_state',
    'warning',
    provider_reconfirmation_pending_count > 0,
    'reconfirmation_pending',
    provider_reconfirmation_pending_count,
    provider_reconfirmation_pending_count,
    1
  );

  select
    count(*) filter (where event_type = 'form_submit'),
    count(*) filter (where event_type = 'form_error'),
    count(*) filter (where event_type in (
      'client_error', 'unhandled_rejection', 'resource_error'
    ))
  into form_attempt_count, form_failure_count, client_error_count
  from public.website_operational_events
  where occurred_at >= now() - interval '1 hour';

  form_failure_threshold := greatest(1, ceil(form_attempt_count * 0.25)::bigint);

  perform public.set_website_operational_alert(
    'website_form_failure_rate',
    'website_forms',
    'critical',
    form_attempt_count >= 5
      and form_failure_count::numeric / nullif(form_attempt_count, 0) >= 0.25,
    'failure_rate_25pct',
    form_failure_count,
    form_attempt_count,
    form_failure_threshold
  );

  perform public.set_website_operational_alert(
    'website_client_error_volume',
    'website_client',
    'warning',
    client_error_count >= 10,
    'client_errors_1h',
    client_error_count,
    client_error_count,
    10
  );

  update public.website_operational_monitoring_state
  set last_evaluated_at = now()
  where singleton = true;

  select count(*)::integer into open_alert_count
  from public.website_operational_alerts
  where status = 'open';

  -- pg_cron executes this function unattended. Safe warnings make each open
  -- condition visible in database logs without copying request/response text.
  for active_alert in
    select
      alert_code,
      severity,
      detail_code,
      observed_count,
      sample_count,
      threshold_count
    from public.website_operational_alerts
    where status = 'open'
    order by severity desc, alert_code
  loop
    raise warning
      'olw_operational_alert code=% severity=% detail=% observed=% sample=% threshold=%',
      active_alert.alert_code,
      active_alert.severity,
      active_alert.detail_code,
      active_alert.observed_count,
      active_alert.sample_count,
      active_alert.threshold_count;
  end loop;

  return open_alert_count;
end
$$;

revoke all on function public.evaluate_website_operational_health()
  from public, anon, authenticated, service_role;

-- Service-side health consumers can read aggregate state through this single
-- RPC without receiving table access or any per-event fingerprints/paths.
create or replace function public.website_operational_monitoring_health()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'status', case
      when exists (
        select 1 from public.website_operational_alerts
        where status = 'open' and severity = 'critical'
      ) then 'critical'
      when exists (
        select 1 from public.website_operational_alerts
        where status = 'open'
      ) then 'warning'
      else 'ok'
    end,
    'open_alerts', (
      select count(*) from public.website_operational_alerts where status = 'open'
    ),
    'open_critical_alerts', (
      select count(*) from public.website_operational_alerts
      where status = 'open' and severity = 'critical'
    ),
    'last_evaluated_at', (
      select last_evaluated_at
      from public.website_operational_monitoring_state
      where singleton = true
    ),
    'measured_at', now()
  )
$$;

revoke all on function public.website_operational_monitoring_health()
  from public, anon, authenticated;
grant execute on function public.website_operational_monitoring_health()
  to service_role;

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'olw-dispatch-website-route-health';

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'olw-evaluate-website-operational-health';

  perform cron.schedule(
    'olw-dispatch-website-route-health',
    '*/5 * * * *',
    $schedule$select public.dispatch_website_route_health_checks();$schedule$
  );

  -- Two minutes after alternating dispatch intervals gives pg_net time to
  -- finish while still evaluating every ten minutes.
  perform cron.schedule(
    'olw-evaluate-website-operational-health',
    '2,12,22,32,42,52 * * * *',
    $schedule$select public.evaluate_website_operational_health();$schedule$
  );
end
$$;
