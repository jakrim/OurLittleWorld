-- Website launch interest is isolated from the parent lifecycle audience.
-- The former audience has an ongoing provider-native signup automation; using
-- a separate audience is the only API-manageable way to guarantee that a
-- generic website visitor cannot enter the parent onboarding sequence.

alter table public.marketing_contact_provider_state
  alter column audience_id set default '91d293c5c4';

alter table public.marketing_provider_events
  alter column audience_id set default '91d293c5c4';

update public.marketing_contact_provider_state provider_state
set audience_id = '91d293c5c4',
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
  and contact.marketing_consent = true
  and provider_state.audience_id <> '91d293c5c4';

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
      and contact.marketing_consent = true
      and provider_state.audience_id = '91d293c5c4'
      and provider_state.provider_status = 'unknown'
  loop
    perform public.enqueue_marketing_contact_sync(
      contact_record.id,
      'audience-isolation:91d293c5c4:' || contact_record.id::text,
      'upsert'
    );
  end loop;
end
$$;

comment on column public.marketing_contact_provider_state.audience_id is
  'Mailchimp audience for website launch interest. Kept separate from the parent lifecycle audience so signup-triggered onboarding cannot reach generic visitors.';
