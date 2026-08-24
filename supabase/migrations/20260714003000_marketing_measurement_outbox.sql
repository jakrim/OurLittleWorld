-- Independent, privacy-safe export ledger for portfolio lifecycle measurement.
--
-- This destination is deliberately separate from the Mailchimp lifecycle
-- outbox. Measurement downtime must never delay provider state tags, journey
-- exits, unsubscribe handling, or transactional delivery.

create table if not exists public.marketing_measurement_outbox (
  id                    uuid primary key default gen_random_uuid(),
  lifecycle_event_id    uuid not null unique references public.marketing_lifecycle_events(id) on delete cascade,
  contact_id            uuid not null references public.marketing_contacts(id) on delete restrict,
  delivery_state        text not null default 'pending' check (
    delivery_state in ('pending', 'claimed', 'retry', 'completed', 'canceled', 'quarantined')
  ),
  attempt_count         integer not null default 0 check (attempt_count >= 0),
  available_at          timestamptz not null default now(),
  claimed_at            timestamptz,
  claim_token           uuid,
  completed_at          timestamptz,
  last_error_code       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists marketing_measurement_outbox_due_idx
  on public.marketing_measurement_outbox(delivery_state, available_at, created_at)
  where delivery_state in ('pending', 'retry', 'claimed');

drop trigger if exists marketing_measurement_outbox_updated
  on public.marketing_measurement_outbox;
create trigger marketing_measurement_outbox_updated
  before update on public.marketing_measurement_outbox
  for each row execute procedure public.ool_set_updated_at();

alter table public.marketing_measurement_outbox enable row level security;
revoke all on table public.marketing_measurement_outbox
  from public, anon, authenticated;
grant select, insert, update on table public.marketing_measurement_outbox
  to service_role;

comment on table public.marketing_measurement_outbox is
  'Independent coarse lifecycle measurement delivery. Stores no email or private family content; internal event identifiers are HMAC-projected by the exporter.';

create or replace function public.enqueue_marketing_measurement_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.marketing_measurement_outbox (
    lifecycle_event_id,
    contact_id
  ) values (
    new.id,
    new.contact_id
  )
  on conflict (lifecycle_event_id) do nothing;
  return new;
end
$$;

revoke all on function public.enqueue_marketing_measurement_event()
  from public, anon, authenticated;

drop trigger if exists marketing_lifecycle_event_measurement
  on public.marketing_lifecycle_events;
create trigger marketing_lifecycle_event_measurement
  after insert on public.marketing_lifecycle_events
  for each row execute procedure public.enqueue_marketing_measurement_event();

create or replace function public.claim_marketing_measurement_events(batch_size integer default 20)
returns table (
  outbox_id uuid,
  lifecycle_event_id uuid,
  event_id text,
  claim_token uuid,
  email text,
  event_name text,
  occurred_at timestamptz,
  lifecycle_state text,
  billing_state text,
  campaign_id text,
  angle_id text,
  creative_id text,
  channel text,
  attempt_count integer
)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
begin
  return query
  with due as (
    select measurement.id
    from public.marketing_measurement_outbox measurement
    join public.marketing_contacts contact on contact.id = measurement.contact_id
    where (
        measurement.delivery_state in ('pending', 'retry')
        or (
          measurement.delivery_state = 'claimed'
          and measurement.claimed_at < now() - interval '15 minutes'
        )
      )
      and measurement.available_at <= now()
      and measurement.attempt_count < 8
      and contact.status = 'subscribed'
      and contact.marketing_consent is true
    order by measurement.created_at, measurement.id
    for update of measurement skip locked
    limit least(greatest(batch_size, 1), 50)
  ), claimed as (
    update public.marketing_measurement_outbox measurement
    set delivery_state = 'claimed',
        attempt_count = measurement.attempt_count + 1,
        claimed_at = now(),
        claim_token = gen_random_uuid(),
        last_error_code = null
    from due
    where measurement.id = due.id
    returning measurement.*
  )
  select
    claimed.id,
    lifecycle_event.id,
    lifecycle_event.event_id,
    claimed.claim_token,
    contact.email,
    lifecycle_event.event_name,
    lifecycle_event.occurred_at,
    lifecycle_event.lifecycle_state,
    coalesce(contact_state.billing_state, 'none'),
    coalesce(contact.attribution ->> 'first_campaign', contact.attribution ->> 'campaign'),
    coalesce(contact.attribution ->> 'first_angle', contact.attribution ->> 'angle'),
    coalesce(contact.attribution ->> 'first_creative', contact.attribution ->> 'creative'),
    coalesce(contact.attribution ->> 'first_channel', contact.attribution ->> 'channel'),
    claimed.attempt_count
  from claimed
  join public.marketing_lifecycle_events lifecycle_event
    on lifecycle_event.id = claimed.lifecycle_event_id
  join public.marketing_contacts contact on contact.id = claimed.contact_id
  left join public.marketing_lifecycle_contact_state contact_state
    on contact_state.contact_id = claimed.contact_id
  order by lifecycle_event.sequence_no;
end
$$;

revoke all on function public.claim_marketing_measurement_events(integer)
  from public, anon, authenticated;
grant execute on function public.claim_marketing_measurement_events(integer)
  to service_role;

create or replace function public.complete_marketing_measurement_event(
  target_outbox_id uuid,
  target_claim_token uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  changed_id uuid;
begin
  update public.marketing_measurement_outbox measurement
  set delivery_state = 'completed',
      completed_at = now(),
      claim_token = null,
      last_error_code = null
  where measurement.id = target_outbox_id
    and measurement.delivery_state = 'claimed'
    and measurement.claim_token = target_claim_token
  returning measurement.id into changed_id;

  return jsonb_build_object(
    'completed', changed_id is not null,
    'duplicate', changed_id is null
  );
end
$$;

revoke all on function public.complete_marketing_measurement_event(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_marketing_measurement_event(uuid, uuid)
  to service_role;

create or replace function public.fail_marketing_measurement_event(
  target_outbox_id uuid,
  target_claim_token uuid,
  target_error_code text,
  target_retry_after_seconds integer default 300,
  target_terminal boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  changed_id uuid;
  final_state text;
begin
  update public.marketing_measurement_outbox measurement
  set delivery_state = case
        when target_terminal or measurement.attempt_count >= 8 then 'quarantined'
        else 'retry'
      end,
      available_at = case
        when target_terminal or measurement.attempt_count >= 8 then measurement.available_at
        else now() + make_interval(secs => least(greatest(target_retry_after_seconds, 60), 21600))
      end,
      claim_token = null,
      last_error_code = left(coalesce(target_error_code, 'measurement_unavailable'), 120)
  where measurement.id = target_outbox_id
    and measurement.delivery_state = 'claimed'
    and measurement.claim_token = target_claim_token
  returning measurement.id, measurement.delivery_state into changed_id, final_state;

  return jsonb_build_object(
    'failed', changed_id is not null,
    'duplicate', changed_id is null,
    'state', coalesce(final_state, 'missing')
  );
end
$$;

revoke all on function public.fail_marketing_measurement_event(
  uuid, uuid, text, integer, boolean
) from public, anon, authenticated;
grant execute on function public.fail_marketing_measurement_event(
  uuid, uuid, text, integer, boolean
) to service_role;

create or replace function public.marketing_measurement_health()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'pending', (select count(*) from public.marketing_measurement_outbox where delivery_state = 'pending'),
    'retry', (select count(*) from public.marketing_measurement_outbox where delivery_state = 'retry'),
    'claimed', (select count(*) from public.marketing_measurement_outbox where delivery_state = 'claimed'),
    'completed', (select count(*) from public.marketing_measurement_outbox where delivery_state = 'completed'),
    'canceled', (select count(*) from public.marketing_measurement_outbox where delivery_state = 'canceled'),
    'quarantined', (select count(*) from public.marketing_measurement_outbox where delivery_state = 'quarantined'),
    'oldest_due_at', (
      select min(available_at) from public.marketing_measurement_outbox
      where delivery_state in ('pending', 'retry')
    )
  );
$$;

revoke all on function public.marketing_measurement_health()
  from public, anon, authenticated;
grant execute on function public.marketing_measurement_health()
  to service_role;

-- Consent withdrawal cancels measurement delivery without changing the
-- separate Mailchimp provider path.
create or replace function public.marketing_lifecycle_contact_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.status = 'subscribed' and new.marketing_consent is true then
    perform public.reconcile_marketing_contact_lifecycle(new.id);
  elsif old.status is distinct from new.status
     or old.marketing_consent is distinct from new.marketing_consent then
    update public.marketing_lifecycle_events
    set delivery_state = 'canceled',
        claim_token = null,
        last_error_code = 'contact_not_marketable'
    where contact_id = new.id
      and delivery_state in ('pending', 'retry', 'claimed');

    update public.marketing_measurement_outbox
    set delivery_state = 'canceled',
        claim_token = null,
        last_error_code = 'contact_not_marketable'
    where contact_id = new.id
      and delivery_state in ('pending', 'retry', 'claimed');
  end if;
  return new;
end
$$;

revoke all on function public.marketing_lifecycle_contact_changed()
  from public, anon, authenticated;

-- Backfill only coarse lifecycle identities. No email or product content is
-- copied into this outbox.
insert into public.marketing_measurement_outbox (
  lifecycle_event_id,
  contact_id
)
select lifecycle_event.id, lifecycle_event.contact_id
from public.marketing_lifecycle_events lifecycle_event
on conflict (lifecycle_event_id) do nothing;

update public.marketing_measurement_outbox measurement
set delivery_state = 'canceled',
    claim_token = null,
    last_error_code = 'contact_not_marketable'
from public.marketing_contacts contact
where contact.id = measurement.contact_id
  and (contact.status <> 'subscribed' or contact.marketing_consent is not true)
  and measurement.delivery_state in ('pending', 'retry', 'claimed');
