-- Each writer authorizes and scans only the photo library on their own device.
-- This family-readable projection contains aggregate connection health only:
-- never local asset identifiers, face data, image fingerprints, or camera-roll rows.

create table if not exists public.family_library_connections (
  family_id          uuid not null references public.families(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  discovery_enabled  boolean not null default true,
  status             text not null default 'not_started'
    check (status in ('not_started', 'scanning', 'ready', 'needs_permission', 'error')),
  last_scan_at       timestamptz,
  last_success_at    timestamptz,
  surfaced_count     integer not null default 0 check (surfaced_count >= 0),
  saved_count        integer not null default 0 check (saved_count >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (family_id, user_id)
);

create index if not exists family_library_connections_family_idx
  on public.family_library_connections(family_id, updated_at desc);

drop trigger if exists family_library_connections_updated on public.family_library_connections;
create trigger family_library_connections_updated
  before update on public.family_library_connections
  for each row execute procedure public.ool_set_updated_at();

alter table public.family_library_connections enable row level security;

drop policy if exists family_library_connections_select on public.family_library_connections;
create policy family_library_connections_select on public.family_library_connections for select
  using (public.is_family_writer(family_id));

drop policy if exists family_library_connections_insert_own on public.family_library_connections;
create policy family_library_connections_insert_own on public.family_library_connections for insert
  with check (public.is_family_writer(family_id) and user_id = auth.uid());

drop policy if exists family_library_connections_update_own on public.family_library_connections;
create policy family_library_connections_update_own on public.family_library_connections for update
  using (public.is_family_writer(family_id) and user_id = auth.uid())
  with check (public.is_family_writer(family_id) and user_id = auth.uid());

drop policy if exists family_library_connections_delete_own on public.family_library_connections;
create policy family_library_connections_delete_own on public.family_library_connections for delete
  using (public.is_family_writer(family_id) and user_id = auth.uid());
