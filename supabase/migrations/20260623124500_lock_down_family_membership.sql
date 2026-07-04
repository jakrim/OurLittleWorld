-- Lock down direct family_members writes.
-- Family creation and invite redemption use security-definer RPCs; profile edits
-- get a narrow RPC that cannot change family_id, user_id, or role.

create or replace function public.update_my_family_membership(
  target_family_id uuid,
  membership_patch jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  update public.family_members
  set
    display_name = case
      when membership_patch ? 'display_name' then nullif(trim(membership_patch->>'display_name'), '')
      else display_name
    end,
    relationship_label = case
      when membership_patch ? 'relationship_label' then nullif(trim(membership_patch->>'relationship_label'), '')
      else relationship_label
    end
  where family_id = target_family_id
    and user_id = auth.uid();

  if not found then
    raise exception 'family membership not found';
  end if;
end
$$;

revoke all on function public.update_my_family_membership(uuid, jsonb) from public, anon;
grant execute on function public.update_my_family_membership(uuid, jsonb) to authenticated;

drop policy if exists family_members_modify on public.family_members;
