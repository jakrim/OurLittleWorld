-- Provider-access result without emitting an address or provider body.

do $$
declare
  qa_contact_id uuid;
  qa_provider jsonb;
  qa_job jsonb;
begin
  perform public.reconcile_website_operational_responses();

  select id into qa_contact_id
  from public.marketing_contacts
  where email_hash = '35ce9fe842f9cb0955bad9b70b1cdf826d10f1f8585fb11d0e2a380ae6313b41'
  limit 1;

  select jsonb_build_object(
    'sync_state', provider.sync_state,
    'provider_status', provider.provider_status,
    'last_error_code', provider.last_error_code
  ) into qa_provider
  from public.marketing_contact_provider_state provider
  where provider.contact_id = qa_contact_id;

  select jsonb_build_object(
    'state', outbox.state,
    'sync_action', outbox.sync_action,
    'attempt_count', outbox.attempt_count,
    'last_error_code', outbox.last_error_code
  ) into qa_job
  from public.marketing_sync_outbox outbox
  where outbox.contact_id = qa_contact_id
  order by outbox.created_at desc
  limit 1;

  raise notice 'internal_qa_provider_probe=%', qa_provider;
  raise notice 'internal_qa_provider_probe_job=%', qa_job;
end
$$;
