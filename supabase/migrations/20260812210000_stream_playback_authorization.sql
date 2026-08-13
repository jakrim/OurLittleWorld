-- A family-scoped media session is not authority to play an arbitrary Stream
-- UID. Only the trusted gateway may exchange an exact, atomically published
-- family/media publication binding for a playback capability.

create or replace function public.authorize_canonical_stream_playback(
  target_family_id uuid,
  target_user_id uuid,
  p_provider_object_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Stream playback authorization requires a trusted service.';
  end if;
  if target_family_id is null or target_user_id is null
    or nullif(trim(p_provider_object_id), '') is null then
    return false;
  end if;

  return exists (
    select 1
    from public.moment_media media
    join public.family_members member
      on member.family_id = media.family_id
     and member.user_id = target_user_id
    join public.moments moment
      on moment.id = media.moment_id
     and moment.family_id = media.family_id
    join public.photo_tags tag
      on tag.moment_media_id = media.id
     and tag.moment_id = media.moment_id
     and tag.family_id = media.family_id
     and tag.asset_owner_user_id is not distinct from media.owner_user_id
     and tag.upload_status = 'ready'
    join public.canonical_media_provider_publications publication
      on publication.moment_media_id = media.id
     and publication.family_id = media.family_id
     and publication.provider = 'stream'
     and publication.provider_object_id = media.stream_uid
    where media.family_id = target_family_id
      and media.media_type = 'video'
      and media.upload_status = 'ready'
      and media.storage_provider = 'stream'
      and media.playback_provider = 'stream'
      and media.stream_uid = trim(p_provider_object_id)
      and (
        member.role in ('creator', 'partner')
        or (member.role = 'circle' and coalesce(moment.shared_with, '[]'::jsonb) ? 'circle')
      )
  );
end
$$;

revoke all on function public.authorize_canonical_stream_playback(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.authorize_canonical_stream_playback(uuid, uuid, text)
  to service_role;

create index if not exists moment_media_family_stream_uid_idx
  on public.moment_media (family_id, stream_uid)
  where stream_uid is not null;

-- Provider identifiers are capabilities. An authenticated client may request a
-- canonical reservation, but only trusted provider-verifying code may bind the
-- reservation to the provider object that will later be published.
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
  reservation public.media_upload_reservations%rowtype;
  candidate text := nullif(trim(p_provider_object_id), '');
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Provider upload identity requires a trusted service.';
  end if;
  if p_provider <> 'stream' or candidate is null then
    raise exception 'Provider upload identity is invalid.';
  end if;

  select * into reservation
  from public.media_upload_reservations
  where id = p_reservation_id
  for update;

  if not found then raise exception 'reservation not found'; end if;
  if reservation.status <> 'reserved' then
    raise exception 'reservation is no longer open';
  end if;
  if reservation.canonical_media_id is null or reservation.transport <> 'video-stream' then
    raise exception 'reservation is not a canonical Stream upload';
  end if;
  if reservation.provider is not null and reservation.provider <> p_provider then
    raise exception 'reservation belongs to another provider';
  end if;

  if reservation.provider_object_id is null then
    update public.media_upload_reservations
    set provider = p_provider,
        provider_object_id = candidate,
        provider_cleanup_required = true,
        provider_cleanup_confirmed_at = null,
        provider_upload_confirmed_at = null
    where id = p_reservation_id;
    return query select true, candidate;
    return;
  end if;

  return query select reservation.provider_object_id = candidate,
    reservation.provider_object_id;
end
$$;

revoke all on function public.claim_canonical_media_upload_provider_object(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_canonical_media_upload_provider_object(uuid, text, text)
  to service_role;
