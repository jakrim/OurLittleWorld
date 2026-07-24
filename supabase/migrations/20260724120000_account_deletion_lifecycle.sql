-- Idempotent, role-aware account deletion lifecycle.
--
-- The Edge orchestrator performs provider cleanup before this migration's
-- finalizer removes database state. Family locks close the race where a new
-- Keep, upload, or membership change could arrive after provider inventory.
-- Audit rows contain identifiers, roles, timestamps, status, and aggregate
-- provider outcomes only; they never contain family-authored content or local
-- discovery state.

create table if not exists public.account_deletion_requests (
  id                    uuid primary key,
  requester_user_id     uuid not null unique,
  family_roles          jsonb not null default '[]'::jsonb,
  status                text not null default 'prepared' check (status in (
    'prepared',
    'provider_cleaned',
    'cleanup_failed',
    'database_deleted',
    'auth_deleting',
    'completed',
    'blocked_legal_hold',
    'failed'
  )),
  legal_hold            boolean not null default false,
  reauthenticated_at    timestamptz not null,
  provider_summary      jsonb not null default '{}'::jsonb,
  attempts              integer not null default 1 check (attempts > 0),
  last_error_code       text,
  requested_at          timestamptz not null default now(),
  provider_cleaned_at   timestamptz,
  database_deleted_at   timestamptz,
  auth_deleted_at       timestamptz,
  completed_at          timestamptz,
  updated_at            timestamptz not null default now()
);

create index if not exists account_deletion_requests_status_idx
  on public.account_deletion_requests(status, updated_at);

create table if not exists public.account_deletion_family_locks (
  family_id             uuid primary key references public.families(id) on delete cascade,
  request_id            uuid not null references public.account_deletion_requests(id) on delete cascade,
  requester_user_id     uuid not null,
  expires_at            timestamptz not null default now() + interval '30 minutes',
  created_at            timestamptz not null default now()
);

create index if not exists account_deletion_family_locks_request_idx
  on public.account_deletion_family_locks(request_id, expires_at);

alter table public.account_deletion_requests enable row level security;
alter table public.account_deletion_family_locks enable row level security;

revoke all on table public.account_deletion_requests from public, anon, authenticated;
revoke all on table public.account_deletion_family_locks from public, anon, authenticated;
grant select, insert, update, delete on table public.account_deletion_requests to service_role;
grant select, insert, update, delete on table public.account_deletion_family_locks to service_role;

drop trigger if exists account_deletion_requests_updated on public.account_deletion_requests;
create trigger account_deletion_requests_updated
  before update on public.account_deletion_requests
  for each row execute procedure public.ool_set_updated_at();

create or replace function public.family_deletion_locked(fid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.account_deletion_family_locks lock
    where lock.family_id = fid
      and lock.expires_at > now()
  );
$$;

revoke all on function public.family_deletion_locked(uuid) from public, anon;
grant execute on function public.family_deletion_locked(uuid) to authenticated, service_role;

-- Every established writer mutation gate calls is_family_writer. Making an
-- active deletion lock fail this predicate pauses direct API, Storage, and RPC
-- writes while provider cleanup is in flight.
create or replace function public.is_family_writer(fid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    not public.family_deletion_locked(fid)
    and exists (
      select 1
      from public.family_members
      where family_id = fid
        and user_id = auth.uid()
        and role in ('creator', 'partner')
    );
$$;

revoke all on function public.is_family_writer(uuid) from public, anon;
grant execute on function public.is_family_writer(uuid) to authenticated;

create or replace function public.guard_family_membership_during_deletion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  target_family_id uuid;
begin
  target_family_id := case when tg_op = 'DELETE' then old.family_id else new.family_id end;
  if public.family_deletion_locked(target_family_id) then
    raise exception 'family account deletion is in progress'
      using errcode = '55000';
  end if;
  return coalesce(new, old);
end
$$;

drop trigger if exists family_members_deletion_lock on public.family_members;
create trigger family_members_deletion_lock
  before insert or update or delete on public.family_members
  for each row execute procedure public.guard_family_membership_during_deletion();

create or replace function public.preview_account_deletion(target_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with memberships as (
    select
      fm.family_id,
      fm.role,
      (
        select count(*)::integer
        from public.family_members writers
        where writers.family_id = fm.family_id
          and writers.role in ('creator', 'partner')
      ) as writer_count,
      fe.source as billing_source,
      fe.billing_owner_user_id
    from public.family_members fm
    left join public.family_entitlements fe on fe.family_id = fm.family_id
    where fm.user_id = target_user_id
  ), classified as (
    select
      role,
      case
        when role = 'circle' then 'circle_member'
        when writer_count <= 1 then 'sole_writer'
        else 'additional_writer'
      end as disposition,
      coalesce(billing_source, 'none') as billing_source,
      billing_owner_user_id = target_user_id as is_billing_owner
    from memberships
  )
  select jsonb_build_object(
    'family_count', (select count(*) from classified),
    'sole_writer_count', (select count(*) from classified where disposition = 'sole_writer'),
    'additional_writer_count', (select count(*) from classified where disposition = 'additional_writer'),
    'circle_count', (select count(*) from classified where disposition = 'circle_member'),
    'store_subscription_action_required', exists (
      select 1
      from classified
      where billing_source in ('apple', 'google')
        and (disposition = 'sole_writer' or is_billing_owner)
    ),
    'stripe_cancellation_required', exists (
      select 1
      from classified
      where billing_source = 'stripe'
        and (disposition = 'sole_writer' or is_billing_owner)
    )
  );
$$;

revoke all on function public.preview_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.preview_account_deletion(uuid) to service_role;

alter table public.media_upload_reservations
  add column if not exists provider text
    check (provider is null or provider in ('supabase', 'stream', 'r2')),
  add column if not exists provider_object_id text;

create index if not exists media_upload_reservations_provider_object_idx
  on public.media_upload_reservations(provider, provider_object_id)
  where provider_object_id is not null;

create or replace function public.begin_account_deletion(
  target_user_id uuid,
  proposed_request_id uuid,
  reauthenticated_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  effective_request_id uuid;
  member record;
  classifications jsonb := '[]'::jsonb;
  audit_roles jsonb := '[]'::jsonb;
  sole_family_ids uuid[] := array[]::uuid[];
  storage_paths jsonb := '[]'::jsonb;
  stream_uids jsonb := '[]'::jsonb;
  r2_object_ids jsonb := '[]'::jsonb;
  stripe_subscription_ids jsonb := '[]'::jsonb;
  existing_status text;
  deletion_legal_hold boolean;
begin
  if target_user_id is null or proposed_request_id is null then
    raise exception 'deletion request scope is required';
  end if;
  if reauthenticated_at is null or reauthenticated_at < now() - interval '15 minutes' then
    raise exception 'recent reauthentication is required';
  end if;
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'account not found';
  end if;
  if exists (
    select 1
    from public.account_deletion_requests
    where id = proposed_request_id
      and requester_user_id <> target_user_id
  ) then
    raise exception 'deletion request does not belong to this account';
  end if;

  insert into public.account_deletion_requests (
    id,
    requester_user_id,
    reauthenticated_at,
    status
  )
  values (
    proposed_request_id,
    target_user_id,
    reauthenticated_at,
    'prepared'
  )
  on conflict (requester_user_id) do update
  set
    reauthenticated_at = excluded.reauthenticated_at,
    status = case
      when public.account_deletion_requests.status in ('database_deleted', 'auth_deleting', 'completed')
        then public.account_deletion_requests.status
      else 'prepared'
    end,
    attempts = public.account_deletion_requests.attempts + 1,
    last_error_code = null
  returning id, status, legal_hold
  into effective_request_id, existing_status, deletion_legal_hold;

  if deletion_legal_hold then
    raise exception 'account deletion is blocked by a legal hold';
  end if;

  if existing_status in ('database_deleted', 'auth_deleting', 'completed') then
    return jsonb_build_object(
      'request_id', effective_request_id,
      'status', existing_status,
      'classifications', '[]'::jsonb,
      'sole_family_ids', '[]'::jsonb,
      'storage_paths', '[]'::jsonb,
      'stream_uids', '[]'::jsonb,
      'r2_object_ids', '[]'::jsonb,
      'stripe_subscription_ids', '[]'::jsonb
    );
  end if;

  delete from public.account_deletion_family_locks
  where request_id = effective_request_id
     or (requester_user_id = target_user_id and expires_at <= now());

  for member in
    select
      fm.family_id,
      fm.role,
      (
        select count(*)::integer
        from public.family_members writers
        where writers.family_id = fm.family_id
          and writers.role in ('creator', 'partner')
      ) as writer_count,
      coalesce(fe.source, 'none') as billing_source,
      fe.billing_owner_user_id = target_user_id as is_billing_owner
    from public.family_members fm
    left join public.family_entitlements fe on fe.family_id = fm.family_id
    where fm.user_id = target_user_id
    order by fm.family_id
  loop
    perform 1 from public.families where id = member.family_id for update;

    insert into public.account_deletion_family_locks (
      family_id,
      request_id,
      requester_user_id,
      expires_at
    )
    values (
      member.family_id,
      effective_request_id,
      target_user_id,
      now() + interval '30 minutes'
    )
    on conflict (family_id) do update
    set
      request_id = excluded.request_id,
      requester_user_id = excluded.requester_user_id,
      expires_at = excluded.expires_at;

    classifications := classifications || jsonb_build_array(jsonb_build_object(
      'family_id', member.family_id,
      'role', member.role,
      'writer_count', member.writer_count,
      'disposition', case
        when member.role = 'circle' then 'circle_member'
        when member.writer_count <= 1 then 'sole_writer'
        else 'additional_writer'
      end,
      'billing_source', member.billing_source,
      'is_billing_owner', member.is_billing_owner
    ));

    audit_roles := audit_roles || jsonb_build_array(jsonb_build_object(
      'family_id', member.family_id,
      'role', member.role,
      'disposition', case
        when member.role = 'circle' then 'circle_member'
        when member.writer_count <= 1 then 'sole_writer'
        else 'additional_writer'
      end
    ));

    if member.role <> 'circle' and member.writer_count <= 1 then
      sole_family_ids := array_append(sole_family_ids, member.family_id);
    end if;
  end loop;

  if coalesce(array_length(sole_family_ids, 1), 0) > 0 then
    select coalesce(jsonb_agg(distinct path order by path), '[]'::jsonb)
    into storage_paths
    from (
      select mm.family_id, mm.metadata ->> 'fullPath' as path
      from public.moment_media mm
      where mm.family_id = any(sole_family_ids)
      union all
      select mm.family_id, mm.metadata ->> 'thumbPath'
      from public.moment_media mm
      where mm.family_id = any(sole_family_ids)
      union all
      select mm.family_id, mm.metadata ->> 'posterPath'
      from public.moment_media mm
      where mm.family_id = any(sole_family_ids)
      union all
      select pt.family_id, pt.family_id::text || '/full/' || pt.storage_object::text || '.jpg'
      from public.photo_tags pt
      where pt.family_id = any(sole_family_ids) and pt.storage_object is not null
      union all
      select pt.family_id, pt.family_id::text || '/thumb/' || pt.thumb_object::text || '.jpg'
      from public.photo_tags pt
      where pt.family_id = any(sole_family_ids) and pt.thumb_object is not null
      union all
      select
        vn.family_id,
        case
          when vn.moment_id is not null then
            vn.family_id::text || '/moments/' || vn.moment_id::text || '/voice/' || vn.audio_object::text || '.' ||
            case
              when vn.mime_type = 'audio/mpeg' then 'mp3'
              when vn.mime_type = 'audio/aac' then 'aac'
              when vn.mime_type = 'audio/webm' then 'webm'
              else 'm4a'
            end
          when vn.letter_id is not null then
            vn.family_id::text || '/letters/' || vn.letter_id::text || '/voice/' || vn.audio_object::text || '.' ||
            case
              when vn.mime_type = 'audio/mpeg' then 'mp3'
              when vn.mime_type = 'audio/aac' then 'aac'
              when vn.mime_type = 'audio/webm' then 'webm'
              else 'm4a'
            end
          else null
        end
      from public.voice_notes vn
      where vn.family_id = any(sole_family_ids) and vn.audio_object is not null
    ) candidates
    where path is not null
      and path like family_id::text || '/%';

    select coalesce(jsonb_agg(distinct uid order by uid), '[]'::jsonb)
    into stream_uids
    from (
      select mm.stream_uid as uid
      from public.moment_media mm
      where mm.family_id = any(sole_family_ids)
        and mm.stream_uid is not null
      union all
      select mur.provider_object_id
      from public.media_upload_reservations mur
      where mur.family_id = any(sole_family_ids)
        and mur.provider = 'stream'
        and mur.provider_object_id is not null
    ) provider_objects;

    select coalesce(jsonb_agg(distinct object_id order by object_id), '[]'::jsonb)
    into r2_object_ids
    from (
      select mm.original_object::text as object_id
      from public.moment_media mm
      where mm.family_id = any(sole_family_ids)
        and mm.original_object is not null
      union all
      select mur.provider_object_id
      from public.media_upload_reservations mur
      where mur.family_id = any(sole_family_ids)
        and mur.provider = 'r2'
        and mur.provider_object_id is not null
    ) provider_objects;
  end if;

  select coalesce(jsonb_agg(distinct bs.provider_subscription_id order by bs.provider_subscription_id), '[]'::jsonb)
  into stripe_subscription_ids
  from public.billing_subscriptions bs
  where bs.provider = 'stripe'
    and bs.provider_subscription_id is not null
    and bs.status in ('pending', 'active', 'trialing', 'grace_period', 'past_due')
    and (
      bs.family_id = any(sole_family_ids)
      or bs.purchaser_user_id = target_user_id
    );

  update public.account_deletion_requests
  set
    family_roles = audit_roles,
    status = 'prepared',
    reauthenticated_at = begin_account_deletion.reauthenticated_at,
    last_error_code = null
  where id = effective_request_id;

  return jsonb_build_object(
    'request_id', effective_request_id,
    'status', 'prepared',
    'classifications', classifications,
    'sole_family_ids', to_jsonb(sole_family_ids),
    'storage_paths', storage_paths,
    'stream_uids', stream_uids,
    'r2_object_ids', r2_object_ids,
    'stripe_subscription_ids', stripe_subscription_ids
  );
end
$$;

revoke all on function public.begin_account_deletion(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.begin_account_deletion(uuid, uuid, timestamptz) to service_role;

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
  reservation public.media_upload_reservations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  if p_provider not in ('stream', 'r2') or nullif(trim(p_provider_object_id), '') is null then
    raise exception 'provider upload identity is invalid';
  end if;

  select * into reservation
  from public.media_upload_reservations
  where id = p_reservation_id
  for update;

  if not found or reservation.user_id is distinct from auth.uid() then
    raise exception 'reservation not found';
  end if;
  if reservation.status <> 'reserved' then
    raise exception 'reservation is no longer open';
  end if;
  if not public.is_family_writer(reservation.family_id) then
    raise exception 'Only a co-parent can attach provider media.';
  end if;

  update public.media_upload_reservations
  set
    provider = p_provider,
    provider_object_id = trim(p_provider_object_id)
  where id = p_reservation_id;
end
$$;

revoke all on function public.attach_media_upload_provider_object(uuid, text, text) from public, anon;
grant execute on function public.attach_media_upload_provider_object(uuid, text, text) to authenticated;

create or replace function public.mark_account_deletion_status(
  target_user_id uuid,
  target_request_id uuid,
  next_status text,
  summary jsonb default '{}'::jsonb,
  error_code text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
begin
  if next_status not in ('provider_cleaned', 'cleanup_failed', 'auth_deleting', 'completed', 'failed') then
    raise exception 'invalid deletion status transition';
  end if;

  update public.account_deletion_requests
  set
    status = next_status,
    provider_summary = case
      when next_status in ('provider_cleaned', 'cleanup_failed') then coalesce(summary, '{}'::jsonb)
      else provider_summary
    end,
    last_error_code = left(nullif(error_code, ''), 80),
    provider_cleaned_at = case when next_status = 'provider_cleaned' then now() else provider_cleaned_at end,
    auth_deleted_at = case when next_status = 'completed' then now() else auth_deleted_at end,
    completed_at = case when next_status = 'completed' then now() else completed_at end
  where id = target_request_id
    and requester_user_id = target_user_id;

  if not found then
    raise exception 'deletion request not found';
  end if;
end
$$;

revoke all on function public.mark_account_deletion_status(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.mark_account_deletion_status(uuid, uuid, text, jsonb, text) to service_role;

create or replace function public.finalize_account_deletion(
  target_user_id uuid,
  target_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  request_row public.account_deletion_requests%rowtype;
  member record;
  expected_disposition text;
  actual_disposition text;
  deleted_family_count integer := 0;
  left_family_count integer := 0;
  circle_count integer := 0;
  affected_family_ids uuid[] := array[]::uuid[];
begin
  select * into request_row
  from public.account_deletion_requests
  where id = target_request_id
    and requester_user_id = target_user_id
  for update;

  if not found then
    raise exception 'deletion request not found';
  end if;
  if request_row.legal_hold then
    update public.account_deletion_requests
    set status = 'blocked_legal_hold', last_error_code = 'legal_hold'
    where id = target_request_id;
    raise exception 'account deletion is blocked by a legal hold';
  end if;
  if request_row.status = 'database_deleted' then
    return jsonb_build_object(
      'deleted_family_count', 0,
      'left_family_count', 0,
      'circle_count', 0,
      'already_finalized', true
    );
  end if;
  if request_row.status <> 'provider_cleaned' then
    raise exception 'provider cleanup must finish before database deletion';
  end if;

  for member in
    select
      fm.family_id,
      fm.role,
      (
        select count(*)::integer
        from public.family_members writers
        where writers.family_id = fm.family_id
          and writers.role in ('creator', 'partner')
      ) as writer_count
    from public.family_members fm
    where fm.user_id = target_user_id
    order by fm.family_id
    for update of fm
  loop
    perform 1
    from public.account_deletion_family_locks lock
    where lock.family_id = member.family_id
      and lock.request_id = target_request_id
      and lock.requester_user_id = target_user_id
      and lock.expires_at > now();
    if not found then
      raise exception 'deletion family lock expired';
    end if;

    actual_disposition := case
      when member.role = 'circle' then 'circle_member'
      when member.writer_count <= 1 then 'sole_writer'
      else 'additional_writer'
    end;

    select role ->> 'disposition'
    into expected_disposition
    from jsonb_array_elements(request_row.family_roles) role
    where (role ->> 'family_id')::uuid = member.family_id
    limit 1;

    if expected_disposition is distinct from actual_disposition then
      raise exception 'family deletion classification changed';
    end if;

    affected_family_ids := array_append(affected_family_ids, member.family_id);

    if actual_disposition = 'sole_writer' then
      update public.billing_subscriptions
      set
        purchaser_user_id = case when purchaser_user_id = target_user_id then null else purchaser_user_id end,
        status = case
          when provider = 'stripe' and status in ('pending', 'active', 'trialing', 'grace_period', 'past_due') then 'canceled'
          else status
        end,
        current_period_end = case
          when provider = 'stripe' and status in ('pending', 'active', 'trialing', 'grace_period', 'past_due') then now()
          else current_period_end
        end,
        latest_receipt = '{}'::jsonb,
        metadata = jsonb_build_object(
          'account_deleted_at', now(),
          'deletion_request_id', target_request_id
        )
      where family_id = member.family_id;

      update public.billing_events
      set
        user_id = case when user_id = target_user_id then null else user_id end,
        payload = '{}'::jsonb
      where family_id = member.family_id;

      update public.gift_redemptions
      set
        status = 'revoked',
        redeemed_by_user_id = null,
        redeemed_family_id = null,
        metadata = jsonb_build_object(
          'family_account_deleted_at', now(),
          'deletion_request_id', target_request_id
        )
      where redeemed_family_id = member.family_id;

      update public.partner_grant_codes
      set
        status = 'revoked',
        redeemed_by_user_id = null,
        redeemed_family_id = null,
        metadata = jsonb_build_object(
          'family_account_deleted_at', now(),
          'deletion_request_id', target_request_id
        )
      where redeemed_family_id = member.family_id;

      delete from public.account_deletion_family_locks
      where family_id = member.family_id and request_id = target_request_id;
      delete from public.families where id = member.family_id;
      deleted_family_count := deleted_family_count + 1;
    else
      if actual_disposition = 'circle_member' then
        circle_count := circle_count + 1;
      else
        left_family_count := left_family_count + 1;
      end if;

      update public.family_entitlements
      set
        status = case
          when billing_owner_user_id = target_user_id
            and source = 'stripe'
            and status in ('active', 'trialing', 'grace_period', 'past_due')
            then 'canceled'
          else status
        end,
        expires_at = case
          when billing_owner_user_id = target_user_id and source = 'stripe' then now()
          else expires_at
        end,
        billing_owner_user_id = case
          when billing_owner_user_id = target_user_id then null
          else billing_owner_user_id
        end,
        billing_owner_email = case
          when billing_owner_user_id = target_user_id then null
          else billing_owner_email
        end,
        metadata = case
          when billing_owner_user_id = target_user_id then
            jsonb_build_object(
              'billing_owner_account_deleted_at', now(),
              'deletion_request_id', target_request_id
            )
          else metadata
        end
      where family_id = member.family_id;

      delete from public.account_deletion_family_locks
      where family_id = member.family_id and request_id = target_request_id;
      delete from public.family_members
      where family_id = member.family_id and user_id = target_user_id;
    end if;
  end loop;

  -- User/device-specific server state is never retained in another family.
  delete from public.push_tokens where user_id = target_user_id;
  delete from public.notification_preferences where user_id = target_user_id;
  delete from public.notification_deliveries where user_id = target_user_id;
  delete from public.notifications where user_id = target_user_id;
  delete from public.moment_views where user_id = target_user_id;
  delete from public.media_import_calibrations where user_id = target_user_id;
  delete from public.scan_checkpoints where user_id = target_user_id;
  delete from public.family_library_connections where user_id = target_user_id;
  delete from public.media_upload_reservations where user_id = target_user_id;
  delete from public.family_invites
  where created_by = target_user_id or used_by = target_user_id;

  update public.families set created_by = null where created_by = target_user_id;

  update public.billing_subscriptions
  set
    purchaser_user_id = null,
    latest_receipt = '{}'::jsonb,
    metadata = jsonb_build_object(
      'purchaser_account_deleted_at', now(),
      'deletion_request_id', target_request_id
    )
  where purchaser_user_id = target_user_id;

  update public.billing_events
  set user_id = null, payload = '{}'::jsonb
  where user_id = target_user_id;

  update public.gift_redemptions
  set redeemed_by_user_id = null
  where redeemed_by_user_id = target_user_id;

  update public.partner_grant_codes
  set redeemed_by_user_id = null
  where redeemed_by_user_id = target_user_id;

  delete from public.account_deletion_family_locks
  where requester_user_id = target_user_id;

  update public.account_deletion_requests
  set
    status = 'database_deleted',
    database_deleted_at = now(),
    last_error_code = null
  where id = target_request_id;

  return jsonb_build_object(
    'deleted_family_count', deleted_family_count,
    'left_family_count', left_family_count,
    'circle_count', circle_count,
    'already_finalized', false
  );
end
$$;

revoke all on function public.finalize_account_deletion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.finalize_account_deletion(uuid, uuid) to service_role;
