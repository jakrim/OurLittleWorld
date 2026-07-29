-- Retry only the owner-controlled QA contact after correcting the Mailchimp
-- Date merge-field format. No customer, suppressed, or unsubscribed contact is
-- selected by this operation.

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
    'olw_internal_qa_mailchimp_date_fix_20260713',
    'reconcile'
  ) then
    -- A clean replay can already have an active job from the immediately
    -- preceding controlled-QA migration. That is equivalent to a successful
    -- queue request; fail only when neither a new nor an active job exists.
    if not exists (
      select 1
      from public.marketing_sync_outbox
      where contact_id = qa_contact_id
        and state in ('pending', 'processing', 'retry')
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'internal_qa_retry_not_queued';
    end if;
  end if;
end
$$;
