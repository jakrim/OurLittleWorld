-- One controlled post-deployment dispatch. The recurring provider and
-- measurement schedules remain the unattended execution paths.

select public.dispatch_marketing_contact_sync();
select public.dispatch_marketing_measurement_export();
