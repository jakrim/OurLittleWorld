alter table public.media_upload_reservations
  add column if not exists canonical_media_id uuid,
  add column if not exists transport text
    check (transport is null or transport in ('image', 'video-stream', 'video-direct', 'video-poster'));

create unique index if not exists media_upload_reservations_canonical_active_idx
  on public.media_upload_reservations (family_id, user_id, canonical_media_id, transport)
  where canonical_media_id is not null
    and transport is not null
    and status in ('reserved', 'finalized');

drop policy if exists media_upload_reservations_select on public.media_upload_reservations;
create policy media_upload_reservations_select on public.media_upload_reservations for select
  using (
    (
      status = 'reserved'
      and user_id = auth.uid()
      and public.is_family_writer(family_id)
      and public.family_has_active_entitlement(family_id)
    )
    or (
      status in ('finalized', 'released', 'expired')
      and public.is_family_member(family_id)
    )
  );

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
      update public.media_upload_reservations
      set status = 'expired'
      where id = v_existing.id;
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
        provider_object_id = v_candidate
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
      provider_object_id = trim(p_provider_object_id)
  where id = p_reservation_id;
end
$$;

revoke all on function public.attach_media_upload_provider_object(uuid, text, text) from public, anon;
grant execute on function public.attach_media_upload_provider_object(uuid, text, text) to authenticated;
