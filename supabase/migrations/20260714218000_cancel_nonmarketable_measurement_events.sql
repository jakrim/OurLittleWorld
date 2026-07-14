-- Prevent privacy-safe measurement rows from remaining permanently pending
-- after a contact opts out or is suppressed before export.

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
  update public.marketing_measurement_outbox measurement
  set delivery_state = 'canceled',
      completed_at = now(),
      claim_token = null,
      last_error_code = 'contact_not_marketable'
  from public.marketing_contacts contact
  where contact.id = measurement.contact_id
    and measurement.delivery_state in ('pending', 'retry', 'claimed')
    and (contact.status <> 'subscribed' or contact.marketing_consent is not true);

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

select public.dispatch_marketing_measurement_export();
