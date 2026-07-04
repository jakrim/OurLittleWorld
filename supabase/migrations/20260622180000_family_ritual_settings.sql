-- Family ritual settings
-- Persists the Settings control-plane choices for prompt/digest/monthiversary cadence.

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

drop trigger if exists family_ritual_settings_updated on public.family_ritual_settings;
create trigger family_ritual_settings_updated
  before update on public.family_ritual_settings
  for each row execute procedure public.ool_set_updated_at();

alter table public.family_ritual_settings enable row level security;

drop policy if exists family_ritual_settings_select on public.family_ritual_settings;
create policy family_ritual_settings_select on public.family_ritual_settings for select
  using (public.is_family_member(family_id));

drop policy if exists family_ritual_settings_insert on public.family_ritual_settings;
create policy family_ritual_settings_insert on public.family_ritual_settings for insert
  with check (public.is_family_writer(family_id));

drop policy if exists family_ritual_settings_update on public.family_ritual_settings;
create policy family_ritual_settings_update on public.family_ritual_settings for update
  using (public.is_family_writer(family_id))
  with check (public.is_family_writer(family_id));
