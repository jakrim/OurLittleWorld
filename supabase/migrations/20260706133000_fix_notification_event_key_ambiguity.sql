-- Avoid PL/pgSQL ambiguity between the event_key argument and table column.

create or replace function public.enqueue_notification_event(
  target_family_id uuid,
  event_category text,
  event_actor_user_id uuid,
  event_deep_link text,
  event_title text,
  event_body text,
  event_key text default null,
  event_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_id uuid;
begin
  insert into public.notification_events (
    family_id,
    category,
    actor_user_id,
    deep_link,
    title,
    body,
    event_key,
    metadata
  )
  values (
    target_family_id,
    event_category,
    event_actor_user_id,
    event_deep_link,
    event_title,
    event_body,
    $7,
    coalesce($8, '{}'::jsonb)
  )
  on conflict on constraint notification_events_event_key_key do update
    set metadata = public.notification_events.metadata || excluded.metadata
  returning id into v_id;

  return v_id;
end
$$;

revoke all on function public.enqueue_notification_event(uuid, text, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_notification_event(uuid, text, uuid, text, text, text, text, jsonb) to service_role;
