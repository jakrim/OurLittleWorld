-- Spouse letters
-- Adds relationship labels for family members and separates child letters
-- from immediate spouse notes.

alter table public.family_members
  add column if not exists relationship_label text;

alter table public.letters
  add column if not exists audience text not null default 'child'
    check (audience in ('child','spouse'));

alter table public.letters
  add column if not exists starter_key text;

drop function if exists public.redeem_family_invite(text, text);

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

  insert into public.family_members (family_id, user_id, display_name, relationship_label, role)
  values (v_invite.family_id, auth.uid(), member_display_name, nullif(member_relationship_label, ''), 'partner')
  on conflict (family_id, user_id) do nothing;

  update public.family_invites set used_by = auth.uid(), used_at = now()
   where id = v_invite.id;

  return v_invite.family_id;
end
$$;

revoke all on function public.redeem_family_invite(text, text, text) from public, anon;
grant execute on function public.redeem_family_invite(text, text, text) to authenticated;
