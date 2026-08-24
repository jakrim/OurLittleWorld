-- Notification category preferences, event outbox, and delivery cadence logs.
-- Delivery is performed by Edge Functions; these tables let callers honor
-- per-user preferences, quiet hours, hard caps, and partner-activity batching.

create table if not exists public.notification_preferences (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  category     text not null check (category in (
    'weekly_digest',
    'daily_prompt',
    'partner_activity',
    'new_moments',
    'tonight_picks',
    'letter_openable',
    'circle_joined'
  )),
  enabled      boolean not null default true,
  quiet_start  time not null default '21:00',
  quiet_end    time not null default '08:00',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, family_id, category)
);

create index if not exists notification_preferences_family_user_idx
  on public.notification_preferences(family_id, user_id);

create table if not exists public.notification_events (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references public.families(id) on delete cascade,
  category       text not null check (category in (
    'weekly_digest',
    'daily_prompt',
    'partner_activity',
    'new_moments',
    'tonight_picks',
    'letter_openable',
    'circle_joined',
    'billing_quota'
  )),
  actor_user_id  uuid references auth.users(id) on delete set null,
  title          text not null,
  body           text not null,
  deep_link      text not null,
  event_key      text,
  metadata       jsonb not null default '{}'::jsonb,
  processed_at   timestamptz,
  created_at     timestamptz not null default now(),
  unique (event_key)
);

create index if not exists notification_events_pending_idx
  on public.notification_events(processed_at, created_at)
  where processed_at is null;

create index if not exists notification_events_family_idx
  on public.notification_events(family_id, created_at desc);

create table if not exists public.notification_deliveries (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  category      text not null,
  delivery_day  date not null,
  batch_key     text not null,
  event_count   integer not null default 1,
  title         text not null,
  body          text not null,
  deep_link     text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, family_id, batch_key)
);

create index if not exists notification_deliveries_user_day_idx
  on public.notification_deliveries(user_id, delivery_day desc);

drop trigger if exists notification_preferences_updated on public.notification_preferences;
create trigger notification_preferences_updated
  before update on public.notification_preferences
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists notification_deliveries_updated on public.notification_deliveries;
create trigger notification_deliveries_updated
  before update on public.notification_deliveries
  for each row execute procedure public.ool_set_updated_at();

alter table public.notification_preferences enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_deliveries enable row level security;

drop policy if exists notification_preferences_select_own on public.notification_preferences;
drop policy if exists notification_preferences_insert_own on public.notification_preferences;
drop policy if exists notification_preferences_update_own on public.notification_preferences;
drop policy if exists notification_preferences_delete_own on public.notification_preferences;

create policy notification_preferences_select_own on public.notification_preferences for select
  using (user_id = auth.uid());

create policy notification_preferences_insert_own on public.notification_preferences for insert
  with check (user_id = auth.uid() and public.is_family_member(family_id));

create policy notification_preferences_update_own on public.notification_preferences for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_family_member(family_id));

create policy notification_preferences_delete_own on public.notification_preferences for delete
  using (user_id = auth.uid());

drop policy if exists notification_events_select_family on public.notification_events;
create policy notification_events_select_family on public.notification_events for select
  using (public.is_family_member(family_id));

drop policy if exists notification_deliveries_select_own on public.notification_deliveries;
create policy notification_deliveries_select_own on public.notification_deliveries for select
  using (user_id = auth.uid());

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
    event_key,
    coalesce(event_metadata, '{}'::jsonb)
  )
  on conflict (event_key) do update
    set metadata = public.notification_events.metadata || excluded.metadata
  returning id into v_id;

  return v_id;
end
$$;

revoke all on function public.enqueue_notification_event(uuid, text, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_notification_event(uuid, text, uuid, text, text, text, text, jsonb) to service_role;

create or replace function public.enqueue_prompt_partner_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if coalesce(new.response_text, '') = '' and new.moment_id is null and new.audio_storage_object is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and (coalesce(old.response_text, '') <> '' or old.moment_id is not null or old.audio_storage_object is not null) then
    return new;
  end if;

  perform public.enqueue_notification_event(
    new.family_id,
    'partner_activity',
    new.author_user_id,
    '/prompt',
    'Your co-parent answered today''s prompt',
    'Open today''s prompt.',
    'partner_prompt:' || new.family_id::text || ':' || new.prompt_date::text || ':' || new.author_user_id::text,
    jsonb_build_object('kind', 'prompt_response', 'prompt_date', new.prompt_date)
  );
  return new;
end
$$;

drop trigger if exists daily_prompt_partner_activity_notification on public.daily_prompt_responses;
create trigger daily_prompt_partner_activity_notification
  after insert or update of response_text, moment_id, audio_storage_object on public.daily_prompt_responses
  for each row execute procedure public.enqueue_prompt_partner_activity();

create or replace function public.enqueue_first_partner_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if coalesce(new.done, true) is not true then
    return new;
  end if;

  if tg_op = 'UPDATE' and coalesce(old.done, true) is true then
    return new;
  end if;

  perform public.enqueue_notification_event(
    new.family_id,
    'partner_activity',
    new.created_by_user_id,
    '/firsts',
    'A First was saved',
    coalesce(new.title, 'A First') || ' was added to the family story.',
    'partner_first:' || new.id::text,
    jsonb_build_object('kind', 'first_saved', 'first_id', new.id)
  );
  return new;
end
$$;

drop trigger if exists first_partner_activity_notification on public.firsts;
create trigger first_partner_activity_notification
  after insert or update of done on public.firsts
  for each row execute procedure public.enqueue_first_partner_activity();

create or replace function public.enqueue_letter_partner_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.enqueue_notification_event(
    new.family_id,
    'partner_activity',
    new.author_user_id,
    '/letters',
    'A letter was sealed',
    'Your co-parent sealed a letter for later.',
    'partner_letter:' || new.id::text,
    jsonb_build_object('kind', 'letter_sealed', 'letter_id', new.id)
  );
  return new;
end
$$;

drop trigger if exists letter_partner_activity_notification on public.letters;
create trigger letter_partner_activity_notification
  after insert on public.letters
  for each row execute procedure public.enqueue_letter_partner_activity();

create or replace function public.assemble_due_weekly_digests(
  run_date date default current_date
)
returns table (
  family_id uuid,
  week_start date,
  digest_id uuid
)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_family record;
  v_digest public.weekly_digests%rowtype;
  v_week_start date;
  v_digest_day smallint;
begin
  v_digest_day := extract(dow from run_date)::smallint;

  for v_family in
    select f.id, f.baby_name
    from public.families f
    left join public.family_ritual_settings frs on frs.family_id = f.id
    where coalesce(frs.weekly_digest_day, 0) = v_digest_day
  loop
    v_week_start := (run_date - 7)::date;
    v_digest := public.assemble_weekly_digest(v_family.id, v_week_start);

    perform public.enqueue_notification_event(
      v_family.id,
      'weekly_digest',
      null,
      '/digest',
      'Next week''s story is ready',
      'The weekly digest is ready for ' || coalesce(v_family.baby_name, 'your little one') || '.',
      'weekly_digest:' || v_digest.id::text,
      jsonb_build_object('digest_id', v_digest.id, 'week_start', v_digest.week_start)
    );

    family_id := v_family.id;
    week_start := v_digest.week_start;
    digest_id := v_digest.id;
    return next;
  end loop;
end
$$;

revoke all on function public.assemble_due_weekly_digests(date) from public, anon, authenticated;
grant execute on function public.assemble_due_weekly_digests(date) to service_role;
