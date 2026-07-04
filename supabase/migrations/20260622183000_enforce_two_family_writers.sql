-- Enforce the PRD family model: two writer co-parents plus view-only circle.

create or replace function public.enforce_two_family_writers()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_writer_count integer;
begin
  if new.role not in ('creator','partner') then
    return new;
  end if;

  perform 1 from public.families where id = new.family_id for update;

  select count(*) into v_writer_count
  from public.family_members
  where family_id = new.family_id
    and user_id <> new.user_id
    and role in ('creator','partner');

  if v_writer_count >= 2 then
    raise exception 'families can have at most two co-parents';
  end if;

  return new;
end
$$;

drop trigger if exists family_members_two_writers on public.family_members;
create trigger family_members_two_writers
  before insert or update of family_id, user_id, role on public.family_members
  for each row execute function public.enforce_two_family_writers();

revoke all on function public.enforce_two_family_writers() from public, anon;
