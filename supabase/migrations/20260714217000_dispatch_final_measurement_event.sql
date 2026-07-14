-- Dispatch the provider-confirmed subscription event created during cutover.

select public.dispatch_marketing_measurement_export();
