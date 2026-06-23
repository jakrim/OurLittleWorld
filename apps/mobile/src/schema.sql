-- Our Little World cloud schema
-- Source of truth lives in Supabase migrations (applied via MCP). This file
-- mirrors the latest migrated state for human review.

-- ─── tables ──────────────────────────────────────────────────────────────────

create table if not exists public.families (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  baby_name       text,
  baby_birthday   date,
  palette_preference text check (
    palette_preference is null
    or palette_preference in ('hearth','sky','linen','twilight','meadow')
  ),
  created_by      uuid not null references auth.users(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id     uuid not null references public.families(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  display_name  text,
  relationship_label text,
  role          text not null default 'partner' check (role in ('creator','partner','circle')),
  joined_at     timestamptz not null default now(),
  primary key (family_id, user_id)
);

alter table public.family_members
  add column if not exists relationship_label text;

create index if not exists family_members_user_idx on public.family_members(user_id);

create table if not exists public.family_invites (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families(id) on delete cascade,
  code            text not null unique,
  created_by      uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '7 days'),
  role            text not null default 'partner' check (role in ('partner','circle')),
  used_by         uuid references auth.users(id) on delete set null,
  used_at         timestamptz
);

alter table public.family_invites
  add column if not exists role text not null default 'partner';

do $$
begin
  alter table public.family_invites drop constraint if exists family_invites_role_check;
  alter table public.family_invites
    add constraint family_invites_role_check
    check (role in ('partner','circle'));
end $$;

create or replace function public.enforce_two_family_writers()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_writer_count integer;
begin
  if new.role not in ('creator','partner') then
    return new;
  end if;

  perform 1 from public.families where id = new.family_id for update;

  select count(*) into v_writer_count
  from public.family_members
  where family_id = new.family_id
    and user_id <> new.user_id
    and role in ('creator','partner');

  if v_writer_count >= 2 then
    raise exception 'families can have at most two co-parents';
  end if;

  return new;
end
$$;

drop trigger if exists family_members_two_writers on public.family_members;
create trigger family_members_two_writers
  before insert or update of family_id, user_id, role on public.family_members
  for each row execute function public.enforce_two_family_writers();

revoke all on function public.enforce_two_family_writers() from public, anon;

create index if not exists family_invites_family_idx on public.family_invites(family_id);

create table if not exists public.photo_tags (
  family_id            uuid not null references public.families(id) on delete cascade,
  asset_owner_user_id  uuid not null references auth.users(id) on delete cascade,
  asset_id             text not null,
  tagged_by_user_id    uuid not null references auth.users(id) on delete cascade,
  tagged_at            timestamptz not null default now(),
  storage_object       uuid,
  thumb_object         uuid,
  original_width       integer,
  original_height      integer,
  creation_time        timestamptz,
  latitude             double precision,
  longitude            double precision,
  location_fetched_at  timestamptz,
  upload_status        text not null default 'pending' check (upload_status in ('pending', 'uploading', 'ready', 'failed')),
  upload_error         text,
  primary key (family_id, asset_owner_user_id, asset_id)
);

create index if not exists photo_tags_family_idx on public.photo_tags(family_id);
create index if not exists photo_tags_owner_idx on public.photo_tags(family_id, asset_owner_user_id);
create index if not exists photo_tags_family_location_idx
  on public.photo_tags(family_id, latitude, longitude)
  where latitude is not null and longitude is not null;

create table if not exists public.memories (
  id                   uuid primary key default gen_random_uuid(),
  family_id            uuid not null references public.families(id) on delete cascade,
  asset_owner_user_id  uuid not null references auth.users(id) on delete cascade,
  asset_id             text not null,
  author_user_id       uuid not null references auth.users(id) on delete cascade,
  note                 text not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists memories_family_asset_idx on public.memories(family_id, asset_owner_user_id, asset_id);

create table if not exists public.daily_prompt_responses (
  id                   uuid primary key default gen_random_uuid(),
  family_id            uuid not null references public.families(id) on delete cascade,
  prompt_date          date not null,
  prompt_key           text not null,
  prompt_text          text not null,
  author_user_id       uuid not null references auth.users(id) on delete cascade,
  response_text        text,
  audio_storage_object uuid,
  snoozed_until        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (family_id, prompt_date, author_user_id)
);

create index if not exists daily_prompt_responses_family_date_idx
  on public.daily_prompt_responses(family_id, prompt_date desc);

create table if not exists public.goal_definitions (
  id               uuid primary key default gen_random_uuid(),
  goal_type        text not null default 'first' check (goal_type in ('first')),
  key              text not null unique,
  title            text not null,
  description      text,
  target_age_label text,
  sort_order       integer not null default 0,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

insert into public.goal_definitions (goal_type, key, title, description, target_age_label, sort_order, active)
values
  ('first', 'smile', 'First smile', 'A first little social spark to save for the family story.', '6-8 weeks', 10, true),
  ('first', 'laugh', 'First laugh', 'The first laugh that made everyone stop and listen.', '3-4 months', 20, true),
  ('first', 'roll', 'First roll', 'A new way to move through the world.', '4-6 months', 30, true),
  ('first', 'food', 'First solid food', 'The first taste that became part of the archive.', '6 months', 40, true),
  ('first', 'crawl', 'First crawl', 'The beginning of going places on purpose.', '7-10 months', 50, true),
  ('first', 'word', 'First word', 'A sound that starts turning into their own voice.', '9-14 months', 60, true),
  ('first', 'steps', 'First steps', 'The first tiny proof of everywhere they are headed.', '10-18 months', 70, true)
on conflict (key) do update set
  goal_type = excluded.goal_type,
  title = excluded.title,
  description = excluded.description,
  target_age_label = excluded.target_age_label,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = now();

create index if not exists goal_definitions_type_active_order_idx
  on public.goal_definitions(goal_type, active, sort_order);

create table if not exists public.firsts (
  id                   uuid primary key default gen_random_uuid(),
  family_id            uuid not null references public.families(id) on delete cascade,
  created_by_user_id   uuid not null references auth.users(id) on delete cascade,
  title                text not null,
  note                 text,
  happened_at          timestamptz,
  asset_owner_user_id  uuid references auth.users(id) on delete set null,
  asset_id             text,
  goal_key             text references public.goal_definitions(key) on update cascade on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists firsts_family_happened_idx
  on public.firsts(family_id, happened_at desc nulls last, created_at desc);

create table if not exists public.letters (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families(id) on delete cascade,
  author_user_id  uuid not null references auth.users(id) on delete cascade,
  title           text,
  body            text not null,
  open_on         date not null,
  audience        text not null default 'child' check (audience = 'child'),
  sealed_at       timestamptz not null default now(),
  opened_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.letters
  add column if not exists audience text not null default 'child'
    check (audience = 'child');

update public.letters
set audience = 'child'
where audience <> 'child';

do $$
begin
  alter table public.letters drop constraint if exists letters_audience_check;
  alter table public.letters
    add constraint letters_audience_check check (audience = 'child');
end $$;

alter table public.letters
  drop column if exists starter_key;

create index if not exists letters_family_open_idx
  on public.letters(family_id, open_on asc, created_at desc);

create table if not exists public.weekly_digests (
  id                         uuid primary key default gen_random_uuid(),
  family_id                  uuid not null references public.families(id) on delete cascade,
  week_start                 date not null,
  week_end                   date not null,
  headline                   text not null,
  photo_count                integer not null default 0,
  memory_count               integer not null default 0,
  firsts_count               integer not null default 0,
  letter_count               integer not null default 0,
  representative_media       jsonb not null default '[]'::jsonb,
  moment_count               integer not null default 0,
  milestone_count            integer not null default 0,
  voice_note_count           integer not null default 0,
  cover_asset_owner_user_id  uuid references auth.users(id) on delete set null,
  cover_asset_id             text,
  generated_at               timestamptz not null default now(),
  unique (family_id, week_start)
);

create table if not exists public.family_ritual_settings (
  family_id              uuid primary key references public.families(id) on delete cascade,
  daily_prompt_time      time not null default '19:30',
  weekly_digest_day      smallint not null default 0 check (weekly_digest_day between 0 and 6),
  monthiversary_enabled  boolean not null default true,
  monthiversary_day      smallint not null default 1 check (monthiversary_day between 1 and 31),
  timezone               text not null default 'local',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists public.moments (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families(id) on delete cascade,
  author_user_id  uuid not null references auth.users(id) on delete cascade,
  title           text,
  caption_note    text,
  captured_at     timestamptz not null default now(),
  place_name      text,
  latitude        double precision,
  longitude       double precision,
  shared_with     jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists moments_family_captured_idx
  on public.moments(family_id, captured_at desc);

create table if not exists public.moment_media (
  id                   uuid primary key default gen_random_uuid(),
  moment_id            uuid not null references public.moments(id) on delete cascade,
  family_id            uuid not null references public.families(id) on delete cascade,
  owner_user_id         uuid not null references auth.users(id) on delete cascade,
  media_type            text not null check (media_type in ('image','video')),
  local_identifier      text,
  file_name             text,
  mime_type             text,
  full_object           uuid,
  thumb_object          uuid,
  poster_object         uuid,
  width                 integer,
  height                integer,
  duration_sec          numeric,
  metadata              jsonb not null default '{}'::jsonb,
  upload_status         text not null default 'pending' check (upload_status in ('pending','uploading','ready','failed')),
  upload_error          text,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists moment_media_moment_idx
  on public.moment_media(moment_id, sort_order asc, created_at asc);
create index if not exists moment_media_family_idx
  on public.moment_media(family_id, created_at desc);

create table if not exists public.voice_notes (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families(id) on delete cascade,
  moment_id       uuid references public.moments(id) on delete cascade,
  author_user_id  uuid not null references auth.users(id) on delete cascade,
  duration_sec    numeric,
  waveform        jsonb not null default '[]'::jsonb,
  audio_object    uuid,
  mime_type       text,
  upload_status   text not null default 'pending' check (upload_status in ('pending','uploading','ready','failed')),
  upload_error    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists voice_notes_moment_idx on public.voice_notes(moment_id);
create index if not exists voice_notes_family_idx on public.voice_notes(family_id, created_at desc);

create table if not exists public.moment_reactions (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families(id) on delete cascade,
  moment_id       uuid not null references public.moments(id) on delete cascade,
  author_user_id  uuid not null references auth.users(id) on delete cascade,
  emoji           text not null,
  created_at      timestamptz not null default now(),
  unique (moment_id, author_user_id, emoji)
);

create index if not exists moment_reactions_moment_idx on public.moment_reactions(moment_id);

create table if not exists public.moment_tags (
  family_id   uuid not null references public.families(id) on delete cascade,
  moment_id   uuid not null references public.moments(id) on delete cascade,
  tag         text not null,
  created_at  timestamptz not null default now(),
  primary key (moment_id, tag)
);

create index if not exists moment_tags_family_idx on public.moment_tags(family_id, tag);

create table if not exists public.media_import_calibrations (
  family_id            uuid not null references public.families(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  auto_save_enabled    boolean not null default false,
  auto_save_threshold  numeric not null default 0.9,
  batch_review_min     numeric not null default 0.68,
  calibrated_at        timestamptz,
  corrections          jsonb not null default '[]'::jsonb,
  negative_examples    jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table if not exists public.scan_checkpoints (
  family_id        uuid not null references public.families(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  last_scanned_at  timestamptz,
  last_cursor      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (family_id, user_id)
);

alter table public.photo_tags
  add column if not exists moment_id uuid references public.moments(id) on delete set null;

alter table public.photo_tags
  add column if not exists moment_media_id uuid references public.moment_media(id) on delete set null;

alter table public.daily_prompt_responses
  add column if not exists moment_id uuid references public.moments(id) on delete set null;

alter table public.firsts
  add column if not exists moment_id uuid references public.moments(id) on delete set null;

alter table public.firsts
  add column if not exists target_age_label text;

alter table public.firsts
  add column if not exists done boolean not null default true;

alter table public.firsts
  add column if not exists goal_key text references public.goal_definitions(key) on update cascade on delete set null;

update public.firsts
set goal_key = case
  when lower(regexp_replace(title, '[^a-z0-9]+', ' ', 'g')) = 'first smile' then 'smile'
  when lower(regexp_replace(title, '[^a-z0-9]+', ' ', 'g')) = 'first laugh' then 'laugh'
  when lower(regexp_replace(title, '[^a-z0-9]+', ' ', 'g')) = 'first roll' then 'roll'
  when lower(regexp_replace(title, '[^a-z0-9]+', ' ', 'g')) = 'first solid food' then 'food'
  when lower(regexp_replace(title, '[^a-z0-9]+', ' ', 'g')) = 'first crawl' then 'crawl'
  when lower(regexp_replace(title, '[^a-z0-9]+', ' ', 'g')) = 'first word' then 'word'
  when lower(regexp_replace(title, '[^a-z0-9]+', ' ', 'g')) = 'first steps' then 'steps'
  else goal_key
end
where goal_key is null;

create index if not exists firsts_family_goal_key_idx
  on public.firsts(family_id, goal_key)
  where goal_key is not null;

-- ─── triggers ────────────────────────────────────────────────────────────────

create or replace function public.ool_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists families_updated on public.families;
create trigger families_updated
  before update on public.families
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists memories_updated on public.memories;
create trigger memories_updated
  before update on public.memories
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists daily_prompt_responses_updated on public.daily_prompt_responses;
create trigger daily_prompt_responses_updated
  before update on public.daily_prompt_responses
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists firsts_updated on public.firsts;
create trigger firsts_updated
  before update on public.firsts
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists goal_definitions_updated on public.goal_definitions;
create trigger goal_definitions_updated
  before update on public.goal_definitions
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists letters_updated on public.letters;
create trigger letters_updated
  before update on public.letters
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists family_ritual_settings_updated on public.family_ritual_settings;
create trigger family_ritual_settings_updated
  before update on public.family_ritual_settings
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists moments_updated on public.moments;
create trigger moments_updated
  before update on public.moments
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists moment_media_updated on public.moment_media;
create trigger moment_media_updated
  before update on public.moment_media
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists voice_notes_updated on public.voice_notes;
create trigger voice_notes_updated
  before update on public.voice_notes
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists media_import_calibrations_updated on public.media_import_calibrations;
create trigger media_import_calibrations_updated
  before update on public.media_import_calibrations
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists scan_checkpoints_updated on public.scan_checkpoints;
create trigger scan_checkpoints_updated
  before update on public.scan_checkpoints
  for each row execute procedure public.ool_set_updated_at();

-- ─── helper: is the current user a member of this family? ─────────────────────

create or replace function public.is_family_member(fid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.family_members
    where family_id = fid and user_id = auth.uid()
  );
$$;

revoke all on function public.is_family_member(uuid) from public, anon;
grant execute on function public.is_family_member(uuid) to authenticated;

create or replace function public.is_family_writer(fid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.family_members
    where family_id = fid
      and user_id = auth.uid()
      and role in ('creator','partner')
  );
$$;

revoke all on function public.is_family_writer(uuid) from public, anon;
grant execute on function public.is_family_writer(uuid) to authenticated;

-- ─── invite code generator ───────────────────────────────────────────────────
-- 8-char Crockford base32 (avoids confusing 0/O/1/I), 32^8 keyspace.

create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = public, pg_catalog
as $$
declare
  alphabet text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  out text := '';
begin
  for i in 1..8 loop
    out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return out;
end
$$;

revoke all on function public.generate_invite_code() from public, anon;
grant execute on function public.generate_invite_code() to authenticated;

-- ─── family creation RPC ─────────────────────────────────────────────────────
-- Atomically creates a family and the creator membership. This avoids the
-- INSERT ... RETURNING RLS trap before a membership row exists.

create or replace function public.create_family(
  p_family_name text default null,
  p_baby_name text default null,
  p_baby_birthday date default null,
  p_member_display_name text default null,
  p_member_relationship_label text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_family_id uuid;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  insert into public.families (name, baby_name, baby_birthday, created_by)
  values (
    coalesce(nullif(trim(p_family_name), ''), 'Our Little World'),
    nullif(trim(p_baby_name), ''),
    p_baby_birthday,
    auth.uid()
  )
  returning id into v_family_id;

  insert into public.family_members (
    family_id,
    user_id,
    display_name,
    relationship_label,
    role
  )
  values (
    v_family_id,
    auth.uid(),
    nullif(trim(p_member_display_name), ''),
    nullif(trim(p_member_relationship_label), ''),
    'creator'
  );

  return v_family_id;
end
$$;

revoke all on function public.create_family(text, text, date, text, text) from public, anon;
grant execute on function public.create_family(text, text, date, text, text) to authenticated;

-- Narrow self-profile update RPC. Direct family_members writes stay locked down
-- so members cannot self-join arbitrary families or self-promote roles.

create or replace function public.update_my_family_membership(
  target_family_id uuid,
  membership_patch jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  update public.family_members
  set
    display_name = case
      when membership_patch ? 'display_name' then nullif(trim(membership_patch->>'display_name'), '')
      else display_name
    end,
    relationship_label = case
      when membership_patch ? 'relationship_label' then nullif(trim(membership_patch->>'relationship_label'), '')
      else relationship_label
    end
  where family_id = target_family_id
    and user_id = auth.uid();

  if not found then
    raise exception 'family membership not found';
  end if;
end
$$;

revoke all on function public.update_my_family_membership(uuid, jsonb) from public, anon;
grant execute on function public.update_my_family_membership(uuid, jsonb) to authenticated;

create or replace function public.update_family_member_role(
  target_family_id uuid,
  target_user_id uuid,
  target_role text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_next_role text;
  v_current_role text;
  v_writer_count integer;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  if not public.is_family_writer(target_family_id) then
    raise exception 'must be a family writer';
  end if;

  v_next_role := case
    when target_role = 'circle' then 'circle'
    when target_role = 'partner' then 'partner'
    else null
  end;

  if v_next_role is null then
    raise exception 'invalid member role';
  end if;

  select role into v_current_role
  from public.family_members
  where family_id = target_family_id
    and user_id = target_user_id
  for update;

  if not found then
    raise exception 'family member not found';
  end if;

  if v_current_role = 'creator' then
    raise exception 'creator role cannot be changed';
  end if;

  select count(*) into v_writer_count
  from public.family_members
  where family_id = target_family_id
    and role in ('creator', 'partner');

  if v_next_role = 'partner'
    and v_current_role not in ('creator', 'partner')
    and v_writer_count >= 2 then
    raise exception 'This family already has two co-parents. Make someone view-only before adding another co-parent.';
  end if;

  if v_next_role = 'circle'
    and v_current_role in ('creator', 'partner')
    and v_writer_count <= 1 then
    raise exception 'A family needs at least one co-parent.';
  end if;

  update public.family_members
  set role = v_next_role
  where family_id = target_family_id
    and user_id = target_user_id;
end
$$;

revoke all on function public.update_family_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.update_family_member_role(uuid, uuid, text) to authenticated;

-- ─── invite redemption RPC ───────────────────────────────────────────────────

drop function if exists public.redeem_family_invite(text, text);

create or replace function public.redeem_family_invite(
  invite_code text,
  member_display_name text default null,
  member_relationship_label text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_invite public.family_invites%rowtype;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  select * into v_invite from public.family_invites
   where code = upper(invite_code) and used_at is null and expires_at > now()
   for update;

  if not found then
    raise exception 'invite code is invalid or expired';
  end if;

  v_role := case when v_invite.role = 'circle' then 'circle' else 'partner' end;

  insert into public.family_members (family_id, user_id, display_name, relationship_label, role)
  values (v_invite.family_id, auth.uid(), member_display_name, nullif(member_relationship_label, ''), v_role)
  on conflict (family_id, user_id) do update
    set display_name = coalesce(excluded.display_name, public.family_members.display_name),
        relationship_label = coalesce(excluded.relationship_label, public.family_members.relationship_label),
        role = excluded.role;

  update public.family_invites set used_by = auth.uid(), used_at = now()
   where id = v_invite.id;

  return v_invite.family_id;
end
$$;

revoke all on function public.redeem_family_invite(text, text, text) from public, anon;
grant execute on function public.redeem_family_invite(text, text, text) to authenticated;

create or replace function public.assemble_weekly_digest(
  target_family_id uuid,
  target_week_start date default null
)
returns public.weekly_digests
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_week_start date;
  v_week_end date;
  v_moment_count integer := 0;
  v_milestone_count integer := 0;
  v_voice_note_count integer := 0;
  v_letter_count integer := 0;
  v_photo_count integer := 0;
  v_memory_count integer := 0;
  v_headline text;
  v_representative_media jsonb := '[]'::jsonb;
  v_digest public.weekly_digests%rowtype;
begin
  if target_family_id is null then
    raise exception 'target_family_id is required';
  end if;

  if auth.uid() is not null and not public.is_family_writer(target_family_id) then
    raise exception 'not allowed to assemble digest for this family';
  end if;

  v_week_start := coalesce(
    target_week_start,
    (current_date - extract(dow from current_date)::int)::date
  );
  v_week_end := (v_week_start + 6);

  select count(*)::integer into v_moment_count
  from public.moments m
  where m.family_id = target_family_id
    and (m.captured_at at time zone 'utc')::date between v_week_start and v_week_end;

  select count(*)::integer into v_photo_count
  from public.photo_tags p
  where p.family_id = target_family_id
    and p.upload_status = 'ready'
    and (p.creation_time at time zone 'utc')::date between v_week_start and v_week_end;

  select count(*)::integer into v_memory_count
  from public.memories mem
  where mem.family_id = target_family_id
    and (mem.created_at at time zone 'utc')::date between v_week_start and v_week_end;

  select count(*)::integer into v_milestone_count
  from public.firsts f
  where f.family_id = target_family_id
    and coalesce(f.done, true) = true
    and (coalesce(f.happened_at::timestamptz, f.created_at) at time zone 'utc')::date between v_week_start and v_week_end;

  select count(*)::integer into v_voice_note_count
  from public.voice_notes vn
  join public.moments m on m.id = vn.moment_id
  where vn.family_id = target_family_id
    and m.family_id = target_family_id
    and (m.captured_at at time zone 'utc')::date between v_week_start and v_week_end;

  select count(*)::integer into v_letter_count
  from public.letters l
  where l.family_id = target_family_id
    and (l.created_at at time zone 'utc')::date between v_week_start and v_week_end;

  select coalesce(jsonb_agg(item order by captured_at desc), '[]'::jsonb)
  into v_representative_media
  from (
    select
      m.captured_at,
      jsonb_build_object(
        'momentId', m.id,
        'mediaId', mm.id,
        'mediaType', mm.media_type,
        'capturedAt', m.captured_at,
        'metadata', mm.metadata
      ) as item
    from public.moments m
    join public.moment_media mm on mm.moment_id = m.id
    where m.family_id = target_family_id
      and mm.family_id = target_family_id
      and (m.captured_at at time zone 'utc')::date between v_week_start and v_week_end
    order by m.captured_at desc, mm.sort_order asc
    limit 4
  ) media;

  v_headline := case
    when v_milestone_count > 0 then 'A week with a first worth saving.'
    when v_voice_note_count > 0 then 'A week with voices kept close.'
    when v_moment_count > 0 or v_photo_count > 0 then 'A week of small arrivals.'
    when v_letter_count > 0 then 'A week with words saved for later.'
    else 'A quiet week, still worth keeping.'
  end;

  insert into public.weekly_digests (
    family_id,
    week_start,
    week_end,
    headline,
    photo_count,
    memory_count,
    firsts_count,
    letter_count,
    representative_media,
    moment_count,
    milestone_count,
    voice_note_count,
    generated_at
  )
  values (
    target_family_id,
    v_week_start,
    v_week_end,
    v_headline,
    v_photo_count,
    v_memory_count,
    v_milestone_count,
    v_letter_count,
    v_representative_media,
    greatest(v_moment_count, v_photo_count),
    v_milestone_count,
    v_voice_note_count,
    now()
  )
  on conflict (family_id, week_start) do update
    set week_end = excluded.week_end,
        headline = excluded.headline,
        photo_count = excluded.photo_count,
        memory_count = excluded.memory_count,
        firsts_count = excluded.firsts_count,
        letter_count = excluded.letter_count,
        representative_media = excluded.representative_media,
        moment_count = excluded.moment_count,
        milestone_count = excluded.milestone_count,
        voice_note_count = excluded.voice_note_count,
        generated_at = excluded.generated_at
  returning * into v_digest;

  return v_digest;
end
$$;

revoke all on function public.assemble_weekly_digest(uuid, date) from public, anon;
grant execute on function public.assemble_weekly_digest(uuid, date) to authenticated, service_role;

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
    select f.id
    from public.families f
    left join public.family_ritual_settings frs on frs.family_id = f.id
    where coalesce(frs.weekly_digest_day, 0) = v_digest_day
  loop
    -- Generate the most recently completed seven-day window for that family's
    -- chosen digest day. A Sunday digest covers the previous Sunday-Saturday.
    v_week_start := (run_date - 7)::date;
    v_digest := public.assemble_weekly_digest(v_family.id, v_week_start);

    family_id := v_family.id;
    week_start := v_digest.week_start;
    digest_id := v_digest.id;
    return next;
  end loop;
end
$$;

revoke all on function public.assemble_due_weekly_digests(date) from public, anon, authenticated;
grant execute on function public.assemble_due_weekly_digests(date) to service_role;

-- Installed by migration 20260622181500_scheduled_weekly_digest_cron.sql when
-- pg_cron is available:
-- cron.schedule(
--   'our-little-world-weekly-digest-assembly',
--   '15 13 * * *',
--   'select public.assemble_due_weekly_digests(current_date);'
-- );

-- ─── row-level security ──────────────────────────────────────────────────────

alter table public.families        enable row level security;
alter table public.family_members  enable row level security;
alter table public.family_invites  enable row level security;
alter table public.photo_tags      enable row level security;
alter table public.memories        enable row level security;
alter table public.daily_prompt_responses enable row level security;
alter table public.goal_definitions       enable row level security;
alter table public.firsts                 enable row level security;
alter table public.letters                enable row level security;
alter table public.weekly_digests         enable row level security;
alter table public.family_ritual_settings enable row level security;
alter table public.moments                enable row level security;
alter table public.moment_media           enable row level security;
alter table public.voice_notes            enable row level security;
alter table public.moment_reactions       enable row level security;
alter table public.moment_tags            enable row level security;
alter table public.media_import_calibrations enable row level security;
alter table public.scan_checkpoints       enable row level security;

-- families
create policy families_select on public.families for select
  using (public.is_family_member(id));
create policy families_insert on public.families for insert
  with check (created_by = auth.uid());
create policy families_update on public.families for update
  using (public.is_family_member(id))
  with check (public.is_family_member(id));

-- family_members
create policy family_members_select on public.family_members for select
  using (public.is_family_member(family_id));
create policy family_members_admin_delete_circle on public.family_members for delete
  using (public.is_family_writer(family_id) and role = 'circle');

-- family_invites
create policy family_invites_select on public.family_invites for select
  using (public.is_family_member(family_id));
create policy family_invites_modify on public.family_invites for all
  using (public.is_family_writer(family_id))
  with check (public.is_family_writer(family_id));

-- photo_tags + memories
create policy photo_tags_all on public.photo_tags for all
  using (public.is_family_member(family_id))
  with check (public.is_family_writer(family_id) and tagged_by_user_id = auth.uid());

create policy memories_select on public.memories for select
  using (public.is_family_member(family_id));
create policy memories_insert on public.memories for insert
  with check (public.is_family_member(family_id) and author_user_id = auth.uid());
create policy memories_update_own on public.memories for update
  using (public.is_family_member(family_id) and author_user_id = auth.uid())
  with check (author_user_id = auth.uid());
create policy memories_delete_own on public.memories for delete
  using (public.is_family_member(family_id) and author_user_id = auth.uid());

-- rituals
create policy daily_prompt_responses_select on public.daily_prompt_responses for select
  using (public.is_family_member(family_id));
create policy daily_prompt_responses_insert on public.daily_prompt_responses for insert
  with check (public.is_family_member(family_id) and author_user_id = auth.uid());
create policy daily_prompt_responses_update_own on public.daily_prompt_responses for update
  using (public.is_family_member(family_id) and author_user_id = auth.uid())
  with check (author_user_id = auth.uid());
create policy daily_prompt_responses_delete_own on public.daily_prompt_responses for delete
  using (public.is_family_member(family_id) and author_user_id = auth.uid());

create policy goal_definitions_select on public.goal_definitions for select
  using (auth.uid() is not null);

create policy firsts_select on public.firsts for select
  using (public.is_family_member(family_id));
create policy firsts_insert on public.firsts for insert
  with check (public.is_family_member(family_id) and created_by_user_id = auth.uid());
create policy firsts_update_own on public.firsts for update
  using (public.is_family_member(family_id) and created_by_user_id = auth.uid())
  with check (created_by_user_id = auth.uid());
create policy firsts_delete_own on public.firsts for delete
  using (public.is_family_member(family_id) and created_by_user_id = auth.uid());

create policy letters_select on public.letters for select
  using (public.is_family_member(family_id));
create policy letters_insert on public.letters for insert
  with check (public.is_family_member(family_id) and author_user_id = auth.uid());
create policy letters_update_own on public.letters for update
  using (public.is_family_member(family_id) and author_user_id = auth.uid())
  with check (author_user_id = auth.uid());
create policy letters_delete_own on public.letters for delete
  using (public.is_family_member(family_id) and author_user_id = auth.uid());

create policy weekly_digests_select on public.weekly_digests for select
  using (public.is_family_member(family_id));
create policy weekly_digests_insert on public.weekly_digests for insert
  with check (public.is_family_member(family_id));
create policy weekly_digests_update on public.weekly_digests for update
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

create policy family_ritual_settings_select on public.family_ritual_settings for select
  using (public.is_family_member(family_id));
create policy family_ritual_settings_insert on public.family_ritual_settings for insert
  with check (public.is_family_writer(family_id));
create policy family_ritual_settings_update on public.family_ritual_settings for update
  using (public.is_family_writer(family_id))
  with check (public.is_family_writer(family_id));

create policy moments_select on public.moments for select
  using (public.is_family_member(family_id));
create policy moments_insert on public.moments for insert
  with check (public.is_family_writer(family_id) and author_user_id = auth.uid());
create policy moments_update_own on public.moments for update
  using (public.is_family_writer(family_id) and author_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and author_user_id = auth.uid());
create policy moments_delete_own on public.moments for delete
  using (public.is_family_writer(family_id) and author_user_id = auth.uid());

create policy moment_media_select on public.moment_media for select
  using (public.is_family_member(family_id));
create policy moment_media_insert on public.moment_media for insert
  with check (public.is_family_writer(family_id) and owner_user_id = auth.uid());
create policy moment_media_update_own on public.moment_media for update
  using (public.is_family_writer(family_id) and owner_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and owner_user_id = auth.uid());
create policy moment_media_delete_own on public.moment_media for delete
  using (public.is_family_writer(family_id) and owner_user_id = auth.uid());

create policy voice_notes_select on public.voice_notes for select
  using (public.is_family_member(family_id));
create policy voice_notes_insert on public.voice_notes for insert
  with check (public.is_family_writer(family_id) and author_user_id = auth.uid());
create policy voice_notes_update_own on public.voice_notes for update
  using (public.is_family_writer(family_id) and author_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and author_user_id = auth.uid());
create policy voice_notes_delete_own on public.voice_notes for delete
  using (public.is_family_writer(family_id) and author_user_id = auth.uid());

create policy moment_reactions_select on public.moment_reactions for select
  using (public.is_family_member(family_id));
create policy moment_reactions_all on public.moment_reactions for all
  using (public.is_family_writer(family_id) and author_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and author_user_id = auth.uid());

create policy moment_tags_select on public.moment_tags for select
  using (public.is_family_member(family_id));
create policy moment_tags_all on public.moment_tags for all
  using (public.is_family_writer(family_id))
  with check (public.is_family_writer(family_id));

create policy media_import_calibrations_select on public.media_import_calibrations for select
  using (public.is_family_writer(family_id) and user_id = auth.uid());
create policy media_import_calibrations_all on public.media_import_calibrations for all
  using (public.is_family_writer(family_id) and user_id = auth.uid())
  with check (public.is_family_writer(family_id) and user_id = auth.uid());

create policy scan_checkpoints_select on public.scan_checkpoints for select
  using (public.is_family_writer(family_id) and user_id = auth.uid());
create policy scan_checkpoints_all on public.scan_checkpoints for all
  using (public.is_family_writer(family_id) and user_id = auth.uid())
  with check (public.is_family_writer(family_id) and user_id = auth.uid());
