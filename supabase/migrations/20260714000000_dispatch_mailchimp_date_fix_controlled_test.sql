-- Remove recurring-job clock ambiguity for the one owner-controlled QA retry.
select public.dispatch_marketing_contact_sync();
