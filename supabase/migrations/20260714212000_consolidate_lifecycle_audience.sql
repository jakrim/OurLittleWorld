-- The verified Our Little World audience now owns both double-opt-in signup and
-- the active lifecycle journey. Consolidating the provider source and journey
-- audience guarantees that a confirmed subscriber enters the flow without a
-- manual copy or a second audience.

alter table public.marketing_contact_provider_state
  alter column audience_id set default '333fbdbba0';

alter table public.marketing_provider_events
  alter column audience_id set default '333fbdbba0';

update public.marketing_contact_provider_state provider_state
set audience_id = '333fbdbba0',
    provider_status = 'unknown',
    provider_member_hash = null,
    sync_state = 'pending',
    welcome_enrolled_at = null,
    last_synced_at = null,
    last_provider_event_at = null,
    last_status_event_at = null,
    last_identity_event_at = null,
    last_error_code = null,
    updated_at = now()
from public.marketing_contacts contact
where contact.id = provider_state.contact_id
  and contact.status = 'subscribed'
  and contact.marketing_consent is true
  and provider_state.audience_id <> '333fbdbba0';

do $$
declare
  contact_record record;
begin
  for contact_record in
    select contact.id
    from public.marketing_contacts contact
    join public.marketing_contact_provider_state provider_state
      on provider_state.contact_id = contact.id
    where contact.status = 'subscribed'
      and contact.marketing_consent is true
      and provider_state.audience_id = '333fbdbba0'
      and provider_state.provider_status <> 'subscribed'
  loop
    perform public.enqueue_marketing_contact_sync(
      contact_record.id,
      'audience-consolidation:333fbdbba0:' || contact_record.id::text,
      'upsert'
    );
  end loop;
end
$$;

-- A provider-wide cooldown delayed the controlled QA upsert. The destination
-- is now an already-subscribed verified member, so replay the normal job now.
update public.marketing_sync_outbox outbox
set available_at = now(),
    last_error_code = null,
    updated_at = now()
from public.marketing_contacts contact
where contact.id = outbox.contact_id
  and contact.status = 'subscribed'
  and contact.marketing_consent is true
  and outbox.state = 'retry';

-- The central ingest secret is now aligned. Replay only the bounded events
-- quarantined by the prior authentication mismatch.
update public.marketing_measurement_outbox
set delivery_state = 'pending',
    available_at = now(),
    claim_token = null,
    last_error_code = null
where delivery_state = 'quarantined'
  and last_error_code = 'ingest_contract_rejected';

select public.dispatch_marketing_contact_sync();
select public.dispatch_marketing_measurement_export();

comment on column public.marketing_contact_provider_state.audience_id is
  'Mailchimp audience for consented Our Little World lifecycle marketing. The active double-opt-in source and welcome journey both use audience 333fbdbba0.';
