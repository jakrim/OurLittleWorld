-- Add cloud storage columns to photo_tags
alter table public.photo_tags
  add column if not exists storage_object  uuid,
  add column if not exists thumb_object    uuid,
  add column if not exists original_width  int,
  add column if not exists original_height int,
  add column if not exists creation_time   timestamptz,
  add column if not exists upload_status   text not null default 'pending'
    check (upload_status in ('pending','uploading','ready','failed')),
  add column if not exists upload_error    text;

create index if not exists photo_tags_ready_chrono_idx
  on public.photo_tags (family_id, creation_time desc)
  where upload_status = 'ready';

-- Create the private bucket (idempotent)
insert into storage.buckets (id, name, public)
values ('family-photos', 'family-photos', false)
on conflict (id) do update set public = excluded.public;

-- Storage RLS: members of the family in the first path segment can read/write
drop policy if exists family_photos_select on storage.objects;
drop policy if exists family_photos_insert on storage.objects;
drop policy if exists family_photos_update on storage.objects;
drop policy if exists family_photos_delete on storage.objects;

create policy family_photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'family-photos'
    and public.is_family_member(((storage.foldername(name))[1])::uuid)
  );

create policy family_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'family-photos'
    and public.is_family_member(((storage.foldername(name))[1])::uuid)
    and owner = auth.uid()
  );

create policy family_photos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'family-photos'
    and public.is_family_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'family-photos'
    and public.is_family_member(((storage.foldername(name))[1])::uuid)
  );

create policy family_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'family-photos'
    and public.is_family_member(((storage.foldername(name))[1])::uuid)
  );;
