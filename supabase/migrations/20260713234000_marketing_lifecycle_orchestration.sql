-- Privacy-safe product lifecycle orchestration for consented marketing contacts.
--
-- Product tables remain authoritative.  This ledger stores only coarse states
-- and milestone names; it never copies family names, child data, captions,
-- letters, media identifiers, dates, locations, gift notes, or redemption
-- codes into the marketing system.

create table if not exists public.marketing_lifecycle_contact_state (
  contact_id             uuid primary key references public.marketing_contacts(id) on delete restrict,
  user_id                uuid references auth.users(id) on delete set null,
  family_id              uuid references public.families(id) on delete set null,
  lifecycle_state        text not null default 'marketing_subscriber' check (
    lifecycle_state in (
      'marketing_subscriber',
      'unactivated_user',
      'activated_user',
      'trial_user',
      'paid_customer',
      'entitled_user',
      'lapsed_user'
    )
  ),
  billing_state          text not null default 'none' check (
    billing_state in ('none', 'trial', 'paid', 'gift', 'comped', 'grace', 'lapsed')
  ),
  registered_at          timestamptz,
  activated_at           timestamptz,
  trial_started_at       timestamptz,
  converted_at           timestamptz,
  lapsed_at              timestamptz,
  caregiver_invited_at   timestamptz,
  first_created_at       timestamptz,
  letter_created_at      timestamptz,
  gift_purchased_at      timestamptz,
  gift_redeemed_at       timestamptz,
  last_value_event_at    timestamptz,
  provider_synced_at     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists public.marketing_lifecycle_events (
  id                    uuid primary key default gen_random_uuid(),
  sequence_no           bigint generated always as identity unique,
  event_id              text not null,
  product_id            text not null default 'our-little-world' check (product_id = 'our-little-world'),
  contact_id            uuid not null references public.marketing_contacts(id) on delete restrict,
  event_name            text not null check (
    event_name in (
      'marketing_subscribed',
      'registered',
      'first_memory_saved',
      'caregiver_invited',
      'first_created',
      'letter_created',
      'trial_started',
      'paid_started',
      'gift_purchased',
      'gift_redeemed',
      'entitlement_granted',
      'entitlement_lapsed'
    )
  ),
  occurred_at           timestamptz not null,
  lifecycle_state       text not null check (
    lifecycle_state in (
      'marketing_subscriber',
      'unactivated_user',
      'activated_user',
      'trial_user',
      'paid_customer',
      'entitled_user',
      'lapsed_user'
    )
  ),
  properties            jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  delivery_state        text not null default 'pending' check (
    delivery_state in ('pending', 'claimed', 'retry', 'completed', 'canceled', 'quarantined')
  ),
  attempt_count         integer not null default 0 check (attempt_count >= 0),
  available_at          timestamptz not null default now(),
  claimed_at            timestamptz,
  claim_token           uuid,
  provider_synced_at    timestamptz,
  last_error_code       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists marketing_lifecycle_events_due_idx
  on public.marketing_lifecycle_events(delivery_state, available_at, occurred_at)
  where delivery_state in ('pending', 'retry', 'claimed');

create index if not exists marketing_lifecycle_events_contact_idx
  on public.marketing_lifecycle_events(contact_id, occurred_at desc);

create unique index if not exists marketing_lifecycle_events_contact_event_idx
  on public.marketing_lifecycle_events(contact_id, event_id);

create unique index if not exists marketing_lifecycle_first_milestone_idx
  on public.marketing_lifecycle_events(contact_id, event_name)
  where event_name in (
    'marketing_subscribed', 'registered', 'first_memory_saved',
    'caregiver_invited', 'first_created', 'letter_created',
    'trial_started', 'paid_started', 'gift_purchased',
    'gift_redeemed', 'entitlement_granted'
  );

drop trigger if exists marketing_lifecycle_contact_state_updated
  on public.marketing_lifecycle_contact_state;
create trigger marketing_lifecycle_contact_state_updated
  before update on public.marketing_lifecycle_contact_state
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists marketing_lifecycle_events_updated
  on public.marketing_lifecycle_events;
create trigger marketing_lifecycle_events_updated
  before update on public.marketing_lifecycle_events
  for each row execute procedure public.ool_set_updated_at();

alter table public.marketing_lifecycle_contact_state enable row level security;
alter table public.marketing_lifecycle_events enable row level security;

revoke all on table public.marketing_lifecycle_contact_state
  from public, anon, authenticated;
revoke all on table public.marketing_lifecycle_events
  from public, anon, authenticated;
grant select, insert, update on table public.marketing_lifecycle_contact_state
  to service_role;
grant select, insert, update on table public.marketing_lifecycle_events
  to service_role;

comment on table public.marketing_lifecycle_contact_state is
  'Coarse lifecycle state for explicitly consented contacts. Never store private family content here.';
comment on table public.marketing_lifecycle_events is
  'Idempotent, product-isolated lifecycle delivery ledger. Product and billing tables remain authoritative.';

create or replace function public.enqueue_marketing_lifecycle_event(
  target_contact_id uuid,
  target_event_id text,
  target_event_name text,
  target_occurred_at timestamptz,
  target_user_id uuid default null,
  target_family_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, extensions, pg_catalog
as $$
declare
  contact_row public.marketing_contacts%rowtype;
  state_row public.marketing_lifecycle_contact_state%rowtype;
  next_state text;
  next_billing_state text;
  inserted_event_id uuid;
begin
  if target_event_id is null
     or char_length(target_event_id) not between 8 and 240
     or target_event_id !~ '^olw:[a-z0-9:_-]+$' then
    raise exception using errcode = '22023', message = 'invalid_lifecycle_event_id';
  end if;

  if target_event_name not in (
    'marketing_subscribed', 'registered', 'first_memory_saved',
    'caregiver_invited', 'first_created', 'letter_created',
    'trial_started', 'paid_started', 'gift_purchased',
    'gift_redeemed', 'entitlement_granted', 'entitlement_lapsed'
  ) then
    raise exception using errcode = '22023', message = 'invalid_lifecycle_event_name';
  end if;

  select * into contact_row
  from public.marketing_contacts
  where id = target_contact_id
  for update;

  if not found then
    return jsonb_build_object('accepted', false, 'reason', 'contact_missing');
  end if;

  if contact_row.status <> 'subscribed' or contact_row.marketing_consent is not true then
    return jsonb_build_object('accepted', false, 'reason', 'contact_not_marketable');
  end if;

  insert into public.marketing_lifecycle_contact_state (
    contact_id, user_id, family_id
  ) values (
    contact_row.id, target_user_id, target_family_id
  )
  on conflict (contact_id) do update
  set user_id = coalesce(excluded.user_id, public.marketing_lifecycle_contact_state.user_id),
      family_id = coalesce(excluded.family_id, public.marketing_lifecycle_contact_state.family_id)
  returning * into state_row;

  next_state := state_row.lifecycle_state;
  next_billing_state := state_row.billing_state;

  case target_event_name
    when 'registered' then
      if next_state = 'marketing_subscriber' then next_state := 'unactivated_user'; end if;
    when 'first_memory_saved' then
      if next_state in ('marketing_subscriber', 'unactivated_user') then
        next_state := 'activated_user';
      end if;
    when 'trial_started' then
      next_state := 'trial_user';
      next_billing_state := 'trial';
    when 'paid_started' then
      next_state := 'paid_customer';
      next_billing_state := 'paid';
    when 'gift_redeemed' then
      next_state := 'paid_customer';
      next_billing_state := 'gift';
    when 'entitlement_granted' then
      next_state := 'entitled_user';
      next_billing_state := 'comped';
    when 'entitlement_lapsed' then
      next_state := 'lapsed_user';
      next_billing_state := 'lapsed';
    else
      null;
  end case;

  update public.marketing_lifecycle_contact_state
  set user_id = coalesce(target_user_id, user_id),
      family_id = coalesce(target_family_id, family_id),
      lifecycle_state = next_state,
      billing_state = next_billing_state,
      registered_at = case when target_event_name = 'registered'
        then least(coalesce(registered_at, target_occurred_at), target_occurred_at) else registered_at end,
      activated_at = case when target_event_name = 'first_memory_saved'
        then least(coalesce(activated_at, target_occurred_at), target_occurred_at) else activated_at end,
      trial_started_at = case when target_event_name = 'trial_started'
        then least(coalesce(trial_started_at, target_occurred_at), target_occurred_at) else trial_started_at end,
      converted_at = case when target_event_name in ('paid_started', 'gift_redeemed')
        then least(coalesce(converted_at, target_occurred_at), target_occurred_at) else converted_at end,
      lapsed_at = case when target_event_name = 'entitlement_lapsed'
        then target_occurred_at
        when target_event_name in ('trial_started', 'paid_started', 'gift_redeemed', 'entitlement_granted')
        then null else lapsed_at end,
      caregiver_invited_at = case when target_event_name = 'caregiver_invited'
        then least(coalesce(caregiver_invited_at, target_occurred_at), target_occurred_at) else caregiver_invited_at end,
      first_created_at = case when target_event_name = 'first_created'
        then least(coalesce(first_created_at, target_occurred_at), target_occurred_at) else first_created_at end,
      letter_created_at = case when target_event_name = 'letter_created'
        then least(coalesce(letter_created_at, target_occurred_at), target_occurred_at) else letter_created_at end,
      gift_purchased_at = case when target_event_name = 'gift_purchased'
        then least(coalesce(gift_purchased_at, target_occurred_at), target_occurred_at) else gift_purchased_at end,
      gift_redeemed_at = case when target_event_name = 'gift_redeemed'
        then least(coalesce(gift_redeemed_at, target_occurred_at), target_occurred_at) else gift_redeemed_at end,
      last_value_event_at = case when target_event_name in (
        'first_memory_saved', 'caregiver_invited', 'first_created', 'letter_created'
      ) then greatest(coalesce(last_value_event_at, target_occurred_at), target_occurred_at)
      else last_value_event_at end
  where contact_id = target_contact_id
  returning * into state_row;

  insert into public.marketing_lifecycle_events (
    event_id,
    contact_id,
    event_name,
    occurred_at,
    lifecycle_state,
    properties
  ) values (
    target_event_id,
    target_contact_id,
    target_event_name,
    coalesce(target_occurred_at, now()),
    state_row.lifecycle_state,
    jsonb_build_object('schema_version', 1, 'source', 'product_backend')
  )
  on conflict do nothing
  returning id into inserted_event_id;

  return jsonb_build_object(
    'accepted', inserted_event_id is not null,
    'duplicate', inserted_event_id is null,
    'lifecycle_state', state_row.lifecycle_state
  );
end
$$;

revoke all on function public.enqueue_marketing_lifecycle_event(
  uuid, text, text, timestamptz, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.enqueue_marketing_lifecycle_event(
  uuid, text, text, timestamptz, uuid, uuid
) to service_role;

create or replace function public.reconcile_marketing_contact_lifecycle(target_contact_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, extensions, pg_catalog
as $$
declare
  contact_row public.marketing_contacts%rowtype;
  target_user auth.users%rowtype;
  target_family uuid;
  first_moment record;
  first_invite record;
  first_first record;
  first_letter record;
  entitlement_row public.family_entitlements%rowtype;
  gift_row record;
begin
  select * into contact_row
  from public.marketing_contacts
  where id = target_contact_id;

  if not found or contact_row.status <> 'subscribed' or contact_row.marketing_consent is not true then
    return jsonb_build_object('reconciled', false, 'reason', 'contact_not_marketable');
  end if;

  perform public.enqueue_marketing_lifecycle_event(
    contact_row.id,
    'olw:marketing_subscribed:' || contact_row.id::text,
    'marketing_subscribed',
    coalesce(contact_row.consented_at, contact_row.created_at),
    null,
    null
  );

  select user_row.* into target_user
  from auth.users user_row
  where public.marketing_email_hash(user_row.email) = contact_row.email_hash
  order by user_row.created_at
  limit 1;

  if found then
    select member.family_id into target_family
    from public.family_members member
    where member.user_id = target_user.id
    order by member.joined_at
    limit 1;

    perform public.enqueue_marketing_lifecycle_event(
      contact_row.id,
      'olw:registered:' || target_user.id::text,
      'registered',
      target_user.created_at,
      target_user.id,
      target_family
    );

    if target_family is not null then
      select moment.id, moment.created_at into first_moment
      from public.moments moment
      where moment.family_id = target_family
      order by moment.created_at
      limit 1;

      if found then
        perform public.enqueue_marketing_lifecycle_event(
          contact_row.id,
          'olw:first_memory_saved:' || first_moment.id::text,
          'first_memory_saved',
          first_moment.created_at,
          target_user.id,
          target_family
        );
      else
        select memory.id, memory.created_at into first_moment
        from public.memories memory
        where memory.family_id = target_family
        order by memory.created_at
        limit 1;

        if found then
          perform public.enqueue_marketing_lifecycle_event(
            contact_row.id,
            'olw:first_memory_saved:' || first_moment.id::text,
            'first_memory_saved',
            first_moment.created_at,
            target_user.id,
            target_family
          );
        end if;
      end if;

      select invite.id, invite.created_at into first_invite
      from public.family_invites invite
      where invite.family_id = target_family
      order by invite.created_at
      limit 1;
      if found then
        perform public.enqueue_marketing_lifecycle_event(
          contact_row.id,
          'olw:caregiver_invited:' || first_invite.id::text,
          'caregiver_invited',
          first_invite.created_at,
          target_user.id,
          target_family
        );
      end if;

      select item.id, item.created_at into first_first
      from public.firsts item
      where item.family_id = target_family
      order by item.created_at
      limit 1;
      if found then
        perform public.enqueue_marketing_lifecycle_event(
          contact_row.id,
          'olw:first_created:' || first_first.id::text,
          'first_created',
          first_first.created_at,
          target_user.id,
          target_family
        );
      end if;

      select item.id, item.created_at into first_letter
      from public.letters item
      where item.family_id = target_family
      order by item.created_at
      limit 1;
      if found then
        perform public.enqueue_marketing_lifecycle_event(
          contact_row.id,
          'olw:letter_created:' || first_letter.id::text,
          'letter_created',
          first_letter.created_at,
          target_user.id,
          target_family
        );
      end if;

      select * into entitlement_row
      from public.family_entitlements entitlement
      where entitlement.family_id = target_family;

      if found then
        if entitlement_row.status = 'trialing' then
          perform public.enqueue_marketing_lifecycle_event(
            contact_row.id,
            'olw:trial_started:' || target_family::text,
            'trial_started',
            entitlement_row.starts_at,
            target_user.id,
            target_family
          );
        elsif entitlement_row.status in ('active', 'grace_period') then
          perform public.enqueue_marketing_lifecycle_event(
            contact_row.id,
            'olw:paid_started:' || target_family::text,
            'paid_started',
            entitlement_row.starts_at,
            target_user.id,
            target_family
          );
        elsif entitlement_row.status = 'gift_active' then
          perform public.enqueue_marketing_lifecycle_event(
            contact_row.id,
            'olw:gift_redeemed:' || target_family::text,
            'gift_redeemed',
            entitlement_row.starts_at,
            target_user.id,
            target_family
          );
        elsif entitlement_row.status = 'comped' then
          perform public.enqueue_marketing_lifecycle_event(
            contact_row.id,
            'olw:entitlement_granted:' || target_family::text,
            'entitlement_granted',
            entitlement_row.starts_at,
            target_user.id,
            target_family
          );
        elsif entitlement_row.status in ('past_due', 'canceled', 'expired', 'refunded') then
          perform public.enqueue_marketing_lifecycle_event(
            contact_row.id,
            'olw:entitlement_lapsed:' || target_family::text || ':' || extract(epoch from entitlement_row.updated_at)::bigint::text,
            'entitlement_lapsed',
            entitlement_row.updated_at,
            target_user.id,
            target_family
          );
        end if;
      end if;
    end if;
  end if;

  select purchase.id, coalesce(purchase.paid_at, purchase.created_at) as occurred_at
    into gift_row
  from public.gift_purchases purchase
  where public.marketing_email_hash(purchase.giver_email) = contact_row.email_hash
    and purchase.status in ('paid', 'scheduled', 'sent', 'redeemed')
  order by coalesce(purchase.paid_at, purchase.created_at)
  limit 1;

  if found then
    perform public.enqueue_marketing_lifecycle_event(
      contact_row.id,
      'olw:gift_purchased:' || gift_row.id::text,
      'gift_purchased',
      gift_row.occurred_at,
      target_user.id,
      target_family
    );
  end if;

  return jsonb_build_object('reconciled', true);
end
$$;

revoke all on function public.reconcile_marketing_contact_lifecycle(uuid)
  from public, anon, authenticated;
grant execute on function public.reconcile_marketing_contact_lifecycle(uuid)
  to service_role;

create or replace function public.reconcile_all_marketing_lifecycle_contacts(batch_size integer default 100)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  contact_record record;
  reconciled_count integer := 0;
begin
  for contact_record in
    select contact.id
    from public.marketing_contacts contact
    where contact.status = 'subscribed'
      and contact.marketing_consent is true
    order by contact.created_at
    limit least(greatest(batch_size, 1), 500)
  loop
    perform public.reconcile_marketing_contact_lifecycle(contact_record.id);
    reconciled_count := reconciled_count + 1;
  end loop;
  return jsonb_build_object('reconciled', reconciled_count);
end
$$;

revoke all on function public.reconcile_all_marketing_lifecycle_contacts(integer)
  from public, anon, authenticated;
grant execute on function public.reconcile_all_marketing_lifecycle_contacts(integer)
  to service_role;

create or replace function public.marketing_lifecycle_contact_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.status = 'subscribed' and new.marketing_consent is true then
    perform public.reconcile_marketing_contact_lifecycle(new.id);
  elsif old.status is distinct from new.status
     or old.marketing_consent is distinct from new.marketing_consent then
    update public.marketing_lifecycle_events
    set delivery_state = 'canceled',
        claim_token = null,
        last_error_code = 'contact_not_marketable'
    where contact_id = new.id
      and delivery_state in ('pending', 'retry', 'claimed');
  end if;
  return new;
end
$$;

drop trigger if exists marketing_contacts_reconcile_lifecycle
  on public.marketing_contacts;
create trigger marketing_contacts_reconcile_lifecycle
  after insert or update of status, marketing_consent, consented_at
  on public.marketing_contacts
  for each row execute procedure public.marketing_lifecycle_contact_changed();

create or replace function public.marketing_lifecycle_family_event()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  family_key uuid;
  event_name text;
  event_key text;
  event_time timestamptz;
  member_row record;
begin
  family_key := new.family_id;
  event_name := case tg_table_name
    when 'moments' then 'first_memory_saved'
    when 'memories' then 'first_memory_saved'
    when 'family_invites' then 'caregiver_invited'
    when 'firsts' then 'first_created'
    when 'letters' then 'letter_created'
    else null
  end;
  event_key := 'olw:' || event_name || ':' || new.id::text;
  event_time := new.created_at;

  for member_row in
    select contact.id as contact_id, family_member.user_id
    from public.family_members family_member
    join auth.users user_row on user_row.id = family_member.user_id
    join public.marketing_contacts contact
      on contact.email_hash = public.marketing_email_hash(user_row.email)
    where family_member.family_id = family_key
      and contact.status = 'subscribed'
      and contact.marketing_consent is true
  loop
    perform public.enqueue_marketing_lifecycle_event(
      member_row.contact_id,
      event_key,
      event_name,
      event_time,
      member_row.user_id,
      family_key
    );
  end loop;

  return new;
end
$$;

drop trigger if exists moments_marketing_lifecycle on public.moments;
create trigger moments_marketing_lifecycle
  after insert on public.moments
  for each row execute procedure public.marketing_lifecycle_family_event();

drop trigger if exists memories_marketing_lifecycle on public.memories;
create trigger memories_marketing_lifecycle
  after insert on public.memories
  for each row execute procedure public.marketing_lifecycle_family_event();

drop trigger if exists family_invites_marketing_lifecycle on public.family_invites;
create trigger family_invites_marketing_lifecycle
  after insert on public.family_invites
  for each row execute procedure public.marketing_lifecycle_family_event();

drop trigger if exists firsts_marketing_lifecycle on public.firsts;
create trigger firsts_marketing_lifecycle
  after insert on public.firsts
  for each row execute procedure public.marketing_lifecycle_family_event();

drop trigger if exists letters_marketing_lifecycle on public.letters;
create trigger letters_marketing_lifecycle
  after insert on public.letters
  for each row execute procedure public.marketing_lifecycle_family_event();

create or replace function public.marketing_lifecycle_entitlement_changed()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  event_name text;
  event_time timestamptz := coalesce(new.last_event_at, new.updated_at, now());
  event_key text;
  member_row record;
begin
  event_name := case
    when new.status = 'trialing' then 'trial_started'
    when new.status in ('active', 'grace_period') then 'paid_started'
    when new.status = 'gift_active' then 'gift_redeemed'
    when new.status = 'comped' then 'entitlement_granted'
    when new.status in ('past_due', 'canceled', 'expired', 'refunded')
      then 'entitlement_lapsed'
    else null
  end;

  if event_name is null
     or (tg_op = 'UPDATE' and old.status is not distinct from new.status) then
    return new;
  end if;

  event_key := 'olw:' || event_name || ':' || new.family_id::text || ':'
    || extract(epoch from event_time)::bigint::text;

  for member_row in
    select contact.id as contact_id, family_member.user_id
    from public.family_members family_member
    join auth.users user_row on user_row.id = family_member.user_id
    join public.marketing_contacts contact
      on contact.email_hash = public.marketing_email_hash(user_row.email)
    where family_member.family_id = new.family_id
      and contact.status = 'subscribed'
      and contact.marketing_consent is true
  loop
    perform public.enqueue_marketing_lifecycle_event(
      member_row.contact_id,
      event_key,
      event_name,
      event_time,
      member_row.user_id,
      new.family_id
    );
  end loop;

  return new;
end
$$;

drop trigger if exists family_entitlements_marketing_lifecycle
  on public.family_entitlements;
create trigger family_entitlements_marketing_lifecycle
  after insert or update of status on public.family_entitlements
  for each row execute procedure public.marketing_lifecycle_entitlement_changed();

create or replace function public.marketing_lifecycle_gift_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  contact_row record;
begin
  if new.status not in ('paid', 'scheduled', 'sent', 'redeemed')
     or (tg_op = 'UPDATE' and old.status is not distinct from new.status) then
    return new;
  end if;

  select contact.id into contact_row
  from public.marketing_contacts contact
  where contact.email_hash = public.marketing_email_hash(new.giver_email)
    and contact.status = 'subscribed'
    and contact.marketing_consent is true
  limit 1;

  if found then
    perform public.enqueue_marketing_lifecycle_event(
      contact_row.id,
      'olw:gift_purchased:' || new.id::text,
      'gift_purchased',
      coalesce(new.paid_at, new.updated_at, new.created_at),
      null,
      null
    );
  end if;

  return new;
end
$$;

drop trigger if exists gift_purchases_marketing_lifecycle on public.gift_purchases;
create trigger gift_purchases_marketing_lifecycle
  after insert or update of status on public.gift_purchases
  for each row execute procedure public.marketing_lifecycle_gift_changed();

create or replace function public.claim_marketing_lifecycle_events(batch_size integer default 20)
returns table (
  outbox_id uuid,
  event_id text,
  claim_token uuid,
  contact_id uuid,
  email text,
  event_name text,
  occurred_at timestamptz,
  lifecycle_state text,
  attempt_count integer
)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
begin
  return query
  with due as (
    select lifecycle_event.id
    from public.marketing_lifecycle_events lifecycle_event
    join public.marketing_contacts contact on contact.id = lifecycle_event.contact_id
    join public.marketing_contact_provider_state provider_state
      on provider_state.contact_id = contact.id
    where (
        lifecycle_event.delivery_state in ('pending', 'retry')
        or (
          lifecycle_event.delivery_state = 'claimed'
          and lifecycle_event.claimed_at < now() - interval '15 minutes'
        )
      )
      and lifecycle_event.available_at <= now()
      and lifecycle_event.attempt_count < 8
      and contact.status = 'subscribed'
      and contact.marketing_consent is true
      and provider_state.provider_status = 'subscribed'
    -- sequence_no preserves the deliberate reconciliation order (subscriber →
    -- registered → activated → converted) even inside one transaction and
    -- when historical product events predate marketing consent.
    order by lifecycle_event.sequence_no
    for update of lifecycle_event skip locked
    limit least(greatest(batch_size, 1), 50)
  ), claimed as (
    update public.marketing_lifecycle_events lifecycle_event
    set delivery_state = 'claimed',
        attempt_count = lifecycle_event.attempt_count + 1,
        claimed_at = now(),
        claim_token = gen_random_uuid(),
        last_error_code = null
    from due
    where lifecycle_event.id = due.id
    returning lifecycle_event.*
  )
  select
    claimed.id,
    claimed.event_id,
    claimed.claim_token,
    claimed.contact_id,
    contact.email,
    claimed.event_name,
    claimed.occurred_at,
    claimed.lifecycle_state,
    claimed.attempt_count
  from claimed
  join public.marketing_contacts contact on contact.id = claimed.contact_id
  order by claimed.sequence_no;
end
$$;

revoke all on function public.claim_marketing_lifecycle_events(integer)
  from public, anon, authenticated;
grant execute on function public.claim_marketing_lifecycle_events(integer)
  to service_role;

create or replace function public.complete_marketing_lifecycle_event(
  target_outbox_id uuid,
  target_claim_token uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  completed_contact_id uuid;
begin
  update public.marketing_lifecycle_events lifecycle_event
  set delivery_state = 'completed',
      provider_synced_at = now(),
      claim_token = null,
      last_error_code = null
  where lifecycle_event.id = target_outbox_id
    and lifecycle_event.delivery_state = 'claimed'
    and lifecycle_event.claim_token = target_claim_token
  returning lifecycle_event.contact_id into completed_contact_id;

  if completed_contact_id is null then
    return jsonb_build_object('completed', false, 'duplicate', true);
  end if;

  update public.marketing_lifecycle_contact_state
  set provider_synced_at = now()
  where contact_id = completed_contact_id;

  return jsonb_build_object('completed', true, 'duplicate', false);
end
$$;

revoke all on function public.complete_marketing_lifecycle_event(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_marketing_lifecycle_event(uuid, uuid)
  to service_role;

create or replace function public.fail_marketing_lifecycle_event(
  target_outbox_id uuid,
  target_claim_token uuid,
  target_error_code text,
  target_retry_after_seconds integer default 300,
  target_terminal boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  changed_id uuid;
begin
  update public.marketing_lifecycle_events lifecycle_event
  set delivery_state = case when target_terminal then 'quarantined' else 'retry' end,
      available_at = case when target_terminal then lifecycle_event.available_at
        else now() + make_interval(secs => least(greatest(target_retry_after_seconds, 60), 21600)) end,
      claim_token = null,
      last_error_code = left(coalesce(target_error_code, 'provider_unavailable'), 120)
  where lifecycle_event.id = target_outbox_id
    and lifecycle_event.delivery_state = 'claimed'
    and lifecycle_event.claim_token = target_claim_token
  returning lifecycle_event.id into changed_id;

  return jsonb_build_object(
    'failed', changed_id is not null,
    'duplicate', changed_id is null,
    'terminal', target_terminal
  );
end
$$;

revoke all on function public.fail_marketing_lifecycle_event(
  uuid, uuid, text, integer, boolean
) from public, anon, authenticated;
grant execute on function public.fail_marketing_lifecycle_event(
  uuid, uuid, text, integer, boolean
) to service_role;

create or replace function public.marketing_lifecycle_health()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'contact_states', (select count(*) from public.marketing_lifecycle_contact_state),
    'pending', (select count(*) from public.marketing_lifecycle_events where delivery_state = 'pending'),
    'retry', (select count(*) from public.marketing_lifecycle_events where delivery_state = 'retry'),
    'claimed', (select count(*) from public.marketing_lifecycle_events where delivery_state = 'claimed'),
    'completed', (select count(*) from public.marketing_lifecycle_events where delivery_state = 'completed'),
    'canceled', (select count(*) from public.marketing_lifecycle_events where delivery_state = 'canceled'),
    'quarantined', (select count(*) from public.marketing_lifecycle_events where delivery_state = 'quarantined'),
    'activated_contacts', (select count(*) from public.marketing_lifecycle_contact_state where activated_at is not null),
    'converted_contacts', (select count(*) from public.marketing_lifecycle_contact_state where converted_at is not null),
    'oldest_due_at', (
      select min(available_at) from public.marketing_lifecycle_events
      where delivery_state in ('pending', 'retry')
    )
  );
$$;

revoke all on function public.marketing_lifecycle_health()
  from public, anon, authenticated;
grant execute on function public.marketing_lifecycle_health()
  to service_role;

-- Cancel queued work immediately when the canonical consent record is no
-- longer marketable, then reconcile the existing controlled contacts.
update public.marketing_lifecycle_events lifecycle_event
set delivery_state = 'canceled',
    claim_token = null,
    last_error_code = 'contact_not_marketable'
from public.marketing_contacts contact
where contact.id = lifecycle_event.contact_id
  and (contact.status <> 'subscribed' or contact.marketing_consent is not true)
  and lifecycle_event.delivery_state in ('pending', 'retry', 'claimed');

select public.reconcile_all_marketing_lifecycle_contacts(500);
