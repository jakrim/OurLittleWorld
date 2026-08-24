-- In-app notification center rows. Push delivery may fail or be disabled; these
-- rows are still written so the activity center works without push consent.

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid references public.families(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  category      text not null,
  title         text not null,
  body          text not null,
  deep_link     text not null,
  thumbnail_url text,
  metadata      jsonb not null default '{}'::jsonb,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;

create policy notifications_select_own on public.notifications for select
  using (user_id = auth.uid());

create policy notifications_update_own on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
