do $$
declare
  qa_contact_id uuid;
  result jsonb;
begin
  perform public.reconcile_website_operational_responses();
  select id into qa_contact_id
  from public.marketing_contacts
  where email_hash = '35ce9fe842f9cb0955bad9b70b1cdf826d10f1f8585fb11d0e2a380ae6313b41'
  limit 1;

  select jsonb_build_object(
    'sync_state', provider.sync_state,
    'provider_status', provider.provider_status,
    'last_error_code', provider.last_error_code,
    'job_state', job.state,
    'job_attempts', job.attempt_count
  ) into result
  from public.marketing_contact_provider_state provider
  left join lateral (
    select state, attempt_count
    from public.marketing_sync_outbox
    where contact_id = qa_contact_id
    order by created_at desc
    limit 1
  ) job on true
  where provider.contact_id = qa_contact_id;

  raise notice 'internal_qa_rejection_classification=%', result;
end
$$;
