-- A Keep is not shared until its moment, media, tag, and quota finalization can
-- commit together. Provider/storage preparation remains private and replayable.

alter table public.media_upload_reservations
  add column if not exists provider_upload_confirmed_at timestamptz;

-- These composite keys are both database integrity and the stable PostgREST
-- relationship names used by source-matched clients. Fresh databases must not
-- depend on an out-of-band schema repair for family-scoped joins.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.moments'::regclass and conname='moments_id_family_key') then
    alter table public.moments add constraint moments_id_family_key unique (id, family_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.moment_media'::regclass and conname='moment_media_id_family_key') then
    alter table public.moment_media add constraint moment_media_id_family_key unique (id, family_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.moment_media'::regclass and conname='moment_media_moment_family_fkey') then
    alter table public.moment_media
      add constraint moment_media_moment_family_fkey
      foreign key (moment_id, family_id) references public.moments(id, family_id)
      on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.photo_tags'::regclass and conname='photo_tags_moment_family_fkey') then
    alter table public.photo_tags
      add constraint photo_tags_moment_family_fkey
      foreign key (moment_id, family_id) references public.moments(id, family_id)
      on delete set null (moment_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.photo_tags'::regclass and conname='photo_tags_media_family_fkey') then
    alter table public.photo_tags
      add constraint photo_tags_media_family_fkey
      foreign key (moment_media_id, family_id) references public.moment_media(id, family_id)
      on delete set null (moment_media_id);
  end if;
end $$;

-- Provider publication is durable family-media provenance, not a client
-- capability. It outlives the uploader's reservation/authorship so preserved
-- shared media remains playable after an additional caregiver deletes their
-- account. Legacy rows are intentionally not backfilled.
create table if not exists public.canonical_media_provider_publications (
  moment_media_id uuid not null,
  family_id uuid not null,
  provider text not null check (provider in ('stream')),
  provider_object_id text not null check (length(trim(provider_object_id)) > 0),
  source_reservation_id uuid not null,
  published_at timestamptz not null default now(),
  primary key (moment_media_id, provider),
  unique (provider, provider_object_id),
  unique (source_reservation_id),
  constraint canonical_media_provider_publications_media_family_fkey
    foreign key (moment_media_id, family_id)
    references public.moment_media(id, family_id)
    on delete cascade
);

alter table public.canonical_media_provider_publications enable row level security;
revoke all on table public.canonical_media_provider_publications
  from public, anon, authenticated;
grant select, insert, update, delete on table public.canonical_media_provider_publications
  to service_role;

create or replace function public.confirm_canonical_media_provider_upload(
  p_reservation_id uuid,
  p_provider text,
  p_provider_object_id text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  reservation public.media_upload_reservations%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Provider upload confirmation requires a trusted service.';
  end if;
  if p_provider <> 'stream' or nullif(trim(p_provider_object_id), '') is null then
    raise exception 'Provider upload confirmation is invalid.';
  end if;

  select * into reservation
  from public.media_upload_reservations
  where id = p_reservation_id
  for update;

  if not found
    or reservation.transport <> 'video-stream'
    or reservation.provider is distinct from p_provider
    or reservation.provider_object_id is distinct from trim(p_provider_object_id)
    or reservation.status not in ('reserved', 'finalized') then
    raise exception 'Provider upload confirmation does not match its canonical reservation.';
  end if;

  update public.media_upload_reservations
  set provider_upload_confirmed_at = coalesce(provider_upload_confirmed_at, now())
  where id = p_reservation_id;
end
$$;

revoke all on function public.confirm_canonical_media_provider_upload(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.confirm_canonical_media_provider_upload(uuid, text, text)
  to service_role;

-- Transitional cutover compatibility: the updated Edge function claims the
-- provider identity with service credentials before the following migration
-- revokes the legacy authenticated grant.
grant execute on function public.claim_canonical_media_upload_provider_object(uuid, text, text)
  to service_role;

create or replace function public.finalize_canonical_media_keep(
  target_family_id uuid,
  p_reservation_id uuid,
  p_transport text,
  p_moment_id uuid,
  p_media_id uuid,
  p_asset_id text,
  p_captured_at timestamptz,
  p_tagged_at timestamptz,
  p_creation_time timestamptz,
  p_latitude double precision,
  p_longitude double precision,
  p_location_fetched_at timestamptz,
  p_file_name text,
  p_mime_type text,
  p_full_object uuid,
  p_thumb_object uuid,
  p_poster_object uuid,
  p_full_storage_path text,
  p_thumb_storage_path text,
  p_poster_storage_path text,
  p_width integer,
  p_height integer,
  p_duration_sec numeric,
  p_metadata jsonb,
  p_stream_uid text,
  p_source_bytes bigint,
  p_optimized_bytes bigint,
  p_playback_seconds integer,
  p_actual_bytes bigint,
  p_actual_duration_sec integer
)
returns table (
  moment_id uuid,
  moment_media_id uuid,
  photo_tag_id uuid,
  already_published boolean
)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  writer_id uuid := auth.uid();
  reservation public.media_upload_reservations%rowtype;
  existing_moment public.moments%rowtype;
  existing_media public.moment_media%rowtype;
  existing_tag public.photo_tags%rowtype;
  saved_tag_id uuid;
  expected_media_type text;
  expected_quota_class text;
  expected_storage_provider text;
  expected_playback_provider text;
  expected_tag_storage uuid;
  expected_tag_thumb uuid;
  actual_bytes bigint;
  actual_seconds integer;
  was_published boolean := false;
begin
  if writer_id is null then raise exception 'must be signed in'; end if;
  if target_family_id is null or p_reservation_id is null or p_moment_id is null or p_media_id is null then
    raise exception 'Canonical Keep scope is incomplete.';
  end if;
  if p_transport not in ('image', 'video-stream', 'video-direct', 'video-poster') then
    raise exception 'Unsupported canonical Keep transport.';
  end if;
  if p_asset_id is null
    or p_asset_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Canonical shared-media identity is invalid.';
  end if;
  if p_captured_at is null
    or p_creation_time is null
    or p_captured_at is distinct from p_creation_time then
    raise exception 'Canonical media capture time must be grounded.';
  end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception 'Canonical media latitude is invalid.';
  end if;
  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception 'Canonical media longitude is invalid.';
  end if;
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Canonical media location is incomplete.';
  end if;
  if coalesce(p_width, 0) < 0 or coalesce(p_height, 0) < 0
    or coalesce(p_duration_sec, 0) < 0 or coalesce(p_source_bytes, 0) < 0
    or coalesce(p_optimized_bytes, 0) < 0 or coalesce(p_playback_seconds, 0) < 0
    or coalesce(p_actual_bytes, 0) < 0 or coalesce(p_actual_duration_sec, 0) < 0 then
    raise exception 'Canonical media measurements are invalid.';
  end if;
  if length(coalesce(p_file_name, '')) > 512 or length(coalesce(p_mime_type, '')) > 255 then
    raise exception 'Canonical media description is too long.';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object'
    or pg_column_size(p_metadata) > 32768 then
    raise exception 'Canonical media metadata is invalid.';
  end if;
  if p_metadata ?| array[
    'assetId', 'localAssetId', 'pickerAssetId', 'recognitionCandidateId',
    'recognitionScore', 'faceCount', 'videoPresenceRatio', 'videoSampledFrames',
    'videoMatchedFrames', 'curationDay', 'curationRole', 'curationReason',
    'visualFingerprint', 'identityEvidence'
  ] then
    raise exception 'Private discovery evidence cannot be published.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    target_family_id::text || ':' || writer_id::text || ':' || p_media_id::text,
    0
  ));
  -- The opaque asset identity is also globally singular for one caregiver and
  -- family. Serialize different media reservations that race for that asset so
  -- the loser observes the winner before quota finalization.
  perform pg_advisory_xact_lock(hashtextextended(
    target_family_id::text || ':' || writer_id::text || ':asset:' || p_asset_id,
    0
  ));

  select * into reservation
  from public.media_upload_reservations
  where id = p_reservation_id
  for update;

  if not found or reservation.user_id is distinct from writer_id
    or reservation.family_id is distinct from target_family_id
    or reservation.canonical_media_id is distinct from p_media_id
    or reservation.transport is distinct from p_transport
    or reservation.status not in ('reserved', 'finalized') then
    raise exception 'Canonical upload reservation does not match this Keep.';
  end if;

  -- Publication is a family write even when an older client already finalized
  -- its reservation. Lapsed/deletion-locked families fail closed until the
  -- write gate is restored.
  perform public.authorize_canonical_media_upload(target_family_id);

  expected_media_type := case when p_transport = 'image' then 'image' else 'video' end;
  expected_quota_class := case when p_transport = 'video-poster' then 'poster_only' else 'optimized' end;
  expected_storage_provider := case when p_transport = 'video-stream' then 'stream' else 'supabase' end;
  expected_playback_provider := case
    when p_transport = 'video-stream' then 'stream'
    when p_transport = 'video-direct' then 'supabase'
    else null
  end;
  expected_tag_storage := case when p_transport in ('image', 'video-direct') then p_full_object else null end;
  expected_tag_thumb := case when p_transport = 'image' then p_thumb_object else p_poster_object end;

  if reservation.media_type <> (case when p_transport = 'video-poster' then 'image' else expected_media_type end)
    or reservation.quota_class <> 'optimized' then
    raise exception 'Canonical upload reservation parameters do not match publication.';
  end if;

  if p_transport = 'image' then
    if p_full_object is null or p_thumb_object is null or p_poster_object is not null
      or p_stream_uid is not null
      or p_full_storage_path is distinct from target_family_id::text || '/full/' || p_full_object::text || '.jpg'
      or p_thumb_storage_path is distinct from target_family_id::text || '/thumb/' || p_thumb_object::text || '.jpg'
      or p_poster_storage_path is not null then
      raise exception 'Canonical image storage identity is inconsistent.';
    end if;
  elsif p_transport = 'video-direct' then
    if p_full_object is null or p_thumb_object is not null or p_stream_uid is not null
      or p_full_storage_path not in (
        target_family_id::text || '/moments/' || p_moment_id::text || '/video/' || p_full_object::text || '.mov',
        target_family_id::text || '/moments/' || p_moment_id::text || '/video/' || p_full_object::text || '.mp4',
        target_family_id::text || '/moments/' || p_moment_id::text || '/video/' || p_full_object::text || '.m4v'
      )
      or p_thumb_storage_path is not null
      or (p_poster_object is null) <> (p_poster_storage_path is null)
      or (p_poster_object is not null and p_poster_storage_path is distinct from
        target_family_id::text || '/moments/' || p_moment_id::text || '/video-poster/' || p_poster_object::text || '.jpg') then
      raise exception 'Canonical direct-video storage identity is inconsistent.';
    end if;
  elsif p_transport = 'video-poster' then
    if p_full_object is not null or p_thumb_object is not null or p_poster_object is null
      or p_stream_uid is not null or p_full_storage_path is not null or p_thumb_storage_path is not null
      or p_poster_storage_path is distinct from
        target_family_id::text || '/moments/' || p_moment_id::text || '/video-poster/' || p_poster_object::text || '.jpg' then
      raise exception 'Canonical poster-video storage identity is inconsistent.';
    end if;
  else
    if p_full_object is not null or p_thumb_object is not null or nullif(trim(p_stream_uid), '') is null
      or p_full_storage_path is not null or p_thumb_storage_path is not null
      or (p_poster_object is null) <> (p_poster_storage_path is null)
      or (p_poster_object is not null and p_poster_storage_path is distinct from
        target_family_id::text || '/moments/' || p_moment_id::text || '/video-poster/' || p_poster_object::text || '.jpg')
      or reservation.provider <> 'stream'
      or reservation.provider_object_id is distinct from trim(p_stream_uid)
      or reservation.provider_upload_confirmed_at is null then
      raise exception 'Canonical Stream upload is not confirmed for publication.';
    end if;
  end if;

  if p_full_storage_path is not null and not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'family-photos' and object.name = p_full_storage_path
      and object.owner_id = writer_id::text
  ) then raise exception 'Canonical full media object is unavailable.'; end if;
  if p_thumb_storage_path is not null and not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'family-photos' and object.name = p_thumb_storage_path
      and object.owner_id = writer_id::text
  ) then raise exception 'Canonical thumbnail object is unavailable.'; end if;
  if p_poster_storage_path is not null and not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'family-photos' and object.name = p_poster_storage_path
      and object.owner_id = writer_id::text
  ) then raise exception 'Canonical poster object is unavailable.'; end if;

  select * into existing_moment from public.moments where id = p_moment_id for update;
  if found and (existing_moment.family_id is distinct from target_family_id
    or existing_moment.author_user_id is distinct from writer_id) then
    raise exception 'Canonical moment identity belongs to another family record.';
  end if;
  select * into existing_media from public.moment_media where id = p_media_id for update;
  if found and (existing_media.family_id is distinct from target_family_id
    or existing_media.owner_user_id is distinct from writer_id
    or existing_media.moment_id is distinct from p_moment_id
    or existing_media.letter_id is not null
    or existing_media.local_identifier is distinct from p_asset_id
    or existing_media.media_type is distinct from expected_media_type) then
    raise exception 'Canonical media identity belongs to another saved memory.';
  end if;
  if found and existing_media.upload_status = 'ready'
    and not (
      existing_media.full_object is not distinct from p_full_object
      and existing_media.thumb_object is not distinct from p_thumb_object
      and existing_media.poster_object is not distinct from p_poster_object
      and existing_media.stream_uid is not distinct from nullif(trim(p_stream_uid), '')
    )
    and not (
      expected_media_type = 'video'
      and p_transport in ('video-direct', 'video-stream')
      and existing_media.quota_class = 'poster_only'
      and existing_media.full_object is null
      and existing_media.stream_uid is null
      and existing_media.poster_object is not distinct from p_poster_object
    ) then
    raise exception 'Canonical media identity belongs to another saved memory.';
  end if;
  if found and existing_media.upload_status <> 'ready'
    and (
      (existing_media.full_object is not null and existing_media.full_object is distinct from p_full_object)
      or (existing_media.thumb_object is not null and existing_media.thumb_object is distinct from p_thumb_object)
      or (existing_media.poster_object is not null and existing_media.poster_object is distinct from p_poster_object)
      or (existing_media.stream_uid is not null and existing_media.stream_uid is distinct from nullif(trim(p_stream_uid), ''))
    ) then
    raise exception 'Canonical media identity belongs to another saved memory.';
  end if;
  select * into existing_tag
  from public.photo_tags
  where family_id = target_family_id and asset_owner_user_id = writer_id and asset_id = p_asset_id
  for update;
  if found and ((existing_tag.moment_id is not null and existing_tag.moment_id is distinct from p_moment_id)
    or (existing_tag.moment_media_id is not null and existing_tag.moment_media_id is distinct from p_media_id)) then
    raise exception 'Canonical tag identity belongs to another saved memory.';
  end if;
  if exists (
    select 1 from public.photo_tags tag
    where tag.moment_media_id = p_media_id
      and (tag.family_id, tag.asset_owner_user_id, tag.asset_id)
        is distinct from (target_family_id, writer_id, p_asset_id)
  ) then raise exception 'Canonical media is already linked to another tag.'; end if;

  was_published := existing_moment.id is not null
    and existing_media.id is not null and existing_media.upload_status = 'ready'
    and existing_media.full_object is not distinct from p_full_object
    and existing_media.thumb_object is not distinct from p_thumb_object
    and existing_media.poster_object is not distinct from p_poster_object
    and existing_media.stream_uid is not distinct from nullif(trim(p_stream_uid), '')
    and existing_tag.id is not null and existing_tag.upload_status = 'ready'
    and existing_tag.moment_id = p_moment_id and existing_tag.moment_media_id = p_media_id;

  if was_published and reservation.status = 'finalized' then
    if p_transport = 'video-stream' and not exists (
      select 1
      from public.canonical_media_provider_publications publication
      where publication.moment_media_id = p_media_id
        and publication.family_id = target_family_id
        and publication.provider = 'stream'
        and publication.provider_object_id = trim(p_stream_uid)
        and publication.source_reservation_id = p_reservation_id
    ) then
      raise exception 'Canonical Stream publication proof is unavailable.';
    end if;
    return query select p_moment_id, p_media_id, existing_tag.id, true;
    return;
  end if;

  actual_bytes := coalesce(p_actual_bytes, reservation.reserved_bytes);
  actual_seconds := coalesce(p_actual_duration_sec, reservation.reserved_seconds);
  if reservation.reserved_bytes is distinct from actual_bytes
    or reservation.reserved_seconds is distinct from actual_seconds
  then
    raise exception 'Canonical upload accounting does not match its reservation.';
  end if;

  if reservation.status = 'reserved' then
    perform public.finalize_media_upload(p_reservation_id, actual_bytes, actual_seconds);
  end if;

  insert into public.moments (
    id, family_id, author_user_id, captured_at, latitude, longitude, shared_with
  ) values (
    p_moment_id, target_family_id, writer_id, p_captured_at,
    p_latitude, p_longitude, '[]'::jsonb
  ) on conflict (id) do nothing;

  insert into public.moment_media (
    id, moment_id, family_id, owner_user_id, media_type, local_identifier,
    file_name, mime_type, full_object, thumb_object, poster_object, width, height,
    duration_sec, metadata, upload_status, upload_error, sort_order, storage_provider,
    playback_provider, stream_uid, source_bytes, optimized_bytes, playback_seconds, quota_class
  ) values (
    p_media_id, p_moment_id, target_family_id, writer_id, expected_media_type, p_asset_id,
    p_file_name, p_mime_type, p_full_object, p_thumb_object, p_poster_object, p_width, p_height,
    p_duration_sec, p_metadata, 'ready', null, 0, expected_storage_provider,
    expected_playback_provider, nullif(trim(p_stream_uid), ''), p_source_bytes,
    coalesce(p_optimized_bytes, actual_bytes),
    coalesce(p_playback_seconds, case when expected_media_type = 'video' then actual_seconds else null end),
    expected_quota_class
  ) on conflict (id) do update set
    file_name = excluded.file_name,
    mime_type = excluded.mime_type,
    full_object = excluded.full_object,
    thumb_object = excluded.thumb_object,
    poster_object = excluded.poster_object,
    width = excluded.width,
    height = excluded.height,
    duration_sec = excluded.duration_sec,
    metadata = excluded.metadata,
    upload_status = 'ready',
    upload_error = null,
    storage_provider = excluded.storage_provider,
    playback_provider = excluded.playback_provider,
    stream_uid = excluded.stream_uid,
    source_bytes = excluded.source_bytes,
    optimized_bytes = excluded.optimized_bytes,
    playback_seconds = excluded.playback_seconds,
    quota_class = excluded.quota_class;

  insert into public.photo_tags (
    family_id, asset_owner_user_id, asset_id, tagged_by_user_id, tagged_at,
    creation_time, original_width, original_height, latitude, longitude,
    location_fetched_at, storage_object, thumb_object, upload_status, upload_error,
    moment_id, moment_media_id
  ) values (
    target_family_id, writer_id, p_asset_id, writer_id, coalesce(p_tagged_at, now()),
    p_creation_time, p_width, p_height, p_latitude, p_longitude,
    p_location_fetched_at, expected_tag_storage, expected_tag_thumb, 'ready', null,
    p_moment_id, p_media_id
  ) on conflict (family_id, asset_owner_user_id, asset_id) do update set
    tagged_by_user_id = excluded.tagged_by_user_id,
    tagged_at = excluded.tagged_at,
    creation_time = excluded.creation_time,
    original_width = excluded.original_width,
    original_height = excluded.original_height,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    location_fetched_at = excluded.location_fetched_at,
    storage_object = excluded.storage_object,
    thumb_object = excluded.thumb_object,
    upload_status = 'ready',
    upload_error = null,
    moment_id = excluded.moment_id,
    moment_media_id = excluded.moment_media_id
  returning id into saved_tag_id;

  if p_transport = 'video-stream' then
    insert into public.canonical_media_provider_publications (
      moment_media_id, family_id, provider, provider_object_id,
      source_reservation_id, published_at
    ) values (
      p_media_id, target_family_id, 'stream', trim(p_stream_uid),
      p_reservation_id, now()
    ) on conflict on constraint canonical_media_provider_publications_pkey do nothing;

    if not exists (
      select 1
      from public.canonical_media_provider_publications publication
      where publication.moment_media_id = p_media_id
        and publication.family_id = target_family_id
        and publication.provider = 'stream'
        and publication.provider_object_id = trim(p_stream_uid)
        and publication.source_reservation_id = p_reservation_id
    ) then
      raise exception 'Canonical Stream publication proof is inconsistent.';
    end if;
  end if;

  return query select p_moment_id, p_media_id, saved_tag_id, was_published;
end
$$;

revoke all on function public.finalize_canonical_media_keep(
  uuid, uuid, text, uuid, uuid, text, timestamptz, timestamptz, timestamptz,
  double precision, double precision, timestamptz, text, text, uuid, uuid, uuid,
  text, text, text, integer, integer, numeric, jsonb, text, bigint, bigint, integer,
  bigint, integer
) from public, anon;
grant execute on function public.finalize_canonical_media_keep(
  uuid, uuid, text, uuid, uuid, text, timestamptz, timestamptz, timestamptz,
  double precision, double precision, timestamptz, text, text, uuid, uuid, uuid,
  text, text, text, integer, integer, numeric, jsonb, text, bigint, bigint, integer,
  bigint, integer
) to authenticated;
