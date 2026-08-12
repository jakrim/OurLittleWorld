begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(13);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'initial-creator@example.test', '', now(),
   now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'initial-partner@example.test', '', now(),
   now(), now(), '{}'::jsonb, '{}'::jsonb);

insert into public.families (id, name, baby_name, baby_birthday, created_by) values
  ('12000000-0000-4000-8000-000000000010', 'Initial setup fixture',
   null, null, '12000000-0000-4000-8000-000000000001'),
  ('12000000-0000-4000-8000-000000000020', 'Name-only fixture',
   'Child', null, '12000000-0000-4000-8000-000000000001'),
  ('12000000-0000-4000-8000-000000000030', 'Birthday-only fixture',
   null, '2025-10-01', '12000000-0000-4000-8000-000000000001'),
  ('12000000-0000-4000-8000-000000000040', 'Deletion-locked fixture',
   null, null, '12000000-0000-4000-8000-000000000001');

insert into public.family_members (family_id, user_id, role) values
  ('12000000-0000-4000-8000-000000000010', '12000000-0000-4000-8000-000000000001', 'creator'),
  ('12000000-0000-4000-8000-000000000010', '12000000-0000-4000-8000-000000000002', 'partner'),
  ('12000000-0000-4000-8000-000000000020', '12000000-0000-4000-8000-000000000001', 'creator'),
  ('12000000-0000-4000-8000-000000000030', '12000000-0000-4000-8000-000000000001', 'creator'),
  ('12000000-0000-4000-8000-000000000040', '12000000-0000-4000-8000-000000000001', 'creator');

insert into public.account_deletion_requests (
  id, requester_user_id, reauthenticated_at
) values (
  '12000000-0000-4000-8000-000000000090',
  '12000000-0000-4000-8000-000000000001',
  now()
);
insert into public.account_deletion_family_locks (
  family_id, request_id, requester_user_id, expires_at
) values (
  '12000000-0000-4000-8000-000000000040',
  '12000000-0000-4000-8000-000000000090',
  '12000000-0000-4000-8000-000000000001',
  now() + interval '30 minutes'
);

select is(
  has_function_privilege(
    'anon',
    'public.complete_initial_family_profile(uuid, text, date)',
    'EXECUTE'
  ),
  false,
  'anonymous callers cannot execute initial family setup'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select public.complete_initial_family_profile(
       '12000000-0000-4000-8000-000000000010', 'Child', '2025-10-01') $$,
  'creator can complete initial setup before entitlement'
);
select is(
  (select baby_name from public.families where id = '12000000-0000-4000-8000-000000000010'),
  'Child',
  'initial setup stores the parent-authored child name'
);
select is(
  (select baby_birthday from public.families where id = '12000000-0000-4000-8000-000000000010'),
  '2025-10-01'::date,
  'initial setup stores the parent-authored birth date'
);
select lives_ok(
  $$ select public.complete_initial_family_profile(
       '12000000-0000-4000-8000-000000000010', 'Child', '2025-10-01') $$,
  'an exact setup replay is idempotent'
);
select throws_ok(
  $$ select public.complete_initial_family_profile(
       '12000000-0000-4000-8000-000000000010', 'Different child', '2025-10-01') $$,
  'P0001',
  'family profile is already configured',
  'setup cannot replace established child facts'
);

select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select public.complete_initial_family_profile(
       '12000000-0000-4000-8000-000000000010', 'Different child', '2025-10-01') $$,
  'P0001',
  'only the family creator can complete initial setup',
  'a co-parent cannot use setup to replace child facts'
);

select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select public.complete_initial_family_profile(
       '12000000-0000-4000-8000-000000000020', 'Child', '2025-10-01') $$,
  'creator can finish a legacy name-only profile'
);
select is(
  (select baby_birthday from public.families where id = '12000000-0000-4000-8000-000000000020'),
  '2025-10-01'::date,
  'name-only completion fills the missing birth date'
);
select lives_ok(
  $$ select public.complete_initial_family_profile(
       '12000000-0000-4000-8000-000000000030', 'Child', '2025-10-01') $$,
  'creator can finish a legacy birthday-only profile'
);
select is(
  (select baby_name from public.families where id = '12000000-0000-4000-8000-000000000030'),
  'Child',
  'birthday-only completion fills the missing child name'
);
select throws_ok(
  $$ select public.complete_initial_family_profile(
       '12000000-0000-4000-8000-000000000040', 'Child', '2025-10-01') $$,
  '55000',
  'family account deletion is in progress',
  'initial setup cannot write through an account-deletion lock'
);
select is(
  (select baby_name from public.families where id = '12000000-0000-4000-8000-000000000040'),
  null::text,
  'a rejected deletion-locked setup leaves the profile unchanged'
);

select * from finish();
rollback;
