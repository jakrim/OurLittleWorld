-- Shared archive media identity must never be the device Photos identifier.
-- Existing approved rows are rotated to opaque UUID keys in one transaction;
-- new clients generate the opaque key locally and keep the private mapping in
-- SQLite. The UUID checks make older clients fail closed instead of restoring
-- raw iOS/Android identifiers after this migration.

alter table public.photo_tags add column if not exists id uuid default gen_random_uuid();
update public.photo_tags set id = gen_random_uuid() where id is null;
alter table public.photo_tags alter column id set default gen_random_uuid();
alter table public.photo_tags alter column id set not null;

alter table public.photo_tags drop constraint if exists photo_tags_pkey;
alter table public.photo_tags add constraint photo_tags_pkey primary key (id);
alter table public.photo_tags drop constraint if exists photo_tags_family_owner_asset_key;
alter table public.photo_tags
  add constraint photo_tags_family_owner_asset_key unique (family_id, asset_owner_user_id, asset_id);

create temporary table media_identifier_rotation (
  photo_tag_id uuid primary key,
  family_id uuid not null,
  owner_user_id uuid,
  old_asset_id text not null,
  new_asset_id text not null unique
);

insert into media_identifier_rotation (photo_tag_id, family_id, owner_user_id, old_asset_id, new_asset_id)
select id, family_id, asset_owner_user_id, asset_id, gen_random_uuid()::text
from public.photo_tags
where asset_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

update public.memories m
set asset_id = r.new_asset_id
from media_identifier_rotation r
where m.family_id = r.family_id
  and m.asset_owner_user_id is not distinct from r.owner_user_id
  and m.asset_id = r.old_asset_id;

update public.firsts f
set asset_id = r.new_asset_id
from media_identifier_rotation r
where f.family_id = r.family_id
  and f.asset_owner_user_id is not distinct from r.owner_user_id
  and f.asset_id = r.old_asset_id;

update public.weekly_digests d
set cover_asset_id = r.new_asset_id
from media_identifier_rotation r
where d.family_id = r.family_id
  and d.cover_asset_owner_user_id is not distinct from r.owner_user_id
  and d.cover_asset_id = r.old_asset_id;

update public.moment_media mm
set local_identifier = r.new_asset_id
from media_identifier_rotation r
join public.photo_tags pt on pt.id = r.photo_tag_id
where pt.moment_media_id = mm.id;

update public.photo_tags pt
set asset_id = r.new_asset_id
from media_identifier_rotation r
where pt.id = r.photo_tag_id;

update public.memories m
set asset_id = gen_random_uuid()::text
where asset_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and not exists (
  select 1 from public.photo_tags pt
  where pt.family_id = m.family_id
    and pt.asset_owner_user_id is not distinct from m.asset_owner_user_id
    and pt.asset_id = m.asset_id
);

-- Unmatched legacy pointers cannot safely remain shared. Kept media still has
-- its canonical moment/media relationship and storage object after nulling.
update public.firsts f
set asset_id = null, asset_owner_user_id = null
where asset_id is not null
  and not exists (
    select 1 from public.photo_tags pt
    where pt.family_id = f.family_id
      and pt.asset_owner_user_id is not distinct from f.asset_owner_user_id
      and pt.asset_id = f.asset_id
  );

update public.weekly_digests d
set cover_asset_id = null, cover_asset_owner_user_id = null
where cover_asset_id is not null
  and not exists (
    select 1 from public.photo_tags pt
    where pt.family_id = d.family_id
      and pt.asset_owner_user_id is not distinct from d.cover_asset_owner_user_id
      and pt.asset_id = d.cover_asset_id
  );

-- Manual moment/letter attachments do not need a local library pointer. Give
-- any unmatched legacy value a fresh opaque key for compatibility with code
-- that still treats local_identifier as the shared-media key.
update public.moment_media mm
set local_identifier = gen_random_uuid()::text
where local_identifier is not null
  and local_identifier !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and not exists (
    select 1 from public.photo_tags pt where pt.moment_media_id = mm.id
  );

update public.moment_media
set metadata = coalesce(metadata, '{}'::jsonb)
  - 'assetId'
  - 'localAssetId'
  - 'pickerAssetId'
  - 'recognitionCandidateId'
  - 'recognitionScore'
  - 'faceCount'
  - 'videoPresenceRatio'
  - 'videoSampledFrames'
  - 'videoMatchedFrames'
  - 'curationDay'
  - 'curationRole'
  - 'curationReason'
  - 'visualFingerprint'
  - 'identityEvidence';

alter table public.photo_tags drop constraint if exists photo_tags_opaque_asset_id_check;
alter table public.photo_tags add constraint photo_tags_opaque_asset_id_check
  check (asset_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');

alter table public.memories drop constraint if exists memories_opaque_asset_id_check;
alter table public.memories add constraint memories_opaque_asset_id_check
  check (asset_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');

alter table public.firsts drop constraint if exists firsts_opaque_asset_id_check;
alter table public.firsts add constraint firsts_opaque_asset_id_check
  check (asset_id is null or asset_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');

alter table public.weekly_digests drop constraint if exists weekly_digests_opaque_asset_id_check;
alter table public.weekly_digests add constraint weekly_digests_opaque_asset_id_check
  check (cover_asset_id is null or cover_asset_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');

alter table public.moment_media drop constraint if exists moment_media_opaque_local_identifier_check;
alter table public.moment_media add constraint moment_media_opaque_local_identifier_check
  check (local_identifier is null or local_identifier ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');

comment on column public.photo_tags.asset_id is
  'Opaque shared-media UUID. The device Photos identifier remains only in owner-scoped local SQLite.';
comment on column public.moment_media.local_identifier is
  'Legacy name retained for compatibility; values are opaque shared-media UUIDs, never device Photos identifiers.';

drop table if exists media_identifier_rotation;
