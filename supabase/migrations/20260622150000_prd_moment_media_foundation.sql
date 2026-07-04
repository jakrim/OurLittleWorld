-- PRD v0.2 moment/media foundation
-- Adds the core entities needed by Add, Photo Detail, voice notes, reactions,
-- richer digests, calibrated media import, and view-only family circle.

alter table public.families
  add column if not exists palette_preference text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'families_palette_preference_check'
      and conrelid = 'public.families'::regclass
  ) then
    alter table public.families
      add constraint families_palette_preference_check
      check (
        palette_preference is null
        or palette_preference in ('hearth','sky','linen','twilight','meadow')
      ) not valid;
  end if;
end
$$;

do $$
begin
  alter table public.family_members drop constraint if exists family_members_role_check;
  alter table public.family_members
    add constraint family_members_role_check
    check (role in ('creator','partner','circle'));
exception
  when duplicate_object then null;
end
$$;

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

alter table public.weekly_digests
  add column if not exists representative_media jsonb not null default '[]'::jsonb;

alter table public.weekly_digests
  add column if not exists moment_count integer not null default 0;

alter table public.weekly_digests
  add column if not exists milestone_count integer not null default 0;

alter table public.weekly_digests
  add column if not exists voice_note_count integer not null default 0;

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

alter table public.moments                   enable row level security;
alter table public.moment_media              enable row level security;
alter table public.voice_notes               enable row level security;
alter table public.moment_reactions          enable row level security;
alter table public.moment_tags               enable row level security;
alter table public.media_import_calibrations enable row level security;
alter table public.scan_checkpoints          enable row level security;

drop policy if exists moments_select on public.moments;
create policy moments_select on public.moments for select
  using (public.is_family_member(family_id));

drop policy if exists moments_insert on public.moments;
create policy moments_insert on public.moments for insert
  with check (public.is_family_writer(family_id) and author_user_id = auth.uid());

drop policy if exists moments_update_own on public.moments;
create policy moments_update_own on public.moments for update
  using (public.is_family_writer(family_id) and author_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and author_user_id = auth.uid());

drop policy if exists moments_delete_own on public.moments;
create policy moments_delete_own on public.moments for delete
  using (public.is_family_writer(family_id) and author_user_id = auth.uid());

drop policy if exists moment_media_select on public.moment_media;
create policy moment_media_select on public.moment_media for select
  using (public.is_family_member(family_id));

drop policy if exists moment_media_insert on public.moment_media;
create policy moment_media_insert on public.moment_media for insert
  with check (public.is_family_writer(family_id) and owner_user_id = auth.uid());

drop policy if exists moment_media_update_own on public.moment_media;
create policy moment_media_update_own on public.moment_media for update
  using (public.is_family_writer(family_id) and owner_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and owner_user_id = auth.uid());

drop policy if exists moment_media_delete_own on public.moment_media;
create policy moment_media_delete_own on public.moment_media for delete
  using (public.is_family_writer(family_id) and owner_user_id = auth.uid());

drop policy if exists voice_notes_select on public.voice_notes;
create policy voice_notes_select on public.voice_notes for select
  using (public.is_family_member(family_id));

drop policy if exists voice_notes_insert on public.voice_notes;
create policy voice_notes_insert on public.voice_notes for insert
  with check (public.is_family_writer(family_id) and author_user_id = auth.uid());

drop policy if exists voice_notes_update_own on public.voice_notes;
create policy voice_notes_update_own on public.voice_notes for update
  using (public.is_family_writer(family_id) and author_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and author_user_id = auth.uid());

drop policy if exists voice_notes_delete_own on public.voice_notes;
create policy voice_notes_delete_own on public.voice_notes for delete
  using (public.is_family_writer(family_id) and author_user_id = auth.uid());

drop policy if exists moment_reactions_select on public.moment_reactions;
create policy moment_reactions_select on public.moment_reactions for select
  using (public.is_family_member(family_id));

drop policy if exists moment_reactions_all on public.moment_reactions;
create policy moment_reactions_all on public.moment_reactions for all
  using (public.is_family_writer(family_id) and author_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and author_user_id = auth.uid());

drop policy if exists moment_tags_select on public.moment_tags;
create policy moment_tags_select on public.moment_tags for select
  using (public.is_family_member(family_id));

drop policy if exists moment_tags_all on public.moment_tags;
create policy moment_tags_all on public.moment_tags for all
  using (public.is_family_writer(family_id))
  with check (public.is_family_writer(family_id));

drop policy if exists media_import_calibrations_select on public.media_import_calibrations;
create policy media_import_calibrations_select on public.media_import_calibrations for select
  using (public.is_family_writer(family_id) and user_id = auth.uid());

drop policy if exists media_import_calibrations_all on public.media_import_calibrations;
create policy media_import_calibrations_all on public.media_import_calibrations for all
  using (public.is_family_writer(family_id) and user_id = auth.uid())
  with check (public.is_family_writer(family_id) and user_id = auth.uid());

drop policy if exists scan_checkpoints_select on public.scan_checkpoints;
create policy scan_checkpoints_select on public.scan_checkpoints for select
  using (public.is_family_writer(family_id) and user_id = auth.uid());

drop policy if exists scan_checkpoints_all on public.scan_checkpoints;
create policy scan_checkpoints_all on public.scan_checkpoints for all
  using (public.is_family_writer(family_id) and user_id = auth.uid())
  with check (public.is_family_writer(family_id) and user_id = auth.uid());

drop policy if exists photo_tags_all on public.photo_tags;
create policy photo_tags_all on public.photo_tags for all
  using (public.is_family_member(family_id))
  with check (public.is_family_writer(family_id) and tagged_by_user_id = auth.uid());
