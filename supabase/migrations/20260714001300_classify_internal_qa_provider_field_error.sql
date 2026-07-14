do $$
declare
  qa_contact_id uuid;
begin
  select id into qa_contact_id
  from public.marketing_contacts
  where email_hash = '35ce9fe842f9cb0955bad9b70b1cdf826d10f1f8585fb11d0e2a380ae6313b41'
    and marketing_consent = true
    and status = 'subscribed';

  if qa_contact_id is null
     or not public.enqueue_marketing_contact_sync(
       qa_contact_id,
       'olw_internal_qa_provider_field_classifier_20260713',
       'upsert'
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'internal_qa_field_classifier_not_queued';
  end if;
end
$$;

select public.dispatch_marketing_contact_sync();
