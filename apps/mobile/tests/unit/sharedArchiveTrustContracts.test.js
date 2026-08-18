import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('canonical photo Keep maps local Photos identity to an opaque shared key', () => {
  const photoSync = source('../../src/photoSync.js');
  const mediaDb = source('../../src/mediaDb.js');

  assert.match(photoSync, /getOrCreateRemoteAssetIdentity\([\s\S]*localAssetId: assetId[\s\S]*proposedRemoteKey: uuid\(\)[\s\S]*proposedMomentId: uuid\(\)[\s\S]*proposedMediaId: uuid\(\)/);
  assert.match(photoSync, /momentId: mappedMomentId/);
  assert.match(photoSync, /mediaId: mappedMediaId/);
  assert.match(photoSync, /asset_id: remoteAssetKey/);
  assert.match(photoSync, /local_identifier: remoteAssetKey/);
  assert.doesNotMatch(photoSync, /asset_id: assetId/);
  assert.doesNotMatch(photoSync, /local_identifier: assetId/);
  assert.match(mediaDb, /where family_id = \? and owner_user_id = \? and asset_id = \?/);
  assert.doesNotMatch(mediaDb, /from ['"]\.\/supabase|trackAnalytics|Sentry|PostHog|posthog/);
});

test('First composer and correction UI translate shared identity only at the device boundary', () => {
  const firstComposer = source('../../src/FirstComposeSheetScreen.js');
  const momentDetail = source('../../src/MomentDetailScreen.js');
  const correction = source('../../src/autoSaveCorrection.js');

  assert.match(firstComposer, /remoteAssetKey/);
  assert.match(momentDetail, /resolveLocalAssetId\([\s\S]*remoteAssetKey: media\?\.local_identifier/);
  assert.match(correction, /resolveLocalAssetId\([\s\S]*remoteAssetKey: normalized\.assetId/);
  assert.match(correction, /resolveRemoteAssetKey\([\s\S]*localAssetId: normalized\.assetId/);
  assert.match(correction, /assetId: localAssetId \|\| normalized\.assetId/);
});

test('manual picker and shared upload metadata exclude device and identity evidence', () => {
  const moments = source('../../src/moments.js');
  const metadata = source('../../src/mediaUploadMetadataModel.js');

  assert.doesNotMatch(moments, /pickerAssetId\s*:/);
  assert.doesNotMatch(moments, /local_identifier:\s*(?:asset\.assetId|localIdentifier)/);
  for (const forbidden of [
    'localAssetId',
    'pickerAssetId',
    'recognitionCandidateId',
    'recognitionScore',
    'faceCount',
    'videoPresenceRatio',
    'recognitionFrameTimeMs',
    'visualFingerprint',
    'identityEvidence',
  ]) {
    assert.match(metadata, new RegExp(`['"]${forbidden}['"]`), `${forbidden} is explicitly filtered`);
  }
});

test('remote migration rotates legacy identifiers and rejects old-client raw identifiers', () => {
  const migration = source('../../../../supabase/migrations/20260720210000_private_shared_media_identity.sql');

  assert.match(migration, /create temporary table media_identifier_rotation/);
  assert.match(migration, /set asset_id = r\.new_asset_id/);
  assert.match(migration, /set local_identifier = r\.new_asset_id/);
  assert.match(migration, /photo_tags_opaque_asset_id_check/);
  assert.match(migration, /moment_media_opaque_local_identifier_check/);
  for (const forbidden of ['localAssetId', 'pickerAssetId', 'recognitionCandidateId', 'recognitionScore', 'faceCount']) {
    assert.match(migration, new RegExp(`- '${forbidden}'`), `${forbidden} is scrubbed`);
  }
});

test('server policies enforce active entitlement and preserve shared authorship on deletion', () => {
  const migration = source('../../../../supabase/migrations/20260720211000_shared_archive_write_and_authorship.sql');

  for (const table of [
    'photo_tags',
    'memories',
    'moments',
    'moment_media',
    'voice_notes',
    'moment_reactions',
    'moment_replies',
    'letters',
    'firsts',
    'scan_checkpoints',
  ]) {
    assert.match(migration, new RegExp(`policy [\\s\\S]{0,120}${table}|${table}[\\s\\S]{0,300}family_has_active_entitlement`));
  }
  assert.match(migration, /family_photos_insert[\s\S]*family_has_active_entitlement/);
  for (const constraint of [
    'moments_author_user_id_fkey',
    'moment_media_owner_user_id_fkey',
    'voice_notes_author_user_id_fkey',
    'moment_reactions_author_user_id_fkey',
    'moment_replies_author_user_id_fkey',
  ]) {
    assert.match(migration, new RegExp(`${constraint}[\\s\\S]{0,180}on delete set null`));
  }
});
