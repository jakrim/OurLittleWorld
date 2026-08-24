-- The controlled QA identity has explicit canonical consent but no current
-- Mailchimp member. Exercise the normal opted-in signup path for this one
-- owner-controlled contact; do not change reconciliation semantics.

do $$
declare
  qa_contact_id uuid;
begin
  select id
  into qa_contact_id
  from public.marketing_contacts
  where email_hash = '35ce9fe842f9cb0955bad9b70b1cdf826d10f1f8585fb11d0e2a380ae6313b41'
    and marketing_consent = true
    and status = 'subscribed';

  if qa_contact_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'internal_qa_contact_not_eligible';
  end if;

  if not public.enqueue_marketing_contact_sync(
    qa_contact_id,
    'olw_internal_qa_provider_absence_20260713',
    'upsert'
  ) then
    -- On a clean schema replay an earlier controlled-QA job can still own the
    -- one-active-job slot. Treat that active job as successful queue coverage.
    if not exists (
      select 1
      from public.marketing_sync_outbox
      where contact_id = qa_contact_id
        and state in ('pending', 'processing', 'retry')
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'internal_qa_upsert_not_queued';
    end if;
  end if;
end
$$;
