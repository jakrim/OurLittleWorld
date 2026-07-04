-- Scheduled weekly digest assembly.
-- Runs once daily and only assembles families whose configured digest day is due.

create or replace function public.assemble_due_weekly_digests(
  run_date date default current_date
)
returns table (
  family_id uuid,
  week_start date,
  digest_id uuid
)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_family record;
  v_digest public.weekly_digests%rowtype;
  v_week_start date;
  v_digest_day smallint;
begin
  v_digest_day := extract(dow from run_date)::smallint;

  for v_family in
    select f.id
    from public.families f
    left join public.family_ritual_settings frs on frs.family_id = f.id
    where coalesce(frs.weekly_digest_day, 0) = v_digest_day
  loop
    -- Generate the most recently completed seven-day window for that family's
    -- chosen digest day. A Sunday digest covers the previous Sunday-Saturday.
    v_week_start := (run_date - 7)::date;
    v_digest := public.assemble_weekly_digest(v_family.id, v_week_start);

    family_id := v_family.id;
    week_start := v_digest.week_start;
    digest_id := v_digest.id;
    return next;
  end loop;
end
$$;

revoke all on function public.assemble_due_weekly_digests(date) from public, anon, authenticated;
grant execute on function public.assemble_due_weekly_digests(date) to service_role;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron'
  ) then
    execute 'create schema if not exists extensions';
    execute 'create extension if not exists pg_cron with schema extensions';

    if exists (
      select 1 from pg_catalog.pg_namespace where nspname = 'cron'
    ) then
      perform cron.unschedule(jobid)
      from cron.job
      where jobname = 'our-little-world-weekly-digest-assembly';

      perform cron.schedule(
        'our-little-world-weekly-digest-assembly',
        '15 13 * * *',
        'select public.assemble_due_weekly_digests(current_date);'
      );
    end if;
  end if;
end
$$;
