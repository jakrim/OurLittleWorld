-- Read-only circle access: selected content only.
--
-- Circle members can join the family context, but memory content must be gated to
-- rows a co-parent explicitly selected for the circle. Writers keep full access.

alter table public.firsts
  add column if not exists shared_with jsonb not null default '[]'::jsonb;

alter table public.weekly_digests
  add column if not exists shared_with jsonb not null default '[]'::jsonb;

create index if not exists firsts_family_shared_with_idx
  on public.firsts using gin (shared_with);

create index if not exists weekly_digests_family_shared_with_idx
  on public.weekly_digests using gin (shared_with);

create or replace function public.is_family_circle_member(fid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.family_members
    where family_id = fid
      and user_id = auth.uid()
      and role = 'circle'
  );
$$;

revoke all on function public.is_family_circle_member(uuid) from public, anon;
grant execute on function public.is_family_circle_member(uuid) to authenticated;

create or replace function public.is_shared_with_circle(shared_with jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_catalog
as $$
  select coalesce(shared_with, '[]'::jsonb) ? 'circle';
$$;

revoke all on function public.is_shared_with_circle(jsonb) from public, anon;
grant execute on function public.is_shared_with_circle(jsonb) to authenticated;

create or replace function public.is_moment_shared_with_circle(target_family_id uuid, target_moment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.moments m
    where m.family_id = target_family_id
      and m.id = target_moment_id
      and public.is_shared_with_circle(m.shared_with)
  );
$$;

revoke all on function public.is_moment_shared_with_circle(uuid, uuid) from public, anon;
grant execute on function public.is_moment_shared_with_circle(uuid, uuid) to authenticated;

create or replace function public.uuid_or_null(value text)
returns uuid
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
begin
  return nullif(value, '')::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

revoke all on function public.uuid_or_null(text) from public, anon;
grant execute on function public.uuid_or_null(text) to authenticated;

drop policy if exists families_update on public.families;
create policy families_update on public.families for update
  using (public.is_family_writer(id))
  with check (public.is_family_writer(id));

drop policy if exists family_invites_select on public.family_invites;
create policy family_invites_select on public.family_invites for select
  using (public.is_family_writer(family_id));

drop policy if exists photo_tags_all on public.photo_tags;
create policy photo_tags_all on public.photo_tags for all
  using (public.is_family_writer(family_id))
  with check (public.is_family_writer(family_id) and tagged_by_user_id = auth.uid());

drop policy if exists memories_select on public.memories;
create policy memories_select on public.memories for select
  using (public.is_family_writer(family_id));

drop policy if exists memories_insert on public.memories;
create policy memories_insert on public.memories for insert
  with check (public.is_family_writer(family_id) and author_user_id = auth.uid());

drop policy if exists memories_update_own on public.memories;
create policy memories_update_own on public.memories for update
  using (public.is_family_writer(family_id) and author_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and author_user_id = auth.uid());

drop policy if exists memories_delete_own on public.memories;
create policy memories_delete_own on public.memories for delete
  using (public.is_family_writer(family_id) and author_user_id = auth.uid());

drop policy if exists daily_prompt_responses_select on public.daily_prompt_responses;
create policy daily_prompt_responses_select on public.daily_prompt_responses for select
  using (public.is_family_writer(family_id));

drop policy if exists daily_prompt_responses_insert on public.daily_prompt_responses;
create policy daily_prompt_responses_insert on public.daily_prompt_responses for insert
  with check (public.is_family_writer(family_id) and author_user_id = auth.uid());

drop policy if exists daily_prompt_responses_update_own on public.daily_prompt_responses;
create policy daily_prompt_responses_update_own on public.daily_prompt_responses for update
  using (public.is_family_writer(family_id) and author_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and author_user_id = auth.uid());

drop policy if exists daily_prompt_responses_delete_own on public.daily_prompt_responses;
create policy daily_prompt_responses_delete_own on public.daily_prompt_responses for delete
  using (public.is_family_writer(family_id) and author_user_id = auth.uid());

drop policy if exists firsts_select on public.firsts;
create policy firsts_select on public.firsts for select
  using (
    public.is_family_writer(family_id)
    or (
      public.is_family_circle_member(family_id)
      and (
        public.is_shared_with_circle(shared_with)
        or (
          moment_id is not null
          and public.is_moment_shared_with_circle(family_id, moment_id)
        )
      )
    )
  );

drop policy if exists firsts_insert on public.firsts;
create policy firsts_insert on public.firsts for insert
  with check (public.is_family_writer(family_id) and created_by_user_id = auth.uid());

drop policy if exists firsts_update_own on public.firsts;
create policy firsts_update_own on public.firsts for update
  using (public.is_family_writer(family_id) and created_by_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and created_by_user_id = auth.uid());

drop policy if exists firsts_delete_own on public.firsts;
create policy firsts_delete_own on public.firsts for delete
  using (public.is_family_writer(family_id) and created_by_user_id = auth.uid());

drop policy if exists letters_select on public.letters;
create policy letters_select on public.letters for select
  using (public.is_family_writer(family_id));

drop policy if exists letters_insert on public.letters;
create policy letters_insert on public.letters for insert
  with check (public.is_family_writer(family_id) and author_user_id = auth.uid());

drop policy if exists letters_update_own on public.letters;
create policy letters_update_own on public.letters for update
  using (public.is_family_writer(family_id) and author_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and author_user_id = auth.uid());

drop policy if exists letters_delete_own on public.letters;
create policy letters_delete_own on public.letters for delete
  using (public.is_family_writer(family_id) and author_user_id = auth.uid());

drop policy if exists weekly_digests_select on public.weekly_digests;
create policy weekly_digests_select on public.weekly_digests for select
  using (
    public.is_family_writer(family_id)
    or (
      public.is_family_circle_member(family_id)
      and public.is_shared_with_circle(shared_with)
    )
  );

drop policy if exists weekly_digests_insert on public.weekly_digests;
create policy weekly_digests_insert on public.weekly_digests for insert
  with check (public.is_family_writer(family_id));

drop policy if exists weekly_digests_update on public.weekly_digests;
create policy weekly_digests_update on public.weekly_digests for update
  using (public.is_family_writer(family_id))
  with check (public.is_family_writer(family_id));

drop policy if exists family_ritual_settings_select on public.family_ritual_settings;
create policy family_ritual_settings_select on public.family_ritual_settings for select
  using (public.is_family_writer(family_id));

drop policy if exists moments_select on public.moments;
create policy moments_select on public.moments for select
  using (
    public.is_family_writer(family_id)
    or (
      public.is_family_circle_member(family_id)
      and public.is_shared_with_circle(shared_with)
    )
  );

drop policy if exists moment_media_select on public.moment_media;
create policy moment_media_select on public.moment_media for select
  using (
    public.is_family_writer(family_id)
    or (
      public.is_family_circle_member(family_id)
      and public.is_moment_shared_with_circle(family_id, moment_id)
    )
  );

drop policy if exists voice_notes_select on public.voice_notes;
create policy voice_notes_select on public.voice_notes for select
  using (
    public.is_family_writer(family_id)
    or (
      public.is_family_circle_member(family_id)
      and moment_id is not null
      and public.is_moment_shared_with_circle(family_id, moment_id)
    )
  );

drop policy if exists moment_reactions_select on public.moment_reactions;
create policy moment_reactions_select on public.moment_reactions for select
  using (
    public.is_family_writer(family_id)
    or (
      public.is_family_circle_member(family_id)
      and public.is_moment_shared_with_circle(family_id, moment_id)
    )
  );

drop policy if exists moment_tags_select on public.moment_tags;
create policy moment_tags_select on public.moment_tags for select
  using (
    public.is_family_writer(family_id)
    or (
      public.is_family_circle_member(family_id)
      and public.is_moment_shared_with_circle(family_id, moment_id)
    )
  );

drop policy if exists family_photos_select on storage.objects;
create policy family_photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'family-photos'
    and (
      public.is_family_writer(public.uuid_or_null(split_part(storage.objects.name, '/', 1)))
      or (
        public.is_family_circle_member(public.uuid_or_null(split_part(storage.objects.name, '/', 1)))
        and split_part(storage.objects.name, '/', 2) = 'moments'
        and public.is_moment_shared_with_circle(
          public.uuid_or_null(split_part(storage.objects.name, '/', 1)),
          public.uuid_or_null(split_part(storage.objects.name, '/', 3))
        )
      )
    )
  );

drop policy if exists family_photos_insert on storage.objects;
create policy family_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'family-photos'
    and public.is_family_writer(public.uuid_or_null(split_part(storage.objects.name, '/', 1)))
  );

drop policy if exists family_photos_update on storage.objects;
create policy family_photos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'family-photos'
    and public.is_family_writer(public.uuid_or_null(split_part(storage.objects.name, '/', 1)))
  )
  with check (
    bucket_id = 'family-photos'
    and public.is_family_writer(public.uuid_or_null(split_part(storage.objects.name, '/', 1)))
  );

drop policy if exists family_photos_delete on storage.objects;
create policy family_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'family-photos'
    and public.is_family_writer(public.uuid_or_null(split_part(storage.objects.name, '/', 1)))
  );
