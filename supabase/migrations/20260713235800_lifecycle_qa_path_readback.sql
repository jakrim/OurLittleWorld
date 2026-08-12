-- Controlled QA path readback without emitting the address or contact IDs.

do $$
declare
  qa_contact_id uuid;
  qa_provider jsonb;
  qa_lifecycle jsonb;
  failure_groups jsonb;
begin
  select id into qa_contact_id
  from public.marketing_contacts
  where email_hash = public.marketing_email_hash('jesse@ourlittleworld.me')
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

  select coalesce(jsonb_agg(grouped), '[]'::jsonb) into failure_groups
  from (
    select
      coalesce(outbox.last_error_code, provider.last_error_code, 'unknown') as error_code,
      count(*) as occurrences
    from public.marketing_contacts contact
    left join public.marketing_contact_provider_state provider on provider.contact_id = contact.id
    left join public.marketing_sync_outbox outbox
      on outbox.contact_id = contact.id
      and outbox.state = 'terminal'
    where provider.sync_state = 'blocked' or outbox.state = 'terminal'
    group by 1
  ) grouped;

  raise notice 'controlled_qa_provider=%', qa_provider;
  raise notice 'controlled_qa_lifecycle=%', qa_lifecycle;
  raise notice 'controlled_failure_groups=%', failure_groups;
end
$$;
