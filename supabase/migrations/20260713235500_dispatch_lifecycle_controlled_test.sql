-- One controlled dispatch for the existing internal QA contact. The recurring
-- five-minute job remains the long-term publisher; this only removes clock
-- ambiguity from the deployment readback.

select public.dispatch_marketing_contact_sync();

