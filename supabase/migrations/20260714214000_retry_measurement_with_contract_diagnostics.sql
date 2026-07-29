-- Retry the bounded historical events once against the central validator with
-- privacy-safe rejection logging enabled. No private values are logged.

update public.marketing_measurement_outbox
set delivery_state = 'pending',
    available_at = now(),
    claim_token = null,
    last_error_code = null
where delivery_state = 'quarantined'
  and last_error_code = 'ingest_contract_rejected';

select public.dispatch_marketing_measurement_export();
