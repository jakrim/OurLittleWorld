-- Grounded shared enrichment for parent-kept memories.
--
-- Unsaved candidate data remains on-device. These records reference only
-- canonical shared moments, parent-confirmed Firsts, canonical voice notes,
-- and exact fingerprints computed after a media upload is ready.

create table if not exists public.moment_annotations (
  id                  uuid primary key,
  family_id           uuid not null references public.families(id) on delete cascade,
  moment_id           uuid not null references public.moments(id) on delete cascade,
  author_user_id      uuid references auth.users(id) on delete set null,
  annotation_type     text not null check (annotation_type in ('text', 'voice')),
  body                text,
  voice_note_id       uuid references public.voice_notes(id) on delete cascade,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (
    (annotation_type = 'text' and nullif(trim(body), '') is not null and voice_note_id is null)
    or (annotation_type = 'voice' and body is null and voice_note_id is not null)
  ),
  unique (voice_note_id)
);

create index if not exists moment_annotations_moment_created_idx
  on public.moment_annotations(family_id, moment_id, created_at, id);
create index if not exists moment_annotations_author_idx
  on public.moment_annotations(family_id, author_user_id, created_at desc);

alter table public.moment_annotations enable row level security;

drop policy if exists moment_annotations_select on public.moment_annotations;
create policy moment_annotations_select on public.moment_annotations for select
  using (
    public.is_family_writer(family_id)
    or (
      public.is_family_circle_member(family_id)
      and public.is_moment_shared_with_circle(family_id, moment_id)
    )
  );
drop policy if exists moment_annotations_insert_active on public.moment_annotations;
create policy moment_annotations_insert_active on public.moment_annotations for insert
  with check (
    public.is_family_writer(family_id)
    and public.family_has_active_entitlement(family_id)
    and author_user_id = auth.uid()
  );
drop policy if exists moment_annotations_update_own on public.moment_annotations;
create policy moment_annotations_update_own on public.moment_annotations for update
  using (
    public.is_family_writer(family_id)
    and public.family_has_active_entitlement(family_id)
    and author_user_id = auth.uid()
  )
  with check (
    public.is_family_writer(family_id)
    and public.family_has_active_entitlement(family_id)
    and author_user_id = auth.uid()
  );
drop policy if exists moment_annotations_delete_own on public.moment_annotations;
create policy moment_annotations_delete_own on public.moment_annotations for delete
  using (
    public.is_family_writer(family_id)
    and public.family_has_active_entitlement(family_id)
    and author_user_id = auth.uid()
  );

create or replace function public.validate_moment_annotation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.moments m
    where m.id = new.moment_id and m.family_id = new.family_id
  ) then
    raise exception 'Annotation moment does not belong to family';
  end if;
  if new.annotation_type = 'voice' and not exists (
    select 1 from public.voice_notes vn
    where vn.id = new.voice_note_id
      and vn.family_id = new.family_id
      and vn.moment_id = new.moment_id
      and vn.author_user_id is not distinct from new.author_user_id
      and vn.upload_status = 'ready'
  ) then
    raise exception 'Voice note is not a ready authored note for this moment';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.validate_moment_annotation() from public;
drop trigger if exists moment_annotations_validate on public.moment_annotations;
create trigger moment_annotations_validate
  before insert or update on public.moment_annotations
  for each row execute function public.validate_moment_annotation();

-- Expensive-to-discover factual edges. Date, age and parent-entered place are
-- composed from current source rows at read time so they can never become stale.
create table if not exists public.moment_context_facts (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families(id) on delete cascade,
  moment_id           uuid not null references public.moments(id) on delete cascade,
  fact_type           text not null check (fact_type in ('confirmed_first_nearby')),
  source_type         text not null check (source_type in ('first')),
  source_id           uuid not null references public.firsts(id) on delete cascade,
  model_version       text not null default 'grounded-context-v1',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (moment_id, fact_type, source_id)
);

create index if not exists moment_context_facts_moment_idx
  on public.moment_context_facts(family_id, moment_id, fact_type, source_id);
create index if not exists moment_context_facts_source_idx
  on public.moment_context_facts(source_type, source_id, moment_id);

alter table public.moment_context_facts enable row level security;
drop policy if exists moment_context_facts_select on public.moment_context_facts;
create policy moment_context_facts_select on public.moment_context_facts for select
  using (
    public.is_family_writer(family_id)
    or (
      public.is_family_circle_member(family_id)
      and public.is_moment_shared_with_circle(family_id, moment_id)
    )
  );

create or replace function public.refresh_moment_context_facts(target_moment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.moments%rowtype;
begin
  select * into target from public.moments where id = target_moment_id;
  if not found then return; end if;

  insert into public.moment_context_facts (
    family_id, moment_id, fact_type, source_type, source_id, model_version, updated_at
  )
  select target.family_id, target.id, 'confirmed_first_nearby', 'first', f.id,
         'grounded-context-v1', now()
  from public.firsts f
  where f.family_id = target.family_id
    and f.done is distinct from false
    and f.happened_at is not null
    and abs((f.happened_at::date - target.captured_at::date)) <= 60
  on conflict (moment_id, fact_type, source_id) do update set
    model_version = excluded.model_version,
    updated_at = excluded.updated_at;

  delete from public.moment_context_facts mcf
  where mcf.moment_id = target.id
    and mcf.fact_type = 'confirmed_first_nearby'
    and not exists (
      select 1 from public.firsts f
      where f.id = mcf.source_id
        and f.family_id = target.family_id
        and f.done is distinct from false
        and f.happened_at is not null
        and abs((f.happened_at::date - target.captured_at::date)) <= 60
    );
end;
$$;

revoke all on function public.refresh_moment_context_facts(uuid) from public;

create or replace function public.refresh_context_for_moment_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'DELETE' then
    perform public.refresh_moment_context_facts(new.id);
    return new;
  end if;
  return old;
end;
$$;

revoke all on function public.refresh_context_for_moment_trigger() from public;
drop trigger if exists moments_refresh_grounded_context on public.moments;
create trigger moments_refresh_grounded_context
  after insert or update of captured_at on public.moments
  for each row execute function public.refresh_context_for_moment_trigger();

create or replace function public.refresh_context_for_first_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_moment_id uuid;
  target_family_id uuid := coalesce(new.family_id, old.family_id);
  earliest_date date := least(new.happened_at::date, old.happened_at::date) - 60;
  latest_date date := greatest(new.happened_at::date, old.happened_at::date) + 60;
begin
  for target_moment_id in
    select m.id from public.moments m
    where m.family_id = target_family_id
      and m.captured_at::date between earliest_date and latest_date
  loop
    perform public.refresh_moment_context_facts(target_moment_id);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.refresh_context_for_first_trigger() from public;
drop trigger if exists firsts_refresh_grounded_context on public.firsts;
create trigger firsts_refresh_grounded_context
  after insert or update of happened_at, done, family_id or delete on public.firsts
  for each row execute function public.refresh_context_for_first_trigger();

-- Post-save grouping is deliberately exact and conservative. The digest is
-- derived only from ready, shared media. It is not an on-device asset ID or an
-- unsaved perceptual fingerprint and it is never returned to clients.
create table if not exists public.saved_event_groups (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families(id) on delete cascade,
  algorithm           text not null check (algorithm in ('content-md5-v1')),
  content_digest      text not null check (content_digest ~ '^[a-f0-9]{32}$'),
  created_at          timestamptz not null default now(),
  unique (family_id, algorithm, content_digest)
);

create table if not exists public.saved_event_memberships (
  family_id           uuid not null references public.families(id) on delete cascade,
  event_group_id      uuid not null references public.saved_event_groups(id) on delete cascade,
  moment_id           uuid not null references public.moments(id) on delete cascade,
  moment_media_id     uuid not null references public.moment_media(id) on delete cascade,
  owner_user_id       uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  primary key (event_group_id, moment_media_id),
  unique (moment_media_id)
);

create index if not exists saved_event_memberships_moment_idx
  on public.saved_event_memberships(family_id, moment_id, event_group_id);
alter table public.saved_event_groups enable row level security;
alter table public.saved_event_memberships enable row level security;
-- No direct client policies: clients register and read sanitized grouping via RPC.

create or replace function public.register_saved_media_fingerprint(
  target_family_id uuid,
  target_moment_id uuid,
  target_moment_media_id uuid,
  target_algorithm text,
  target_digest text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_group_id uuid;
  previous_group_id uuid;
begin
  if auth.uid() is null
     or not public.is_family_writer(target_family_id)
     or not public.family_has_active_entitlement(target_family_id) then
    raise exception 'Active family writer required';
  end if;
  if target_algorithm <> 'content-md5-v1' or target_digest !~ '^[a-f0-9]{32}$' then
    raise exception 'Unsupported saved-media fingerprint';
  end if;
  if not exists (
    select 1 from public.moment_media mm
    where mm.id = target_moment_media_id
      and mm.moment_id = target_moment_id
      and mm.family_id = target_family_id
      and mm.owner_user_id = auth.uid()
      and mm.upload_status = 'ready'
  ) then
    raise exception 'Ready owned media required';
  end if;

  select sem.event_group_id into previous_group_id
  from public.saved_event_memberships sem
  where sem.moment_media_id = target_moment_media_id;

  insert into public.saved_event_groups (family_id, algorithm, content_digest)
  values (target_family_id, target_algorithm, target_digest)
  on conflict (family_id, algorithm, content_digest) do update
    set content_digest = excluded.content_digest
  returning id into target_group_id;

  insert into public.saved_event_memberships (
    family_id, event_group_id, moment_id, moment_media_id, owner_user_id
  ) values (
    target_family_id, target_group_id, target_moment_id, target_moment_media_id, auth.uid()
  )
  on conflict (moment_media_id) do update set
    event_group_id = excluded.event_group_id,
    moment_id = excluded.moment_id,
    owner_user_id = excluded.owner_user_id;
  if previous_group_id is not null and previous_group_id <> target_group_id then
    delete from public.saved_event_groups seg
    where seg.id = previous_group_id
      and not exists (
        select 1 from public.saved_event_memberships sem where sem.event_group_id = seg.id
      );
  end if;
  return target_group_id;
end;
$$;

revoke all on function public.register_saved_media_fingerprint(uuid, uuid, uuid, text, text) from public;
grant execute on function public.register_saved_media_fingerprint(uuid, uuid, uuid, text, text) to authenticated;

create or replace function public.list_saved_event_companions(
  target_family_id uuid,
  target_moment_id uuid,
  result_limit integer default 12
)
returns table (
  event_group_id uuid,
  moment_id uuid,
  moment_media_id uuid,
  owner_user_id uuid,
  owner_label text,
  captured_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_family_writer(target_family_id) then
    raise exception 'Family writer required';
  end if;
  return query
  select sem.event_group_id, sem.moment_id, sem.moment_media_id, sem.owner_user_id,
         coalesce(nullif(trim(fm.display_name), ''), nullif(trim(fm.relationship_label), ''), 'A parent'),
         m.captured_at
  from public.saved_event_memberships seed
  join public.saved_event_memberships sem on sem.event_group_id = seed.event_group_id
  join public.moments m on m.id = sem.moment_id and m.family_id = target_family_id
  left join public.family_members fm
    on fm.family_id = target_family_id and fm.user_id = sem.owner_user_id
  where seed.family_id = target_family_id and seed.moment_id = target_moment_id
  order by m.captured_at, sem.moment_id, sem.moment_media_id
  limit least(greatest(coalesce(result_limit, 12), 1), 24);
end;
$$;

revoke all on function public.list_saved_event_companions(uuid, uuid, integer) from public;
grant execute on function public.list_saved_event_companions(uuid, uuid, integer) to authenticated;

create or replace function public.cleanup_empty_saved_event_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.saved_event_groups seg
  where seg.id = old.event_group_id
    and not exists (
      select 1 from public.saved_event_memberships sem where sem.event_group_id = seg.id
    );
  return old;
end;
$$;

revoke all on function public.cleanup_empty_saved_event_group() from public;
drop trigger if exists saved_event_memberships_cleanup_group on public.saved_event_memberships;
create trigger saved_event_memberships_cleanup_group
  after delete on public.saved_event_memberships
  for each row execute function public.cleanup_empty_saved_event_group();

-- Rare source changes refresh the affected shared facts server-side rather than
-- loading a family's archive into JavaScript. The measured 5,000-moment path is
-- documented as a release tunable; ordinary reads remain paginated and bounded.
create or replace function public.refresh_family_shared_facts(target_family_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target_moment_id uuid;
begin
  for target_moment_id in
    select id from public.moments where family_id = target_family_id order by id
  loop
    perform public.refresh_moment_factual_collections(target_moment_id);
    perform public.refresh_moment_context_facts(target_moment_id);
  end loop;
end;
$$;

revoke all on function public.refresh_family_shared_facts(uuid) from public;

create or replace function public.refresh_family_sources_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_family_shared_facts(coalesce(new.id, old.id));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.refresh_family_sources_trigger() from public;
drop trigger if exists families_refresh_shared_facts on public.families;
create trigger families_refresh_shared_facts
  after update of baby_birthday on public.families
  for each row when (old.baby_birthday is distinct from new.baby_birthday)
  execute function public.refresh_family_sources_trigger();

create or replace function public.refresh_family_setting_sources_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_family_shared_facts(coalesce(new.family_id, old.family_id));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.refresh_family_setting_sources_trigger() from public;
drop trigger if exists ritual_settings_refresh_shared_facts on public.family_ritual_settings;
create trigger ritual_settings_refresh_shared_facts
  after insert or update of timezone or delete on public.family_ritual_settings
  for each row execute function public.refresh_family_setting_sources_trigger();

create or replace function public.refresh_family_member_sources_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_family_shared_facts(coalesce(new.family_id, old.family_id));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.refresh_family_member_sources_trigger() from public;
drop trigger if exists family_members_refresh_shared_facts on public.family_members;
create trigger family_members_refresh_shared_facts
  after insert or update of display_name, relationship_label, role or delete on public.family_members
  for each row execute function public.refresh_family_member_sources_trigger();

do $$
declare existing_moment_id uuid;
begin
  for existing_moment_id in select id from public.moments loop
    perform public.refresh_moment_context_facts(existing_moment_id);
  end loop;
end;
$$;

comment on table public.moment_annotations is
  'Separately authored text or canonical voice context for a parent-kept moment.';
comment on table public.moment_context_facts is
  'Source-linked factual edges only; prose is composed from current source rows.';
comment on table public.saved_event_groups is
  'Private server-side exact grouping key derived only after canonical media is shared.';
comment on table public.saved_event_memberships is
  'Non-destructive links between separately authored shared originals.';
