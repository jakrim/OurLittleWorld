begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(22);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'collections-writer@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'collections-circle@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'collections-lapsed@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

insert into public.families (id, name, baby_name, baby_birthday, created_by) values
  ('30000000-0000-4000-8000-000000000010', 'Collections family', 'Baby', '2025-07-23',
   '30000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000020', 'Lapsed collections family', 'Baby', '2025-07-23',
   '30000000-0000-4000-8000-000000000003');

insert into public.family_members (family_id, user_id, display_name, role) values
  ('30000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000001', 'Alex', 'creator'),
  ('30000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000002', 'Grandparent', 'circle'),
  ('30000000-0000-4000-8000-000000000020', '30000000-0000-4000-8000-000000000003', 'Lapsed parent', 'creator');

insert into public.family_entitlements (family_id, status, source, expires_at) values
  ('30000000-0000-4000-8000-000000000010', 'active', 'admin', now() + interval '30 days'),
  ('30000000-0000-4000-8000-000000000020', 'expired', 'stripe', now() - interval '1 day');

insert into public.family_ritual_settings (family_id, timezone)
values ('30000000-0000-4000-8000-000000000010', 'America/New_York');

insert into public.moments (
  id, family_id, author_user_id, title, captured_at, place_name, latitude, longitude
) values (
  '30000000-0000-4000-8000-000000000101', '30000000-0000-4000-8000-000000000010',
  '30000000-0000-4000-8000-000000000001', 'A kept memory', '2025-08-14 14:00:00+00',
  'Central Park', 40.7812, -73.9665
);

select has_table('public', 'collections', 'collections are durable shared records');
select has_table('public', 'collection_memberships', 'collection memberships are durable shared records');
select is(
  (select count(*) from public.collection_memberships where moment_id = '30000000-0000-4000-8000-000000000101'),
  5::bigint,
  'moment insertion derives year, month, first-year, author and safe place facts'
);

insert into public.moment_media (id, moment_id, family_id, owner_user_id, media_type, upload_status)
values ('30000000-0000-4000-8000-000000000201', '30000000-0000-4000-8000-000000000101',
  '30000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000001', 'image', 'ready');
select ok(exists(
  select 1 from public.collection_memberships cm join public.collections c on c.id = cm.collection_id
  where cm.moment_id = '30000000-0000-4000-8000-000000000101' and c.collection_key = 'media:photos'
), 'kept image derives the Photos collection');

insert into public.voice_notes (id, family_id, moment_id, author_user_id, duration_sec, upload_status)
values ('30000000-0000-4000-8000-000000000301', '30000000-0000-4000-8000-000000000010',
  '30000000-0000-4000-8000-000000000101', '30000000-0000-4000-8000-000000000001', 7, 'ready');
select ok(exists(
  select 1 from public.collection_memberships cm join public.collections c on c.id = cm.collection_id
  where cm.moment_id = '30000000-0000-4000-8000-000000000101' and c.collection_key = 'media:voice'
), 'voice note derives a Voice notes collection');

insert into public.firsts (id, family_id, created_by_user_id, title, happened_at, moment_id, done)
values ('30000000-0000-4000-8000-000000000401', '30000000-0000-4000-8000-000000000010',
  '30000000-0000-4000-8000-000000000001', 'A confirmed first', '2025-08-14 14:00:00+00',
  '30000000-0000-4000-8000-000000000101', true);
select ok(exists(
  select 1 from public.collection_memberships cm join public.collections c on c.id = cm.collection_id
  where cm.moment_id = '30000000-0000-4000-8000-000000000101' and c.collection_key = 'firsts:confirmed'
), 'only a confirmed First derives the Firsts collection');

insert into public.moment_reactions (id, family_id, moment_id, author_user_id, emoji) values
  ('30000000-0000-4000-8000-000000000501', '30000000-0000-4000-8000-000000000010',
   '30000000-0000-4000-8000-000000000101', '30000000-0000-4000-8000-000000000001', 'heart'),
  ('30000000-0000-4000-8000-000000000502', '30000000-0000-4000-8000-000000000010',
   '30000000-0000-4000-8000-000000000101', '30000000-0000-4000-8000-000000000001', 'spark');
select ok(exists(
  select 1 from public.collection_memberships cm join public.collections c on c.id = cm.collection_id
  where cm.moment_id = '30000000-0000-4000-8000-000000000101' and c.collection_key = 'reaction:favorites'
), 'explicit Tonight favorite derives Favorites');
select ok(exists(
  select 1 from public.collection_memberships cm join public.collections c on c.id = cm.collection_id
  where cm.moment_id = '30000000-0000-4000-8000-000000000101' and c.collection_key = 'reaction:family'
), 'non-favorite reactions derive Family reactions');
select ok(exists(
  select 1 from public.collections where family_id = '30000000-0000-4000-8000-000000000010'
    and kind = 'place' and title = 'Central Park' and source_ref = 'central park'
), 'parent-entered safe place label becomes a factual collection');
select ok(not exists(
  select 1 from public.collections where family_id = '30000000-0000-4000-8000-000000000010'
    and (source_ref like '%40.7812%' or source_ref like '%-73.9665%' or title like '%40.7812%')
), 'raw coordinates never enter collection labels or provenance');

insert into public.media_import_calibrations (family_id, user_id, corrections)
values ('30000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000001', '[{"kept":"unchanged"}]'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select public.apply_moment_collection_choices(
    '30000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000101',
    array['media:photos'], array[]::text[]
  ) $$,
  'writer can reverse a selected-by-default factual suggestion'
);
select is((
  select cm.parent_override from public.collection_memberships cm join public.collections c on c.id = cm.collection_id
  where cm.moment_id = '30000000-0000-4000-8000-000000000101' and c.collection_key = 'media:photos'
), 'excluded', 'parent correction is stored explicitly');

select public.refresh_moment_factual_collections('30000000-0000-4000-8000-000000000101');
select is((
  select cm.parent_override from public.collection_memberships cm join public.collections c on c.id = cm.collection_id
  where cm.moment_id = '30000000-0000-4000-8000-000000000101' and c.collection_key = 'media:photos'
), 'excluded', 'derived refresh preserves the parent correction');

select lives_ok(
  $$ select public.set_collection_membership_visible(
    '30000000-0000-4000-8000-000000000010',
    (select id from public.collections where family_id = '30000000-0000-4000-8000-000000000010' and collection_key = 'media:photos'),
    '30000000-0000-4000-8000-000000000101', true
  ) $$,
  'writer can undo a collection correction'
);
select is((select corrections from public.media_import_calibrations
  where family_id = '30000000-0000-4000-8000-000000000010' and user_id = '30000000-0000-4000-8000-000000000001'),
  '[{"kept": "unchanged"}]'::jsonb,
  'category corrections never alter child-identity calibration');

reset role;
delete from public.firsts where id = '30000000-0000-4000-8000-000000000401';
select ok(not exists(
  select 1 from public.collection_memberships cm join public.collections c on c.id = cm.collection_id
  where cm.moment_id = '30000000-0000-4000-8000-000000000101' and c.collection_key = 'firsts:confirmed'
), 'deleting the source First invalidates its membership');
delete from public.moment_reactions where id = '30000000-0000-4000-8000-000000000502';
select ok(not exists(
  select 1 from public.collection_memberships cm join public.collections c on c.id = cm.collection_id
  where cm.moment_id = '30000000-0000-4000-8000-000000000101' and c.collection_key = 'reaction:family'
), 'deleting the source reaction invalidates its membership');

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.family_collection_summaries
  where family_id = '30000000-0000-4000-8000-000000000010'), 0::bigint,
  'Circle cannot discover private archive collections');
select throws_ok(
  $$ select public.apply_moment_collection_choices(
    '30000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000101',
    array['media:photos'], array['media:photos']
  ) $$,
  'P0001', 'Active family writer required', 'Circle cannot correct collection membership');

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ select public.apply_moment_collection_choices(
    '30000000-0000-4000-8000-000000000020', '30000000-0000-4000-8000-000000000101',
    array[]::text[], array[]::text[]
  ) $$,
  'P0001', 'Active family writer required', 'lapsed writer cannot mutate collection state');

reset role;
delete from public.moments where id = '30000000-0000-4000-8000-000000000101';
select is((select count(*) from public.collection_memberships
  where moment_id = '30000000-0000-4000-8000-000000000101'), 0::bigint,
  'moment deletion cascades collection memberships');
select ok(not exists(
  select 1 from information_schema.columns where table_schema = 'public'
    and table_name in ('collections', 'collection_memberships')
    and column_name in ('asset_id', 'fingerprint', 'face_data', 'identity_score', 'draft_text', 'draft_voice_uri')
), 'shared collection schema contains no private candidate or draft fields');

select * from finish();
rollback;
