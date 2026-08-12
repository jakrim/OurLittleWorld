-- Aggregate-only deployment readback. No contact identifiers, addresses,
-- provider response bodies, or product content are emitted.

do $$
declare
  lifecycle_health jsonb;
  contact_health jsonb;
  latest_dispatch record;
begin
  perform public.reconcile_website_operational_responses();
  lifecycle_health := public.marketing_lifecycle_health();
  contact_health := public.marketing_sync_health();

  select status, status_code, error_code, dispatched_at, completed_at
    into latest_dispatch
  from public.marketing_sync_dispatch_runs
  order by dispatched_at desc
  limit 1;

  raise notice 'controlled_lifecycle_health=%', lifecycle_health;
  raise notice 'controlled_contact_sync_health=%', contact_health;
  raise notice 'controlled_dispatch_status=%, status_code=%, error_code=%, dispatched_at=%, completed_at=%',
    latest_dispatch.status,
    latest_dispatch.status_code,
    latest_dispatch.error_code,
    latest_dispatch.dispatched_at,
    latest_dispatch.completed_at;
end
$$;
