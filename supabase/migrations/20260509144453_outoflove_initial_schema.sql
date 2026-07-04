-- outOfLove cloud schema

create table if not exists public.ool_profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  baby_name      text,
  baby_birthday  date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.ool_photo_tags (
  user_id    uuid not null references auth.users(id) on delete cascade,
  asset_id   text not null,
  is_baby    boolean not null default false,
  tagged_at  timestamptz not null default now(),
  primary key (user_id, asset_id)
);

create index if not exists ool_photo_tags_baby_idx
  on public.ool_photo_tags (user_id) where is_baby;

create table if not exists public.ool_memories (
  user_id     uuid not null references auth.users(id) on delete cascade,
  asset_id    text not null,
  note        text not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, asset_id)
);

create or replace function public.ool_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists ool_profiles_updated on public.ool_profiles;
create trigger ool_profiles_updated
  before update on public.ool_profiles
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists ool_memories_updated on public.ool_memories;
create trigger ool_memories_updated
  before update on public.ool_memories
  for each row execute procedure public.ool_set_updated_at();

alter table public.ool_profiles    enable row level security;
alter table public.ool_photo_tags  enable row level security;
alter table public.ool_memories    enable row level security;

drop policy if exists ool_profiles_owner   on public.ool_profiles;
drop policy if exists ool_photo_tags_owner on public.ool_photo_tags;
drop policy if exists ool_memories_owner   on public.ool_memories;

create policy ool_profiles_owner on public.ool_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy ool_photo_tags_owner on public.ool_photo_tags
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy ool_memories_owner on public.ool_memories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);;
