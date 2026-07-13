begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000101',
    'authenticated',
    'authenticated',
    'writer-circle-rls@example.test',
    '',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000102',
    'authenticated',
    'authenticated',
    'circle-rls@example.test',
    '',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  )
on conflict (id) do nothing;

insert into public.families (id, name, baby_name, created_by)
values (
  '00000000-0000-4000-8000-000000000001',
  'Circle RLS family',
  'Test baby',
  '00000000-0000-4000-8000-000000000101'
);

insert into public.family_members (family_id, user_id, display_name, role)
values
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'Writer',
    'creator'
  ),
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000102',
    'Grandparent',
    'circle'
  );

insert into public.moments (
  id,
  family_id,
  author_user_id,
  title,
  captured_at,
  shared_with
) values
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'Private day',
    '2026-07-01 12:00:00+00',
    '[]'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'Shared day',
    '2026-07-02 12:00:00+00',
    '["circle"]'::jsonb
  );

insert into public.moment_media (
  id,
  moment_id,
  family_id,
  owner_user_id,
  media_type,
  metadata
) values
  (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'image',
    '{"thumbPath":"00000000-0000-4000-8000-000000000001/moments/00000000-0000-4000-8000-000000000201/image-thumb/private.jpg"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'image',
    '{"thumbPath":"00000000-0000-4000-8000-000000000001/moments/00000000-0000-4000-8000-000000000202/image-thumb/shared.jpg"}'::jsonb
  );

insert into public.firsts (
  id,
  family_id,
  created_by_user_id,
  title,
  happened_at,
  moment_id,
  shared_with
) values
  (
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'Private first',
    '2026-07-01 12:00:00+00',
    null,
    '[]'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'Linked shared first',
    '2026-07-02 12:00:00+00',
    '00000000-0000-4000-8000-000000000202',
    '[]'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000403',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'Explicit circle first',
    '2026-07-03 12:00:00+00',
    null,
    '["circle"]'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000404',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'Linked private first',
    '2026-07-04 12:00:00+00',
    '00000000-0000-4000-8000-000000000201',
    '[]'::jsonb
  );

insert into public.weekly_digests (
  id,
  family_id,
  week_start,
  week_end,
  headline,
  shared_with
) values
  (
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000001',
    '2026-06-28',
    '2026-07-04',
    'Private week',
    '[]'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000001',
    '2026-07-05',
    '2026-07-11',
    'Shared week',
    '["circle"]'::jsonb
  );

insert into public.letters (
  id,
  family_id,
  author_user_id,
  title,
  body,
  open_on,
  sealed_at
) values (
  '00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101',
  'Private letter',
  'A writer-only letter.',
  null,
  null
);

insert into public.moment_media (
  id,
  letter_id,
  family_id,
  owner_user_id,
  media_type,
  metadata
) values (
  '00000000-0000-4000-8000-000000000602',
  '00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101',
  'image',
  '{"thumbPath":"00000000-0000-4000-8000-000000000001/letters/00000000-0000-4000-8000-000000000601/image-thumb/private.jpg"}'::jsonb
);

insert into public.voice_notes (
  id,
  family_id,
  letter_id,
  author_user_id,
  duration_sec,
  audio_object,
  mime_type,
  upload_status
) values (
  '00000000-0000-4000-8000-000000000603',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-000000000101',
  12,
  '00000000-0000-4000-8000-000000000604',
  'audio/mp4',
  'ready'
);

insert into public.daily_prompt_responses (
  id,
  family_id,
  prompt_date,
  prompt_key,
  prompt_text,
  author_user_id,
  response_text
) values (
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000001',
  '2026-07-02',
  'test-prompt',
  'What happened?',
  '00000000-0000-4000-8000-000000000101',
  'A writer-only answer.'
);

insert into public.memories (
  id,
  family_id,
  asset_owner_user_id,
  asset_id,
  author_user_id,
  note
) values (
  '00000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101',
  'asset-private',
  '00000000-0000-4000-8000-000000000101',
  'A writer-only memory note.'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from public.moments where family_id = '00000000-0000-4000-8000-000000000001'),
  1::bigint,
  'circle sees only moments shared with circle'
);

select is(
  (select max(title) from public.moments where family_id = '00000000-0000-4000-8000-000000000001'),
  'Shared day',
  'circle sees the selected moment title'
);

select is(
  (select count(*) from public.moment_media where family_id = '00000000-0000-4000-8000-000000000001'),
  1::bigint,
  'circle sees media only for shared moments'
);

select is(
  (select count(*) from public.moment_media where letter_id = '00000000-0000-4000-8000-000000000601'),
  0::bigint,
  'circle cannot read media attached to letters'
);

select is(
  (select count(*) from public.voice_notes where letter_id = '00000000-0000-4000-8000-000000000601'),
  0::bigint,
  'circle cannot read voice attached to letters'
);

select is(
  (select count(*) from public.firsts where family_id = '00000000-0000-4000-8000-000000000001'),
  2::bigint,
  'circle sees selected firsts and firsts linked to shared moments'
);

select ok(
  not exists (
    select 1 from public.firsts
    where family_id = '00000000-0000-4000-8000-000000000001'
      and title in ('Private first', 'Linked private first')
  ),
  'circle does not see unshared firsts'
);

select is(
  (select count(*) from public.weekly_digests where family_id = '00000000-0000-4000-8000-000000000001'),
  1::bigint,
  'circle sees only shared weekly digests'
);

select is(
  (select max(headline) from public.weekly_digests where family_id = '00000000-0000-4000-8000-000000000001'),
  'Shared week',
  'circle sees the selected digest headline'
);

select is(
  (select count(*) from public.letters where family_id = '00000000-0000-4000-8000-000000000001'),
  0::bigint,
  'circle cannot read letters'
);

select is(
  (select count(*) from public.daily_prompt_responses where family_id = '00000000-0000-4000-8000-000000000001'),
  0::bigint,
  'circle cannot read prompt answers'
);

select is(
  (select count(*) from public.memories where family_id = '00000000-0000-4000-8000-000000000001'),
  0::bigint,
  'circle cannot read unshared memory notes'
);

select throws_ok(
  $$
    insert into public.moments (
      id,
      family_id,
      author_user_id,
      title,
      captured_at
    ) values (
      '00000000-0000-4000-8000-000000000901',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000102',
      'Circle write attempt',
      now()
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "moments"',
  'circle cannot insert moments'
);

select throws_ok(
  $$
    insert into public.firsts (
      id,
      family_id,
      created_by_user_id,
      title
    ) values (
      '00000000-0000-4000-8000-000000000902',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000102',
      'Circle first attempt'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "firsts"',
  'circle cannot insert firsts'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from public.moments where family_id = '00000000-0000-4000-8000-000000000001'),
  2::bigint,
  'writer sees all moments'
);

select is(
  (select count(*) from public.firsts where family_id = '00000000-0000-4000-8000-000000000001'),
  4::bigint,
  'writer sees all firsts'
);

select is(
  (select count(*) from public.weekly_digests where family_id = '00000000-0000-4000-8000-000000000001'),
  2::bigint,
  'writer sees all weekly digests'
);

select is(
  (select count(*) from public.letters where family_id = '00000000-0000-4000-8000-000000000001'),
  1::bigint,
  'writer sees letters'
);

select is(
  (select count(*) from public.moment_media where letter_id = '00000000-0000-4000-8000-000000000601'),
  1::bigint,
  'writer sees media attached to letters'
);

select is(
  (select count(*) from public.voice_notes where letter_id = '00000000-0000-4000-8000-000000000601'),
  1::bigint,
  'writer sees voice attached to letters'
);

select is(
  (select count(*) from public.daily_prompt_responses where family_id = '00000000-0000-4000-8000-000000000001'),
  1::bigint,
  'writer sees prompt answers'
);

select is(
  (select count(*) from public.memories where family_id = '00000000-0000-4000-8000-000000000001'),
  1::bigint,
  'writer sees memory notes'
);

reset role;
select * from finish();

rollback;
