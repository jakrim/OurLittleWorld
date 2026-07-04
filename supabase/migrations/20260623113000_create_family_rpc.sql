-- Atomically create a family and the creator membership.
-- Client-side family inserts cannot safely use INSERT ... RETURNING because
-- the SELECT policy is only satisfied after the membership row exists.

create or replace function public.create_family(
  p_family_name text default null,
  p_baby_name text default null,
  p_baby_birthday date default null,
  p_member_display_name text default null,
  p_member_relationship_label text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_family_id uuid;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  insert into public.families (name, baby_name, baby_birthday, created_by)
  values (
    coalesce(nullif(trim(p_family_name), ''), 'Our Little World'),
    nullif(trim(p_baby_name), ''),
    p_baby_birthday,
    auth.uid()
  )
  returning id into v_family_id;

  insert into public.family_members (
    family_id,
    user_id,
    display_name,
    relationship_label,
    role
  )
  values (
    v_family_id,
    auth.uid(),
    nullif(trim(p_member_display_name), ''),
    nullif(trim(p_member_relationship_label), ''),
    'creator'
  );

  return v_family_id;
end
$$;

revoke all on function public.create_family(text, text, date, text, text) from public, anon;
grant execute on function public.create_family(text, text, date, text, text) to authenticated;
