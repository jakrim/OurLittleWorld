begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(40);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'context-parent-one@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'context-parent-two@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'context-circle@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'context-lapsed@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

insert into public.families (id, name, baby_name, baby_birthday, created_by) values
  ('40000000-0000-4000-8000-000000000010', 'Context family', 'Baby', '2025-07-23', '40000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000020', 'Lapsed context family', 'Baby', '2025-07-23', '40000000-0000-4000-8000-000000000004');

insert into public.family_members (family_id, user_id, display_name, relationship_label, role) values
  ('40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000001', 'Alex Parent', 'Mama', 'creator'),
  ('40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000002', 'Sam Parent', 'Papa', 'partner'),
  ('40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000003', 'Grandparent', 'Grandparent', 'circle'),
  ('40000000-0000-4000-8000-000000000020', '40000000-0000-4000-8000-000000000004', 'Lapsed Parent', 'Parent', 'creator');

insert into public.family_entitlements (family_id, status, source, expires_at) values
  ('40000000-0000-4000-8000-000000000010', 'active', 'admin', now() + interval '30 days'),
  ('40000000-0000-4000-8000-000000000020', 'expired', 'stripe', now() - interval '1 day');

insert into public.family_ritual_settings (family_id, timezone) values
  ('40000000-0000-4000-8000-000000000010', 'America/New_York');

insert into public.moments (id, family_id, author_user_id, title, captured_at, place_name, shared_with) values
  ('40000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000001', 'First original', '2025-08-14 14:00:00+00', 'Home', '["circle"]'::jsonb),
  ('40000000-0000-4000-8000-000000000102', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000002', 'Second original', '2025-08-14 14:01:00+00', 'Home', '[]'::jsonb),
  ('40000000-0000-4000-8000-000000000103', '40000000-0000-4000-8000-000000000020', '40000000-0000-4000-8000-000000000004', 'Lapsed memory', '2025-08-14 14:00:00+00', null, '[]'::jsonb);

insert into public.moment_media (id, moment_id, family_id, owner_user_id, media_type, upload_status) values
  ('40000000-0000-4000-8000-000000000201', '40000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000001', 'image', 'ready'),
  ('40000000-0000-4000-8000-000000000202', '40000000-0000-4000-8000-000000000102', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000002', 'image', 'ready');

insert into public.firsts (id, family_id, created_by_user_id, title, happened_at, done) values
  ('40000000-0000-4000-8000-000000000301', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000001', 'Rolled over', '2025-08-02 12:00:00+00', true);

select has_table('public', 'moment_annotations', 'separately authored annotations are durable');
select has_table('public', 'moment_context_facts', 'source-linked context facts are durable');
select has_table('public', 'saved_event_groups', 'saved event groups are durable');
select has_table('public', 'saved_event_memberships', 'saved originals retain separate memberships');

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.moment_annotations (id, family_id, moment_id, author_user_id, annotation_type, body) values
  ('40000000-0000-4000-8000-000000000401', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000001', 'text', 'Alex remembers this');
select is((select count(*) from public.moment_annotations where moment_id = '40000000-0000-4000-8000-000000000101'), 1::bigint, 'first parent can add context');
select is((select author_user_id from public.moment_annotations where id = '40000000-0000-4000-8000-000000000401'), '40000000-0000-4000-8000-000000000001'::uuid, 'text keeps its writer attribution');
insert into public.moment_annotations (id, family_id, moment_id, author_user_id, annotation_type, body) values
  ('40000000-0000-4000-8000-000000000401', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000001', 'text', 'Alex remembers this')
on conflict (id) do update set body = excluded.body;
select is((select count(*) from public.moment_annotations where id = '40000000-0000-4000-8000-000000000401'), 1::bigint, 'annotation retry identity is idempotent');

select lives_ok(
  $$ select public.register_saved_media_fingerprint('40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000201', 'content-md5-v1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') $$,
  'first parent can register a ready already-saved original'
);

reset role;
select is((select count(*) from public.moment_context_facts where moment_id = '40000000-0000-4000-8000-000000000101'), 1::bigint, 'confirmed nearby First creates a context edge');
select is((select model_version from public.moment_context_facts where moment_id = '40000000-0000-4000-8000-000000000101'), 'grounded-context-v1', 'context edges retain their model version');
select is((select f.title from public.moment_context_facts mcf join public.firsts f on f.id = mcf.source_id where mcf.moment_id = '40000000-0000-4000-8000-000000000101'), 'Rolled over', 'context reads the current source title');
update public.firsts set done = false where id = '40000000-0000-4000-8000-000000000301';
select is((select count(*) from public.moment_context_facts where source_id = '40000000-0000-4000-8000-000000000301'), 0::bigint, 'dismissing a First invalidates its context edges');
update public.firsts set done = true where id = '40000000-0000-4000-8000-000000000301';
select is((select count(*) from public.moment_context_facts where source_id = '40000000-0000-4000-8000-000000000301'), 2::bigint, 'reconfirming a First restores only qualifying moment edges');
update public.firsts set happened_at = '2024-01-01 12:00:00+00' where id = '40000000-0000-4000-8000-000000000301';
select is((select count(*) from public.moment_context_facts where source_id = '40000000-0000-4000-8000-000000000301'), 0::bigint, 'changing a source date invalidates the old window');
update public.firsts set happened_at = '2025-08-02 12:00:00+00' where id = '40000000-0000-4000-8000-000000000301';
select is((select count(*) from public.moment_context_facts where source_id = '40000000-0000-4000-8000-000000000301'), 2::bigint, 'restoring a source date rebuilds the window');

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000002', true);
insert into public.moment_annotations (id, family_id, moment_id, author_user_id, annotation_type, body) values
  ('40000000-0000-4000-8000-000000000402', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000002', 'text', 'Sam remembers this');
select is((select count(distinct author_user_id) from public.moment_annotations where moment_id = '40000000-0000-4000-8000-000000000101'), 2::bigint, 'two parents keep separate authored text');

insert into public.voice_notes (id, family_id, moment_id, author_user_id, duration_sec, waveform, audio_object, mime_type, upload_status) values
  ('40000000-0000-4000-8000-000000000501', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000002', 8, '[0.2,0.6]'::jsonb, '40000000-0000-4000-8000-000000000502', 'audio/mp4', 'ready');
insert into public.moment_annotations (id, family_id, moment_id, author_user_id, annotation_type, voice_note_id) values
  ('40000000-0000-4000-8000-000000000403', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000002', 'voice', '40000000-0000-4000-8000-000000000501');
select is((select voice_note_id from public.moment_annotations where id = '40000000-0000-4000-8000-000000000403'), '40000000-0000-4000-8000-000000000501'::uuid, 'voice annotation reuses a canonical authored voice note');
select throws_ok(
  $$ insert into public.moment_annotations (id, family_id, moment_id, author_user_id, annotation_type, voice_note_id) values ('40000000-0000-4000-8000-000000000404', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000102', '40000000-0000-4000-8000-000000000002', 'voice', '40000000-0000-4000-8000-000000000501') $$,
  'P0001', 'Voice note is not a ready authored note for this moment', 'voice cannot be attached across moments'
);
update public.moment_annotations set body = 'Partner overwrite' where id = '40000000-0000-4000-8000-000000000401';
select is((select body from public.moment_annotations where id = '40000000-0000-4000-8000-000000000401'), 'Alex remembers this', 'one writer cannot overwrite the other writer context');
select lives_ok(
  $$ select public.register_saved_media_fingerprint('40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000102', '40000000-0000-4000-8000-000000000202', 'content-md5-v1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') $$,
  'second parent can register the same saved content independently'
);
select is((select count(*) from public.list_saved_event_companions('40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000101', 12)), 2::bigint, 'shared event presentation returns both saved originals');
select is((select count(distinct moment_id) from public.list_saved_event_companions('40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000101', 12)), 2::bigint, 'grouping never merges away either moment');
select lives_ok(
  $$ select public.register_saved_media_fingerprint('40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000102', '40000000-0000-4000-8000-000000000202', 'content-md5-v1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') $$,
  'repeated post-save registration is idempotent'
);
reset role;
select is((select count(*) from public.saved_event_groups where family_id = '40000000-0000-4000-8000-000000000010'), 1::bigint, 'exact matches share one event group');
select is((select count(*) from public.saved_event_memberships where family_id = '40000000-0000-4000-8000-000000000010'), 2::bigint, 'group keeps two original memberships');

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.saved_event_groups), 0::bigint, 'raw saved fingerprints have no direct client read policy');

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.moment_annotations where moment_id = '40000000-0000-4000-8000-000000000101'), 3::bigint, 'Circle sees annotations only on an explicitly shared moment');
select is((select count(*) from public.moment_context_facts where moment_id = '40000000-0000-4000-8000-000000000101'), 1::bigint, 'Circle sees grounded context only on an explicitly shared moment');
select throws_ok(
  $$ select public.list_saved_event_companions('40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000101', 12) $$,
  'P0001', 'Family writer required', 'Circle cannot discover writer-only grouping across unshared originals'
);
select throws_like(
  $$ insert into public.moment_annotations (id, family_id, moment_id, author_user_id, annotation_type, body) values ('40000000-0000-4000-8000-000000000405', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000003', 'text', 'Circle write') $$,
  '%row-level security%', 'Circle cannot add annotations'
);

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.moments where family_id = '40000000-0000-4000-8000-000000000020'), 1::bigint, 'lapsed writer retains read-only archive access');
select throws_like(
  $$ insert into public.moment_annotations (id, family_id, moment_id, author_user_id, annotation_type, body) values ('40000000-0000-4000-8000-000000000406', '40000000-0000-4000-8000-000000000020', '40000000-0000-4000-8000-000000000103', '40000000-0000-4000-8000-000000000004', 'text', 'Lapsed write') $$,
  '%row-level security%', 'lapsed writer cannot add annotations'
);

reset role;
select ok(exists(
  select 1 from public.collection_memberships cm join public.collections c on c.id = cm.collection_id
  where cm.moment_id = '40000000-0000-4000-8000-000000000101' and c.collection_key = 'life:first-year'
), 'first-year collection exists before birthday source changes');
update public.families set baby_birthday = '2026-07-23' where id = '40000000-0000-4000-8000-000000000010';
select ok(not exists(
  select 1 from public.collection_memberships cm join public.collections c on c.id = cm.collection_id
  where cm.moment_id = '40000000-0000-4000-8000-000000000101' and c.collection_key = 'life:first-year'
), 'birthday changes invalidate dependent collection facts');

delete from public.voice_notes where id = '40000000-0000-4000-8000-000000000501';
select is((select count(*) from public.moment_annotations where id = '40000000-0000-4000-8000-000000000403'), 0::bigint, 'deleting canonical voice cascades its voice annotation');
delete from public.moments where id = '40000000-0000-4000-8000-000000000102';
select is((select count(*) from public.saved_event_memberships where family_id = '40000000-0000-4000-8000-000000000010'), 1::bigint, 'deleting one duplicate preserves the other original');
delete from public.moments where id = '40000000-0000-4000-8000-000000000101';
select is((select count(*) from public.saved_event_groups where family_id = '40000000-0000-4000-8000-000000000010'), 0::bigint, 'deleting the last original cleans the empty group');
select is((select count(*) from public.moment_annotations where family_id = '40000000-0000-4000-8000-000000000010'), 0::bigint, 'moment deletion cascades authored annotations');
select ok(not exists(
  select 1 from information_schema.columns
  where table_schema = 'public'
    and table_name in ('moment_annotations', 'moment_context_facts', 'saved_event_groups', 'saved_event_memberships')
    and column_name in ('asset_id', 'local_identifier', 'face_data', 'identity_score', 'draft_text', 'draft_voice_uri')
), 'shared enrichment schema contains no private candidate, device asset, face, or draft fields');
select is((select count(*) from public.moment_context_facts where family_id = '40000000-0000-4000-8000-000000000010'), 0::bigint, 'moment deletion cascades source-linked context edges');

select * from finish();
rollback;
