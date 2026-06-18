-- Ritual Feature MVP
-- Adds family-scoped rituals for daily prompts, firsts, letters, and weekly digests.

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

create table if not exists public.firsts (
  id                   uuid primary key default gen_random_uuid(),
  family_id            uuid not null references public.families(id) on delete cascade,
  created_by_user_id   uuid not null references auth.users(id) on delete cascade,
  title                text not null,
  note                 text,
  happened_at          timestamptz,
  asset_owner_user_id  uuid references auth.users(id) on delete set null,
  asset_id             text,
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
  sealed_at       timestamptz not null default now(),
  opened_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

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
  cover_asset_owner_user_id  uuid references auth.users(id) on delete set null,
  cover_asset_id             text,
  generated_at               timestamptz not null default now(),
  unique (family_id, week_start)
);

drop trigger if exists daily_prompt_responses_updated on public.daily_prompt_responses;
create trigger daily_prompt_responses_updated
  before update on public.daily_prompt_responses
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists firsts_updated on public.firsts;
create trigger firsts_updated
  before update on public.firsts
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists letters_updated on public.letters;
create trigger letters_updated
  before update on public.letters
  for each row execute procedure public.ool_set_updated_at();

alter table public.daily_prompt_responses enable row level security;
alter table public.firsts                 enable row level security;
alter table public.letters                enable row level security;
alter table public.weekly_digests         enable row level security;

drop policy if exists daily_prompt_responses_select on public.daily_prompt_responses;
create policy daily_prompt_responses_select on public.daily_prompt_responses for select
  using (public.is_family_member(family_id));

drop policy if exists daily_prompt_responses_insert on public.daily_prompt_responses;
create policy daily_prompt_responses_insert on public.daily_prompt_responses for insert
  with check (public.is_family_member(family_id) and author_user_id = auth.uid());

drop policy if exists daily_prompt_responses_update_own on public.daily_prompt_responses;
create policy daily_prompt_responses_update_own on public.daily_prompt_responses for update
  using (public.is_family_member(family_id) and author_user_id = auth.uid())
  with check (author_user_id = auth.uid());

drop policy if exists daily_prompt_responses_delete_own on public.daily_prompt_responses;
create policy daily_prompt_responses_delete_own on public.daily_prompt_responses for delete
  using (public.is_family_member(family_id) and author_user_id = auth.uid());

drop policy if exists firsts_select on public.firsts;
create policy firsts_select on public.firsts for select
  using (public.is_family_member(family_id));

drop policy if exists firsts_insert on public.firsts;
create policy firsts_insert on public.firsts for insert
  with check (public.is_family_member(family_id) and created_by_user_id = auth.uid());

drop policy if exists firsts_update_own on public.firsts;
create policy firsts_update_own on public.firsts for update
  using (public.is_family_member(family_id) and created_by_user_id = auth.uid())
  with check (created_by_user_id = auth.uid());

drop policy if exists firsts_delete_own on public.firsts;
create policy firsts_delete_own on public.firsts for delete
  using (public.is_family_member(family_id) and created_by_user_id = auth.uid());

drop policy if exists letters_select on public.letters;
create policy letters_select on public.letters for select
  using (public.is_family_member(family_id));

drop policy if exists letters_insert on public.letters;
create policy letters_insert on public.letters for insert
  with check (public.is_family_member(family_id) and author_user_id = auth.uid());

drop policy if exists letters_update_own on public.letters;
create policy letters_update_own on public.letters for update
  using (public.is_family_member(family_id) and author_user_id = auth.uid())
  with check (author_user_id = auth.uid());

drop policy if exists letters_delete_own on public.letters;
create policy letters_delete_own on public.letters for delete
  using (public.is_family_member(family_id) and author_user_id = auth.uid());

drop policy if exists weekly_digests_select on public.weekly_digests;
create policy weekly_digests_select on public.weekly_digests for select
  using (public.is_family_member(family_id));

drop policy if exists weekly_digests_insert on public.weekly_digests;
create policy weekly_digests_insert on public.weekly_digests for insert
  with check (public.is_family_member(family_id));

drop policy if exists weekly_digests_update on public.weekly_digests;
create policy weekly_digests_update on public.weekly_digests for update
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));
