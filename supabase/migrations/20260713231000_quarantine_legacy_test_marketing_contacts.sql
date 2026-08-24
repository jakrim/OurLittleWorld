-- Three pre-rollout browser checks used deliberate dummy addresses. Mailchimp
-- correctly rejects these domains, so retain their immutable consent history
-- while taking them out of the live delivery queue with an auditable reason.
-- The predicate is intentionally narrow: a same-day contact must already have
-- a terminal provider rejection and use one of the test-only domains.

insert into public.marketing_consent_events (
  event_key,
  contact_id,
  event_type,
  consent_granted,
  effect_applied,
  consent_source,
  consent_version,
  occurred_at,
  attribution
)
select
  'ops-quarantine:' || contact.id::text,
  contact.id,
  'test_contact_quarantined',
  false,
  true,
  contact.consent_source,
  '2026-07-13',
  now(),
  '{}'::jsonb
from public.marketing_contacts contact
where contact.consented_at >= timestamptz '2026-07-13 00:00:00+00'
  and lower(split_part(contact.email, '@', 2)) in ('example.com', 'test.com')
  and exists (
    select 1
    from public.marketing_sync_outbox outbox
    where outbox.contact_id = contact.id
      and outbox.state = 'terminal'
      and outbox.last_error_code = 'provider_contact_rejected'
  )
on conflict (event_key) do nothing;

update public.marketing_contacts contact
set status = 'unsubscribed',
    marketing_consent = false,
    consent_revoked_at = coalesce(contact.consent_revoked_at, now()),
    suppression_reason = 'test_contact_quarantined',
    updated_at = now()
where contact.consented_at >= timestamptz '2026-07-13 00:00:00+00'
  and lower(split_part(contact.email, '@', 2)) in ('example.com', 'test.com')
  and exists (
    select 1
    from public.marketing_sync_outbox outbox
    where outbox.contact_id = contact.id
      and outbox.state = 'terminal'
      and outbox.last_error_code = 'provider_contact_rejected'
  );

update public.marketing_contact_provider_state provider_state
set provider_status = 'unsubscribed',
    sync_state = 'synced',
    last_error_code = null,
    last_synced_at = now(),
    updated_at = now()
from public.marketing_contacts contact
where contact.id = provider_state.contact_id
  and contact.status = 'unsubscribed'
  and contact.marketing_consent = false
  and contact.suppression_reason = 'test_contact_quarantined';

update public.marketing_sync_outbox outbox
set state = 'canceled',
    last_error_code = 'test_contact_quarantined',
    completed_at = coalesce(outbox.completed_at, now()),
    updated_at = now()
from public.marketing_contacts contact
where contact.id = outbox.contact_id
  and contact.suppression_reason = 'test_contact_quarantined'
  and outbox.state = 'terminal'
  and outbox.last_error_code = 'provider_contact_rejected';
