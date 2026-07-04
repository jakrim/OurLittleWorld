-- ─── new tables ──────────────────────────────────────────────────────────

create table if not exists public.families (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  baby_name       text,
  baby_birthday   date,
  created_by      uuid not null references auth.users(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id     uuid not null references public.families(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  display_name  text,
  role          text not null default 'partner' check (role in ('creator','partner')),
  joined_at     timestamptz not null default now(),
  primary key (family_id, user_id)
);

create index if not exists family_members_user_idx on public.family_members(user_id);

create table if not exists public.family_invites (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families(id) on delete cascade,
  code            text not null unique,
  created_by      uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '7 days'),
  used_by         uuid references auth.users(id) on delete set null,
  used_at         timestamptz
);

create index if not exists family_invites_family_idx on public.family_invites(family_id);

create table if not exists public.photo_tags (
  family_id            uuid not null references public.families(id) on delete cascade,
  asset_owner_user_id  uuid not null references auth.users(id) on delete cascade,
  asset_id             text not null,
  tagged_by_user_id    uuid not null references auth.users(id) on delete cascade,
  tagged_at            timestamptz not null default now(),
  primary key (family_id, asset_owner_user_id, asset_id)
);

create index if not exists photo_tags_family_idx on public.photo_tags(family_id);
create index if not exists photo_tags_owner_idx on public.photo_tags(family_id, asset_owner_user_id);

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

-- ─── updated_at triggers ────────────────────────────────────────────────

drop trigger if exists families_updated on public.families;
create trigger families_updated
  before update on public.families
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists memories_updated on public.memories;
create trigger memories_updated
  before update on public.memories
  for each row execute procedure public.ool_set_updated_at();

-- ─── helper: is the current user a member of this family? ───────────────

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

-- ─── invite code generator ──────────────────────────────────────────────
-- 8-char Crockford base32 (avoids confusing 0/O/1/I), 32^8 keyspace.

create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = public, pg_catalog
as $$
declare
  alphabet text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  i int;
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

-- ─── row-level security ─────────────────────────────────────────────────

alter table public.families        enable row level security;
alter table public.family_members  enable row level security;
alter table public.family_invites  enable row level security;
alter table public.photo_tags      enable row level security;
alter table public.memories        enable row level security;

drop policy if exists families_select        on public.families;
drop policy if exists families_insert        on public.families;
drop policy if exists families_update        on public.families;
drop policy if exists family_members_select  on public.family_members;
drop policy if exists family_members_modify  on public.family_members;
drop policy if exists family_invites_select  on public.family_invites;
drop policy if exists family_invites_modify  on public.family_invites;
drop policy if exists photo_tags_all         on public.photo_tags;
drop policy if exists memories_select        on public.memories;
drop policy if exists memories_insert        on public.memories;
drop policy if exists memories_update_own    on public.memories;
drop policy if exists memories_delete_own    on public.memories;

-- families: members can see/update; anyone signed-in can create (and become creator)
create policy families_select on public.families for select
  using (public.is_family_member(id));
create policy families_insert on public.families for insert
  with check (created_by = auth.uid());
create policy families_update on public.families for update
  using (public.is_family_member(id))
  with check (public.is_family_member(id));

-- family_members: members of the same family can see all rows; users can manage their own membership
create policy family_members_select on public.family_members for select
  using (public.is_family_member(family_id));
create policy family_members_modify on public.family_members for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- family_invites: members can see/create invites; anyone can redeem via the redeem rpc (handled below)
create policy family_invites_select on public.family_invites for select
  using (public.is_family_member(family_id));
create policy family_invites_modify on public.family_invites for all
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

-- photo_tags + memories: family-wide read/write
create policy photo_tags_all on public.photo_tags for all
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id) and tagged_by_user_id = auth.uid());

create policy memories_select on public.memories for select
  using (public.is_family_member(family_id));
create policy memories_insert on public.memories for insert
  with check (public.is_family_member(family_id) and author_user_id = auth.uid());
create policy memories_update_own on public.memories for update
  using (public.is_family_member(family_id) and author_user_id = auth.uid())
  with check (author_user_id = auth.uid());
create policy memories_delete_own on public.memories for delete
  using (public.is_family_member(family_id) and author_user_id = auth.uid());

-- ─── invite redemption RPC ──────────────────────────────────────────────
-- Lets anyone signed-in atomically redeem a code and join the family.

create or replace function public.redeem_family_invite(invite_code text, member_display_name text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_invite public.family_invites%rowtype;
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

  insert into public.family_members (family_id, user_id, display_name, role)
  values (v_invite.family_id, auth.uid(), member_display_name, 'partner')
  on conflict (family_id, user_id) do nothing;

  update public.family_invites set used_by = auth.uid(), used_at = now()
   where id = v_invite.id;

  return v_invite.family_id;
end
$$;

revoke all on function public.redeem_family_invite(text, text) from public, anon;
grant execute on function public.redeem_family_invite(text, text) to authenticated;

-- ─── backfill: jesse's existing data into a fresh family ────────────────

do $$
declare
  v_user uuid;
  v_baby_name text;
  v_baby_birthday date;
  v_family_id uuid;
begin
  -- pick the first existing user that has any data; in practice there's only one
  select p.user_id, p.baby_name, p.baby_birthday
    into v_user, v_baby_name, v_baby_birthday
    from public.ool_profiles p
    order by p.created_at asc
    limit 1;

  if v_user is null then
    raise notice 'no existing profiles to migrate';
    return;
  end if;

  -- only backfill if not already migrated
  if exists (select 1 from public.family_members where user_id = v_user) then
    raise notice 'user % already in a family, skipping backfill', v_user;
    return;
  end if;

  insert into public.families (name, baby_name, baby_birthday, created_by)
  values ('Our Little World', v_baby_name, v_baby_birthday, v_user)
  returning id into v_family_id;

  insert into public.family_members (family_id, user_id, display_name, role)
  values (v_family_id, v_user, 'Papa', 'creator');

  insert into public.photo_tags (family_id, asset_owner_user_id, asset_id, tagged_by_user_id, tagged_at)
  select v_family_id, t.user_id, t.asset_id, t.user_id, t.tagged_at
    from public.ool_photo_tags t
   where t.user_id = v_user and t.is_baby = true;

  insert into public.memories (family_id, asset_owner_user_id, asset_id, author_user_id, note, updated_at)
  select v_family_id, m.user_id, m.asset_id, m.user_id, m.note, m.updated_at
    from public.ool_memories m
   where m.user_id = v_user;

  raise notice 'backfilled user % into family %', v_user, v_family_id;
end
$$;
;
