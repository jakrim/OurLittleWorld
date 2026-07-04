-- Family circle invite roles and member management.
-- Co-parents can write; circle members are view-only through is_family_writer().

alter table public.family_invites
  add column if not exists role text not null default 'partner';

do $$
begin
  alter table public.family_invites drop constraint if exists family_invites_role_check;
  alter table public.family_invites
    add constraint family_invites_role_check
    check (role in ('partner','circle'));
end $$;

create or replace function public.redeem_family_invite(
  invite_code text,
  member_display_name text default null,
  member_relationship_label text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_invite public.family_invites%rowtype;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  select * into v_invite from public.family_invites
   where code = upper(invite_code) and used_at is null and expires_at > now()
   for update;

  if not found then
    raise exception 'invite code is invalid or expired';
  end if;

  v_role := case when v_invite.role = 'circle' then 'circle' else 'partner' end;

  insert into public.family_members (family_id, user_id, display_name, relationship_label, role)
  values (v_invite.family_id, auth.uid(), member_display_name, nullif(member_relationship_label, ''), v_role)
  on conflict (family_id, user_id) do update
    set display_name = coalesce(excluded.display_name, public.family_members.display_name),
        relationship_label = coalesce(excluded.relationship_label, public.family_members.relationship_label),
        role = excluded.role;

  update public.family_invites set used_by = auth.uid(), used_at = now()
   where id = v_invite.id;

  return v_invite.family_id;
end
$$;

revoke all on function public.redeem_family_invite(text, text, text) from public, anon;
grant execute on function public.redeem_family_invite(text, text, text) to authenticated;

drop policy if exists family_invites_modify on public.family_invites;
create policy family_invites_modify on public.family_invites for all
  using (public.is_family_writer(family_id))
  with check (public.is_family_writer(family_id));

drop policy if exists family_members_admin_update on public.family_members;
create policy family_members_admin_update on public.family_members for update
  using (public.is_family_writer(family_id))
  with check (public.is_family_writer(family_id) and role in ('creator','partner','circle'));

drop policy if exists family_members_admin_delete_circle on public.family_members;
create policy family_members_admin_delete_circle on public.family_members for delete
  using (public.is_family_writer(family_id) and role = 'circle');
