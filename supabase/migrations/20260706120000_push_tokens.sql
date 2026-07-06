-- Push token registry for Expo notifications.
-- Client writes are owner-only; server-side delivery uses the service role.

create table if not exists public.push_tokens (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  family_id        uuid not null references public.families(id) on delete cascade,
  expo_push_token  text not null check (length(trim(expo_push_token)) > 0),
  platform         text not null default 'unknown' check (platform in ('ios', 'android', 'web', 'unknown')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (expo_push_token),
  unique (user_id, family_id, platform)
);

create index if not exists push_tokens_family_idx
  on public.push_tokens(family_id, updated_at desc);

create index if not exists push_tokens_user_idx
  on public.push_tokens(user_id, updated_at desc);

drop trigger if exists push_tokens_updated on public.push_tokens;
create trigger push_tokens_updated
  before update on public.push_tokens
  for each row execute procedure public.ool_set_updated_at();

alter table public.push_tokens enable row level security;

drop policy if exists push_tokens_select_own on public.push_tokens;
drop policy if exists push_tokens_insert_own on public.push_tokens;
drop policy if exists push_tokens_update_own on public.push_tokens;
drop policy if exists push_tokens_delete_own on public.push_tokens;

create policy push_tokens_select_own on public.push_tokens for select
  using (user_id = auth.uid());

create policy push_tokens_insert_own on public.push_tokens for insert
  with check (user_id = auth.uid() and public.is_family_member(family_id));

create policy push_tokens_update_own on public.push_tokens for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_family_member(family_id));

create policy push_tokens_delete_own on public.push_tokens for delete
  using (user_id = auth.uid());
