-- Final privacy-safe health snapshot after provider and measurement replay.

do $$
declare
  qa_hash constant text := '35ce9fe842f9cb0955bad9b70b1cdf826d10f1f8585fb11d0e2a380ae6313b41';
  provider_snapshot jsonb;
  measurement_snapshot jsonb;
begin
  select public.marketing_lifecycle_contact_health(qa_hash)
    into provider_snapshot;

  select jsonb_build_object(
    'health', public.marketing_measurement_health(),
    'states', coalesce(jsonb_agg(jsonb_build_object(
      'delivery_state', grouped.delivery_state,
      'last_error_code', grouped.last_error_code,
      'count', grouped.event_count
    ) order by grouped.delivery_state, grouped.last_error_code), '[]'::jsonb)
  ) into measurement_snapshot
  from (
    select outbox.delivery_state, outbox.last_error_code, count(*) as event_count
    from public.marketing_measurement_outbox outbox
    group by outbox.delivery_state, outbox.last_error_code
  ) grouped;

  raise notice 'lifecycle_final_provider=%', provider_snapshot;
  raise notice 'lifecycle_final_measurement=%', measurement_snapshot;
end
$$;
