-- Move family member role changes behind a narrow RPC.
-- Direct UPDATE policies can otherwise alter more columns than intended.

create or replace function public.update_family_member_role(
  target_family_id uuid,
  target_user_id uuid,
  target_role text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_next_role text;
  v_current_role text;
  v_writer_count integer;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  if not public.is_family_writer(target_family_id) then
    raise exception 'must be a family writer';
  end if;

  v_next_role := case
    when target_role = 'circle' then 'circle'
    when target_role = 'partner' then 'partner'
    else null
  end;

  if v_next_role is null then
    raise exception 'invalid member role';
  end if;

  select role into v_current_role
  from public.family_members
  where family_id = target_family_id
    and user_id = target_user_id
  for update;

  if not found then
    raise exception 'family member not found';
  end if;

  if v_current_role = 'creator' then
    raise exception 'creator role cannot be changed';
  end if;

  select count(*) into v_writer_count
  from public.family_members
  where family_id = target_family_id
    and role in ('creator', 'partner');

  if v_next_role = 'partner'
    and v_current_role not in ('creator', 'partner')
    and v_writer_count >= 2 then
    raise exception 'This family already has two co-parents. Make someone view-only before adding another co-parent.';
  end if;

  if v_next_role = 'circle'
    and v_current_role in ('creator', 'partner')
    and v_writer_count <= 1 then
    raise exception 'A family needs at least one co-parent.';
  end if;

  update public.family_members
  set role = v_next_role
  where family_id = target_family_id
    and user_id = target_user_id;
end
$$;

revoke all on function public.update_family_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.update_family_member_role(uuid, uuid, text) to authenticated;

drop policy if exists family_members_admin_update on public.family_members;
