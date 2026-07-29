-- Consent-aware launch acquisition and idempotent transactional delivery ledger.
-- Marketing contacts and transactional messages remain separate by design.

create table if not exists public.marketing_contacts (
  id                    uuid primary key default gen_random_uuid(),
  email                 text not null,
  email_hash            text not null unique,
  status                text not null default 'subscribed' check (status in ('subscribed', 'unsubscribed', 'suppressed')),
  marketing_consent     boolean not null default false,
  consented_at          timestamptz,
  consent_source        text,
  attribution           jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (email = lower(trim(email))),
  check (char_length(email) between 3 and 320),
  check (marketing_consent = false or consented_at is not null)
);

create table if not exists public.transactional_email_outbox (
  id                    uuid primary key default gen_random_uuid(),
  idempotency_key       text not null unique,
  message_type          text not null check (message_type in ('gift_buyer_confirmation', 'gift_recipient_delivery')),
  recipient_email       text not null,
  gift_purchase_id      uuid references public.gift_purchases(id) on delete cascade,
  scheduled_for         timestamptz not null,
  state                 text not null default 'pending' check (state in ('pending', 'sending', 'sent', 'failed', 'canceled')),
  attempt_count         integer not null default 0 check (attempt_count >= 0),
  last_attempt_at       timestamptz,
  sent_at               timestamptz,
  provider_message_id   text,
  last_error_code       text,
  payload               jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists transactional_email_outbox_due_idx
  on public.transactional_email_outbox(state, scheduled_for)
  where state in ('pending', 'failed');

drop trigger if exists marketing_contacts_updated on public.marketing_contacts;
create trigger marketing_contacts_updated
  before update on public.marketing_contacts
  for each row execute procedure public.ool_set_updated_at();

drop trigger if exists transactional_email_outbox_updated on public.transactional_email_outbox;
create trigger transactional_email_outbox_updated
  before update on public.transactional_email_outbox
  for each row execute procedure public.ool_set_updated_at();

alter table public.marketing_contacts enable row level security;
alter table public.transactional_email_outbox enable row level security;

revoke all on table public.marketing_contacts from public, anon, authenticated;
revoke all on table public.transactional_email_outbox from public, anon, authenticated;

comment on table public.marketing_contacts is
  'Explicit marketing consent only. Never infer consent from billing, gifting, redemption, or product access.';
comment on table public.transactional_email_outbox is
  'Purchased gift fulfillment only. Do not sync redemption codes into marketing providers or analytics.';

create or replace function public.claim_transactional_email_outbox(batch_size integer default 20)
returns setof public.transactional_email_outbox
language sql
volatile
security definer
set search_path = public, pg_catalog
as $$
  with due as (
    select id
    from public.transactional_email_outbox
    where (state in ('pending', 'failed') or (state = 'sending' and last_attempt_at < now() - interval '15 minutes'))
      and scheduled_for <= now()
      and attempt_count < 5
    order by scheduled_for, created_at
    for update skip locked
    limit least(greatest(batch_size, 1), 50)
  ), claimed as (
    update public.transactional_email_outbox outbox
    set state = 'sending',
        attempt_count = outbox.attempt_count + 1,
        last_attempt_at = now(),
        last_error_code = null
    from due
    where outbox.id = due.id
    returning outbox.*
  )
  select * from claimed;
$$;

revoke all on function public.claim_transactional_email_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_transactional_email_outbox(integer) to service_role;
