-- Media quotas and Vault tier foundation (Milestone 1 of the media/pricing plan).
-- Adds vault plan keys, per-family quota columns, a storage usage ledger, and
-- the reserve/finalize/release RPC flow used around media uploads.

-- 1. Extend plan_key checks for the Vault tier.

alter table public.billing_products drop constraint if exists billing_products_plan_key_check;
alter table public.billing_products add constraint billing_products_plan_key_check
  check (plan_key in ('family_monthly', 'family_yearly', 'vault_monthly', 'vault_yearly', 'gift_year', 'gift_vault_year', 'partner_year', 'comp_year'));

alter table public.family_entitlements drop constraint if exists family_entitlements_plan_key_check;
alter table public.family_entitlements add constraint family_entitlements_plan_key_check
  check (plan_key in ('family_monthly', 'family_yearly', 'vault_monthly', 'vault_yearly', 'gift_year', 'gift_vault_year', 'partner_year', 'comp_year'));

alter table public.billing_subscriptions drop constraint if exists billing_subscriptions_plan_key_check;
alter table public.billing_subscriptions add constraint billing_subscriptions_plan_key_check
  check (plan_key in ('family_monthly', 'family_yearly', 'vault_monthly', 'vault_yearly'));

-- 1b. The webhook upserts billing_subscriptions with
-- ON CONFLICT (provider, provider_subscription_id), which cannot infer the
-- existing partial unique index. Replace it with a real unique constraint
-- (multiple NULL provider_subscription_id rows stay allowed).

drop index if exists public.billing_subscriptions_provider_subscription_uidx;
alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_provider_subscription_key;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_provider_subscription_key
  unique (provider, provider_subscription_id);

-- 2. Quota columns on family_entitlements. Defaults match the Family tier.

alter table public.family_entitlements
  add column if not exists storage_tier text not null default 'family'
    check (storage_tier in ('family', 'vault', 'partner', 'comp')),
  add column if not exists media_quota_bytes bigint not null default 20000000000,
  add column if not exists optimized_media_quota_bytes bigint not null default 20000000000,
  add column if not exists original_quota_bytes bigint not null default 0,
  add column if not exists video_quota_seconds integer not null default 18000,
  add column if not exists video_quota_bytes bigint not null default 10000000000,
  add column if not exists originals_enabled boolean not null default false,
  add column if not exists max_video_duration_sec integer not null default 120,
  add column if not exists max_video_source_bytes bigint not null default 500000000;

-- 3. Per-family storage usage ledger. Family members can read it; only
-- security-definer functions (or service role) mutate it.

create table if not exists public.family_storage_usage (
  family_id uuid primary key references public.families(id) on delete cascade,
  optimized_media_bytes bigint not null default 0,
  original_media_bytes bigint not null default 0,
  video_seconds integer not null default 0,
  video_bytes bigint not null default 0,
  image_count integer not null default 0,
  video_count integer not null default 0,
  audio_bytes bigint not null default 0,
  object_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.family_storage_usage enable row level security;

drop policy if exists family_storage_usage_select on public.family_storage_usage;
create policy family_storage_usage_select on public.family_storage_usage for select
  using (public.is_family_member(family_id));

-- 4. Upload reservations. A reservation holds quota while an upload is in
-- flight; finalize records real usage, release abandons the hold. Expired
-- reservations stop counting against quota automatically.

create table if not exists public.media_upload_reservations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  media_type text not null check (media_type in ('image', 'video', 'audio')),
  quota_class text not null default 'optimized' check (quota_class in ('optimized', 'original')),
  reserved_bytes bigint not null default 0 check (reserved_bytes >= 0),
  reserved_seconds integer not null default 0 check (reserved_seconds >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'finalized', 'released', 'expired')),
  expires_at timestamptz not null default now() + interval '1 hour',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_upload_reservations_family_active_idx
  on public.media_upload_reservations(family_id, status, expires_at);

alter table public.media_upload_reservations enable row level security;

drop policy if exists media_upload_reservations_select on public.media_upload_reservations;
create policy media_upload_reservations_select on public.media_upload_reservations for select
  using (public.is_family_member(family_id));

drop trigger if exists media_upload_reservations_updated on public.media_upload_reservations;
create trigger media_upload_reservations_updated
  before update on public.media_upload_reservations
  for each row execute procedure public.ool_set_updated_at();

-- 5. Plan quota mapping. Single source of truth for what each plan includes.

create or replace function public.plan_storage_limits(p_plan_key text)
returns table (
  storage_tier text,
  media_quota_bytes bigint,
  optimized_media_quota_bytes bigint,
  original_quota_bytes bigint,
  video_quota_seconds integer,
  video_quota_bytes bigint,
  originals_enabled boolean,
  max_video_duration_sec integer,
  max_video_source_bytes bigint
)
language sql
immutable
as $$
  select
    case
      when p_plan_key in ('vault_monthly', 'vault_yearly', 'gift_vault_year') then 'vault'
      when p_plan_key = 'partner_year' then 'partner'
      when p_plan_key = 'comp_year' then 'comp'
      else 'family'
    end,
    case when p_plan_key in ('vault_monthly', 'vault_yearly', 'gift_vault_year') then 100000000000 else 20000000000 end::bigint,
    case when p_plan_key in ('vault_monthly', 'vault_yearly', 'gift_vault_year') then 100000000000 else 20000000000 end::bigint,
    case when p_plan_key in ('vault_monthly', 'vault_yearly', 'gift_vault_year') then 100000000000 else 0 end::bigint,
    case when p_plan_key in ('vault_monthly', 'vault_yearly', 'gift_vault_year') then 60000 else 18000 end,
    case when p_plan_key in ('vault_monthly', 'vault_yearly', 'gift_vault_year') then 50000000000 else 10000000000 end::bigint,
    p_plan_key in ('vault_monthly', 'vault_yearly', 'gift_vault_year'),
    case when p_plan_key in ('vault_monthly', 'vault_yearly', 'gift_vault_year') then 600 else 120 end,
    case when p_plan_key in ('vault_monthly', 'vault_yearly', 'gift_vault_year') then 2000000000 else 500000000 end::bigint;
$$;

-- 6. apply_family_entitlement also applies quota columns from the plan.

create or replace function public.apply_family_entitlement(
  target_family_id uuid,
  next_source text,
  next_status text,
  next_plan_key text,
  next_billing_owner_user_id uuid default null,
  next_billing_owner_email text default null,
  next_provider_subscription_id text default null,
  next_starts_at timestamptz default now(),
  next_expires_at timestamptz default null,
  next_grace_ends_at timestamptz default null,
  next_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_limits record;
begin
  select * into v_limits from public.plan_storage_limits(next_plan_key);

  insert into public.family_entitlements (
    family_id,
    status,
    source,
    plan_key,
    child_limit,
    billing_owner_user_id,
    billing_owner_email,
    provider_subscription_id,
    starts_at,
    expires_at,
    grace_ends_at,
    last_event_at,
    metadata,
    storage_tier,
    media_quota_bytes,
    optimized_media_quota_bytes,
    original_quota_bytes,
    video_quota_seconds,
    video_quota_bytes,
    originals_enabled,
    max_video_duration_sec,
    max_video_source_bytes
  )
  values (
    target_family_id,
    next_status,
    next_source,
    next_plan_key,
    1,
    next_billing_owner_user_id,
    nullif(trim(next_billing_owner_email), ''),
    next_provider_subscription_id,
    coalesce(next_starts_at, now()),
    next_expires_at,
    next_grace_ends_at,
    now(),
    coalesce(next_metadata, '{}'::jsonb),
    v_limits.storage_tier,
    v_limits.media_quota_bytes,
    v_limits.optimized_media_quota_bytes,
    v_limits.original_quota_bytes,
    v_limits.video_quota_seconds,
    v_limits.video_quota_bytes,
    v_limits.originals_enabled,
    v_limits.max_video_duration_sec,
    v_limits.max_video_source_bytes
  )
  on conflict (family_id) do update
  set
    status = excluded.status,
    source = excluded.source,
    plan_key = excluded.plan_key,
    child_limit = 1,
    billing_owner_user_id = coalesce(excluded.billing_owner_user_id, public.family_entitlements.billing_owner_user_id),
    billing_owner_email = coalesce(excluded.billing_owner_email, public.family_entitlements.billing_owner_email),
    provider_subscription_id = coalesce(excluded.provider_subscription_id, public.family_entitlements.provider_subscription_id),
    starts_at = excluded.starts_at,
    expires_at = excluded.expires_at,
    grace_ends_at = excluded.grace_ends_at,
    last_event_at = now(),
    metadata = public.family_entitlements.metadata || excluded.metadata,
    storage_tier = excluded.storage_tier,
    media_quota_bytes = excluded.media_quota_bytes,
    optimized_media_quota_bytes = excluded.optimized_media_quota_bytes,
    original_quota_bytes = excluded.original_quota_bytes,
    video_quota_seconds = excluded.video_quota_seconds,
    video_quota_bytes = excluded.video_quota_bytes,
    originals_enabled = excluded.originals_enabled,
    max_video_duration_sec = excluded.max_video_duration_sec,
    max_video_source_bytes = excluded.max_video_source_bytes;
end
$$;

-- 7. Entitlement read RPC returns quota fields. Return type changes, so drop first.

drop function if exists public.get_my_family_entitlement(uuid);

create or replace function public.get_my_family_entitlement(target_family_id uuid)
returns table (
  family_id uuid,
  status text,
  source text,
  plan_key text,
  child_limit integer,
  billing_owner_user_id uuid,
  billing_owner_email text,
  starts_at timestamptz,
  expires_at timestamptz,
  grace_ends_at timestamptz,
  is_active boolean,
  is_billing_owner boolean,
  support_email text,
  storage_tier text,
  media_quota_bytes bigint,
  optimized_media_quota_bytes bigint,
  original_quota_bytes bigint,
  video_quota_seconds integer,
  video_quota_bytes bigint,
  originals_enabled boolean,
  max_video_duration_sec integer,
  max_video_source_bytes bigint
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

  if not public.is_family_member(target_family_id) then
    raise exception 'family entitlement not found';
  end if;

  return query
  select
    target_family_id,
    coalesce(fe.status, 'inactive')::text,
    coalesce(fe.source, 'none')::text,
    fe.plan_key,
    coalesce(fe.child_limit, 1),
    fe.billing_owner_user_id,
    fe.billing_owner_email,
    fe.starts_at,
    fe.expires_at,
    fe.grace_ends_at,
    public.family_has_active_entitlement(target_family_id),
    fe.billing_owner_user_id is not distinct from auth.uid(),
    'support@ourlittleworld.me'::text,
    coalesce(fe.storage_tier, 'family'),
    coalesce(fe.media_quota_bytes, 20000000000),
    coalesce(fe.optimized_media_quota_bytes, 20000000000),
    coalesce(fe.original_quota_bytes, 0),
    coalesce(fe.video_quota_seconds, 18000),
    coalesce(fe.video_quota_bytes, 10000000000),
    coalesce(fe.originals_enabled, false),
    coalesce(fe.max_video_duration_sec, 120),
    coalesce(fe.max_video_source_bytes, 500000000)
  from (select 1) seed
  left join public.family_entitlements fe
    on fe.family_id = target_family_id;
end
$$;

revoke all on function public.get_my_family_entitlement(uuid) from public, anon;
grant execute on function public.get_my_family_entitlement(uuid) to authenticated;

-- 8. Reserve / finalize / release flow around media uploads.
-- reserve checks per-item limits and remaining quota (usage + in-flight
-- reservations), then holds the requested amounts until finalize or release.

create or replace function public.reserve_media_upload(
  target_family_id uuid,
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
  v_ent public.family_entitlements%rowtype;
  v_usage public.family_storage_usage%rowtype;
  v_pending_bytes bigint;
  v_pending_seconds integer;
  v_pending_original bigint;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  if not public.is_family_writer(target_family_id) then
    raise exception 'Only a co-parent can upload media for this family.';
  end if;
  if p_media_type not in ('image', 'video', 'audio') then
    raise exception 'Unsupported media type.';
  end if;
  if coalesce(p_bytes, 0) < 0 or coalesce(p_duration_sec, 0) < 0 then
    raise exception 'Invalid media size.';
  end if;

  select * into v_ent from public.family_entitlements where family_id = target_family_id;
  if not found or not public.family_has_active_entitlement(target_family_id) then
    return query select null::uuid, false, 'no_active_plan'::text;
    return;
  end if;

  if p_quota_class = 'original' and not v_ent.originals_enabled then
    return query select null::uuid, false, 'originals_not_included'::text;
    return;
  end if;

  if p_media_type = 'video' then
    if coalesce(p_duration_sec, 0) > v_ent.max_video_duration_sec then
      return query select null::uuid, false, 'video_too_long'::text;
      return;
    end if;
    if coalesce(p_bytes, 0) > v_ent.max_video_source_bytes then
      return query select null::uuid, false, 'video_source_too_large'::text;
      return;
    end if;
  end if;

  select * into v_usage from public.family_storage_usage where family_id = target_family_id;

  select
    coalesce(sum(reserved_bytes) filter (where quota_class = 'optimized'), 0),
    coalesce(sum(reserved_seconds), 0),
    coalesce(sum(reserved_bytes) filter (where quota_class = 'original'), 0)
  into v_pending_bytes, v_pending_seconds, v_pending_original
  from public.media_upload_reservations
  where family_id = target_family_id
    and status = 'reserved'
    and expires_at > now();

  if p_quota_class = 'original' then
    if coalesce(v_usage.original_media_bytes, 0) + v_pending_original + p_bytes > v_ent.original_quota_bytes then
      return query select null::uuid, false, 'original_quota_exceeded'::text;
      return;
    end if;
  else
    if coalesce(v_usage.optimized_media_bytes, 0) + v_pending_bytes + p_bytes > v_ent.optimized_media_quota_bytes then
      return query select null::uuid, false, 'media_quota_exceeded'::text;
      return;
    end if;
    if p_media_type = 'video' then
      if coalesce(v_usage.video_seconds, 0) + v_pending_seconds + coalesce(p_duration_sec, 0) > v_ent.video_quota_seconds then
        return query select null::uuid, false, 'video_minutes_exceeded'::text;
        return;
      end if;
      if coalesce(v_usage.video_bytes, 0) + p_bytes > v_ent.video_quota_bytes then
        return query select null::uuid, false, 'video_quota_exceeded'::text;
        return;
      end if;
    end if;
  end if;

  insert into public.media_upload_reservations (family_id, user_id, media_type, quota_class, reserved_bytes, reserved_seconds)
  values (target_family_id, auth.uid(), p_media_type, coalesce(p_quota_class, 'optimized'), coalesce(p_bytes, 0), coalesce(p_duration_sec, 0))
  returning id into v_id;

  return query select v_id, true, null::text;
end
$$;

revoke all on function public.reserve_media_upload(uuid, text, bigint, integer, text) from public, anon;
grant execute on function public.reserve_media_upload(uuid, text, bigint, integer, text) to authenticated;

create or replace function public.finalize_media_upload(
  p_reservation_id uuid,
  p_actual_bytes bigint default null,
  p_actual_duration_sec integer default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_res public.media_upload_reservations%rowtype;
  v_bytes bigint;
  v_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  select * into v_res from public.media_upload_reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'Reservation not found.';
  end if;
  if not public.is_family_writer(v_res.family_id) then
    raise exception 'Only a co-parent can finalize uploads for this family.';
  end if;
  if v_res.status <> 'reserved' then
    raise exception 'Reservation is no longer open.';
  end if;

  v_bytes := coalesce(p_actual_bytes, v_res.reserved_bytes);
  v_seconds := coalesce(p_actual_duration_sec, v_res.reserved_seconds);

  update public.media_upload_reservations
  set status = 'finalized', reserved_bytes = v_bytes, reserved_seconds = v_seconds
  where id = p_reservation_id;

  insert into public.family_storage_usage as usage (
    family_id,
    optimized_media_bytes,
    original_media_bytes,
    video_seconds,
    video_bytes,
    image_count,
    video_count,
    audio_bytes,
    object_count,
    updated_at
  )
  values (
    v_res.family_id,
    case when v_res.quota_class = 'optimized' then v_bytes else 0 end,
    case when v_res.quota_class = 'original' then v_bytes else 0 end,
    case when v_res.media_type = 'video' and v_res.quota_class = 'optimized' then v_seconds else 0 end,
    case when v_res.media_type = 'video' and v_res.quota_class = 'optimized' then v_bytes else 0 end,
    case when v_res.media_type = 'image' then 1 else 0 end,
    case when v_res.media_type = 'video' then 1 else 0 end,
    case when v_res.media_type = 'audio' then v_bytes else 0 end,
    1,
    now()
  )
  on conflict (family_id) do update
  set
    optimized_media_bytes = usage.optimized_media_bytes + excluded.optimized_media_bytes,
    original_media_bytes = usage.original_media_bytes + excluded.original_media_bytes,
    video_seconds = usage.video_seconds + excluded.video_seconds,
    video_bytes = usage.video_bytes + excluded.video_bytes,
    image_count = usage.image_count + excluded.image_count,
    video_count = usage.video_count + excluded.video_count,
    audio_bytes = usage.audio_bytes + excluded.audio_bytes,
    object_count = usage.object_count + excluded.object_count,
    updated_at = now();
end
$$;

revoke all on function public.finalize_media_upload(uuid, bigint, integer) from public, anon;
grant execute on function public.finalize_media_upload(uuid, bigint, integer) to authenticated;

create or replace function public.release_media_upload(p_reservation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_res public.media_upload_reservations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  select * into v_res from public.media_upload_reservations where id = p_reservation_id for update;
  if not found then return; end if;
  if not public.is_family_writer(v_res.family_id) then
    raise exception 'Only a co-parent can release uploads for this family.';
  end if;
  if v_res.status = 'reserved' then
    update public.media_upload_reservations set status = 'released' where id = p_reservation_id;
  end if;
end
$$;

revoke all on function public.release_media_upload(uuid) from public, anon;
grant execute on function public.release_media_upload(uuid) to authenticated;

-- 8b. Gift redemptions carry their plan so Vault gift years redeem correctly.

alter table public.gift_redemptions
  add column if not exists plan_key text not null default 'gift_year'
    check (plan_key in ('gift_year', 'gift_vault_year'));

create or replace function public.redeem_purchase_code(
  p_code text,
  target_family_id uuid
)
returns table (
  family_id uuid,
  status text,
  source text,
  plan_key text,
  expires_at timestamptz,
  message text
)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_hash text;
  v_now timestamptz := now();
  v_gift public.gift_redemptions%rowtype;
  v_partner public.partner_grant_codes%rowtype;
  v_partner_grant public.partner_grants%rowtype;
  v_subscription public.billing_subscriptions%rowtype;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  if not public.is_family_writer(target_family_id) then
    raise exception 'Only a co-parent can redeem a purchase code for this family.';
  end if;

  v_hash := public.billing_code_hash(p_code);

  select * into v_gift
  from public.gift_redemptions
  where code_hash = v_hash
  for update;

  if found then
    if v_gift.status <> 'available'
      or v_gift.redeemed_at is not null
      or (v_gift.code_expires_at is not null and v_gift.code_expires_at <= v_now) then
      raise exception 'This gift code has already been used or expired.';
    end if;

    v_expires_at := v_now + make_interval(days => v_gift.duration_days);

    update public.gift_redemptions
    set status = 'redeemed',
        redeemed_by_user_id = auth.uid(),
        redeemed_family_id = target_family_id,
        redeemed_at = v_now
    where id = v_gift.id;

    update public.gift_purchases
    set status = 'redeemed'
    where id = v_gift.gift_purchase_id;

    perform public.apply_family_entitlement(
      target_family_id,
      'gift',
      'gift_active',
      v_gift.plan_key,
      auth.uid(),
      null,
      null,
      v_now,
      v_expires_at,
      null,
      jsonb_build_object('gift_redemption_id', v_gift.id)
    );

    insert into public.billing_events (provider, event_id, event_type, family_id, user_id, processed_at, payload)
    values ('gift', v_gift.id::text, 'gift.redeemed', target_family_id, auth.uid(), v_now, jsonb_build_object('gift_redemption_id', v_gift.id))
    on conflict (provider, event_id) do nothing;

    return query select target_family_id, 'gift_active'::text, 'gift'::text, v_gift.plan_key, v_expires_at,
      case when v_gift.plan_key = 'gift_vault_year' then 'Vault gift year redeemed.' else 'Gift year redeemed.' end::text;
    return;
  end if;

  select * into v_partner
  from public.partner_grant_codes
  where code_hash = v_hash
  for update;

  if found then
    select * into v_partner_grant
    from public.partner_grants
    where id = v_partner.partner_grant_id
    for update;

    if v_partner.status <> 'available'
      or v_partner.redeemed_at is not null
      or v_partner_grant.status <> 'active'
      or (v_partner_grant.expires_at is not null and v_partner_grant.expires_at <= v_now) then
      raise exception 'This partner code has already been used or expired.';
    end if;

    v_expires_at := v_now + make_interval(days => v_partner_grant.duration_days);

    update public.partner_grant_codes
    set status = 'redeemed',
        redeemed_by_user_id = auth.uid(),
        redeemed_family_id = target_family_id,
        redeemed_at = v_now
    where id = v_partner.id;

    perform public.apply_family_entitlement(
      target_family_id,
      'partner',
      'comped',
      'partner_year',
      auth.uid(),
      null,
      null,
      v_now,
      v_expires_at,
      null,
      jsonb_build_object('partner_grant_id', v_partner.partner_grant_id, 'partner_grant_code_id', v_partner.id)
    );

    insert into public.billing_events (provider, event_id, event_type, family_id, user_id, processed_at, payload)
    values ('partner', v_partner.id::text, 'partner_code.redeemed', target_family_id, auth.uid(), v_now, jsonb_build_object('partner_grant_id', v_partner.partner_grant_id))
    on conflict (provider, event_id) do nothing;

    return query select target_family_id, 'comped'::text, 'partner'::text, 'partner_year'::text, v_expires_at, 'Partner access redeemed.'::text;
    return;
  end if;

  select * into v_subscription
  from public.billing_subscriptions
  where claim_code_hash = v_hash
  for update;

  if found then
    if v_subscription.status not in ('active', 'trialing', 'grace_period')
      or v_subscription.claim_code_redeemed_at is not null
      or (v_subscription.family_id is not null and v_subscription.family_id <> target_family_id) then
      raise exception 'This subscription code cannot be redeemed.';
    end if;

    update public.billing_subscriptions
    set family_id = target_family_id,
        purchaser_user_id = auth.uid(),
        claim_code_redeemed_at = v_now
    where id = v_subscription.id;

    perform public.apply_family_entitlement(
      target_family_id,
      'stripe',
      v_subscription.status,
      v_subscription.plan_key,
      auth.uid(),
      null,
      v_subscription.provider_subscription_id,
      coalesce(v_subscription.current_period_start, v_now),
      v_subscription.current_period_end,
      null,
      jsonb_build_object('billing_subscription_id', v_subscription.id)
    );

    insert into public.billing_events (provider, event_id, event_type, family_id, user_id, processed_at, payload)
    values ('stripe', 'claim:' || v_subscription.id::text, 'stripe_subscription.claimed', target_family_id, auth.uid(), v_now, jsonb_build_object('billing_subscription_id', v_subscription.id))
    on conflict (provider, event_id) do nothing;

    return query select target_family_id, v_subscription.status, 'stripe'::text, v_subscription.plan_key, v_subscription.current_period_end, 'Website subscription connected.'::text;
    return;
  end if;

  raise exception 'Purchase code is invalid or expired.';
end
$$;

revoke all on function public.redeem_purchase_code(text, uuid) from public, anon;
grant execute on function public.redeem_purchase_code(text, uuid) to authenticated;

-- 9. Backfill quota columns for existing entitlements from their plan.

update public.family_entitlements fe
set (storage_tier, media_quota_bytes, optimized_media_quota_bytes, original_quota_bytes,
     video_quota_seconds, video_quota_bytes, originals_enabled, max_video_duration_sec, max_video_source_bytes)
  = (select l.storage_tier, l.media_quota_bytes, l.optimized_media_quota_bytes, l.original_quota_bytes,
            l.video_quota_seconds, l.video_quota_bytes, l.originals_enabled, l.max_video_duration_sec, l.max_video_source_bytes
     from public.plan_storage_limits(fe.plan_key) l);

-- 10. Vault products and repriced Family products.

insert into public.billing_products (provider, product_id, plan_key, billing_interval, price_cents, currency, active)
values
  ('apple', 'olw.vault.monthly', 'vault_monthly', 'month', 1499, 'usd', true),
  ('apple', 'olw.vault.yearly', 'vault_yearly', 'year', 14999, 'usd', true),
  ('google', 'olw.vault.monthly', 'vault_monthly', 'month', 1499, 'usd', true),
  ('google', 'olw.vault.yearly', 'vault_yearly', 'year', 14999, 'usd', true),
  ('stripe', 'vault_monthly', 'vault_monthly', 'month', 1499, 'usd', true),
  ('stripe', 'vault_yearly', 'vault_yearly', 'year', 14999, 'usd', true),
  ('stripe', 'gift_vault_year', 'gift_vault_year', 'one_time', 15000, 'usd', true),
  ('gift', 'gift_vault_year_code', 'gift_vault_year', 'one_time', 15000, 'usd', true),
  ('apple', 'olw.family.monthly', 'family_monthly', 'month', 799, 'usd', true),
  ('apple', 'olw.family.yearly', 'family_yearly', 'year', 6999, 'usd', true),
  ('google', 'olw.family.monthly', 'family_monthly', 'month', 799, 'usd', true),
  ('google', 'olw.family.yearly', 'family_yearly', 'year', 6999, 'usd', true),
  ('stripe', 'family_monthly', 'family_monthly', 'month', 799, 'usd', true),
  ('stripe', 'family_yearly', 'family_yearly', 'year', 6999, 'usd', true),
  ('stripe', 'gift_year', 'gift_year', 'one_time', 7000, 'usd', true),
  ('gift', 'gift_year_code', 'gift_year', 'one_time', 7000, 'usd', true)
on conflict (provider, product_id) do update
set plan_key = excluded.plan_key,
    billing_interval = excluded.billing_interval,
    price_cents = excluded.price_cents,
    currency = excluded.currency,
    active = excluded.active;
