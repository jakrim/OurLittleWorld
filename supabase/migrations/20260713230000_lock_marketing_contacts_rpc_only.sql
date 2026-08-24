-- Phase two of the website launch-list rollout. The replacement Edge
-- Functions are live and use the security-definer consent RPCs introduced in
-- 20260713190000, so no API role needs direct table access anymore.
revoke all privileges on table public.marketing_contacts
  from public, anon, authenticated, service_role;

comment on table public.marketing_contacts is
  'Canonical consent ledger. API roles must use the allowlisted security-definer marketing RPCs; direct reads and writes are intentionally revoked.';
