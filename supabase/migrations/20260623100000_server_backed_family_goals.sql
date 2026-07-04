-- Server-backed goal definitions for Firsts and future family progression.

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

alter table public.firsts
  add column if not exists goal_key text;

do $$
begin
  alter table public.firsts
    add constraint firsts_goal_key_fkey
    foreign key (goal_key)
    references public.goal_definitions(key)
    on update cascade
    on delete set null;
exception
  when duplicate_object then null;
end
$$;

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

create index if not exists goal_definitions_type_active_order_idx
  on public.goal_definitions(goal_type, active, sort_order);

create index if not exists firsts_family_goal_key_idx
  on public.firsts(family_id, goal_key)
  where goal_key is not null;

drop trigger if exists goal_definitions_updated on public.goal_definitions;
create trigger goal_definitions_updated
  before update on public.goal_definitions
  for each row execute procedure public.ool_set_updated_at();

alter table public.goal_definitions enable row level security;

drop policy if exists goal_definitions_select on public.goal_definitions;
create policy goal_definitions_select on public.goal_definitions for select
  using (auth.uid() is not null);
