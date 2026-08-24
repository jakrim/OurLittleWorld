begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(10);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'archive-trust@example.test', '', now(),
  now(), now(), '{}'::jsonb, '{}'::jsonb
);

insert into public.families (id, name, baby_name, created_by) values
  ('10000000-0000-4000-8000-000000000010', 'Active fixture', 'Baby', '10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000020', 'Lapsed fixture', 'Baby', '10000000-0000-4000-8000-000000000001');

insert into public.family_members (family_id, user_id, role) values
  ('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001', 'creator'),
  ('10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000001', 'creator');

insert into public.family_entitlements (family_id, status, source, expires_at) values
  ('10000000-0000-4000-8000-000000000010', 'active', 'admin', now() + interval '30 days'),
  ('10000000-0000-4000-8000-000000000020', 'expired', 'stripe', now() - interval '1 day');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ insert into public.moments (id, family_id, author_user_id, captured_at)
     values ('10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000010',
       '10000000-0000-4000-8000-000000000001', now()) $$,
  'active writer can create a kept moment'
);

select throws_ok(
  $$ insert into public.moments (id, family_id, author_user_id, captured_at)
     values ('10000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000020',
       '10000000-0000-4000-8000-000000000001', now()) $$,
  '42501',
  'new row violates row-level security policy for table "moments"',
  'lapsed writer cannot create a moment'
);

select throws_ok(
  $$ insert into public.photo_tags (family_id, asset_owner_user_id, asset_id, tagged_by_user_id)
     values ('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001',
       'PH-RAW-DEVICE/L0/001', '10000000-0000-4000-8000-000000000001') $$,
  '23514',
  null,
  'raw device identifier is rejected even for an active writer'
);

select lives_ok(
  $$ insert into public.photo_tags (id, family_id, asset_owner_user_id, asset_id, tagged_by_user_id, moment_id)
     values ('10000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000010',
       '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000202',
       '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000101') $$,
  'opaque media key is accepted'
);

select throws_ok(
  $$ insert into public.moment_views (family_id, moment_id, user_id)
     values ('10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000101',
       '10000000-0000-4000-8000-000000000001') $$,
  '42501',
  'new row violates row-level security policy for table "moment_views"',
  'lapsed writer cannot mutate read-receipt state'
);

reset role;

insert into public.moment_media (
  id, moment_id, family_id, owner_user_id, media_type, local_identifier, metadata
) values (
  '10000000-0000-4000-8000-000000000301',
  '10000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001',
  'image',
  '10000000-0000-4000-8000-000000000302',
  '{}'::jsonb
);

insert into public.moment_reactions (id, moment_id, family_id, author_user_id, emoji)
values ('10000000-0000-4000-8000-000000000401', '10000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001', '❤️');

insert into public.moment_replies (id, moment_id, family_id, author_user_id, body)
values ('10000000-0000-4000-8000-000000000501', '10000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001', 'Remember this day');

delete from auth.users where id = '10000000-0000-4000-8000-000000000001';

select is((select count(*) from public.moments where id = '10000000-0000-4000-8000-000000000101'), 1::bigint,
  'shared moment survives author deletion');
select is((select author_user_id from public.moments where id = '10000000-0000-4000-8000-000000000101'), null::uuid,
  'moment attribution is removed');
select is((select owner_user_id from public.moment_media where id = '10000000-0000-4000-8000-000000000301'), null::uuid,
  'media survives with removed owner attribution');
select is((select author_user_id from public.moment_reactions where id = '10000000-0000-4000-8000-000000000401'), null::uuid,
  'reaction survives with removed attribution');
select is((select author_user_id from public.moment_replies where id = '10000000-0000-4000-8000-000000000501'), null::uuid,
  'reply survives with removed attribution');

select * from finish();
rollback;
