begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(16);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'stream-a@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'stream-b@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

insert into public.families (id, name, created_by) values
  ('92000000-0000-4000-8000-000000000001', 'Stream family A', '91000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000002', 'Stream family B', '91000000-0000-4000-8000-000000000002');
insert into public.family_members (family_id, user_id, role) values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'creator'),
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', 'circle'),
  ('92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', 'creator');
insert into public.family_entitlements (family_id, status, source, expires_at) values
  ('92000000-0000-4000-8000-000000000001', 'active', 'admin', now() + interval '1 day'),
  ('92000000-0000-4000-8000-000000000002', 'active', 'admin', now() + interval '1 day');

insert into public.moments (id, family_id, author_user_id, captured_at, shared_with) values
  ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001',
   '91000000-0000-4000-8000-000000000001', now(), '[]'::jsonb),
  ('93000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002',
   '91000000-0000-4000-8000-000000000002', now(), '[]'::jsonb),
  ('93000000-0000-4000-8000-000000000003', '92000000-0000-4000-8000-000000000001',
   '91000000-0000-4000-8000-000000000001', now(), '[]'::jsonb);

insert into public.moment_media (
  id, moment_id, family_id, owner_user_id, media_type, local_identifier,
  upload_status, storage_provider, playback_provider, stream_uid, quota_class
) values
  ('94000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
   '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
   'video', '95000000-0000-4000-8000-000000000001', 'ready', 'stream', 'stream', 'stream-family-a', 'optimized'),
  ('94000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000002',
   '92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002',
   'video', '95000000-0000-4000-8000-000000000002', 'ready', 'stream', 'stream', 'stream-family-b', 'optimized'),
  ('94000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000003',
   '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
   'video', '95000000-0000-4000-8000-000000000003', 'ready', 'stream', 'stream', 'stream-unconfirmed', 'optimized');

insert into public.photo_tags (
  family_id, asset_owner_user_id, asset_id, tagged_by_user_id, upload_status,
  moment_id, moment_media_id
) values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
   '95000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
   'ready', '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002',
   '95000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002',
   'ready', '93000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000002'),
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
   '95000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001',
   'ready', '93000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000003');

insert into public.media_upload_reservations (
  id, family_id, user_id, media_type, quota_class, status, canonical_media_id,
  transport, provider, provider_object_id, provider_cleanup_required,
  provider_upload_confirmed_at, expires_at
) values
  ('96000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001',
   '91000000-0000-4000-8000-000000000001', 'video', 'optimized', 'finalized',
   '94000000-0000-4000-8000-000000000001', 'video-stream', 'stream', 'stream-family-a', true, now(), now() + interval '1 day'),
  ('96000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002',
   '91000000-0000-4000-8000-000000000002', 'video', 'optimized', 'finalized',
   '94000000-0000-4000-8000-000000000002', 'video-stream', 'stream', 'stream-family-b', true, now(), now() + interval '1 day'),
  ('96000000-0000-4000-8000-000000000003', '92000000-0000-4000-8000-000000000001',
   '91000000-0000-4000-8000-000000000001', 'video', 'optimized', 'finalized',
   '94000000-0000-4000-8000-000000000003', 'video-stream', 'stream', 'stream-unconfirmed', true, null, now() + interval '1 day');

insert into public.canonical_media_provider_publications (
  moment_media_id, family_id, provider, provider_object_id, source_reservation_id
) values
  ('94000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001',
   'stream', 'stream-family-a', '96000000-0000-4000-8000-000000000001'),
  ('94000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002',
   'stream', 'stream-family-b', '96000000-0000-4000-8000-000000000002');

select is(has_function_privilege('authenticated',
  'public.authorize_canonical_stream_playback(uuid, uuid, text)', 'EXECUTE'), false,
  'authenticated clients cannot authorize Stream playback');
select is(has_function_privilege('anon',
  'public.authorize_canonical_stream_playback(uuid, uuid, text)', 'EXECUTE'), false,
  'anonymous clients cannot authorize Stream playback');
select is(has_function_privilege('service_role',
  'public.authorize_canonical_stream_playback(uuid, uuid, text)', 'EXECUTE'), true,
  'the trusted gateway can authorize Stream playback');
select is(has_function_privilege('authenticated',
  'public.claim_canonical_media_upload_provider_object(uuid, text, text)', 'EXECUTE'), false,
  'authenticated clients cannot bind a provider capability');
select is(has_function_privilege('anon',
  'public.claim_canonical_media_upload_provider_object(uuid, text, text)', 'EXECUTE'), false,
  'anonymous clients cannot bind a provider capability');
select is(has_function_privilege('service_role',
  'public.claim_canonical_media_upload_provider_object(uuid, text, text)', 'EXECUTE'), true,
  'trusted provider-verifying code can bind a provider capability');
select is(has_function_privilege('authenticated',
  'public.confirm_canonical_media_provider_upload(uuid, text, text)', 'EXECUTE'), false,
  'authenticated clients cannot confirm provider acceptance');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select is(public.authorize_canonical_stream_playback(
  '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
  'stream-family-a'), true,
  'an exactly published Stream UID is authorized for its family');
select is(public.authorize_canonical_stream_playback(
  '92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002',
  'stream-family-a'), false,
  'a Stream UID is not authorized through another family');
select is(public.authorize_canonical_stream_playback(
  '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
  'stream-family-b'), false,
  'another family Stream UID is not authorized through this family');
select is(public.authorize_canonical_stream_playback(
  '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
  'stream-unconfirmed'), false,
  'provider acceptance must be trusted before playback');
select is(public.authorize_canonical_stream_playback(
  '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
  'unknown-stream'), false,
  'unknown Stream UIDs fail closed');
select is(public.authorize_canonical_stream_playback(
  '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002',
  'stream-family-a'), false,
  'Circle cannot play an unshared family Stream memory');
update public.moments
set shared_with = '["circle"]'::jsonb
where id = '93000000-0000-4000-8000-000000000001';
select is(public.authorize_canonical_stream_playback(
  '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002',
  'stream-family-a'), true,
  'Circle can play an explicitly shared family Stream memory');

delete from public.media_upload_reservations
where id = '96000000-0000-4000-8000-000000000001';
update public.moments
set author_user_id = null
where id = '93000000-0000-4000-8000-000000000001';
update public.moment_media
set owner_user_id = null
where id = '94000000-0000-4000-8000-000000000001';
update public.photo_tags
set asset_owner_user_id = null, tagged_by_user_id = null
where moment_media_id = '94000000-0000-4000-8000-000000000001';
select is(public.authorize_canonical_stream_playback(
  '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
  'stream-family-a'), true,
  'durable publication proof keeps shared Stream media playable after uploader cleanup');

delete from public.family_members
where family_id = '92000000-0000-4000-8000-000000000001'
  and user_id = '91000000-0000-4000-8000-000000000001';
select is(public.authorize_canonical_stream_playback(
  '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
  'stream-family-a'), false,
  'a removed caregiver cannot reuse an unexpired media session for Stream playback');

select * from finish();
rollback;
