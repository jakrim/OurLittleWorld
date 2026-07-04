-- Billing and entitlement foundation.
-- Entitlements are family-level: one paid plan unlocks one private family
-- space for one child at launch. Billing-owner changes stay support-led.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.billing_products (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null check (provider in ('apple', 'google', 'stripe', 'gift', 'partner', 'admin')),
  product_id    text not null,
  plan_key      text not null check (plan_key in ('family_monthly', 'family_yearly', 'gift_year', 'partner_year', 'comp_year')),
  billing_interval text not null check (billing_interval in ('month', 'year', 'one_time', 'none')),
  price_cents   integer check (price_cents is null or price_cents >= 0),
  currency      text not null default 'usd',
  active        boolean not null default true,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (provider, product_id)
);

create table if not exists public.family_entitlements (
  family_id                  uuid primary key references public.families(id) on delete cascade,
  status                     text not null default 'inactive' check (
    status in ('inactive', 'active', 'trialing', 'grace_period', 'past_due', 'canceled', 'expired', 'refunded', 'gift_active', 'comped')
  ),
  source                     text not null default 'none' check (source in ('none', 'apple', 'google', 'stripe', 'gift', 'partner', 'admin')),
  plan_key                   text check (plan_key in ('family_monthly', 'family_yearly', 'gift_year', 'partner_year', 'comp_year')),
  child_limit                integer not null default 1 check (child_limit = 1),
  billing_owner_user_id      uuid references auth.users(id) on delete set null,
  billing_owner_email        text,
  provider_subscription_id   text,
  starts_at                  timestamptz not null default now(),
  expires_at                 timestamptz,
  grace_ends_at              timestamptz,
  last_event_at              timestamptz,
  metadata                   jsonb not null default '{}'::jsonb,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create table if not exists public.billing_subscriptions (
  id                         uuid primary key default gen_random_uuid(),
  family_id                  uuid references public.families(id) on delete set null,
  purchaser_user_id          uuid references auth.users(id) on delete set null,
  provider                   text not null check (provider in ('apple', 'google', 'stripe')),
  product_id                 text,
  plan_key                   text not null check (plan_key in ('family_monthly', 'family_yearly')),
  provider_customer_id       text,
  provider_subscription_id   text,
  provider_original_id       text,
  provider_transaction_id    text,
  claim_code_hash            text unique,
  claim_code_hint            text,
  claim_code_redeemed_at     timestamptz,
  status                     text not null default 'pending' check (
    status in ('pending', 'active', 'trialing', 'grace_period', 'past_due', 'canceled', 'expired', 'refunded')
  ),
  current_period_start       timestamptz,
  current_period_end         timestamptz,
  cancel_at_period_end       boolean not null default false,
  latest_receipt             jsonb not null default '{}'::jsonb,
  metadata                   jsonb not null default '{}'::jsonb,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create unique index if not exists billing_subscriptions_provider_subscription_uidx
  on public.billing_subscriptions(provider, provider_subscription_id)
  where provider_subscription_id is not null;

create unique index if not exists billing_subscriptions_provider_original_uidx
  on public.billing_subscriptions(provider, provider_original_id)
  where provider_original_id is not null;

create index if not exists billing_subscriptions_family_idx
  on public.billing_subscriptions(family_id);

create table if not exists public.billing_events (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null check (provider in ('apple', 'google', 'stripe', 'gift', 'partner', 'admin')),
  event_id      text not null,
  event_type    text not null,
  family_id     uuid references public.families(id) on delete set null,
  user_id       uuid references auth.users(id) on delete set null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  payload       jsonb not null default '{}'::jsonb,
  unique (provider, event_id)
);

create index if not exists billing_events_family_idx
  on public.billing_events(family_id, received_at desc);

create table if not exists public.gift_purchases (
  id                         uuid primary key default gen_random_uuid(),
  giver_name                 text,
  giver_email                text not null,
  recipient_name             text,
  recipient_email            text not null,
  gift_note                  text,
  delivery_day               date,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text,
  status                     text not null default 'pending' check (
    status in ('pending', 'paid', 'scheduled', 'sent', 'redeemed', 'refunded', 'canceled')
  ),
  paid_at                    timestamptz,
  delivered_at               timestamptz,
  refunded_at                timestamptz,
  metadata                   jsonb not null default '{}'::jsonb,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create table if not exists public.gift_redemptions (
  id                    uuid primary key default gen_random_uuid(),
  gift_purchase_id      uuid references public.gift_purchases(id) on delete cascade,
  code_hash             text not null unique,
  code_hint             text,
  status                text not null default 'available' check (status in ('available', 'redeemed', 'revoked', 'expired')),
  duration_days         integer not null default 365 check (duration_days > 0),
  code_expires_at       timestamptz,
  redeemed_by_user_id   uuid references auth.users(id) on delete set null,
  redeemed_family_id    uuid references public.families(id) on delete set null,
  redeemed_at           timestamptz,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists gift_redemptions_purchase_idx
  on public.gift_redemptions(gift_purchase_id);

create table if not exists public.partner_grants (
  id             uuid primary key default gen_random_uuid(),
  partner_name   text not null,
  grant_type     text not null default 'bulk_gift' check (grant_type in ('bulk_gift', 'photographer', 'doula', 'employer', 'admin')),
  quantity       integer not null check (quantity > 0),
  duration_days  integer not null default 365 check (duration_days > 0),
  expires_at     timestamptz,
  created_by     uuid references auth.users(id) on delete set null,
  status         text not null default 'active' check (status in ('active', 'paused', 'complete', 'revoked')),
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.partner_grant_codes (
  id                    uuid primary key default gen_random_uuid(),
  partner_grant_id      uuid not null references public.partner_grants(id) on delete cascade,
  code_hash             text not null unique,
  code_hint             text,
  status                text not null default 'available' check (status in ('available', 'redeemed', 'revoked', 'expired')),
  redeemed_by_user_id   uuid references auth.users(id) on delete set null,
  redeemed_family_id    uuid references public.families(id) on delete set null,
  redeemed_at           timestamptz,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists partner_grant_codes_grant_idx
  on public.partner_grant_codes(partner_grant_id);

drop trigger if exists billing_products_updated on public.billing_products;
create trigger billing_products_updated
  before update on public.billing_products
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists family_entitlements_updated on public.family_entitlements;
create trigger family_entitlements_updated
  before update on public.family_entitlements
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists billing_subscriptions_updated on public.billing_subscriptions;
create trigger billing_subscriptions_updated
  before update on public.billing_subscriptions
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists gift_purchases_updated on public.gift_purchases;
create trigger gift_purchases_updated
  before update on public.gift_purchases
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists gift_redemptions_updated on public.gift_redemptions;
create trigger gift_redemptions_updated
  before update on public.gift_redemptions
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists partner_grants_updated on public.partner_grants;
create trigger partner_grants_updated
  before update on public.partner_grants
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists partner_grant_codes_updated on public.partner_grant_codes;
create trigger partner_grant_codes_updated
  before update on public.partner_grant_codes
  for each row execute procedure public.ool_set_updated_at();

create or replace function public.billing_code_hash(raw_code text)
returns text
language sql
immutable
set search_path = public, extensions, pg_catalog
as $$
  select encode(extensions.digest(upper(regexp_replace(trim(coalesce(raw_code, '')), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex');
$$;

revoke all on function public.billing_code_hash(text) from public, anon, authenticated;

create or replace function public.family_has_active_entitlement(fid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.family_entitlements fe
    where fe.family_id = fid
      and fe.status in ('active', 'trialing', 'grace_period', 'gift_active', 'comped')
      and coalesce(fe.grace_ends_at, fe.expires_at, 'infinity'::timestamptz) > now()
  );
$$;

revoke all on function public.family_has_active_entitlement(uuid) from public, anon;
grant execute on function public.family_has_active_entitlement(uuid) to authenticated;

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
  support_email text
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
    'support@ourlittleworld.me'::text
  from (select 1) seed
  left join public.family_entitlements fe
    on fe.family_id = target_family_id;
end
$$;

revoke all on function public.get_my_family_entitlement(uuid) from public, anon;
grant execute on function public.get_my_family_entitlement(uuid) to authenticated;

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
begin
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
    metadata
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
    coalesce(next_metadata, '{}'::jsonb)
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
    metadata = public.family_entitlements.metadata || excluded.metadata;
end
$$;

revoke all on function public.apply_family_entitlement(uuid, text, text, text, uuid, text, text, timestamptz, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.apply_family_entitlement(uuid, text, text, text, uuid, text, text, timestamptz, timestamptz, timestamptz, jsonb) to service_role;

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
      'gift_year',
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

    return query select target_family_id, 'gift_active'::text, 'gift'::text, 'gift_year'::text, v_expires_at, 'Gift year redeemed.'::text;
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

alter table public.billing_products       enable row level security;
alter table public.family_entitlements    enable row level security;
alter table public.billing_subscriptions  enable row level security;
alter table public.billing_events         enable row level security;
alter table public.gift_purchases         enable row level security;
alter table public.gift_redemptions       enable row level security;
alter table public.partner_grants         enable row level security;
alter table public.partner_grant_codes    enable row level security;

drop policy if exists billing_products_read_active on public.billing_products;
create policy billing_products_read_active on public.billing_products for select
  using (active);

drop policy if exists family_entitlements_select on public.family_entitlements;
create policy family_entitlements_select on public.family_entitlements for select
  using (public.is_family_member(family_id));

drop policy if exists billing_subscriptions_select on public.billing_subscriptions;
create policy billing_subscriptions_select on public.billing_subscriptions for select
  using (
    (family_id is not null and public.is_family_member(family_id))
    or purchaser_user_id = auth.uid()
  );

drop policy if exists gift_purchases_redeemed_family_select on public.gift_purchases;
create policy gift_purchases_redeemed_family_select on public.gift_purchases for select
  using (
    exists (
      select 1
      from public.gift_redemptions gr
      where gr.gift_purchase_id = public.gift_purchases.id
        and gr.redeemed_family_id is not null
        and public.is_family_member(gr.redeemed_family_id)
    )
  );

drop policy if exists gift_redemptions_redeemed_family_select on public.gift_redemptions;
create policy gift_redemptions_redeemed_family_select on public.gift_redemptions for select
  using (redeemed_family_id is not null and public.is_family_member(redeemed_family_id));

drop policy if exists partner_grant_codes_redeemed_family_select on public.partner_grant_codes;
create policy partner_grant_codes_redeemed_family_select on public.partner_grant_codes for select
  using (redeemed_family_id is not null and public.is_family_member(redeemed_family_id));

insert into public.billing_products (provider, product_id, plan_key, billing_interval, price_cents, currency, active)
values
  ('apple', 'olw.family.monthly', 'family_monthly', 'month', 499, 'usd', true),
  ('apple', 'olw.family.yearly', 'family_yearly', 'year', 4788, 'usd', true),
  ('google', 'olw.family.monthly', 'family_monthly', 'month', 499, 'usd', true),
  ('google', 'olw.family.yearly', 'family_yearly', 'year', 4788, 'usd', true),
  ('stripe', 'family_monthly', 'family_monthly', 'month', 499, 'usd', true),
  ('stripe', 'family_yearly', 'family_yearly', 'year', 4788, 'usd', true),
  ('stripe', 'gift_year', 'gift_year', 'one_time', 4800, 'usd', true),
  ('gift', 'gift_year_code', 'gift_year', 'one_time', 4800, 'usd', true),
  ('partner', 'partner_year_code', 'partner_year', 'one_time', null, 'usd', true)
on conflict (provider, product_id) do update
set plan_key = excluded.plan_key,
    billing_interval = excluded.billing_interval,
    price_cents = excluded.price_cents,
    currency = excluded.currency,
    active = excluded.active;

-- Families created before billing launched should keep access when the app
-- starts enforcing family-level entitlements.
insert into public.family_entitlements (
  family_id,
  status,
  source,
  plan_key,
  billing_owner_user_id,
  billing_owner_email,
  starts_at,
  metadata
)
select
  f.id,
  'comped',
  'admin',
  'comp_year',
  f.created_by,
  u.email,
  now(),
  jsonb_build_object('reason', 'pre_billing_existing_family')
from public.families f
left join auth.users u on u.id = f.created_by
where not exists (
  select 1
  from public.family_entitlements fe
  where fe.family_id = f.id
);
