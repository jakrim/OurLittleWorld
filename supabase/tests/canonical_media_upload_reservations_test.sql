begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(30);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '81000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'canonical-writer@example.test', '', now(),
    now(), now(), '{}'::jsonb, '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '81000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'canonical-owner@example.test', '', now(),
    now(), now(), '{}'::jsonb, '{}'::jsonb
  );

insert into public.families (id, name, baby_name, created_by) values
  ('82000000-0000-4000-8000-000000000001', 'Active canonical family', 'Baby', '81000000-0000-4000-8000-000000000001'),
  ('82000000-0000-4000-8000-000000000002', 'Lapsed canonical family', 'Baby', '81000000-0000-4000-8000-000000000001'),
  ('82000000-0000-4000-8000-000000000003', 'Circle canonical family', 'Baby', '81000000-0000-4000-8000-000000000002');

insert into public.family_members (family_id, user_id, role) values
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'creator'),
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000002', 'partner'),
  ('82000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000001', 'creator'),
  ('82000000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000001', 'circle'),
  ('82000000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000002', 'creator');

insert into public.family_entitlements (family_id, status, source, expires_at) values
  ('82000000-0000-4000-8000-000000000001', 'active', 'admin', now() + interval '30 days'),
  ('82000000-0000-4000-8000-000000000002', 'expired', 'stripe', now() - interval '1 day'),
  ('82000000-0000-4000-8000-000000000003', 'active', 'admin', now() + interval '30 days');

insert into public.media_upload_reservations (
  id, family_id, user_id, media_type, status, canonical_media_id, transport,
  provider, provider_object_id, provider_cleanup_required, expires_at
) values
  (
    '83000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    'video', 'reserved', '84000000-0000-4000-8000-000000000001', 'video-stream',
    'stream', 'canonical-stream-winner', true, now() + interval '1 hour'
  ),
  (
    '83000000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    'video', 'finalized', '84000000-0000-4000-8000-000000000002', 'video-stream',
    'stream', 'finalized-stream-object', true, now() + interval '1 hour'
  ),
  (
    '83000000-0000-4000-8000-000000000003',
    '82000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000001',
    'video', 'reserved', '84000000-0000-4000-8000-000000000003', 'video-stream',
    'stream', 'lapsed-stream-object', true, now() + interval '1 hour'
  ),
  (
    '83000000-0000-4000-8000-000000000004',
    '82000000-0000-4000-8000-000000000003',
    '81000000-0000-4000-8000-000000000002',
    'video', 'reserved', '84000000-0000-4000-8000-000000000004', 'video-stream',
    'stream', 'circle-family-stream-object', true, now() + interval '1 hour'
  ),
  (
    '83000000-0000-4000-8000-000000000005',
    '82000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000001',
    'video', 'finalized', '84000000-0000-4000-8000-000000000005', 'video-stream',
    'stream', 'lapsed-finalized-stream-object', true, now() + interval '1 hour'
  ),
  (
    '83000000-0000-4000-8000-000000000006',
    '82000000-0000-4000-8000-000000000003',
    '81000000-0000-4000-8000-000000000002',
    'video', 'finalized', '84000000-0000-4000-8000-000000000006', 'video-stream',
    'stream', 'circle-visible-finalized-stream-object', true, now() + interval '1 hour'
  ),
  (
    '83000000-0000-4000-8000-000000000007',
    '82000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    'video', 'reserved', '84000000-0000-4000-8000-000000000007', 'video-stream',
    'stream', 'expired-live-stream-object', true, now() - interval '1 minute'
  );

insert into public.moments (
  id, family_id, author_user_id, captured_at, shared_with
) values (
  '85000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  now(),
  '[]'::jsonb
);

insert into public.moment_media (
  id, moment_id, family_id, owner_user_id, media_type, full_object,
  duration_sec, upload_status, storage_provider, source_bytes, optimized_bytes,
  playback_seconds, quota_class, created_at, updated_at
) values (
  '84000000-0000-4000-8000-000000000008',
  '85000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  'video',
  '86000000-0000-4000-8000-000000000001',
  10,
  'ready',
  'supabase',
  1000,
  1000,
  10,
  'optimized',
  now(),
  now()
);

insert into public.photo_tags (
  family_id, asset_owner_user_id, asset_id, tagged_by_user_id, storage_object,
  upload_status, moment_id, moment_media_id
) values (
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  'opaque-legacy-video',
  '81000000-0000-4000-8000-000000000001',
  '86000000-0000-4000-8000-000000000001',
  'ready',
  '85000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000008'
);

insert into storage.objects (id, bucket_id, name, owner_id)
values (
  '87000000-0000-4000-8000-000000000001',
  'family-photos',
  '82000000-0000-4000-8000-000000000001/moments/85000000-0000-4000-8000-000000000001/video/86000000-0000-4000-8000-000000000001.mp4',
  '81000000-0000-4000-8000-000000000001'
);

insert into public.media_upload_reservations (
  id, family_id, user_id, media_type, quota_class, reserved_bytes, reserved_seconds,
  status, created_at, updated_at
) values (
  '83000000-0000-4000-8000-000000000008',
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  'video',
  'optimized',
  1000,
  10,
  'finalized',
  now(),
  now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select public.authorize_canonical_media_upload('82000000-0000-4000-8000-000000000001') $$,
  'active writer may reconcile a canonical provider upload'
);

select is(
  (
    select count(*)
    from public.media_upload_reservations
    where id = '83000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'active reservation owner can read pending provider identity'
);

select throws_ok(
  $$ select public.authorize_canonical_media_upload('82000000-0000-4000-8000-000000000002') $$,
  'P0001',
  'An active family plan is required to upload media.',
  'lapsed writer cannot reconcile a canonical provider upload'
);

select throws_ok(
  $$ select public.authorize_canonical_media_upload('82000000-0000-4000-8000-000000000003') $$,
  'P0001',
  'Only a co-parent can upload media for this family.',
  'Circle member cannot reconcile a canonical provider upload'
);

select throws_ok(
  $$ select public.attach_media_upload_provider_object(
    '83000000-0000-4000-8000-000000000001',
    'stream',
    'replacement-stream-object'
  ) $$,
  'P0001',
  'Canonical upload reservations require atomic provider claims.',
  'legacy attachment cannot overwrite a canonical provider identity'
);

select is(
  (
    select provider_object_id
    from public.media_upload_reservations
    where id = '83000000-0000-4000-8000-000000000001'
  ),
  'canonical-stream-winner',
  'canonical provider identity remains unchanged'
);

select is(
  (
    select status || '|' || storage_present::text
    from public.reconcile_legacy_canonical_media_upload(
      '82000000-0000-4000-8000-000000000001',
      '84000000-0000-4000-8000-000000000008',
      'video-direct',
      '82000000-0000-4000-8000-000000000001/moments/85000000-0000-4000-8000-000000000001/video/86000000-0000-4000-8000-000000000001.mp4'
    )
  ),
  'finalized|true',
  'legacy ready rows adopt one exact finalized quota reservation with storage proof'
);

select is(
  (
    select canonical_media_id::text || '|' || transport
    from public.media_upload_reservations
    where id = '83000000-0000-4000-8000-000000000008'
  ),
  '84000000-0000-4000-8000-000000000008|video-direct',
  'legacy quota evidence becomes attributable to the canonical direct video'
);

select is(
  (
    select status || '|' || storage_present::text
    from public.reconcile_legacy_canonical_media_upload(
      '82000000-0000-4000-8000-000000000001',
      '84000000-0000-4000-8000-000000000008',
      'video-direct',
      '82000000-0000-4000-8000-000000000001/moments/85000000-0000-4000-8000-000000000001/video/86000000-0000-4000-8000-000000000001.mov'
    )
  ),
  'finalized|false',
  'legacy reconciliation exposes that the requested canonical storage object is absent'
);

select throws_ok(
  $$ select public.release_media_upload('83000000-0000-4000-8000-000000000001') $$,
  'P0001',
  'Provider cleanup must be confirmed before release.',
  'a provider-backed reservation cannot be released before trusted cleanup'
);

select throws_ok(
  $$ select public.confirm_media_upload_provider_cleanup(
    '83000000-0000-4000-8000-000000000001',
    'stream',
    'canonical-stream-winner'
  ) $$,
  '42501',
  'permission denied for function confirm_media_upload_provider_cleanup',
  'an authenticated writer cannot falsely confirm provider cleanup'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$ select public.confirm_media_upload_provider_cleanup(
    '83000000-0000-4000-8000-000000000001',
    'stream',
    'canonical-stream-winner'
  ) $$,
  'a trusted service can confirm exact provider cleanup'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select concat_ws('|', provider_object_id, provider_cleanup_required::text, provider_cleanup_confirmed_at is not null)
    from public.media_upload_reservations
    where id = '83000000-0000-4000-8000-000000000001'
  ),
  'false|true',
  'trusted cleanup removes provider capability and records confirmation'
);

select lives_ok(
  $$ select public.release_media_upload('83000000-0000-4000-8000-000000000001') $$,
  'the active owner may release after provider cleanup'
);

select is(
  (
    select status
    from public.media_upload_reservations
    where id = '83000000-0000-4000-8000-000000000001'
  ),
  'released',
  'release reaches a terminal state only after cleanup'
);

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000002', true);

select is(
  (
    select count(*)
    from public.media_upload_reservations
    where id = '83000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'another active writer cannot read an owner reservation in any state'
);

select is(
  (
    select count(*)
    from public.media_upload_reservations
    where id = '83000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'another family writer cannot read finalized provider identity'
);

select is(
  (
    select count(*)
    from public.list_family_media_upload_lifecycle('82000000-0000-4000-8000-000000000001')
  ),
  3::bigint,
  'another family writer receives sanitized terminal lifecycle state'
);

select is(
  (
    select not (
      to_jsonb(lifecycle) ? 'provider_object_id'
      or to_jsonb(lifecycle) ? 'reservation_id'
    )
    from public.list_family_media_upload_lifecycle('82000000-0000-4000-8000-000000000001') lifecycle
    limit 1
  ),
  true,
  'sanitized lifecycle output omits provider and reservation capabilities'
);

select is(
  (
    select count(*)
    from public.media_upload_reservations
    where id = '83000000-0000-4000-8000-000000000003'
  ),
  0::bigint,
  'a removed family member cannot read pending provider identity'
);

select throws_ok(
  $$ select * from public.list_family_media_upload_lifecycle('82000000-0000-4000-8000-000000000002') $$,
  'P0001',
  'Co-parent access is required.',
  'a removed family member cannot read sanitized lifecycle state'
);

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);

select is(
  (
    select count(*)
    from public.media_upload_reservations
    where id = '83000000-0000-4000-8000-000000000003'
  ),
  0::bigint,
  'lapsed reservation owner cannot read pending provider identity'
);

select is(
  (
    select count(*)
    from public.list_family_media_upload_lifecycle('82000000-0000-4000-8000-000000000002')
  ),
  1::bigint,
  'a lapsed member receives sanitized finalized lifecycle state'
);

select is(
  (
    select count(*)
    from public.media_upload_reservations
    where id = '83000000-0000-4000-8000-000000000004'
  ),
  0::bigint,
  'Circle member cannot read pending provider identity'
);

select throws_ok(
  $$ select * from public.list_family_media_upload_lifecycle('82000000-0000-4000-8000-000000000003') $$,
  'P0001',
  'Co-parent access is required.',
  'a Circle member cannot enumerate sanitized upload lifecycle state'
);

select is(
  (
    select allowed::text || '|' || reason
    from public.reserve_canonical_media_upload(
      '82000000-0000-4000-8000-000000000001',
      '84000000-0000-4000-8000-000000000007',
      'video-stream',
      'video',
      1000,
      10,
      'optimized'
    )
  ),
  'false|provider_cleanup_required',
  'an expired reservation with a provider object requires cleanup instead of replacement'
);

select is(
  (
    select status || '|' || provider_cleanup_required::text
    from public.media_upload_reservations
    where id = '83000000-0000-4000-8000-000000000007'
  ),
  'reserved|true',
  'an expired provider capability remains restricted while cleanup is pending'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$ select public.confirm_media_upload_provider_cleanup(
    '83000000-0000-4000-8000-000000000007',
    'stream',
    'expired-live-stream-object'
  ) $$,
  'trusted deletion confirmation clears an expired provider capability'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select public.release_media_upload('83000000-0000-4000-8000-000000000007') $$,
  'an expired provider reservation can terminate after trusted cleanup'
);

select is(
  (
    select status || '|' || coalesce(provider_object_id, 'none')
    from public.media_upload_reservations
    where id = '83000000-0000-4000-8000-000000000007'
  ),
  'released|none',
  'terminal cleanup state contains no provider upload capability'
);

select * from finish();
rollback;
