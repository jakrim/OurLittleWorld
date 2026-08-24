do $$
declare
  qa_contact_id uuid;
  provider_result jsonb;
  lifecycle_result jsonb;
begin
  perform public.reconcile_website_operational_responses();
  select id into qa_contact_id
  from public.marketing_contacts
  where email_hash = '35ce9fe842f9cb0955bad9b70b1cdf826d10f1f8585fb11d0e2a380ae6313b41'
  limit 1;

  select jsonb_build_object(
    'sync_state', provider.sync_state,
    'provider_status', provider.provider_status,
    'welcome_eligible', provider.welcome_eligible_at is not null,
    'welcome_enrolled', provider.welcome_enrolled_at is not null,
    'last_error_code', provider.last_error_code,
    'job_state', job.state,
    'job_attempts', job.attempt_count,
    'job_provider_status', job.completed_provider_status
  ) into provider_result
  from public.marketing_contact_provider_state provider
  left join lateral (
    select state, attempt_count, completed_provider_status
    from public.marketing_sync_outbox
    where contact_id = qa_contact_id
    order by created_at desc
    limit 1
  ) job on true
  where provider.contact_id = qa_contact_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_name', lifecycle_event.event_name,
    'lifecycle_state', lifecycle_event.lifecycle_state,
    'delivery_state', lifecycle_event.delivery_state,
    'attempt_count', lifecycle_event.attempt_count,
    'last_error_code', lifecycle_event.last_error_code
  ) order by lifecycle_event.sequence_no), '[]'::jsonb)
  into lifecycle_result
  from public.marketing_lifecycle_events lifecycle_event
  where lifecycle_event.contact_id = qa_contact_id;

  raise notice 'exact_provider_reconciliation=%', provider_result;
  raise notice 'exact_provider_lifecycle=%', lifecycle_result;
  raise notice 'exact_provider_lifecycle_health=%', public.marketing_lifecycle_health();
end
$$;
