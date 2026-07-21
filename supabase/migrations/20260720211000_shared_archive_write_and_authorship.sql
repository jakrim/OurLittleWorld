-- Shared memories survive an author's account deletion with attribution
-- removed rather than content silently cascading away. Separately authored
-- rows remain immutable after their author is gone. Lapsed family writers keep
-- read access, but every curated-memory mutation is denied at RLS/storage.

alter table public.families alter column created_by drop not null;
alter table public.families drop constraint if exists families_created_by_fkey;
alter table public.families add constraint families_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.photo_tags
  alter column asset_owner_user_id drop not null,
  alter column tagged_by_user_id drop not null;
alter table public.photo_tags drop constraint if exists photo_tags_asset_owner_user_id_fkey;
alter table public.photo_tags add constraint photo_tags_asset_owner_user_id_fkey
  foreign key (asset_owner_user_id) references auth.users(id) on delete set null;
alter table public.photo_tags drop constraint if exists photo_tags_tagged_by_user_id_fkey;
alter table public.photo_tags add constraint photo_tags_tagged_by_user_id_fkey
  foreign key (tagged_by_user_id) references auth.users(id) on delete set null;

alter table public.memories
  alter column asset_owner_user_id drop not null,
  alter column author_user_id drop not null;
alter table public.memories drop constraint if exists memories_asset_owner_user_id_fkey;
alter table public.memories add constraint memories_asset_owner_user_id_fkey
  foreign key (asset_owner_user_id) references auth.users(id) on delete set null;
alter table public.memories drop constraint if exists memories_author_user_id_fkey;
alter table public.memories add constraint memories_author_user_id_fkey
  foreign key (author_user_id) references auth.users(id) on delete set null;

alter table public.daily_prompt_responses alter column author_user_id drop not null;
alter table public.daily_prompt_responses drop constraint if exists daily_prompt_responses_author_user_id_fkey;
alter table public.daily_prompt_responses add constraint daily_prompt_responses_author_user_id_fkey
  foreign key (author_user_id) references auth.users(id) on delete set null;

alter table public.firsts alter column created_by_user_id drop not null;
alter table public.firsts drop constraint if exists firsts_created_by_user_id_fkey;
alter table public.firsts add constraint firsts_created_by_user_id_fkey
  foreign key (created_by_user_id) references auth.users(id) on delete set null;

alter table public.letters alter column author_user_id drop not null;
alter table public.letters drop constraint if exists letters_author_user_id_fkey;
alter table public.letters add constraint letters_author_user_id_fkey
  foreign key (author_user_id) references auth.users(id) on delete set null;

alter table public.moments alter column author_user_id drop not null;
alter table public.moments drop constraint if exists moments_author_user_id_fkey;
alter table public.moments add constraint moments_author_user_id_fkey
  foreign key (author_user_id) references auth.users(id) on delete set null;

alter table public.moment_media alter column owner_user_id drop not null;
alter table public.moment_media drop constraint if exists moment_media_owner_user_id_fkey;
alter table public.moment_media add constraint moment_media_owner_user_id_fkey
  foreign key (owner_user_id) references auth.users(id) on delete set null;

alter table public.voice_notes alter column author_user_id drop not null;
alter table public.voice_notes drop constraint if exists voice_notes_author_user_id_fkey;
alter table public.voice_notes add constraint voice_notes_author_user_id_fkey
  foreign key (author_user_id) references auth.users(id) on delete set null;

alter table public.moment_reactions alter column author_user_id drop not null;
alter table public.moment_reactions drop constraint if exists moment_reactions_author_user_id_fkey;
alter table public.moment_reactions add constraint moment_reactions_author_user_id_fkey
  foreign key (author_user_id) references auth.users(id) on delete set null;

alter table public.moment_replies alter column author_user_id drop not null;
alter table public.moment_replies drop constraint if exists moment_replies_author_user_id_fkey;
alter table public.moment_replies add constraint moment_replies_author_user_id_fkey
  foreign key (author_user_id) references auth.users(id) on delete set null;

-- Core saved-memory writes.
drop policy if exists photo_tags_all on public.photo_tags;
drop policy if exists photo_tags_insert_active on public.photo_tags;
drop policy if exists photo_tags_update_active on public.photo_tags;
drop policy if exists photo_tags_delete_active on public.photo_tags;
drop policy if exists photo_tags_select_writers on public.photo_tags;
create policy photo_tags_select_writers on public.photo_tags for select
  using (public.is_family_writer(family_id));
create policy photo_tags_insert_active on public.photo_tags for insert
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and tagged_by_user_id = auth.uid());
create policy photo_tags_update_active on public.photo_tags for update
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id))
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and tagged_by_user_id = auth.uid());
create policy photo_tags_delete_active on public.photo_tags for delete
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id));

drop policy if exists memories_insert on public.memories;
drop policy if exists memories_update_own on public.memories;
drop policy if exists memories_delete_own on public.memories;
create policy memories_insert on public.memories for insert
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());
create policy memories_update_own on public.memories for update
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());
create policy memories_delete_own on public.memories for delete
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());

drop policy if exists moments_insert on public.moments;
drop policy if exists moments_update_own on public.moments;
drop policy if exists moments_delete_own on public.moments;
create policy moments_insert on public.moments for insert
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());
create policy moments_update_own on public.moments for update
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());
create policy moments_delete_own on public.moments for delete
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());

drop policy if exists moment_media_insert on public.moment_media;
drop policy if exists moment_media_update_own on public.moment_media;
drop policy if exists moment_media_delete_own on public.moment_media;
create policy moment_media_insert on public.moment_media for insert
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and owner_user_id = auth.uid());
create policy moment_media_update_own on public.moment_media for update
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and owner_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and owner_user_id = auth.uid());
create policy moment_media_delete_own on public.moment_media for delete
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and owner_user_id = auth.uid());

drop policy if exists voice_notes_insert on public.voice_notes;
drop policy if exists voice_notes_update_own on public.voice_notes;
drop policy if exists voice_notes_delete_own on public.voice_notes;
create policy voice_notes_insert on public.voice_notes for insert
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());
create policy voice_notes_update_own on public.voice_notes for update
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());
create policy voice_notes_delete_own on public.voice_notes for delete
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());

drop policy if exists moment_reactions_all on public.moment_reactions;
drop policy if exists moment_reactions_insert_active on public.moment_reactions;
drop policy if exists moment_reactions_update_active on public.moment_reactions;
drop policy if exists moment_reactions_delete_active on public.moment_reactions;
create policy moment_reactions_insert_active on public.moment_reactions for insert
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());
create policy moment_reactions_update_active on public.moment_reactions for update
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());
create policy moment_reactions_delete_active on public.moment_reactions for delete
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());

drop policy if exists moment_tags_all on public.moment_tags;
drop policy if exists moment_tags_insert_active on public.moment_tags;
drop policy if exists moment_tags_update_active on public.moment_tags;
drop policy if exists moment_tags_delete_active on public.moment_tags;
create policy moment_tags_insert_active on public.moment_tags for insert
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id));
create policy moment_tags_update_active on public.moment_tags for update
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id))
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id));
create policy moment_tags_delete_active on public.moment_tags for delete
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id));

-- Context and ritual writes.
drop policy if exists daily_prompt_responses_insert on public.daily_prompt_responses;
drop policy if exists daily_prompt_responses_update_own on public.daily_prompt_responses;
drop policy if exists daily_prompt_responses_delete_own on public.daily_prompt_responses;
create policy daily_prompt_responses_insert on public.daily_prompt_responses for insert
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());
create policy daily_prompt_responses_update_own on public.daily_prompt_responses for update
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());
create policy daily_prompt_responses_delete_own on public.daily_prompt_responses for delete
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());

drop policy if exists firsts_insert on public.firsts;
drop policy if exists firsts_update_own on public.firsts;
drop policy if exists firsts_delete_own on public.firsts;
create policy firsts_insert on public.firsts for insert
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and created_by_user_id = auth.uid());
create policy firsts_update_own on public.firsts for update
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and created_by_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and created_by_user_id = auth.uid());
create policy firsts_delete_own on public.firsts for delete
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and created_by_user_id = auth.uid());

drop policy if exists letters_insert on public.letters;
drop policy if exists letters_update_own on public.letters;
drop policy if exists letters_delete_own on public.letters;
create policy letters_insert on public.letters for insert
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());
create policy letters_update_own on public.letters for update
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());
create policy letters_delete_own on public.letters for delete
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());

drop policy if exists moment_replies_insert_own on public.moment_replies;
drop policy if exists moment_replies_update_own on public.moment_replies;
drop policy if exists moment_replies_delete_own on public.moment_replies;
create policy moment_replies_insert_own on public.moment_replies for insert
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());
create policy moment_replies_update_own on public.moment_replies for update
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid())
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());
create policy moment_replies_delete_own on public.moment_replies for delete
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and author_user_id = auth.uid());

drop policy if exists moment_views_insert_own on public.moment_views;
drop policy if exists moment_views_update_own on public.moment_views;
create policy moment_views_insert_own on public.moment_views for insert
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and user_id = auth.uid());
create policy moment_views_update_own on public.moment_views for update
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and user_id = auth.uid())
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and user_id = auth.uid());

drop policy if exists weekly_digests_insert on public.weekly_digests;
drop policy if exists weekly_digests_update on public.weekly_digests;
create policy weekly_digests_insert on public.weekly_digests for insert
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id));
create policy weekly_digests_update on public.weekly_digests for update
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id))
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id));

drop policy if exists family_ritual_settings_insert on public.family_ritual_settings;
drop policy if exists family_ritual_settings_update on public.family_ritual_settings;
create policy family_ritual_settings_insert on public.family_ritual_settings for insert
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id));
create policy family_ritual_settings_update on public.family_ritual_settings for update
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id))
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id));

drop policy if exists families_update on public.families;
create policy families_update on public.families for update
  using (public.is_family_writer(id) and public.family_has_active_entitlement(id))
  with check (public.is_family_writer(id) and public.family_has_active_entitlement(id));

-- Private scan metadata is still server-scoped per writer, but lapsed writers
-- may not advance checkpoints or calibration state.
drop policy if exists media_import_calibrations_all on public.media_import_calibrations;
create policy media_import_calibrations_all on public.media_import_calibrations for all
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and user_id = auth.uid())
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and user_id = auth.uid());

drop policy if exists scan_checkpoints_all on public.scan_checkpoints;
create policy scan_checkpoints_all on public.scan_checkpoints for all
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and user_id = auth.uid())
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and user_id = auth.uid());

drop policy if exists family_library_connections_insert_own on public.family_library_connections;
drop policy if exists family_library_connections_update_own on public.family_library_connections;
drop policy if exists family_library_connections_delete_own on public.family_library_connections;
create policy family_library_connections_insert_own on public.family_library_connections for insert
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and user_id = auth.uid());
create policy family_library_connections_update_own on public.family_library_connections for update
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and user_id = auth.uid())
  with check (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and user_id = auth.uid());
create policy family_library_connections_delete_own on public.family_library_connections for delete
  using (public.is_family_writer(family_id) and public.family_has_active_entitlement(family_id) and user_id = auth.uid());

-- Storage is part of the same write transaction and must not be a bypass.
drop policy if exists family_photos_insert on storage.objects;
drop policy if exists family_photos_update on storage.objects;
drop policy if exists family_photos_delete on storage.objects;
create policy family_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'family-photos'
    and public.is_family_writer(public.uuid_or_null(split_part(name, '/', 1)))
    and public.family_has_active_entitlement(public.uuid_or_null(split_part(name, '/', 1)))
  );
create policy family_photos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'family-photos'
    and public.is_family_writer(public.uuid_or_null(split_part(name, '/', 1)))
    and public.family_has_active_entitlement(public.uuid_or_null(split_part(name, '/', 1)))
  )
  with check (
    bucket_id = 'family-photos'
    and public.is_family_writer(public.uuid_or_null(split_part(name, '/', 1)))
    and public.family_has_active_entitlement(public.uuid_or_null(split_part(name, '/', 1)))
  );
create policy family_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'family-photos'
    and public.is_family_writer(public.uuid_or_null(split_part(name, '/', 1)))
    and public.family_has_active_entitlement(public.uuid_or_null(split_part(name, '/', 1)))
  );
