-- Privacy-safe readback for the controlled QA upsert and lifecycle handoff.

do $$
declare
  qa_contact_id uuid;
  qa_provider jsonb;
  qa_contact_job jsonb;
  qa_lifecycle jsonb;
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
    'last_error_code', provider.last_error_code
  ) into qa_provider
  from public.marketing_contact_provider_state provider
  where provider.contact_id = qa_contact_id;

  select jsonb_build_object(
    'state', outbox.state,
    'sync_action', outbox.sync_action,
    'attempt_count', outbox.attempt_count,
    'completed_provider_status', outbox.completed_provider_status,
    'last_error_code', outbox.last_error_code
  ) into qa_contact_job
  from public.marketing_sync_outbox outbox
  where outbox.contact_id = qa_contact_id
  order by outbox.created_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_name', lifecycle_event.event_name,
    'lifecycle_state', lifecycle_event.lifecycle_state,
    'delivery_state', lifecycle_event.delivery_state,
    'attempt_count', lifecycle_event.attempt_count,
    'last_error_code', lifecycle_event.last_error_code
  ) order by lifecycle_event.sequence_no), '[]'::jsonb)
  into qa_lifecycle
  from public.marketing_lifecycle_events lifecycle_event
  where lifecycle_event.contact_id = qa_contact_id;

  raise notice 'internal_qa_upsert_provider=%', qa_provider;
  raise notice 'internal_qa_upsert_contact_job=%', qa_contact_job;
  raise notice 'internal_qa_upsert_lifecycle=%', qa_lifecycle;
  raise notice 'internal_qa_upsert_lifecycle_health=%', public.marketing_lifecycle_health();
end
$$;
