-- Lightweight family engagement state. Views are explicit app opens, not push
-- delivery or background fetches, and contain no moment text or media data.

create table if not exists public.moment_views (
  family_id   uuid not null references public.families(id) on delete cascade,
  moment_id   uuid not null references public.moments(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  viewed_at   timestamptz not null default now(),
  primary key (moment_id, user_id)
);

create index if not exists moment_views_family_viewed_idx
  on public.moment_views(family_id, viewed_at desc);

alter table public.moment_views enable row level security;

drop policy if exists moment_views_select on public.moment_views;
create policy moment_views_select on public.moment_views for select
  using (public.is_family_writer(family_id));

drop policy if exists moment_views_insert_own on public.moment_views;
create policy moment_views_insert_own on public.moment_views for insert
  with check (public.is_family_writer(family_id) and user_id = auth.uid());

drop policy if exists moment_views_update_own on public.moment_views;
create policy moment_views_update_own on public.moment_views for update
  using (public.is_family_writer(family_id) and user_id = auth.uid())
  with check (public.is_family_writer(family_id) and user_id = auth.uid());
