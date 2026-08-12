-- Allow a new creator to finish the child profile before purchase without
-- weakening the entitlement requirement on ordinary family edits.
--
-- The operation is deliberately write-once. An exact replay is idempotent;
-- any attempt to replace established child facts still uses the entitled
-- families update policy.

create or replace function public.complete_initial_family_profile(
  target_family_id uuid,
  target_baby_name text,
  target_baby_birthday date
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  current_family public.families%rowtype;
  normalized_name text := nullif(trim(target_baby_name), '');
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  if normalized_name is null then
    raise exception 'child name is required';
  end if;
  if target_baby_birthday is null then
    raise exception 'birth date is required';
  end if;
  if target_baby_birthday > current_date then
    raise exception 'birth date cannot be in the future';
  end if;

  select *
    into current_family
    from public.families
   where id = target_family_id
   for update;

  if not found then
    raise exception 'family not found';
  end if;
  if current_family.created_by is distinct from auth.uid()
     or not exists (
       select 1
         from public.family_members member
        where member.family_id = target_family_id
          and member.user_id = auth.uid()
          and member.role = 'creator'
     ) then
    raise exception 'only the family creator can complete initial setup';
  end if;
  if public.family_deletion_locked(target_family_id) then
    raise exception 'family account deletion is in progress'
      using errcode = '55000';
  end if;

  if current_family.baby_name is not null
     and current_family.baby_name <> normalized_name then
    raise exception 'family profile is already configured';
  end if;
  if current_family.baby_birthday is not null
     and current_family.baby_birthday <> target_baby_birthday then
    raise exception 'family profile is already configured';
  end if;
  if current_family.baby_name is not null
     and current_family.baby_birthday is not null then
    return;
  end if;

  update public.families
     set baby_name = coalesce(baby_name, normalized_name),
         baby_birthday = coalesce(baby_birthday, target_baby_birthday)
   where id = target_family_id;
end
$$;

revoke all on function public.complete_initial_family_profile(uuid, text, date) from public, anon;
grant execute on function public.complete_initial_family_profile(uuid, text, date) to authenticated;
