alter table public.media_upload_reservations
  add column if not exists canonical_media_id uuid,
  add column if not exists transport text
    check (transport is null or transport in ('image', 'video-stream', 'video-direct', 'video-poster')),
  add column if not exists provider_cleanup_required boolean not null default false,
  add column if not exists provider_cleanup_confirmed_at timestamptz,
  add column if not exists accounting_resolution text not null default 'canonical'
    check (accounting_resolution in (
      'canonical',
      'legacy_grandfathered_missing',
      'legacy_grandfathered_ambiguous'
    ));

update public.media_upload_reservations
set provider_cleanup_required = true
where provider_object_id is not null;

create unique index if not exists media_upload_reservations_canonical_active_idx
  on public.media_upload_reservations (family_id, user_id, canonical_media_id, transport)
  where canonical_media_id is not null
    and transport is not null
    and status in ('reserved', 'finalized');

drop policy if exists media_upload_reservations_select on public.media_upload_reservations;
create policy media_upload_reservations_select on public.media_upload_reservations for select
  using (
    user_id = auth.uid()
    and public.is_family_writer(family_id)
    and public.family_has_active_entitlement(family_id)
  );

create or replace function public.list_family_media_upload_lifecycle(target_family_id uuid)
returns table (
  media_type text,
  quota_class text,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  if not public.is_family_writer(target_family_id) then
    raise exception 'Co-parent access is required.';
  end if;

  return query
  select
    reservation.media_type,
    reservation.quota_class,
    reservation.status,
    reservation.expires_at,
    reservation.created_at,
    reservation.updated_at
  from public.media_upload_reservations reservation
  where reservation.family_id = target_family_id
    and reservation.status in ('finalized', 'released', 'expired')
  order by reservation.created_at desc
  limit 500;
end
$$;

revoke all on function public.list_family_media_upload_lifecycle(uuid) from public, anon;
grant execute on function public.list_family_media_upload_lifecycle(uuid) to authenticated;

create or replace function public.authorize_canonical_media_upload(target_family_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  if not public.is_family_writer(target_family_id) then
    raise exception 'Only a co-parent can upload media for this family.';
  end if;
  if not public.family_has_active_entitlement(target_family_id) then
    raise exception 'An active family plan is required to upload media.';
  end if;
end
$$;

revoke all on function public.authorize_canonical_media_upload(uuid) from public, anon;
grant execute on function public.authorize_canonical_media_upload(uuid) to authenticated;

create or replace function public.reconcile_legacy_canonical_media_upload(
  target_family_id uuid,
  p_canonical_media_id uuid,
  p_transport text,
  p_storage_path text
)
returns table (
  reservation_id uuid,
  status text,
  canonical_media_id uuid,
  transport text,
  storage_present boolean,
  accounting_resolution text
)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_media public.moment_media%rowtype;
  v_tag public.photo_tags%rowtype;
  v_reservation public.media_upload_reservations%rowtype;
  v_candidate_count bigint := 0;
  v_storage_present boolean := false;
  v_expected_bytes bigint;
  v_expected_seconds integer;
  v_expected_media_type text;
  v_expected_quota_class text;
  v_accounting_resolution text;
begin
  if p_transport not in ('video-direct', 'video-poster') then
    raise exception 'Unsupported legacy upload transport.';
  end if;
  perform public.authorize_canonical_media_upload(target_family_id);

  perform pg_advisory_xact_lock(hashtextextended(
    target_family_id::text || ':' || auth.uid()::text || ':' || p_canonical_media_id::text || ':' || p_transport,
    0
  ));

  select * into v_media
  from public.moment_media
  where id = p_canonical_media_id
    and family_id = target_family_id
    and owner_user_id = auth.uid()
    and media_type = 'video'
    and stream_uid is null
    and storage_provider = 'supabase'
    and (
      (p_transport = 'video-direct' and full_object is not null)
      or (p_transport = 'video-poster' and full_object is null and poster_object is not null)
    );

  if not found then return; end if;
  if nullif(trim(p_storage_path), '') is null
    or split_part(p_storage_path, '/', 1) <> target_family_id::text
    or not (
      (
        p_transport = 'video-direct'
        and p_storage_path like (
          target_family_id::text || '/moments/' || v_media.moment_id::text
          || '/video/' || v_media.full_object::text || '.%'
        )
      )
      or (
        p_transport = 'video-poster'
        and p_storage_path = (
          target_family_id::text || '/moments/' || v_media.moment_id::text
          || '/video-poster/' || v_media.poster_object::text || '.jpg'
        )
      )
    ) then
    raise exception 'Canonical video storage identity is inconsistent.';
  end if;

  select exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'family-photos'
      and object.name = p_storage_path
  ) into v_storage_present;

  select * into v_tag
  from public.photo_tags
  where family_id = target_family_id
    and asset_owner_user_id = auth.uid()
    and moment_id = v_media.moment_id
    and moment_media_id = v_media.id
    and (
      (p_transport = 'video-direct' and storage_object = v_media.full_object)
      or (
        p_transport = 'video-poster'
        and storage_object is null
        and thumb_object = v_media.poster_object
      )
    )
  limit 1;

  if not found then return; end if;

  select * into v_reservation
  from public.media_upload_reservations reservation
  where reservation.family_id = target_family_id
    and reservation.user_id = auth.uid()
    and reservation.canonical_media_id = p_canonical_media_id
    and reservation.transport = p_transport
    and reservation.status in ('reserved', 'finalized')
  order by reservation.created_at asc
  limit 1
  for update;

  if found then
    return query select
      v_reservation.id,
      v_reservation.status,
      v_reservation.canonical_media_id,
      v_reservation.transport,
      v_storage_present,
      v_reservation.accounting_resolution;
    return;
  end if;

  if v_media.upload_status <> 'ready'
    or v_tag.upload_status <> 'ready'
    or not v_storage_present then
    return;
  end if;

  v_expected_bytes := greatest(
    coalesce(v_media.source_bytes, 0),
    coalesce(v_media.optimized_bytes, 0)
  );
  if p_transport = 'video-direct' then
    v_expected_seconds := greatest(
      coalesce(v_media.playback_seconds, 0),
      coalesce(round(v_media.duration_sec)::integer, 0)
    );
    v_expected_media_type := 'video';
    v_expected_quota_class := coalesce(nullif(v_media.quota_class, 'poster_only'), 'optimized');
  else
    v_expected_seconds := 0;
    v_expected_media_type := 'image';
    v_expected_quota_class := 'optimized';
  end if;

  select count(*)
  into v_candidate_count
  from public.media_upload_reservations reservation
  where reservation.family_id = target_family_id
    and reservation.user_id = auth.uid()
    and reservation.media_type = v_expected_media_type
    and reservation.quota_class = v_expected_quota_class
    and reservation.status in ('reserved', 'finalized')
    and reservation.canonical_media_id is null
    and reservation.transport is null
    and reservation.reserved_bytes = v_expected_bytes
    and reservation.reserved_seconds = v_expected_seconds
    and reservation.created_at >= v_media.created_at - interval '5 minutes'
    and reservation.created_at <= v_media.updated_at + interval '5 minutes';

  v_accounting_resolution := case
    when v_candidate_count = 0 then 'legacy_grandfathered_missing'
    else 'legacy_grandfathered_ambiguous'
  end;

  insert into public.media_upload_reservations (
    family_id,
    user_id,
    media_type,
    quota_class,
    reserved_bytes,
    reserved_seconds,
    status,
    expires_at,
    canonical_media_id,
    transport,
    accounting_resolution
  ) values (
    target_family_id,
    auth.uid(),
    v_expected_media_type,
    v_expected_quota_class,
    0,
    0,
    'finalized',
    now(),
    p_canonical_media_id,
    p_transport,
    v_accounting_resolution
  )
  returning * into v_reservation;

  return query select
    v_reservation.id,
    v_reservation.status,
    v_reservation.canonical_media_id,
    v_reservation.transport,
    v_storage_present,
    v_reservation.accounting_resolution;
end
$$;

revoke all on function public.reconcile_legacy_canonical_media_upload(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.reconcile_legacy_canonical_media_upload(uuid, uuid, text, text)
  to authenticated;

create or replace function public.reconcile_legacy_canonical_image_upload(
  target_family_id uuid,
  p_canonical_media_id uuid,
  p_full_storage_path text,
  p_thumb_storage_path text
)
returns table (
  reservation_id uuid,
  status text,
  canonical_media_id uuid,
  transport text,
  storage_present boolean,
  accounting_resolution text
)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_media public.moment_media%rowtype;
  v_tag public.photo_tags%rowtype;
  v_reservation public.media_upload_reservations%rowtype;
  v_candidate_count bigint := 0;
  v_storage_present boolean := false;
  v_expected_bytes bigint;
  v_accounting_resolution text;
begin
  perform public.authorize_canonical_media_upload(target_family_id);

  perform pg_advisory_xact_lock(hashtextextended(
    target_family_id::text || ':' || auth.uid()::text || ':' || p_canonical_media_id::text || ':image',
    0
  ));

  select * into v_media
  from public.moment_media
  where id = p_canonical_media_id
    and family_id = target_family_id
    and owner_user_id = auth.uid()
    and media_type = 'image'
    and (storage_provider is null or storage_provider = 'supabase')
    and full_object is not null
    and thumb_object is not null;
  if not found then return; end if;

  if p_full_storage_path <> (target_family_id::text || '/full/' || v_media.full_object::text || '.jpg')
    or p_thumb_storage_path <> (target_family_id::text || '/thumb/' || v_media.thumb_object::text || '.jpg') then
    raise exception 'Canonical image storage identity is inconsistent.';
  end if;

  select exists (
    select 1 from storage.objects object
    where object.bucket_id = 'family-photos' and object.name = p_full_storage_path
  ) and exists (
    select 1 from storage.objects object
    where object.bucket_id = 'family-photos' and object.name = p_thumb_storage_path
  ) into v_storage_present;

  select * into v_tag
  from public.photo_tags
  where family_id = target_family_id
    and asset_owner_user_id = auth.uid()
    and moment_id = v_media.moment_id
    and moment_media_id = v_media.id
    and (
      (storage_object = v_media.full_object and thumb_object = v_media.thumb_object)
      or (storage_object is null and thumb_object is null)
    )
  limit 1;
  if not found then return; end if;

  select * into v_reservation
  from public.media_upload_reservations reservation
  where reservation.family_id = target_family_id
    and reservation.user_id = auth.uid()
    and reservation.canonical_media_id = p_canonical_media_id
    and reservation.transport = 'image'
    and reservation.status in ('reserved', 'finalized')
  order by reservation.created_at asc
  limit 1
  for update;
  if found then
    return query select v_reservation.id, v_reservation.status, v_reservation.canonical_media_id,
      v_reservation.transport, v_storage_present, v_reservation.accounting_resolution;
    return;
  end if;

  if v_media.upload_status not in ('uploading', 'failed', 'ready')
    or v_tag.upload_status not in ('uploading', 'failed', 'ready')
    or not v_storage_present then
    return;
  end if;

  v_expected_bytes := greatest(coalesce(v_media.source_bytes, 0), coalesce(v_media.optimized_bytes, 0));
  select count(*) into v_candidate_count
  from public.media_upload_reservations reservation
  where reservation.family_id = target_family_id
    and reservation.user_id = auth.uid()
    and reservation.media_type = 'image'
    and reservation.quota_class = coalesce(v_media.quota_class, 'optimized')
    and reservation.status in ('reserved', 'finalized')
    and reservation.canonical_media_id is null
    and reservation.transport is null
    and reservation.reserved_bytes = v_expected_bytes
    and reservation.reserved_seconds = 0
    and reservation.created_at >= v_media.created_at - interval '5 minutes'
    and reservation.created_at <= v_media.updated_at + interval '5 minutes';

  v_accounting_resolution := case
    when v_candidate_count = 0 then 'legacy_grandfathered_missing'
    else 'legacy_grandfathered_ambiguous'
  end;
  insert into public.media_upload_reservations (
    family_id, user_id, media_type, quota_class, reserved_bytes, reserved_seconds,
    status, expires_at, canonical_media_id, transport, accounting_resolution
  ) values (
    target_family_id, auth.uid(), 'image', coalesce(v_media.quota_class, 'optimized'), 0, 0,
    'finalized', now(), p_canonical_media_id, 'image', v_accounting_resolution
  ) returning * into v_reservation;

  return query select v_reservation.id, v_reservation.status, v_reservation.canonical_media_id,
    v_reservation.transport, v_storage_present, v_reservation.accounting_resolution;
end
$$;

revoke all on function public.reconcile_legacy_canonical_image_upload(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.reconcile_legacy_canonical_image_upload(uuid, uuid, text, text)
  to authenticated;

create or replace function public.reserve_canonical_media_upload(
  target_family_id uuid,
  p_canonical_media_id uuid,
  p_transport text,
  p_media_type text,
  p_bytes bigint,
  p_duration_sec integer default 0,
  p_quota_class text default 'optimized'
)
returns table (
  reservation_id uuid,
  allowed boolean,
  reason text
)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_existing public.media_upload_reservations%rowtype;
  v_reserved record;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  if p_canonical_media_id is null then
    raise exception 'Canonical media identity is required.';
  end if;
  if p_transport not in ('image', 'video-stream', 'video-direct', 'video-poster') then
    raise exception 'Unsupported canonical upload transport.';
  end if;

  perform public.authorize_canonical_media_upload(target_family_id);

  perform pg_advisory_xact_lock(hashtextextended(
    target_family_id::text || ':' || auth.uid()::text || ':' || p_canonical_media_id::text || ':' || p_transport,
    0
  ));

  select * into v_existing
  from public.media_upload_reservations
  where family_id = target_family_id
    and user_id = auth.uid()
    and canonical_media_id = p_canonical_media_id
    and transport = p_transport
    and status in ('reserved', 'finalized')
  order by created_at asc
  limit 1
  for update;

  if found then
    if v_existing.status = 'reserved' and v_existing.expires_at <= now() then
      if v_existing.provider_object_id is not null or v_existing.provider_cleanup_required then
        update public.media_upload_reservations
        set provider_cleanup_required = true
        where id = v_existing.id;
        return query select v_existing.id, false, 'provider_cleanup_required'::text;
        return;
      else
        update public.media_upload_reservations
        set status = 'expired'
        where id = v_existing.id;
      end if;
    else
      if v_existing.media_type <> p_media_type or v_existing.quota_class <> coalesce(p_quota_class, 'optimized') then
        raise exception 'Canonical upload reservation parameters do not match.';
      end if;
      return query select v_existing.id, true, null::text;
      return;
    end if;
  end if;

  select * into v_reserved
  from public.reserve_media_upload(
    target_family_id,
    p_media_type,
    p_bytes,
    p_duration_sec,
    p_quota_class
  );
  if not coalesce(v_reserved.allowed, false) then
    return query select v_reserved.reservation_id, false, v_reserved.reason;
    return;
  end if;

  update public.media_upload_reservations
  set canonical_media_id = p_canonical_media_id,
      transport = p_transport
  where id = v_reserved.reservation_id
    and family_id = target_family_id
    and user_id = auth.uid()
    and status = 'reserved';
  if not found then
    raise exception 'Canonical upload reservation could not be recorded.';
  end if;

  return query select v_reserved.reservation_id, true, null::text;
end
$$;

revoke all on function public.reserve_canonical_media_upload(uuid, uuid, text, text, bigint, integer, text)
  from public, anon;
grant execute on function public.reserve_canonical_media_upload(uuid, uuid, text, text, bigint, integer, text)
  to authenticated;

create or replace function public.claim_canonical_media_upload_provider_object(
  p_reservation_id uuid,
  p_provider text,
  p_provider_object_id text
)
returns table (
  claimed boolean,
  winning_provider_object_id text
)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_reservation public.media_upload_reservations%rowtype;
  v_candidate text := nullif(trim(p_provider_object_id), '');
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  if p_provider not in ('stream', 'r2') or v_candidate is null then
    raise exception 'provider upload identity is invalid';
  end if;

  select * into v_reservation
  from public.media_upload_reservations
  where id = p_reservation_id
  for update;

  if not found or v_reservation.user_id is distinct from auth.uid() then
    raise exception 'reservation not found';
  end if;
  if v_reservation.status <> 'reserved' then
    raise exception 'reservation is no longer open';
  end if;
  if v_reservation.canonical_media_id is null then
    raise exception 'reservation is not canonical';
  end if;
  if p_provider = 'stream' and v_reservation.transport <> 'video-stream' then
    raise exception 'reservation transport does not match provider';
  end if;
  perform public.authorize_canonical_media_upload(v_reservation.family_id);
  if v_reservation.provider is not null and v_reservation.provider <> p_provider then
    raise exception 'reservation belongs to another provider';
  end if;

  if v_reservation.provider_object_id is null then
    update public.media_upload_reservations
    set provider = p_provider,
        provider_object_id = v_candidate,
        provider_cleanup_required = true,
        provider_cleanup_confirmed_at = null
    where id = p_reservation_id;
    return query select true, v_candidate;
    return;
  end if;

  return query select v_reservation.provider_object_id = v_candidate,
    v_reservation.provider_object_id;
end
$$;

revoke all on function public.claim_canonical_media_upload_provider_object(uuid, text, text)
  from public, anon;
grant execute on function public.claim_canonical_media_upload_provider_object(uuid, text, text)
  to authenticated;

create or replace function public.attach_media_upload_provider_object(
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
  v_reservation public.media_upload_reservations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  if p_provider not in ('stream', 'r2') or nullif(trim(p_provider_object_id), '') is null then
    raise exception 'provider upload identity is invalid';
  end if;

  select * into v_reservation
  from public.media_upload_reservations
  where id = p_reservation_id
  for update;

  if not found or v_reservation.user_id is distinct from auth.uid() then
    raise exception 'reservation not found';
  end if;
  if v_reservation.status <> 'reserved' then
    raise exception 'reservation is no longer open';
  end if;
  if v_reservation.canonical_media_id is not null then
    raise exception 'Canonical upload reservations require atomic provider claims.';
  end if;

  perform public.authorize_canonical_media_upload(v_reservation.family_id);

  update public.media_upload_reservations
  set provider = p_provider,
      provider_object_id = trim(p_provider_object_id),
      provider_cleanup_required = true,
      provider_cleanup_confirmed_at = null
  where id = p_reservation_id;
end
$$;

revoke all on function public.attach_media_upload_provider_object(uuid, text, text) from public, anon;
grant execute on function public.attach_media_upload_provider_object(uuid, text, text) to authenticated;

create or replace function public.confirm_media_upload_provider_cleanup(
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
  v_reservation public.media_upload_reservations%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Provider cleanup confirmation requires a trusted service.';
  end if;

  select * into v_reservation
  from public.media_upload_reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'reservation not found';
  end if;
  if v_reservation.status not in ('reserved', 'released', 'expired') then
    raise exception 'reservation does not require provider cleanup';
  end if;
  if v_reservation.provider is distinct from p_provider
    or v_reservation.provider_object_id is distinct from nullif(trim(p_provider_object_id), '') then
    raise exception 'provider cleanup identity does not match';
  end if;

  update public.media_upload_reservations
  set provider = null,
      provider_object_id = null,
      provider_cleanup_required = false,
      provider_cleanup_confirmed_at = now()
  where id = p_reservation_id;
end
$$;

revoke all on function public.confirm_media_upload_provider_cleanup(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.confirm_media_upload_provider_cleanup(uuid, text, text)
  to service_role;

create or replace function public.confirm_and_release_media_upload_provider_cleanup(
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
  v_reservation public.media_upload_reservations%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Provider cleanup confirmation requires a trusted service.';
  end if;

  select * into v_reservation
  from public.media_upload_reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'reservation not found';
  end if;
  if v_reservation.status not in ('reserved', 'released', 'expired') then
    raise exception 'reservation does not require provider cleanup';
  end if;
  if v_reservation.provider is distinct from p_provider
    or v_reservation.provider_object_id is distinct from nullif(trim(p_provider_object_id), '') then
    raise exception 'provider cleanup identity does not match';
  end if;

  update public.media_upload_reservations
  set status = 'released',
      provider = null,
      provider_object_id = null,
      provider_cleanup_required = false,
      provider_cleanup_confirmed_at = now()
  where id = p_reservation_id;
end
$$;

revoke all on function public.confirm_and_release_media_upload_provider_cleanup(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.confirm_and_release_media_upload_provider_cleanup(uuid, text, text)
  to service_role;

create or replace function public.release_media_upload(p_reservation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_reservation public.media_upload_reservations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  select * into v_reservation
  from public.media_upload_reservations
  where id = p_reservation_id
  for update;

  if not found then return; end if;
  if v_reservation.user_id is distinct from auth.uid() then
    raise exception 'reservation not found';
  end if;
  perform public.authorize_canonical_media_upload(v_reservation.family_id);
  if v_reservation.status = 'reserved' then
    if v_reservation.provider_object_id is not null or v_reservation.provider_cleanup_required then
      raise exception 'Provider cleanup must be confirmed before release.';
    end if;
    update public.media_upload_reservations
    set status = 'released'
    where id = p_reservation_id;
  end if;
end
$$;

revoke all on function public.release_media_upload(uuid) from public, anon;
grant execute on function public.release_media_upload(uuid) to authenticated;
