begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(84);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'atomic-parent-one@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'atomic-parent-two@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

insert into public.families (id, name, baby_name, created_by) values
  ('a1000000-0000-4000-8000-000000000001', 'Atomic active family', 'Child', 'a0000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000002', 'Atomic legacy family', 'Child', 'a0000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000003', 'Atomic other family', 'Child', 'a0000000-0000-4000-8000-000000000002'),
  ('a1000000-0000-4000-8000-000000000004', 'Atomic lapsed family', 'Child', 'a0000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000005', 'Atomic deletion family', 'Child', 'a0000000-0000-4000-8000-000000000001');

insert into public.family_members (family_id, user_id, role) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'creator'),
  ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'creator'),
  ('a1000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002', 'creator'),
  ('a1000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'creator'),
  ('a1000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'creator');

insert into public.family_entitlements (family_id, status, source, expires_at) values
  ('a1000000-0000-4000-8000-000000000001', 'active', 'admin', now() + interval '30 days'),
  ('a1000000-0000-4000-8000-000000000002', 'active', 'admin', now() + interval '30 days'),
  ('a1000000-0000-4000-8000-000000000003', 'active', 'admin', now() + interval '30 days'),
  ('a1000000-0000-4000-8000-000000000004', 'expired', 'stripe', now() - interval '1 day'),
  ('a1000000-0000-4000-8000-000000000005', 'active', 'admin', now() + interval '30 days');

insert into public.account_deletion_requests (
  id, requester_user_id, status, reauthenticated_at
) values (
  'a2000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'prepared',
  now()
);
insert into public.account_deletion_family_locks (
  family_id, request_id, requester_user_id, expires_at
) values (
  'a1000000-0000-4000-8000-000000000005',
  'a2000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  now() + interval '30 minutes'
);

insert into public.media_upload_reservations (
  id, family_id, user_id, media_type, quota_class, reserved_bytes, reserved_seconds,
  status, canonical_media_id, transport, provider, provider_object_id, expires_at
) values
  ('b0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'image', 'optimized', 100, 0, 'reserved', 'e0000000-0000-4000-8000-000000000001', 'image', null, null, now() + interval '1 hour'),
  ('b0000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'image', 'optimized', 40, 0, 'reserved', 'e0000000-0000-4000-8000-000000000002', 'image', null, null, now() + interval '1 hour'),
  ('b0000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'image', 'optimized', 41, 0, 'reserved', 'e0000000-0000-4000-8000-000000000003', 'image', null, null, now() + interval '1 hour'),
  ('b0000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'image', 'optimized', 42, 0, 'reserved', 'e0000000-0000-4000-8000-000000000004', 'image', null, null, now() + interval '1 hour'),
  ('b0000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'image', 'optimized', 43, 0, 'reserved', 'e0000000-0000-4000-8000-000000000005', 'image', null, null, now() + interval '1 hour'),
  ('b0000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'image', 'optimized', 44, 0, 'reserved', 'e0000000-0000-4000-8000-000000000006', 'image', null, null, now() + interval '1 hour'),
  ('b0000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'image', 'optimized', 45, 0, 'reserved', 'e0000000-0000-4000-8000-000000000007', 'image', null, null, now() + interval '1 hour'),
  ('b0000000-0000-4000-8000-000000000008', 'a1000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'image', 'optimized', 46, 0, 'reserved', 'e0000000-0000-4000-8000-000000000008', 'image', null, null, now() + interval '1 hour'),
  ('b0000000-0000-4000-8000-000000000009', 'a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'image', 'optimized', 60, 0, 'finalized', 'e0000000-0000-4000-8000-000000000009', 'image', null, null, now() + interval '1 hour'),
  ('b0000000-0000-4000-8000-000000000010', 'a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'video', 'optimized', 200, 10, 'reserved', 'e0000000-0000-4000-8000-000000000010', 'video-stream', 'stream', 'stream-unconfirmed', now() + interval '1 hour'),
  ('b0000000-0000-4000-8000-000000000011', 'a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'video', 'optimized', 200, 10, 'reserved', 'e0000000-0000-4000-8000-000000000011', 'video-stream', 'stream', 'stream-confirmed', now() + interval '1 hour'),
  ('b0000000-0000-4000-8000-000000000012', 'a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'video', 'optimized', 300, 12, 'reserved', 'e0000000-0000-4000-8000-000000000012', 'video-direct', null, null, now() + interval '1 hour'),
  ('b0000000-0000-4000-8000-000000000013', 'a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'image', 'optimized', 50, 0, 'reserved', 'e0000000-0000-4000-8000-000000000013', 'video-poster', null, null, now() + interval '1 hour'),
  ('b0000000-0000-4000-8000-000000000014', 'a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'image', 'optimized', 70, 0, 'reserved', 'e0000000-0000-4000-8000-000000000014', 'image', null, null, now() + interval '1 hour'),
  ('b0000000-0000-4000-8000-000000000015', 'a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'image', 'optimized', 80, 0, 'reserved', 'e0000000-0000-4000-8000-000000000015', 'image', null, null, now() + interval '1 hour'),
  ('b0000000-0000-4000-8000-000000000016', 'a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'image', 'optimized', 90, 0, 'reserved', 'e0000000-0000-4000-8000-000000000016', 'image', null, null, now() + interval '1 hour'),
  ('b0000000-0000-4000-8000-000000000017', 'a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'video', 'optimized', 200, 10, 'reserved', 'e0000000-0000-4000-8000-000000000017', 'video-stream', 'stream', 'stream-rollback', now() + interval '1 hour');

insert into public.family_storage_usage (
  family_id, optimized_media_bytes, image_count, object_count
) values ('a1000000-0000-4000-8000-000000000002', 60, 1, 1);

insert into public.moments (id, family_id, author_user_id, captured_at, shared_with) values (
  'd0000000-0000-4000-8000-000000000009', 'a1000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000001', now(), '[]'::jsonb
);
insert into public.moment_media (
  id, moment_id, family_id, owner_user_id, media_type, local_identifier, mime_type,
  full_object, thumb_object, width, height, metadata, upload_status, storage_provider,
  optimized_bytes, quota_class
) values (
  'e0000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000009',
  'a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
  'image', 'f0000000-0000-4000-8000-000000000009', 'image/jpeg',
  'c0000000-0000-4000-8000-000000000019', 'c0000000-0000-4000-8000-000000000029',
  1200, 900, '{"source":"legacy-exact-repair"}'::jsonb, 'ready', 'supabase', 60, 'optimized'
);

insert into storage.objects (id, bucket_id, name, owner_id) values
  ('90000000-0000-4000-8000-000000000001', 'family-photos', 'a1000000-0000-4000-8000-000000000001/full/c0000000-0000-4000-8000-000000000001.jpg', 'a0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000002', 'family-photos', 'a1000000-0000-4000-8000-000000000001/thumb/c0000000-0000-4000-8000-000000000011.jpg', 'a0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000003', 'family-photos', 'a1000000-0000-4000-8000-000000000001/full/c0000000-0000-4000-8000-000000000003.jpg', 'a0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000004', 'family-photos', 'a1000000-0000-4000-8000-000000000001/thumb/c0000000-0000-4000-8000-000000000013.jpg', 'a0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000005', 'family-photos', 'a1000000-0000-4000-8000-000000000001/full/c0000000-0000-4000-8000-000000000005.jpg', 'a0000000-0000-4000-8000-000000000002'),
  ('90000000-0000-4000-8000-000000000006', 'family-photos', 'a1000000-0000-4000-8000-000000000001/thumb/c0000000-0000-4000-8000-000000000015.jpg', 'a0000000-0000-4000-8000-000000000002'),
  ('90000000-0000-4000-8000-000000000007', 'family-photos', 'a1000000-0000-4000-8000-000000000001/full/c0000000-0000-4000-8000-000000000006.jpg', 'a0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000008', 'family-photos', 'a1000000-0000-4000-8000-000000000001/thumb/c0000000-0000-4000-8000-000000000016.jpg', 'a0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000009', 'family-photos', 'a1000000-0000-4000-8000-000000000002/full/c0000000-0000-4000-8000-000000000019.jpg', 'a0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000010', 'family-photos', 'a1000000-0000-4000-8000-000000000002/thumb/c0000000-0000-4000-8000-000000000029.jpg', 'a0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000011', 'family-photos', 'a1000000-0000-4000-8000-000000000001/moments/d0000000-0000-4000-8000-000000000012/video/c0000000-0000-4000-8000-000000000012.mp4', 'a0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000012', 'family-photos', 'a1000000-0000-4000-8000-000000000001/moments/d0000000-0000-4000-8000-000000000013/video-poster/c0000000-0000-4000-8000-000000000013.jpg', 'a0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000013', 'family-photos', 'a1000000-0000-4000-8000-000000000001/full/c0000000-0000-4000-8000-000000000014.jpg', 'a0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000014', 'family-photos', 'a1000000-0000-4000-8000-000000000001/thumb/c0000000-0000-4000-8000-000000000024.jpg', 'a0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000015', 'family-photos', 'a1000000-0000-4000-8000-000000000001/full/c0000000-0000-4000-8000-000000000015.jpg', 'a0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000016', 'family-photos', 'a1000000-0000-4000-8000-000000000001/thumb/c0000000-0000-4000-8000-000000000025.jpg', 'a0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000017', 'family-photos', 'a1000000-0000-4000-8000-000000000001/full/c0000000-0000-4000-8000-000000000016.jpg', 'a0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000018', 'family-photos', 'a1000000-0000-4000-8000-000000000001/thumb/c0000000-0000-4000-8000-000000000026.jpg', 'a0000000-0000-4000-8000-000000000001');

create function pg_temp.publish_image(
  reservation_id uuid, family_id uuid, moment_id uuid, media_id uuid, asset_id uuid,
  full_id uuid, thumb_id uuid, metadata jsonb default '{"source":"atomic-test"}'::jsonb,
  actual_bytes bigint default null
) returns boolean language plpgsql as $$
declare replay boolean;
begin
  select result.already_published into replay
  from public.finalize_canonical_media_keep(
    family_id, reservation_id, 'image', moment_id, media_id, asset_id::text,
    now(), now(), now(), null, null, null, null, 'image/jpeg', full_id, thumb_id, null,
    family_id::text || '/full/' || full_id::text || '.jpg',
    family_id::text || '/thumb/' || thumb_id::text || '.jpg', null,
    1200, 900, null, metadata, null, null, null, null, actual_bytes, null
  ) result;
  return replay;
end $$;

create function pg_temp.publish_stream(
  reservation_id uuid, moment_id uuid, media_id uuid, asset_id uuid, stream_uid text
) returns boolean language plpgsql as $$
declare replay boolean;
begin
  select result.already_published into replay
  from public.finalize_canonical_media_keep(
    'a1000000-0000-4000-8000-000000000001', reservation_id, 'video-stream',
    moment_id, media_id, asset_id::text, now(), now(), now(), null, null, null,
    'clip.mp4', 'video/mp4', null, null, null, null, null, null, 1920, 1080, 10,
    '{"source":"atomic-test"}'::jsonb, stream_uid, 200, 200, 10, 200, 10
  ) result;
  return replay;
end $$;

create function pg_temp.publish_direct() returns boolean language plpgsql as $$
declare replay boolean;
begin
  select result.already_published into replay
  from public.finalize_canonical_media_keep(
    'a1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000012',
    'video-direct', 'd0000000-0000-4000-8000-000000000012',
    'e0000000-0000-4000-8000-000000000012', 'f0000000-0000-4000-8000-000000000012',
    now(), now(), now(), null, null, null, 'clip.mp4', 'video/mp4',
    'c0000000-0000-4000-8000-000000000012', null, null,
    'a1000000-0000-4000-8000-000000000001/moments/d0000000-0000-4000-8000-000000000012/video/c0000000-0000-4000-8000-000000000012.mp4',
    null, null, 1920, 1080, 12, '{"source":"atomic-test"}'::jsonb, null,
    300, 300, 12, 300, 12
  ) result;
  return replay;
end $$;

create function pg_temp.publish_poster() returns boolean language plpgsql as $$
declare replay boolean;
begin
  select result.already_published into replay
  from public.finalize_canonical_media_keep(
    'a1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000013',
    'video-poster', 'd0000000-0000-4000-8000-000000000013',
    'e0000000-0000-4000-8000-000000000013', 'f0000000-0000-4000-8000-000000000013',
    now(), now(), now(), null, null, null, 'clip.mp4', 'video/mp4', null, null,
    'c0000000-0000-4000-8000-000000000013', null, null,
    'a1000000-0000-4000-8000-000000000001/moments/d0000000-0000-4000-8000-000000000013/video-poster/c0000000-0000-4000-8000-000000000013.jpg',
    1280, 720, 13, '{"source":"atomic-test","posterOnly":true}'::jsonb, null,
    null, 50, null, 50, null
  ) result;
  return replay;
end $$;

create function pg_temp.reject_atomic_tag() returns trigger language plpgsql as $$
begin
  if new.asset_id in (
    'f0000000-0000-4000-8000-000000000006',
    'f0000000-0000-4000-8000-000000000017'
  ) then
    raise exception 'injected tag failure';
  end if;
  return new;
end $$;
create trigger reject_atomic_tag before insert on public.photo_tags
for each row execute function pg_temp.reject_atomic_tag();

select has_function(
  'public', 'finalize_canonical_media_keep',
  array['uuid','uuid','text','uuid','uuid','text','timestamp with time zone','timestamp with time zone','timestamp with time zone','double precision','double precision','timestamp with time zone','text','text','uuid','uuid','uuid','text','text','text','integer','integer','numeric','jsonb','text','bigint','bigint','integer','bigint','integer'],
  'canonical Keep has one atomic publication RPC'
);
select is(has_function_privilege('authenticated', 'public.confirm_canonical_media_provider_upload(uuid,text,text)', 'EXECUTE'), false, 'clients cannot confirm provider acceptance');
select is(has_function_privilege('service_role', 'public.claim_canonical_media_upload_provider_object(uuid,text,text)', 'EXECUTE'), true, 'service Edge claim remains available during ordered cutover');
select ok(exists(select 1 from pg_constraint where conname='moment_media_moment_family_fkey' and contype='f'), 'fresh schema exposes the family-scoped moment-media relationship');
select ok(exists(select 1 from pg_constraint where conname='photo_tags_moment_family_fkey' and contype='f'), 'fresh schema exposes the family-scoped tag-moment relationship');
select ok(exists(select 1 from pg_constraint where conname='photo_tags_media_family_fkey' and contype='f'), 'fresh schema exposes the family-scoped tag-media relationship');
select is((select confdeltype from pg_constraint where conname='moment_media_moment_family_fkey'), 'c'::"char", 'moment deletion cascades its canonical media');
select is((select confdeltype from pg_constraint where conname='photo_tags_moment_family_fkey'), 'n'::"char", 'moment deletion nulls only the tag moment reference');
select is((select confdeltype from pg_constraint where conname='photo_tags_media_family_fkey'), 'n'::"char", 'media deletion nulls only the tag media reference');
select has_table('public', 'canonical_media_provider_publications', 'trusted provider publication proof exists');
select is((select relrowsecurity from pg_class where oid='public.canonical_media_provider_publications'::regclass), true, 'provider publication proof has RLS enabled');
select is((select count(*) from pg_policies where schemaname='public' and tablename='canonical_media_provider_publications'), 0::bigint, 'provider publication proof has no client policy');
select is(has_table_privilege('authenticated', 'public.canonical_media_provider_publications', 'SELECT'), false, 'authenticated clients cannot read provider publication proof');
select is(has_table_privilege('authenticated', 'public.canonical_media_provider_publications', 'INSERT'), false, 'authenticated clients cannot forge provider publication proof');
select is(has_table_privilege('authenticated', 'public.canonical_media_provider_publications', 'UPDATE'), false, 'authenticated clients cannot alter provider publication proof');
select is(has_table_privilege('authenticated', 'public.canonical_media_provider_publications', 'DELETE'), false, 'authenticated clients cannot delete provider publication proof');
select is(has_table_privilege('anon', 'public.canonical_media_provider_publications', 'SELECT'), false, 'anonymous clients cannot read provider publication proof');
select is((select count(*) from public.canonical_media_provider_publications), 0::bigint, 'legacy provider rows are not backfilled with guessed proof');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok($$ select pg_temp.publish_image('b0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000011') $$, 'image Keep publishes atomically');
select is((select count(*) from public.moments where id='d0000000-0000-4000-8000-000000000001') + (select count(*) from public.moment_media where id='e0000000-0000-4000-8000-000000000001') + (select count(*) from public.photo_tags where asset_id='f0000000-0000-4000-8000-000000000001'), 3::bigint, 'image moment, media, and tag all exist');
select is((select status from public.media_upload_reservations where id='b0000000-0000-4000-8000-000000000001'), 'finalized', 'image quota reservation finalizes in publication');
select is((select optimized_media_bytes::text||'|'||image_count::text||'|'||object_count::text from public.family_storage_usage where family_id='a1000000-0000-4000-8000-000000000001'), '100|1|1', 'image quota is charged exactly once');
select is(pg_temp.publish_image('b0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000011'), true, 'exact image replay reports already published');
select is((select optimized_media_bytes::text||'|'||image_count::text||'|'||object_count::text from public.family_storage_usage where family_id='a1000000-0000-4000-8000-000000000001'), '100|1|1', 'exact replay does not double charge');

select lives_ok($$ select pg_temp.publish_image('b0000000-0000-4000-8000-000000000014','a1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000014','e0000000-0000-4000-8000-000000000014','f0000000-0000-4000-8000-000000000014','c0000000-0000-4000-8000-000000000014','c0000000-0000-4000-8000-000000000024') $$, 'first reservation wins an opaque asset identity');
select throws_like($$ select pg_temp.publish_image('b0000000-0000-4000-8000-000000000015','a1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000015','e0000000-0000-4000-8000-000000000015','f0000000-0000-4000-8000-000000000014','c0000000-0000-4000-8000-000000000015','c0000000-0000-4000-8000-000000000025') $$, '%another saved memory%', 'second media reservation for the same asset fails after serialization');
select is((select count(*) from public.photo_tags where asset_id='f0000000-0000-4000-8000-000000000014') + (select count(*) from public.moment_media where id in ('e0000000-0000-4000-8000-000000000014','e0000000-0000-4000-8000-000000000015')) + (select count(*) from public.moments where id in ('d0000000-0000-4000-8000-000000000014','d0000000-0000-4000-8000-000000000015')), 3::bigint, 'asset race leaves one moment, one media, and one tag');
select is((select optimized_media_bytes::text||'|'||image_count::text||'|'||object_count::text from public.family_storage_usage where family_id='a1000000-0000-4000-8000-000000000001'), '170|2|2', 'asset race charges only the winning reservation');

select throws_like($$ select pg_temp.publish_image('b0000000-0000-4000-8000-000000000016','a1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000016','e0000000-0000-4000-8000-000000000016','f0000000-0000-4000-8000-000000000016','c0000000-0000-4000-8000-000000000016','c0000000-0000-4000-8000-000000000026','{"source":"atomic-test"}'::jsonb,89) $$, '%accounting does not match%', 'client cannot under-charge a canonical reservation');
select throws_like($$ select pg_temp.publish_image('b0000000-0000-4000-8000-000000000016','a1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000016','e0000000-0000-4000-8000-000000000016','f0000000-0000-4000-8000-000000000016','c0000000-0000-4000-8000-000000000016','c0000000-0000-4000-8000-000000000026','{"source":"atomic-test"}'::jsonb,91) $$, '%accounting does not match%', 'client cannot over-charge a canonical reservation');
select is((select status from public.media_upload_reservations where id='b0000000-0000-4000-8000-000000000016'), 'reserved', 'accounting mismatch leaves no charge or publication');
select throws_like($$
  select * from public.finalize_canonical_media_keep(
    'a1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000016',
    'image', 'd0000000-0000-4000-8000-000000000016', 'e0000000-0000-4000-8000-000000000016',
    'f0000000-0000-4000-8000-000000000016', null, now(), null, null, null, null,
    null, 'image/jpeg', 'c0000000-0000-4000-8000-000000000016',
    'c0000000-0000-4000-8000-000000000026', null,
    'a1000000-0000-4000-8000-000000000001/full/c0000000-0000-4000-8000-000000000016.jpg',
    'a1000000-0000-4000-8000-000000000001/thumb/c0000000-0000-4000-8000-000000000026.jpg',
    null, 1200, 900, null, '{"source":"atomic-test"}'::jsonb, null, null, 90, null, 90, null
  )
$$, '%capture time must be grounded%', 'server publication refuses to invent an unknown capture date');

select throws_like($$ select pg_temp.publish_image('b0000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000002','f0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000012') $$, '%object is unavailable%', 'missing storage objects fail closed');
select is((select count(*) from public.moments where id='d0000000-0000-4000-8000-000000000002'), 0::bigint, 'missing storage publishes no moment');
select throws_like($$ select pg_temp.publish_image('b0000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000003','f0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000013','{"assetId":"private"}'::jsonb) $$, '%Private discovery evidence%', 'private discovery metadata is rejected');
select is((select status from public.media_upload_reservations where id='b0000000-0000-4000-8000-000000000003'), 'reserved', 'metadata rejection preserves the reservation');
select throws_like($$ select pg_temp.publish_image('b0000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000004','e0000000-0000-4000-8000-000000000004','f0000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000014') $$, '%reservation does not match%', 'wrong-family publication fails closed');
select is((select count(*) from public.moments where id='d0000000-0000-4000-8000-000000000004'), 0::bigint, 'wrong-family publication writes nothing');
select throws_like($$ select pg_temp.publish_image('b0000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000005','e0000000-0000-4000-8000-000000000005','f0000000-0000-4000-8000-000000000005','c0000000-0000-4000-8000-000000000005','c0000000-0000-4000-8000-000000000015') $$, '%object is unavailable%', 'another user owned object cannot be published');
select is((select count(*) from public.moments where id='d0000000-0000-4000-8000-000000000005'), 0::bigint, 'wrong-owner storage writes nothing');
select throws_like($$ select pg_temp.publish_image('b0000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000006','e0000000-0000-4000-8000-000000000006','f0000000-0000-4000-8000-000000000006','c0000000-0000-4000-8000-000000000006','c0000000-0000-4000-8000-000000000016') $$, '%injected tag failure%', 'downstream tag failure aborts the whole transaction');
select is((select status from public.media_upload_reservations where id='b0000000-0000-4000-8000-000000000006'), 'reserved', 'rolled-back publication leaves reservation open');
select is((select count(*) from public.moments where id='d0000000-0000-4000-8000-000000000006') + (select count(*) from public.moment_media where id='e0000000-0000-4000-8000-000000000006') + (select count(*) from public.photo_tags where asset_id='f0000000-0000-4000-8000-000000000006'), 0::bigint, 'rolled-back publication leaves no shared rows');
select is((select optimized_media_bytes from public.family_storage_usage where family_id='a1000000-0000-4000-8000-000000000001'), 170::bigint, 'rolled-back publication leaves usage unchanged');

select throws_like($$ select pg_temp.publish_image('b0000000-0000-4000-8000-000000000008','a1000000-0000-4000-8000-000000000004','d0000000-0000-4000-8000-000000000008','e0000000-0000-4000-8000-000000000008','f0000000-0000-4000-8000-000000000008','c0000000-0000-4000-8000-000000000008','c0000000-0000-4000-8000-000000000018') $$, '%active family plan%', 'lapsed family cannot finish an unpublished Keep');
select is((select count(*) from public.moments where id='d0000000-0000-4000-8000-000000000008'), 0::bigint, 'lapsed publication writes nothing');
select throws_like($$ select pg_temp.publish_image('b0000000-0000-4000-8000-000000000007','a1000000-0000-4000-8000-000000000005','d0000000-0000-4000-8000-000000000007','e0000000-0000-4000-8000-000000000007','f0000000-0000-4000-8000-000000000007','c0000000-0000-4000-8000-000000000007','c0000000-0000-4000-8000-000000000017') $$, '%co-parent%', 'deletion lock blocks publication');
select is((select count(*) from public.moments where id='d0000000-0000-4000-8000-000000000007'), 0::bigint, 'deletion-locked publication writes nothing');

select lives_ok($$ select pg_temp.publish_image('b0000000-0000-4000-8000-000000000009','a1000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000009','e0000000-0000-4000-8000-000000000009','f0000000-0000-4000-8000-000000000009','c0000000-0000-4000-8000-000000000019','c0000000-0000-4000-8000-000000000029','{"source":"legacy-exact-repair"}'::jsonb) $$, 'finalized exact-link legacy interruption repairs its missing tag');
select is((select count(*) from public.photo_tags where asset_id='f0000000-0000-4000-8000-000000000009'), 1::bigint, 'legacy exact repair creates only the missing tag');
select is((select optimized_media_bytes::text||'|'||image_count::text||'|'||object_count::text from public.family_storage_usage where family_id='a1000000-0000-4000-8000-000000000002'), '60|1|1', 'legacy exact repair does not double charge');

select throws_like($$ select pg_temp.publish_stream('b0000000-0000-4000-8000-000000000010','d0000000-0000-4000-8000-000000000010','e0000000-0000-4000-8000-000000000010','f0000000-0000-4000-8000-000000000010','stream-unconfirmed') $$, '%not confirmed%', 'Stream cannot publish before trusted provider acceptance');
select is((select status from public.media_upload_reservations where id='b0000000-0000-4000-8000-000000000010'), 'reserved', 'unconfirmed Stream reservation stays open');
select ok((select provider_upload_confirmed_at is null from public.media_upload_reservations where id='b0000000-0000-4000-8000-000000000011'), 'untrusted phase leaves Stream confirmation unset');

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$ select public.confirm_canonical_media_provider_upload('b0000000-0000-4000-8000-000000000011','stream','stream-confirmed') $$, 'trusted service confirms exact Stream acceptance');
select ok((select provider_upload_confirmed_at is not null from public.media_upload_reservations where id='b0000000-0000-4000-8000-000000000011'), 'provider confirmation is durable');
select lives_ok($$ select public.confirm_canonical_media_provider_upload('b0000000-0000-4000-8000-000000000017','stream','stream-rollback') $$, 'trusted service can confirm a Stream whose later database publication rolls back');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_like($$ select pg_temp.publish_stream('b0000000-0000-4000-8000-000000000017','d0000000-0000-4000-8000-000000000017','e0000000-0000-4000-8000-000000000017','f0000000-0000-4000-8000-000000000017','stream-rollback') $$, '%injected tag failure%', 'Stream tag failure rolls back publication and quota together');
select is((select status from public.media_upload_reservations where id='b0000000-0000-4000-8000-000000000017'), 'reserved', 'rolled-back Stream leaves its confirmed reservation replayable');
select is((select count(*) from public.moments where id='d0000000-0000-4000-8000-000000000017') + (select count(*) from public.moment_media where id='e0000000-0000-4000-8000-000000000017') + (select count(*) from public.photo_tags where asset_id='f0000000-0000-4000-8000-000000000017'), 0::bigint, 'rolled-back Stream leaves no shared rows');
select is((select optimized_media_bytes from public.family_storage_usage where family_id='a1000000-0000-4000-8000-000000000001'), 170::bigint, 'rolled-back Stream leaves usage unchanged');

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select is((select count(*) from public.canonical_media_provider_publications where moment_media_id='e0000000-0000-4000-8000-000000000017'), 0::bigint, 'rolled-back Stream leaves no durable provider publication proof');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_like($$ select pg_temp.publish_stream('b0000000-0000-4000-8000-000000000011','d0000000-0000-4000-8000-000000000011','e0000000-0000-4000-8000-000000000011','f0000000-0000-4000-8000-000000000011','different-stream') $$, '%not confirmed%', 'confirmed reservation cannot publish another Stream identity');
select lives_ok($$ select pg_temp.publish_stream('b0000000-0000-4000-8000-000000000011','d0000000-0000-4000-8000-000000000011','e0000000-0000-4000-8000-000000000011','f0000000-0000-4000-8000-000000000011','stream-confirmed') $$, 'confirmed Stream publishes atomically');
select is((select upload_status||'|'||stream_uid from public.moment_media where id='e0000000-0000-4000-8000-000000000011'), 'ready|stream-confirmed', 'published Stream row retains exact provider identity');
select is((select count(*) from public.photo_tags where moment_media_id='e0000000-0000-4000-8000-000000000011'), 1::bigint, 'Stream publication includes its tag');
select is(pg_temp.publish_stream('b0000000-0000-4000-8000-000000000011','d0000000-0000-4000-8000-000000000011','e0000000-0000-4000-8000-000000000011','f0000000-0000-4000-8000-000000000011','stream-confirmed'), true, 'exact Stream replay reports already published');

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select is((select family_id::text||'|'||provider||'|'||provider_object_id||'|'||source_reservation_id::text from public.canonical_media_provider_publications where moment_media_id='e0000000-0000-4000-8000-000000000011'), 'a1000000-0000-4000-8000-000000000001|stream|stream-confirmed|b0000000-0000-4000-8000-000000000011', 'Stream proof retains exact family, provider identity, and reservation provenance');
select is((select count(*) from public.canonical_media_provider_publications where moment_media_id='e0000000-0000-4000-8000-000000000011'), 1::bigint, 'exact Stream replay creates no duplicate provider proof');
select is((select optimized_media_bytes from public.family_storage_usage where family_id='a1000000-0000-4000-8000-000000000001'), 370::bigint, 'exact Stream replay does not double charge quota');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok($$ select pg_temp.publish_direct() $$, 'direct video publishes atomically');
select is((select count(*) from public.moments where id='d0000000-0000-4000-8000-000000000012') + (select count(*) from public.moment_media where id='e0000000-0000-4000-8000-000000000012') + (select count(*) from public.photo_tags where asset_id='f0000000-0000-4000-8000-000000000012'), 3::bigint, 'direct video has one complete shared record');
select lives_ok($$ select pg_temp.publish_poster() $$, 'poster-only video publishes atomically');
select is((select media_type||'|'||quota_class from public.moment_media where id='e0000000-0000-4000-8000-000000000013'), 'video|poster_only', 'poster-only remains a video memory with explicit presentation class');
select is((select optimized_media_bytes::text||'|'||video_seconds::text||'|'||video_bytes::text||'|'||image_count::text||'|'||video_count::text||'|'||object_count::text from public.family_storage_usage where family_id='a1000000-0000-4000-8000-000000000001'), '720|22|500|3|2|5', 'all transports charge their canonical reservation exactly once');
select is(pg_temp.publish_direct(), true, 'direct video exact replay is idempotent');
select is((select optimized_media_bytes from public.family_storage_usage where family_id='a1000000-0000-4000-8000-000000000001'), 720::bigint, 'video replay does not double charge');
select is((select image_count::text||'|'||video_count::text from public.family_storage_usage where family_id='a1000000-0000-4000-8000-000000000001'), '3|2', 'poster-only quota intentionally counts its stored poster object as image transport');
select is((select count(*) from public.moment_media where family_id='a1000000-0000-4000-8000-000000000001' and upload_status='ready'), 5::bigint, 'only five successful canonical memories are visible');
select is((select count(*) from public.media_upload_reservations where family_id='a1000000-0000-4000-8000-000000000001' and status='finalized'), 5::bigint, 'only published transports are finalized');
select is(has_function_privilege('authenticated', 'public.finalize_canonical_media_keep(uuid,uuid,text,uuid,uuid,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,double precision,double precision,timestamp with time zone,text,text,uuid,uuid,uuid,text,text,text,integer,integer,numeric,jsonb,text,bigint,bigint,integer,bigint,integer)', 'EXECUTE'), true, 'authenticated writers can call the atomic publisher');
select is(has_function_privilege('anon', 'public.finalize_canonical_media_keep(uuid,uuid,text,uuid,uuid,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,double precision,double precision,timestamp with time zone,text,text,uuid,uuid,uuid,text,text,text,integer,integer,numeric,jsonb,text,bigint,bigint,integer,bigint,integer)', 'EXECUTE'), false, 'anonymous callers cannot publish canonical Keep rows');

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
delete from public.media_upload_reservations where id='b0000000-0000-4000-8000-000000000011';
update public.moments set author_user_id=null where id='d0000000-0000-4000-8000-000000000011';
update public.moment_media set owner_user_id=null where id='e0000000-0000-4000-8000-000000000011';
update public.photo_tags
set asset_owner_user_id=null, tagged_by_user_id=null
where moment_media_id='e0000000-0000-4000-8000-000000000011';
select is((select count(*) from public.canonical_media_provider_publications where moment_media_id='e0000000-0000-4000-8000-000000000011' and provider='stream' and provider_object_id='stream-confirmed' and source_reservation_id='b0000000-0000-4000-8000-000000000011'), 1::bigint, 'provider publication proof survives reservation and uploader attribution removal');
select is((select upload_status||'|'||stream_uid||'|'||coalesce(owner_user_id::text,'removed') from public.moment_media where id='e0000000-0000-4000-8000-000000000011'), 'ready|stream-confirmed|removed', 'preserved shared Stream remains ready after uploader attribution removal');

select * from finish();
rollback;
