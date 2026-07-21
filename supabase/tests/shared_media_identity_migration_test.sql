begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

alter table public.photo_tags drop constraint photo_tags_opaque_asset_id_check;
alter table public.memories drop constraint memories_opaque_asset_id_check;
alter table public.moment_media drop constraint moment_media_opaque_local_identifier_check;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-000000000000',
  '20000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'identity-migration@example.test', '', now(),
  now(), now(), '{}'::jsonb, '{}'::jsonb
);

insert into public.families (id, name, created_by)
values ('20000000-0000-4000-8000-000000000010', 'Identity migration fixture',
  '20000000-0000-4000-8000-000000000001');

insert into public.moments (id, family_id, author_user_id, captured_at)
values ('20000000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-000000000010',
  '20000000-0000-4000-8000-000000000001', now());

insert into public.moment_media (
  id, moment_id, family_id, owner_user_id, media_type, local_identifier, metadata
) values (
  '20000000-0000-4000-8000-000000000201',
  '20000000-0000-4000-8000-000000000101',
  '20000000-0000-4000-8000-000000000010',
  '20000000-0000-4000-8000-000000000001',
  'image',
  'PH-PRIVATE/L0/001',
  '{"localAssetId":"PH-PRIVATE/L0/001","recognitionScore":0.99,"faceCount":1,"fullPath":"safe/path.jpg"}'::jsonb
);

insert into public.photo_tags (
  id, family_id, asset_owner_user_id, asset_id, tagged_by_user_id, moment_id, moment_media_id
) values (
  '20000000-0000-4000-8000-000000000301',
  '20000000-0000-4000-8000-000000000010',
  '20000000-0000-4000-8000-000000000001',
  'PH-PRIVATE/L0/001',
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000101',
  '20000000-0000-4000-8000-000000000201'
);

insert into public.memories (family_id, asset_owner_user_id, asset_id, author_user_id, note)
values ('20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001',
  'PH-PRIVATE/L0/001', '20000000-0000-4000-8000-000000000001', 'Private identifier fixture');

\ir ../migrations/20260720210000_private_shared_media_identity.sql

select plan(6);

select ok(
  (select asset_id from public.photo_tags where id = '20000000-0000-4000-8000-000000000301')
    ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  'legacy photo tag is rotated to an opaque UUID'
);
select is(
  (select asset_id from public.memories where note = 'Private identifier fixture'),
  (select asset_id from public.photo_tags where id = '20000000-0000-4000-8000-000000000301'),
  'memory relationship follows the rotated key'
);
select is(
  (select local_identifier from public.moment_media where id = '20000000-0000-4000-8000-000000000201'),
  (select asset_id from public.photo_tags where id = '20000000-0000-4000-8000-000000000301'),
  'moment media relationship follows the rotated key'
);
select ok(
  not ((select metadata from public.moment_media where id = '20000000-0000-4000-8000-000000000201')
    ?| array['localAssetId', 'recognitionScore', 'faceCount']),
  'private metadata is scrubbed'
);
select is(
  (select metadata->>'fullPath' from public.moment_media where id = '20000000-0000-4000-8000-000000000201'),
  'safe/path.jpg',
  'safe storage metadata is preserved'
);

create temporary table first_rotation_key as
select asset_id from public.photo_tags where id = '20000000-0000-4000-8000-000000000301';
\ir ../migrations/20260720210000_private_shared_media_identity.sql
select is(
  (select asset_id from public.photo_tags where id = '20000000-0000-4000-8000-000000000301'),
  (select asset_id from first_rotation_key),
  'repeated migration preserves the already opaque key'
);

select * from finish();
rollback;
