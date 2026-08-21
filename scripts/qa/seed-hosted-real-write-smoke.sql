\if :{?qa_code}
\else
  \quit 1
\endif

delete from public.families as family
using public.family_members as member, auth.users as qa_user
where member.family_id = family.id
  and member.user_id = qa_user.id
  and lower(qa_user.email) = lower(:'qa_email')
  and family.name = 'OLW Hosted QA'
  and family.baby_name = 'QA Baby';

with purchase as (
  insert into public.gift_purchases (
    giver_name, giver_email, recipient_name, recipient_email, status, paid_at, metadata
  ) values (
    'Hosted QA', 'hosted-qa@example.test', 'Hosted QA', 'hosted-qa@example.test',
    'paid', now(), jsonb_build_object('source', 'hosted-real-write-smoke')
  )
  returning id
)
insert into public.gift_redemptions (
  gift_purchase_id, code_hash, code_hint, status, duration_days, code_expires_at,
  redeemed_by_user_id, redeemed_family_id, redeemed_at, plan_key, metadata
)
select
  id, public.billing_code_hash(:'qa_code'), 'HOSTED-QA', 'available', 365, null,
  null, null, null, 'gift_year', jsonb_build_object('source', 'hosted-real-write-smoke')
from purchase
on conflict (code_hash) do update
set
  gift_purchase_id = excluded.gift_purchase_id,
  status = 'available',
  duration_days = 365,
  code_expires_at = null,
  redeemed_by_user_id = null,
  redeemed_family_id = null,
  redeemed_at = null,
  plan_key = 'gift_year',
  metadata = jsonb_build_object('source', 'hosted-real-write-smoke'),
  updated_at = now();
