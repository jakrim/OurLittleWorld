-- Register the already-subscribed, owner-controlled Mailchimp QA address in
-- the canonical consent ledger so product lifecycle synchronization can be
-- exercised without importing or messaging a customer audience.

select public.record_marketing_signup(
  'jesse@ourlittleworld.me',
  public.marketing_email_hash('jesse@ourlittleworld.me'),
  'web_internal_qa',
  jsonb_build_object(
    'channel', 'internal_qa',
    'campaign', 'lifecycle-orchestration-2026-07-13'
  ),
  'olw_internal_qa_lifecycle_20260713',
  '2026-07-13'
);

