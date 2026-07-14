-- Privacy-safe production readback for the controlled lifecycle cutover.

do $$
declare
  qa_contact_id uuid;
  provider_snapshot jsonb;
  contact_job_snapshot jsonb;
  lifecycle_snapshot jsonb;
  measurement_snapshot jsonb;
  dispatch_snapshot jsonb;
begin
  perform public.reconcile_website_operational_responses();

  select contact.id into qa_contact_id
  from public.marketing_contacts contact
  where contact.email_hash = '35ce9fe842f9cb0955bad9b70b1cdf826d10f1f8585fb11d0e2a380ae6313b41'
  limit 1;

  select jsonb_build_object(
    'audience_matches', provider.audience_id = '333fbdbba0',
    'provider_status', provider.provider_status,
    'sync_state', provider.sync_state,
    'last_error_code', provider.last_error_code
  ) into provider_snapshot
  from public.marketing_contact_provider_state provider
  where provider.contact_id = qa_contact_id;

  select jsonb_build_object(
    'state', outbox.state,
    'attempt_count', outbox.attempt_count,
    'completed_provider_status', outbox.completed_provider_status,
    'last_error_code', outbox.last_error_code
  ) into contact_job_snapshot
  from public.marketing_sync_outbox outbox
  where outbox.contact_id = qa_contact_id
  order by outbox.created_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_name', grouped.event_name,
    'delivery_state', grouped.delivery_state,
    'count', grouped.event_count
  ) order by grouped.event_name, grouped.delivery_state), '[]'::jsonb)
  into lifecycle_snapshot
  from (
    select event.event_name, event.delivery_state, count(*) as event_count
    from public.marketing_lifecycle_events event
    where event.contact_id = qa_contact_id
    group by event.event_name, event.delivery_state
  ) grouped;

  select coalesce(jsonb_agg(jsonb_build_object(
    'delivery_state', grouped.delivery_state,
    'last_error_code', grouped.last_error_code,
    'count', grouped.event_count
  ) order by grouped.delivery_state, grouped.last_error_code), '[]'::jsonb)
  into measurement_snapshot
  from (
    select outbox.delivery_state, outbox.last_error_code, count(*) as event_count
    from public.marketing_measurement_outbox outbox
    group by outbox.delivery_state, outbox.last_error_code
  ) grouped;

  select jsonb_build_object(
    'provider_dispatch_status', provider_run.status,
    'provider_dispatch_code', provider_run.status_code,
    'provider_dispatch_error', provider_run.error_code,
    'measurement_dispatch_code', measurement_response.status_code,
    'measurement_dispatch_timed_out', coalesce(measurement_response.timed_out, false)
  ) into dispatch_snapshot
  from lateral (
    select run.status, run.status_code, run.error_code
    from public.marketing_sync_dispatch_runs run
    order by run.dispatched_at desc
    limit 1
  ) provider_run
  left join lateral (
    select response.status_code, response.timed_out
    from public.marketing_measurement_dispatch_runs run
    left join net._http_response response on response.id = run.request_id
    order by run.dispatched_at desc
    limit 1
  ) measurement_response on true;

  raise notice 'lifecycle_consolidation_provider=%', provider_snapshot;
  raise notice 'lifecycle_consolidation_contact_job=%', contact_job_snapshot;
  raise notice 'lifecycle_consolidation_events=%', lifecycle_snapshot;
  raise notice 'lifecycle_consolidation_measurement=%', measurement_snapshot;
  raise notice 'lifecycle_consolidation_dispatch=%', dispatch_snapshot;
end
$$;
