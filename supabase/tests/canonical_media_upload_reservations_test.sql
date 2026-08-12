begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(5);

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
  ('82000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000001', 'creator'),
  ('82000000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000001', 'circle'),
  ('82000000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000002', 'creator');

insert into public.family_entitlements (family_id, status, source, expires_at) values
  ('82000000-0000-4000-8000-000000000001', 'active', 'admin', now() + interval '30 days'),
  ('82000000-0000-4000-8000-000000000002', 'expired', 'stripe', now() - interval '1 day'),
  ('82000000-0000-4000-8000-000000000003', 'active', 'admin', now() + interval '30 days');

insert into public.media_upload_reservations (
  id, family_id, user_id, media_type, status, canonical_media_id, transport,
  provider, provider_object_id
) values (
  '83000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  'video', 'reserved', '84000000-0000-4000-8000-000000000001', 'video-stream',
  'stream', 'canonical-stream-winner'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select public.authorize_canonical_media_upload('82000000-0000-4000-8000-000000000001') $$,
  'active writer may reconcile a canonical provider upload'
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

select * from finish();
rollback;
