-- Short private replies between family writers. These remain attached to the
-- canonical moment rather than creating a second timeline entry.

create table if not exists public.moment_replies (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families(id) on delete cascade,
  moment_id       uuid not null references public.moments(id) on delete cascade,
  author_user_id  uuid not null references auth.users(id) on delete cascade,
  body            text not null check (char_length(trim(body)) between 1 and 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists moment_replies_moment_created_idx
  on public.moment_replies(moment_id, created_at asc);

drop trigger if exists moment_replies_updated on public.moment_replies;
create trigger moment_replies_updated
  before update on public.moment_replies
  for each row execute procedure public.ool_set_updated_at();

alter table public.moment_replies enable row level security;

drop policy if exists moment_replies_select on public.moment_replies;
create policy moment_replies_select on public.moment_replies for select
  using (public.is_family_writer(family_id));

drop policy if exists moment_replies_insert_own on public.moment_replies;
create policy moment_replies_insert_own on public.moment_replies for insert
  with check (public.is_family_writer(family_id) and author_user_id = auth.uid());

drop policy if exists moment_replies_update_own on public.moment_replies;
create policy moment_replies_update_own on public.moment_replies for update
  using (public.is_family_writer(family_id) and author_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and author_user_id = auth.uid());

drop policy if exists moment_replies_delete_own on public.moment_replies;
create policy moment_replies_delete_own on public.moment_replies for delete
  using (public.is_family_writer(family_id) and author_user_id = auth.uid());
