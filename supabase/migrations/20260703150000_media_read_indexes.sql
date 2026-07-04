-- Keyset pagination indexes for the timeline and archive read paths.

create index if not exists photo_tags_family_ready_created_idx
  on public.photo_tags(family_id, upload_status, creation_time desc, asset_owner_user_id, asset_id);

create index if not exists moment_media_family_ready_created_idx
  on public.moment_media(family_id, upload_status, created_at desc, id);
