begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(39);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'delete-target@example.test', '', now(),
    now(), now(), '{}'::jsonb, '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'remaining-writer@example.test', '', now(),
    now(), now(), '{}'::jsonb, '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'legal-hold@example.test', '', now(),
    now(), now(), '{}'::jsonb, '{}'::jsonb
  );

insert into public.families (id, name, baby_name, created_by) values
  ('f0000000-0000-4000-8000-000000000010', 'Sole writer fixture', 'Baby', 'a0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000020', 'Shared writer fixture', 'Baby', 'a0000000-0000-4000-8000-000000000002'),
  ('f0000000-0000-4000-8000-000000000030', 'Circle fixture', 'Baby', 'a0000000-0000-4000-8000-000000000002');

insert into public.family_members (family_id, user_id, display_name, role) values
  ('f0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'Target', 'creator'),
  ('f0000000-0000-4000-8000-000000000020', 'a0000000-0000-4000-8000-000000000001', 'Target', 'partner'),
  ('f0000000-0000-4000-8000-000000000020', 'a0000000-0000-4000-8000-000000000002', 'Remaining', 'creator'),
  ('f0000000-0000-4000-8000-000000000030', 'a0000000-0000-4000-8000-000000000001', 'Target', 'circle'),
  ('f0000000-0000-4000-8000-000000000030', 'a0000000-0000-4000-8000-000000000002', 'Remaining', 'creator');

insert into public.family_entitlements (
  family_id, status, source, plan_key, billing_owner_user_id, billing_owner_email, expires_at
) values
  (
    'f0000000-0000-4000-8000-000000000010',
    'active', 'stripe', 'family_monthly',
    'a0000000-0000-4000-8000-000000000001',
    'delete-target@example.test',
    now() + interval '30 days'
  ),
  (
    'f0000000-0000-4000-8000-000000000020',
    'active', 'admin', 'comp_year',
    null, null,
    now() + interval '30 days'
  ),
  (
    'f0000000-0000-4000-8000-000000000030',
    'active', 'admin', 'comp_year',
    null, null,
    now() + interval '30 days'
  );

insert into public.billing_subscriptions (
  id, family_id, purchaser_user_id, provider, product_id, plan_key,
  provider_subscription_id, status, latest_receipt, metadata
) values (
  'b0000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000010',
  'a0000000-0000-4000-8000-000000000001',
  'stripe',
  'synthetic-delete-plan',
  'family_monthly',
  'sub_synthetic_delete',
  'active',
  '{"synthetic":"receipt"}'::jsonb,
  '{"synthetic":"billing"}'::jsonb
);

insert into public.moments (id, family_id, author_user_id, title, captured_at) values
  (
    'c0000000-0000-4000-8000-000000000010',
    'f0000000-0000-4000-8000-000000000010',
    'a0000000-0000-4000-8000-000000000001',
    'Sole family synthetic moment',
    now()
  ),
  (
    'c0000000-0000-4000-8000-000000000020',
    'f0000000-0000-4000-8000-000000000020',
    'a0000000-0000-4000-8000-000000000001',
    'Shared family synthetic moment',
    now()
  );

insert into public.moment_media (
  id, moment_id, family_id, owner_user_id, media_type, metadata,
  stream_uid, original_object, storage_provider, playback_provider
) values
  (
    'd0000000-0000-4000-8000-000000000010',
    'c0000000-0000-4000-8000-000000000010',
    'f0000000-0000-4000-8000-000000000010',
    'a0000000-0000-4000-8000-000000000001',
    'video',
    '{"fullPath":"f0000000-0000-4000-8000-000000000010/moments/synthetic/full.mp4"}'::jsonb,
    'streamSyntheticDelete01',
    'd0000000-0000-4000-8000-000000000011',
    'r2',
    'stream'
  ),
  (
    'd0000000-0000-4000-8000-000000000020',
    'c0000000-0000-4000-8000-000000000020',
    'f0000000-0000-4000-8000-000000000020',
    'a0000000-0000-4000-8000-000000000001',
    'image',
    '{"fullPath":"f0000000-0000-4000-8000-000000000020/moments/shared/full.jpg"}'::jsonb,
    null,
    null,
    'supabase',
    'supabase'
  );

insert into public.push_tokens (user_id, family_id, expo_push_token, platform)
values (
  'a0000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000020',
  'ExponentPushToken[synthetic-account-deletion]',
  'ios'
);

select is(
  (public.preview_account_deletion('a0000000-0000-4000-8000-000000000001') ->> 'family_count')::integer,
  3,
  'preview counts every family membership'
);
select is(
  (public.preview_account_deletion('a0000000-0000-4000-8000-000000000001') ->> 'sole_writer_count')::integer,
  1,
  'preview identifies the sole-writer family'
);
select is(
  (public.preview_account_deletion('a0000000-0000-4000-8000-000000000001') ->> 'additional_writer_count')::integer,
  1,
  'preview identifies the shared writer family'
);
select is(
  (public.preview_account_deletion('a0000000-0000-4000-8000-000000000001') ->> 'circle_count')::integer,
  1,
  'preview identifies the circle membership'
);
select ok(
  (public.preview_account_deletion('a0000000-0000-4000-8000-000000000001') ->> 'stripe_cancellation_required')::boolean,
  'preview requires Stripe cancellation'
);
select ok(
  not (public.preview_account_deletion('a0000000-0000-4000-8000-000000000001') ->> 'store_subscription_action_required')::boolean,
  'preview does not invent store subscription work'
);

insert into public.account_deletion_requests (
  id, requester_user_id, legal_hold, reauthenticated_at
) values (
  'e0000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000003',
  true,
  now()
);
select throws_ok(
  $$ select public.begin_account_deletion(
    'a0000000-0000-4000-8000-000000000003',
    'e0000000-0000-4000-8000-000000000003',
    now()
  ) $$,
  'P0001',
  'account deletion is blocked by a legal hold',
  'legal hold blocks deletion before provider inventory'
);

create temporary table deletion_plan (plan jsonb);
select lives_ok(
  $$ insert into deletion_plan
     select public.begin_account_deletion(
       'a0000000-0000-4000-8000-000000000001',
       'e0000000-0000-4000-8000-000000000001',
       now()
     ) $$,
  'begin account deletion succeeds after fresh reauthentication'
);
select is(
  (select plan ->> 'request_id' from deletion_plan),
  'e0000000-0000-4000-8000-000000000001',
  'begin returns the stable request identity'
);
select ok(
  (select plan -> 'sole_family_ids' from deletion_plan) @> '["f0000000-0000-4000-8000-000000000010"]'::jsonb,
  'provider plan includes only the sole-writer family'
);
select ok(
  (select plan -> 'storage_paths' from deletion_plan)
    @> '["f0000000-0000-4000-8000-000000000010/moments/synthetic/full.mp4"]'::jsonb,
  'provider plan contains the exact sole-family Storage path'
);
select ok(
  not (select plan -> 'storage_paths' from deletion_plan)
    @> '["f0000000-0000-4000-8000-000000000020/moments/shared/full.jpg"]'::jsonb,
  'provider plan excludes shared-family Storage paths'
);
select ok(
  (select plan -> 'stream_uids' from deletion_plan) @> '["streamSyntheticDelete01"]'::jsonb,
  'provider plan records the sole-family Stream object'
);
select ok(
  (select plan -> 'r2_object_ids' from deletion_plan)
    @> '["d0000000-0000-4000-8000-000000000011"]'::jsonb,
  'provider plan records the sole-family R2 object'
);
select ok(
  (select plan -> 'stripe_subscription_ids' from deletion_plan) @> '["sub_synthetic_delete"]'::jsonb,
  'provider plan records the Stripe subscription'
);
select is(
  (select count(*) from public.account_deletion_family_locks
   where requester_user_id = 'a0000000-0000-4000-8000-000000000001'),
  3::bigint,
  'every affected family is locked before cleanup'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(
  not public.is_family_writer('f0000000-0000-4000-8000-000000000010'),
  'sole writer loses direct write authority while deletion is locked'
);
select ok(
  not public.is_family_writer('f0000000-0000-4000-8000-000000000020'),
  'shared writer loses direct write authority while deletion is locked'
);
select throws_ok(
  $$ insert into public.moments (id, family_id, author_user_id, title, captured_at)
     values (
       'c0000000-0000-4000-8000-000000000099',
       'f0000000-0000-4000-8000-000000000020',
       'a0000000-0000-4000-8000-000000000001',
       'Lock bypass attempt',
       now()
     ) $$,
  '42501',
  null,
  'locked writer cannot add a new shared record'
);
select throws_ok(
  $$ select count(*) from public.account_deletion_requests $$,
  '42501',
  null,
  'authenticated clients cannot read the deletion audit ledger'
);

reset role;
select throws_ok(
  $$ delete from public.family_members
     where family_id = 'f0000000-0000-4000-8000-000000000020'
       and user_id = 'a0000000-0000-4000-8000-000000000001' $$,
  '55000',
  'family account deletion is in progress',
  'membership cannot change after provider inventory'
);

select lives_ok(
  $$ select public.mark_account_deletion_status(
    'a0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    'provider_cleaned',
    '{"storage_deleted_count":1,"stream_deleted_count":1,"r2_delete_request_count":1,"stripe_canceled_count":1}'::jsonb,
    null
  ) $$,
  'aggregate provider cleanup can be recorded'
);

create temporary table deletion_result (result jsonb);
select lives_ok(
  $$ insert into deletion_result
     select public.finalize_account_deletion(
       'a0000000-0000-4000-8000-000000000001',
       'e0000000-0000-4000-8000-000000000001'
     ) $$,
  'database finalization succeeds after provider cleanup'
);
select is(
  (select count(*) from public.families where id = 'f0000000-0000-4000-8000-000000000010'),
  0::bigint,
  'sole-writer family is deleted'
);
select is(
  (select count(*) from public.families where id = 'f0000000-0000-4000-8000-000000000020'),
  1::bigint,
  'shared writer family is preserved'
);
select is(
  (select count(*) from public.families where id = 'f0000000-0000-4000-8000-000000000030'),
  1::bigint,
  'circle family is preserved'
);
select is(
  (select count(*) from public.family_members where user_id = 'a0000000-0000-4000-8000-000000000001'),
  0::bigint,
  'all memberships for the deleted account are removed'
);
select is(
  (select count(*) from public.family_members
   where family_id in (
     'f0000000-0000-4000-8000-000000000020',
     'f0000000-0000-4000-8000-000000000030'
   )
     and user_id = 'a0000000-0000-4000-8000-000000000002'),
  2::bigint,
  'the remaining writer keeps both families'
);
select is(
  (select count(*) from public.moments where id = 'c0000000-0000-4000-8000-000000000020'),
  1::bigint,
  'shared family moment survives database finalization'
);
select is(
  (select count(*) from public.push_tokens where user_id = 'a0000000-0000-4000-8000-000000000001'),
  0::bigint,
  'deleted account push tokens are removed'
);
select is(
  (select status from public.account_deletion_requests where id = 'e0000000-0000-4000-8000-000000000001'),
  'database_deleted',
  'deletion audit advances to database deleted'
);
select ok(
  (public.finalize_account_deletion(
    'a0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001'
  ) ->> 'already_finalized')::boolean,
  'database finalization is idempotent'
);
select ok(
  not ((select provider_summary::text from public.account_deletion_requests
        where id = 'e0000000-0000-4000-8000-000000000001') like '%moments/%'),
  'audit provider evidence is aggregate-only'
);
select is(
  (select status from public.billing_subscriptions where id = 'b0000000-0000-4000-8000-000000000001'),
  'canceled',
  'Stripe subscription record is canceled after provider cleanup'
);
select is(
  (select family_id from public.billing_subscriptions where id = 'b0000000-0000-4000-8000-000000000001'),
  null::uuid,
  'retained billing record is detached from deleted family content'
);
select is(
  (select purchaser_user_id from public.billing_subscriptions where id = 'b0000000-0000-4000-8000-000000000001'),
  null::uuid,
  'retained billing record is detached from the deleted user'
);
select lives_ok(
  $$ delete from auth.users where id = 'a0000000-0000-4000-8000-000000000001' $$,
  'authentication account can be hard-deleted after database cleanup'
);
select is(
  (select author_user_id from public.moments where id = 'c0000000-0000-4000-8000-000000000020'),
  null::uuid,
  'shared moment attribution is removed after auth deletion'
);
select is(
  (select count(*) from public.moments where id = 'c0000000-0000-4000-8000-000000000020'),
  1::bigint,
  'shared moment remains after auth deletion'
);

select * from finish();
rollback;
