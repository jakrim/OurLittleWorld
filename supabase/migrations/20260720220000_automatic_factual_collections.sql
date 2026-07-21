-- Durable, family-owned factual collections. Membership is derived only from
-- shared parent-kept records and explicit family facts. Unsaved candidate data
-- never reaches these tables.

create table if not exists public.collections (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families(id) on delete cascade,
  collection_key      text not null,
  kind                text not null check (kind in (
    'year', 'month', 'media', 'author', 'first', 'place', 'favorite', 'reaction', 'life_stage'
  )),
  title               text not null,
  source_code         text not null check (source_code in (
    'date_year', 'date_month', 'media_type', 'author', 'confirmed_first',
    'parent_place', 'favorite', 'reaction', 'life_stage'
  )),
  source_ref          text,
  confidence_band     text not null check (confidence_band in ('factual', 'confirmed', 'parent')),
  model_version       text not null default 'factual-collections-v1',
  system_generated    boolean not null default true,
  created_by_user_id  uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (family_id, collection_key),
  check (collection_key ~ '^[a-z0-9:_-]{1,160}$')
);

create table if not exists public.collection_memberships (
  family_id           uuid not null references public.families(id) on delete cascade,
  collection_id       uuid not null references public.collections(id) on delete cascade,
  moment_id           uuid not null references public.moments(id) on delete cascade,
  source_code         text not null check (source_code in (
    'date_year', 'date_month', 'media_type', 'author', 'confirmed_first',
    'parent_place', 'favorite', 'reaction', 'life_stage'
  )),
  source_ref          text,
  confidence_band     text not null check (confidence_band in ('factual', 'confirmed', 'parent')),
  model_version       text not null default 'factual-collections-v1',
  parent_override     text not null default 'none' check (parent_override in ('none', 'excluded')),
  override_by_user_id uuid references auth.users(id) on delete set null,
  overridden_at       timestamptz,
  refresh_token       uuid not null default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (collection_id, moment_id),
  unique (family_id, collection_id, moment_id)
);

create index if not exists collections_family_kind_idx
  on public.collections(family_id, kind, title, id);
create index if not exists collection_memberships_family_moment_idx
  on public.collection_memberships(family_id, moment_id, collection_id);
create index if not exists collection_memberships_collection_visible_idx
  on public.collection_memberships(collection_id, created_at desc, moment_id)
  where parent_override <> 'excluded';

alter table public.collections enable row level security;
alter table public.collection_memberships enable row level security;

create policy collections_select_writers on public.collections for select
  using (public.is_family_writer(family_id));
create policy collections_insert_active on public.collections for insert
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id));
create policy collections_update_active on public.collections for update
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id))
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id));
create policy collections_delete_active on public.collections for delete
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id));

create policy collection_memberships_select_writers on public.collection_memberships for select
  using (public.is_family_writer(family_id));
create policy collection_memberships_insert_active on public.collection_memberships for insert
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id));
create policy collection_memberships_update_active on public.collection_memberships for update
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id))
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id));
create policy collection_memberships_delete_active on public.collection_memberships for delete
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id));

create or replace function public.collection_safe_place_label(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select nullif(trim(value), '') is not null
    and length(trim(value)) <= 80
    and trim(value) !~* '^[-+]?\d{1,3}(\.\d+)?\s*[,/]\s*[-+]?\d{1,3}(\.\d+)?$';
$$;

create or replace function public.upsert_factual_collection_membership(
  target_family_id uuid,
  target_moment_id uuid,
  target_key text,
  target_kind text,
  target_title text,
  target_source_code text,
  target_source_ref text,
  target_confidence_band text,
  target_refresh_token uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_collection_id uuid;
begin
  insert into public.collections (
    family_id, collection_key, kind, title, source_code, source_ref,
    confidence_band, model_version, system_generated, updated_at
  ) values (
    target_family_id, target_key, target_kind, target_title, target_source_code,
    target_source_ref, target_confidence_band, 'factual-collections-v1', true, now()
  )
  on conflict (family_id, collection_key) do update set
    title = excluded.title,
    source_code = excluded.source_code,
    source_ref = excluded.source_ref,
    confidence_band = excluded.confidence_band,
    model_version = excluded.model_version,
    updated_at = excluded.updated_at
  where (collections.title, collections.source_code, collections.source_ref,
         collections.confidence_band, collections.model_version)
    is distinct from
        (excluded.title, excluded.source_code, excluded.source_ref,
         excluded.confidence_band, excluded.model_version)
  returning id into target_collection_id;

  if target_collection_id is null then
    select id into target_collection_id
    from public.collections
    where family_id = target_family_id and collection_key = target_key;
  end if;

  insert into public.collection_memberships (
    family_id, collection_id, moment_id, source_code, source_ref,
    confidence_band, model_version, refresh_token, updated_at
  ) values (
    target_family_id, target_collection_id, target_moment_id, target_source_code,
    target_source_ref, target_confidence_band, 'factual-collections-v1',
    target_refresh_token, now()
  )
  on conflict (collection_id, moment_id) do update set
    source_code = excluded.source_code,
    source_ref = excluded.source_ref,
    confidence_band = excluded.confidence_band,
    model_version = excluded.model_version,
    refresh_token = excluded.refresh_token,
    updated_at = excluded.updated_at
  where (collection_memberships.source_code, collection_memberships.source_ref,
         collection_memberships.confidence_band, collection_memberships.model_version)
    is distinct from
        (excluded.source_code, excluded.source_ref,
         excluded.confidence_band, excluded.model_version);
end;
$$;

revoke all on function public.upsert_factual_collection_membership(uuid, uuid, text, text, text, text, text, text, uuid) from public;

create or replace function public.refresh_moment_factual_collections(target_moment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.moments%rowtype;
  family_birthday date;
  family_timezone text;
  local_capture date;
  refresh_id uuid := gen_random_uuid();
  valid_collection_keys text[] := '{}'::text[];
  author_label text;
  place_label text;
  place_key text;
begin
  select * into target from public.moments where id = target_moment_id;
  if not found then return; end if;

  select f.baby_birthday,
         coalesce(nullif(rs.timezone, 'local'), 'UTC')
    into family_birthday, family_timezone
  from public.families f
  left join public.family_ritual_settings rs on rs.family_id = f.id
  where f.id = target.family_id;
  local_capture := (target.captured_at at time zone family_timezone)::date;

  valid_collection_keys := array_append(valid_collection_keys, 'year:' || to_char(local_capture, 'YYYY'));
  perform public.upsert_factual_collection_membership(
    target.family_id, target.id, 'year:' || to_char(local_capture, 'YYYY'),
    'year', to_char(local_capture, 'YYYY'), 'date_year', to_char(local_capture, 'YYYY'),
    'factual', refresh_id
  );
  valid_collection_keys := array_append(valid_collection_keys, 'month:' || to_char(local_capture, 'YYYY-MM'));
  perform public.upsert_factual_collection_membership(
    target.family_id, target.id, 'month:' || to_char(local_capture, 'YYYY-MM'),
    'month', trim(to_char(local_capture, 'FMMonth YYYY')), 'date_month',
    to_char(local_capture, 'YYYY-MM'), 'factual', refresh_id
  );

  if family_birthday is not null and local_capture >= family_birthday
     and local_capture < (family_birthday + interval '1 year')::date then
    valid_collection_keys := array_append(valid_collection_keys, 'life:first-year');
    perform public.upsert_factual_collection_membership(
      target.family_id, target.id, 'life:first-year', 'life_stage', 'First year',
      'life_stage', 'first-year', 'factual', refresh_id
    );
  end if;

  if exists (select 1 from public.moment_media mm where mm.moment_id = target.id and mm.media_type = 'image') then
    valid_collection_keys := array_append(valid_collection_keys, 'media:photos');
    perform public.upsert_factual_collection_membership(
      target.family_id, target.id, 'media:photos', 'media', 'Photos',
      'media_type', 'image', 'factual', refresh_id
    );
  end if;
  if exists (select 1 from public.moment_media mm where mm.moment_id = target.id and mm.media_type = 'video') then
    valid_collection_keys := array_append(valid_collection_keys, 'media:videos');
    perform public.upsert_factual_collection_membership(
      target.family_id, target.id, 'media:videos', 'media', 'Videos',
      'media_type', 'video', 'factual', refresh_id
    );
  end if;
  if exists (select 1 from public.voice_notes vn where vn.moment_id = target.id) then
    valid_collection_keys := array_append(valid_collection_keys, 'media:voice');
    perform public.upsert_factual_collection_membership(
      target.family_id, target.id, 'media:voice', 'media', 'Voice notes',
      'media_type', 'voice', 'factual', refresh_id
    );
  end if;

  if target.author_user_id is not null then
    select coalesce(nullif(trim(fm.display_name), ''), nullif(trim(fm.relationship_label), ''), 'A parent')
      into author_label
    from public.family_members fm
    where fm.family_id = target.family_id and fm.user_id = target.author_user_id;
    valid_collection_keys := array_append(valid_collection_keys, 'author:' || target.author_user_id::text);
    perform public.upsert_factual_collection_membership(
      target.family_id, target.id, 'author:' || target.author_user_id::text,
      'author', 'Added by ' || coalesce(author_label, 'a parent'), 'author',
      target.author_user_id::text, 'confirmed', refresh_id
    );
  end if;

  if exists (select 1 from public.firsts f where f.family_id = target.family_id and f.moment_id = target.id and f.done is distinct from false) then
    valid_collection_keys := array_append(valid_collection_keys, 'firsts:confirmed');
    perform public.upsert_factual_collection_membership(
      target.family_id, target.id, 'firsts:confirmed', 'first', 'Firsts',
      'confirmed_first', target.id::text, 'confirmed', refresh_id
    );
  end if;

  place_label := trim(target.place_name);
  if public.collection_safe_place_label(place_label) then
    place_key := 'place:' || encode(extensions.digest(lower(place_label), 'sha256'), 'hex');
    valid_collection_keys := array_append(valid_collection_keys, place_key);
    perform public.upsert_factual_collection_membership(
      target.family_id, target.id, place_key,
      'place', place_label, 'parent_place', lower(place_label), 'parent', refresh_id
    );
  end if;

  if exists (select 1 from public.moment_reactions mr where mr.moment_id = target.id and mr.emoji = 'heart') then
    valid_collection_keys := array_append(valid_collection_keys, 'reaction:favorites');
    perform public.upsert_factual_collection_membership(
      target.family_id, target.id, 'reaction:favorites', 'favorite', 'Favorites',
      'favorite', 'heart', 'parent', refresh_id
    );
  end if;
  if exists (select 1 from public.moment_reactions mr where mr.moment_id = target.id and mr.emoji <> 'heart') then
    valid_collection_keys := array_append(valid_collection_keys, 'reaction:family');
    perform public.upsert_factual_collection_membership(
      target.family_id, target.id, 'reaction:family', 'reaction', 'Family reactions',
      'reaction', 'non-heart', 'parent', refresh_id
    );
  end if;

  delete from public.collection_memberships cm
  using public.collections c
  where cm.collection_id = c.id
    and cm.family_id = target.family_id and cm.moment_id = target.id
    and not (c.collection_key = any(valid_collection_keys));

  delete from public.collections c
  where c.family_id = target.family_id and c.system_generated
    and not exists (
      select 1 from public.collection_memberships cm where cm.collection_id = c.id
    );
end;
$$;

revoke all on function public.refresh_moment_factual_collections(uuid) from public;

create or replace function public.refresh_factual_collection_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_moment_id uuid;
begin
  if tg_table_name = 'moments' then
    if tg_op = 'DELETE' then return old; end if;
    target_moment_id := new.id;
  elsif tg_op = 'DELETE' then
    target_moment_id := old.moment_id;
  else
    target_moment_id := new.moment_id;
  end if;
  perform public.refresh_moment_factual_collections(target_moment_id);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists moments_refresh_factual_collections on public.moments;
create trigger moments_refresh_factual_collections
  after insert or update of captured_at, place_name, author_user_id on public.moments
  for each row execute function public.refresh_factual_collection_trigger();
drop trigger if exists moment_media_refresh_factual_collections on public.moment_media;
create trigger moment_media_refresh_factual_collections
  after insert or update of media_type or delete on public.moment_media
  for each row execute function public.refresh_factual_collection_trigger();
drop trigger if exists voice_notes_refresh_factual_collections on public.voice_notes;
create trigger voice_notes_refresh_factual_collections
  after insert or delete on public.voice_notes
  for each row execute function public.refresh_factual_collection_trigger();
drop trigger if exists firsts_refresh_factual_collections on public.firsts;
create trigger firsts_refresh_factual_collections
  after insert or update of moment_id, done or delete on public.firsts
  for each row execute function public.refresh_factual_collection_trigger();
drop trigger if exists moment_reactions_refresh_factual_collections on public.moment_reactions;
create trigger moment_reactions_refresh_factual_collections
  after insert or update of emoji or delete on public.moment_reactions
  for each row execute function public.refresh_factual_collection_trigger();

create or replace function public.apply_moment_collection_choices(
  target_family_id uuid,
  target_moment_id uuid,
  available_collection_keys text[],
  selected_collection_keys text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not public.is_family_writer(target_family_id)
     or not public.family_has_active_entitlement(target_family_id) then
    raise exception 'Active family writer required';
  end if;
  if not exists (
    select 1 from public.moments m where m.id = target_moment_id and m.family_id = target_family_id
  ) then
    raise exception 'Moment not found';
  end if;

  perform public.refresh_moment_factual_collections(target_moment_id);
  update public.collection_memberships cm
  set parent_override = case when c.collection_key = any(coalesce(selected_collection_keys, '{}'::text[])) then 'none' else 'excluded' end,
      override_by_user_id = auth.uid(), overridden_at = now(), updated_at = now()
  from public.collections c
  where cm.collection_id = c.id and cm.family_id = target_family_id and cm.moment_id = target_moment_id
    and c.collection_key = any(coalesce(available_collection_keys, '{}'::text[]));
end;
$$;

revoke all on function public.apply_moment_collection_choices(uuid, uuid, text[], text[]) from public;
grant execute on function public.apply_moment_collection_choices(uuid, uuid, text[], text[]) to authenticated;

create or replace function public.set_collection_membership_visible(
  target_family_id uuid,
  target_collection_id uuid,
  target_moment_id uuid,
  visible boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not public.is_family_writer(target_family_id)
     or not public.family_has_active_entitlement(target_family_id) then
    raise exception 'Active family writer required';
  end if;
  update public.collection_memberships
  set parent_override = case when visible then 'none' else 'excluded' end,
      override_by_user_id = auth.uid(), overridden_at = now(), updated_at = now()
  where family_id = target_family_id and collection_id = target_collection_id and moment_id = target_moment_id;
  if not found then raise exception 'Collection membership not found'; end if;
end;
$$;

revoke all on function public.set_collection_membership_visible(uuid, uuid, uuid, boolean) from public;
grant execute on function public.set_collection_membership_visible(uuid, uuid, uuid, boolean) to authenticated;

create or replace view public.family_collection_summaries
with (security_invoker = true)
as
select c.id, c.family_id, c.collection_key, c.kind, c.title, c.source_code,
       c.source_ref, c.confidence_band, c.model_version,
       count(cm.moment_id)::integer as moment_count,
       max(m.captured_at) as latest_captured_at
from public.collections c
join public.collection_memberships cm on cm.collection_id = c.id and cm.parent_override <> 'excluded'
join public.moments m on m.id = cm.moment_id
group by c.id;

create or replace view public.family_collection_moments
with (security_invoker = true)
as
select cm.family_id, cm.collection_id, cm.moment_id, m.captured_at
from public.collection_memberships cm
join public.moments m on m.id = cm.moment_id
where cm.parent_override <> 'excluded';

do $$
declare existing_moment_id uuid;
begin
  for existing_moment_id in select id from public.moments loop
    perform public.refresh_moment_factual_collections(existing_moment_id);
  end loop;
end;
$$;

comment on table public.collections is
  'Family-owned factual collection definitions derived only from shared parent-kept records.';
comment on table public.collection_memberships is
  'Source-aware, reversible collection membership. Corrections are independent from child identity feedback.';
comment on view public.family_collection_moments is
  'Writer-scoped visible collection membership ordered by canonical memory capture time.';
