import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import { CANDIDATE_BATCH_SIZE } from '../../src/candidateLedgerModel.js';

import {
  CANONICAL_KEEP_RESUME_MIGRATION_SQL,
  CANONICAL_SIDE_EFFECT_MIGRATION_SQL,
  CANDIDATE_LEDGER_MIGRATION_SQL,
  FIRST_YEAR_CATCHUP_MIGRATION_SQL,
  LEGACY_PARENT_VIDEO_RECOVERY_MIGRATION_SQL,
  PRIVATE_REMOTE_MEDIA_IDENTITY_MIGRATION_SQL,
  applyMediaDbMigrations,
  assertCandidateLedgerSchema,
  MEDIA_DB_REQUIRED_CANDIDATE_COLUMNS,
  MEDIA_DB_REQUIRED_ENRICHMENT_COLUMNS,
  MEDIA_DB_REQUIRED_COLLECTION_DRAFT_COLUMNS,
  MEDIA_DB_REQUIRED_SAVED_DAY_COLUMNS,
  MEDIA_DB_REQUIRED_REMOTE_MAPPING_COLUMNS,
  MEDIA_DB_REQUIRED_SESSION_COLUMNS,
  MEDIA_DB_SCHEMA_VERSION,
  TONIGHT_ENRICHMENT_MIGRATION_SQL,
  TONIGHT_COLLECTION_DRAFT_MIGRATION_SQL,
  TONIGHT_CONTINUATION_MIGRATION_SQL,
} from '../../src/mediaDbSchema.js';

test('candidate ledger migration succeeds on a fresh database and is repeatable', () => {
  withDatabase((dbPath) => {
    migrate(dbPath);
    migrate(dbPath);
    assert.equal(query(dbPath, 'pragma user_version;'), String(MEDIA_DB_SCHEMA_VERSION));
    const tables = query(dbPath, "select name from sqlite_master where type='table' order by name;").split('\n');
    for (const table of ['discovery_candidates', 'candidate_clusters', 'candidate_cluster_members', 'nightly_review_sessions', 'nightly_review_items', 'nightly_review_enrichment', 'family_saved_day_facts', 'local_asset_mappings']) {
      assert.ok(tables.includes(table), `${table} exists`);
    }
    const columns = query(dbPath, 'pragma table_info(discovery_candidates);')
      .split('\n').filter(Boolean).map((line) => line.split('|')[1]);
    for (const required of MEDIA_DB_REQUIRED_CANDIDATE_COLUMNS) assert.ok(columns.includes(required));
  });
});

test('version 2 upgrades a Release 0 queue without changing its order or decision state', () => {
  withDatabase((dbPath) => {
    migrateV1(dbPath);
    run(dbPath, candidateInsert({ familyId: 'family-a', userId: 'parent-a', assetId: 'asset-1', state: 'shown' }));
    run(dbPath, `
      insert into nightly_review_sessions values (
        'session-v1','family-a','parent-a','2026-07-18','America/New_York','seed','active',
        'nightly-queue-v1','curated-ledger-v1',0,1,'2026-07-18','2026-07-18',null
      );
      insert into nightly_review_items (
        session_id,position,family_id,user_id,asset_id,reason_code,item_state,commit_state,draft_text,updated_at
      ) values ('session-v1',0,'family-a','parent-a','asset-1','best_day','shown','idle','Blue blanket','2026-07-18');
    `);
    run(dbPath, `begin immediate; ${TONIGHT_ENRICHMENT_MIGRATION_SQL} pragma user_version = 2; commit;`);
    assert.equal(query(dbPath, 'pragma user_version;'), '2');
    assert.equal(query(dbPath, "select position || '|' || item_state || '|' || draft_text from nightly_review_items;"), '0|shown|Blue blanket');
    const columns = query(dbPath, 'pragma table_info(nightly_review_enrichment);')
      .split('\n').filter(Boolean).map((line) => line.split('|')[1]);
    for (const required of MEDIA_DB_REQUIRED_ENRICHMENT_COLUMNS.filter((name) => name !== 'parent_interacted')) {
      assert.ok(columns.includes(required));
    }
  });
});

test('mixed Tonight drafts and stable retry identities survive reopen and remain scoped', () => {
  withDatabase((dbPath) => {
    migrate(dbPath);
    run(dbPath, candidateInsert({ familyId: 'family-a', userId: 'parent-a', assetId: 'asset-1', state: 'shown' }));
    run(dbPath, candidateInsert({ familyId: 'family-a', userId: 'parent-a', assetId: 'asset-alt', state: 'superseded' }));
    run(dbPath, `
      insert into nightly_review_sessions values (
        'session-draft','family-a','parent-a','2026-07-18','America/New_York','seed','active',
        'nightly-queue-v1','curated-ledger-v1',0,1,'2026-07-18','2026-07-18',null,0
      );
      insert into nightly_review_items (
        session_id,position,family_id,user_id,asset_id,reason_code,item_state,commit_state,draft_text,updated_at
      ) values ('session-draft',0,'family-a','parent-a','asset-1','best_burst','shown','saving','The blue blanket','2026-07-18');
      insert into nightly_review_enrichment (
        session_id,position,family_id,user_id,selected_asset_id,draft_voice_uri,draft_voice_duration_sec,
        draft_voice_mime_type,draft_voice_waveform_json,draft_favorite,draft_reaction_code,retry_id,
        canonical_moment_id,canonical_voice_note_id,canonical_voice_object_id,media_commit_state,
        text_commit_state,voice_commit_state,reaction_commit_state,temp_cleanup_state,updated_at
      ) values (
        'session-draft',0,'family-a','parent-a','asset-alt','file:///private/tonight.m4a',8.5,
        'audio/mp4','[0.2,0.7]',1,'spark','retry-1','moment-1','voice-1','object-1','saved',
        'saved','failed','idle','pending','2026-07-18'
      );
    `);
    assert.equal(query(dbPath, `select selected_asset_id || '|' || retry_id || '|' || voice_commit_state
      from nightly_review_enrichment where family_id='family-a' and user_id='parent-a';`), 'asset-alt|retry-1|failed');
    assert.equal(query(dbPath, "select count(*) from nightly_review_enrichment where user_id='parent-b';"), '0');
    assert.throws(() => run(dbPath, `update nightly_review_enrichment set draft_reaction_code='made-up' where session_id='session-draft';`));
  });
});

test('current version 2 ledger upgrades in place with stable capture day and scan presence fields', () => {
  withDatabase((dbPath) => {
    migrateV2(dbPath);
    run(dbPath, candidateInsert({ familyId: 'family-a', userId: 'parent-a', assetId: 'asset-v2', state: 'eligible' }));
    run(dbPath, "update discovery_candidates set local_day='2025-07-23', scan_key='scan-v2' where asset_id='asset-v2';");
    run(dbPath, `begin immediate; ${FIRST_YEAR_CATCHUP_MIGRATION_SQL} pragma user_version = 3; commit;`);

    assert.equal(query(dbPath, 'pragma user_version;'), '3');
    assert.equal(query(dbPath, `select local_day || '|' || capture_timezone || '|' || last_seen_scan_key
      from discovery_candidates where asset_id='asset-v2';`), '2025-07-23|legacy-local|scan-v2');
    run(dbPath, `begin immediate; pragma user_version = 3; commit;`);
    assert.equal(query(dbPath, "select count(*) from discovery_candidates where asset_id='asset-v2';"), '1');
  });
});

test('version 3 upgrades to a private local-to-shared media identity map without exposing local IDs', () => {
  withDatabase((dbPath) => {
    migrateV3(dbPath);
    run(dbPath, `insert into local_asset_mappings (
      family_id, owner_user_id, asset_id, media_id, last_checked_at
    ) values ('family-a','parent-a','PH-PRIVATE/L0/001','media-1','2026-07-20');`);
    run(dbPath, `begin immediate; ${PRIVATE_REMOTE_MEDIA_IDENTITY_MIGRATION_SQL} pragma user_version = 4; commit;`);
    run(dbPath, `update local_asset_mappings set remote_asset_key='11111111-1111-4111-8111-111111111111',
      moment_id='moment-1', updated_at='2026-07-20' where asset_id='PH-PRIVATE/L0/001';`);

    assert.equal(query(dbPath, 'pragma user_version;'), '4');
    assert.equal(query(dbPath, `select asset_id || '|' || remote_asset_key || '|' || moment_id
      from local_asset_mappings;`), 'PH-PRIVATE/L0/001|11111111-1111-4111-8111-111111111111|moment-1');
    const columns = query(dbPath, 'pragma table_info(local_asset_mappings);')
      .split('\n').filter(Boolean).map((line) => line.split('|')[1]);
    for (const required of MEDIA_DB_REQUIRED_REMOTE_MAPPING_COLUMNS.filter(
      (name) => !['provider_upload_json', 'canonical_side_effect_started'].includes(name),
    )) {
      assert.ok(columns.includes(required));
    }
  });
});

test('version 4 upgrades Tonight collection drafts without changing an active card', () => {
  withDatabase((dbPath) => {
    migrateV4(dbPath);
    run(dbPath, candidateInsert({ familyId: 'family-a', userId: 'parent-a', assetId: 'asset-collection', state: 'shown' }));
    run(dbPath, `
      insert into nightly_review_sessions values (
        'session-collection','family-a','parent-a','2026-07-20','America/New_York','seed','active',
        'nightly-queue-v1','curated-ledger-v1',0,1,'2026-07-20','2026-07-20',null
      );
      insert into nightly_review_items (
        session_id,position,family_id,user_id,asset_id,reason_code,item_state,commit_state,draft_text,updated_at
      ) values ('session-collection',0,'family-a','parent-a','asset-collection','best_day','shown','idle','One line','2026-07-20');
      insert into nightly_review_enrichment (
        session_id,position,family_id,user_id,draft_favorite,updated_at
      ) values ('session-collection',0,'family-a','parent-a',1,'2026-07-20');
    `);
    run(dbPath, `begin immediate; ${TONIGHT_COLLECTION_DRAFT_MIGRATION_SQL} pragma user_version = 5; commit;`);
    run(dbPath, `update nightly_review_enrichment set draft_collection_keys_json='["media:photos"]' where session_id='session-collection';`);
    assert.equal(query(dbPath, `select i.draft_text || '|' || e.draft_favorite || '|' || e.draft_collection_keys_json
      from nightly_review_items i join nightly_review_enrichment e using(session_id,position);`), 'One line|1|["media:photos"]');
    const columns = query(dbPath, 'pragma table_info(nightly_review_enrichment);')
      .split('\n').filter(Boolean).map((line) => line.split('|')[1]);
    for (const required of MEDIA_DB_REQUIRED_COLLECTION_DRAFT_COLUMNS) assert.ok(columns.includes(required));
  });
});

test('version 5 upgrades legacy continuation seeds to an explicit durable flag', () => {
  withDatabase((dbPath) => {
    migrateV5(dbPath);
    run(dbPath, `
      insert into nightly_review_sessions values
        ('primary','family-a','parent-a','2026-08-10','America/New_York','2026-08-10','completed',
         'nightly-queue-v2','curated-ledger-v1',1,1,'2026-08-10','2026-08-10','2026-08-10'),
        ('more','family-a','parent-a','2026-08-10','America/New_York','2026-08-10:more:1','completed',
         'nightly-queue-v2','curated-ledger-v1',1,1,'2026-08-10','2026-08-10','2026-08-10'),
        ('revalidated','family-a','parent-a','2026-08-10','America/New_York','2026-08-10:revalidated','active',
         'nightly-queue-v2','curated-ledger-v1',0,1,'2026-08-10','2026-08-10',null);
    `);
    run(dbPath, `begin immediate; ${TONIGHT_CONTINUATION_MIGRATION_SQL} pragma user_version = 6; commit;`);
    assert.equal(query(dbPath, `select group_concat(value, ',') from (
      select session_id || ':' || is_continuation as value
      from nightly_review_sessions order by session_id
    );`), 'more:1,primary:0,revalidated:1');
    const columns = query(dbPath, 'pragma table_info(nightly_review_sessions);')
      .split('\n').filter(Boolean).map((line) => line.split('|')[1]);
    for (const required of MEDIA_DB_REQUIRED_SESSION_COLUMNS) assert.ok(columns.includes(required));
  });
});

test('version 6 distinguishes parent interaction and persists provider retry identity', () => {
  withDatabase((dbPath) => {
    migrateV6(dbPath);
    run(dbPath, candidateInsert({ familyId: 'family-a', userId: 'parent-a', assetId: 'asset-defaults', state: 'shown' }));
    run(dbPath, `
      insert into local_asset_mappings (
        family_id,owner_user_id,asset_id,media_id,last_checked_at,remote_asset_key,moment_id,updated_at
      ) values (
        'family-a','parent-a','private-asset','media-1','2026-08-11',
        '11111111-1111-4111-8111-111111111111','moment-1','2026-08-11'
      );
      insert into nightly_review_sessions values (
        'session-defaults','family-a','parent-a','2026-08-11','America/New_York','seed','active',
        'nightly-queue-v2','curated-ledger-v1',0,1,'2026-08-11','2026-08-11',null,0
      );
      insert into nightly_review_items (
        session_id,position,family_id,user_id,asset_id,reason_code,item_state,commit_state,updated_at
      ) values (
        'session-defaults',0,'family-a','parent-a','asset-defaults','best_day','shown','idle','2026-08-11'
      );
      insert into nightly_review_enrichment (
        session_id,position,family_id,user_id,draft_collection_keys_json,updated_at
      ) values ('session-defaults',0,'family-a','parent-a','["media:photos"]','2026-08-11');
    `);
    run(dbPath, `begin immediate; ${CANONICAL_KEEP_RESUME_MIGRATION_SQL} pragma user_version = 7; commit;`);
    run(dbPath, `update local_asset_mappings set provider_upload_json='{"uid":"stream-1","state":"uploaded"}'
      where asset_id='private-asset';`);

    assert.equal(query(dbPath, 'pragma user_version;'), '7');
    assert.equal(query(dbPath, `select parent_interacted from nightly_review_enrichment
      where session_id='session-defaults';`), '0');
    assert.equal(query(dbPath, `select provider_upload_json from local_asset_mappings
      where asset_id='private-asset';`), '{"uid":"stream-1","state":"uploaded"}');
  });
});

test('version 7 preserves legacy parent work and makes frame-only videos recoverable', () => {
  withDatabase((dbPath) => {
    migrateV7(dbPath);
    for (const assetId of [
      'asset-defaults',
      'asset-selected',
      'asset-alternate',
      'asset-voice',
      'asset-favorite',
      'asset-reaction',
      'asset-committed',
    ]) {
      run(dbPath, candidateInsert({ familyId: 'family-a', userId: 'parent-a', assetId, state: 'shown' }));
    }
    run(dbPath, `
      insert into discovery_candidates (
        family_id,user_id,asset_id,media_type,local_uri,preview_uri,availability,
        scorer_version,lifecycle_state,first_seen_at,last_analyzed_at
      ) values
        ('family-a','parent-a','legacy-video','video','file://sample.jpg','file://sample.jpg','available',
         'curated-ledger-v1','shown','2026-08-11','2026-08-11'),
        ('family-a','parent-a','playable-video','video','file://source.mov','file://poster.jpg','available',
         'curated-ledger-v1','shown','2026-08-11','2026-08-11');
      insert into nightly_review_sessions (
        session_id,family_id,user_id,local_day,timezone,seed,status,generation_version,model_version,
        current_position,item_count,created_at,updated_at,is_continuation
      ) values (
        'session-legacy','family-a','parent-a','2026-08-11','America/New_York','seed','active',
        'nightly-queue-v2','curated-ledger-v1',0,8,'2026-08-11','2026-08-11',0
      );
      insert into nightly_review_items (
        session_id,position,family_id,user_id,asset_id,reason_code,item_state,commit_state,updated_at
      ) values
        ('session-legacy',0,'family-a','parent-a','asset-defaults','best_day','shown','idle','2026-08-11'),
        ('session-legacy',1,'family-a','parent-a','asset-selected','best_day','shown','idle','2026-08-11'),
        ('session-legacy',2,'family-a','parent-a','asset-voice','best_day','shown','idle','2026-08-11'),
        ('session-legacy',3,'family-a','parent-a','asset-favorite','best_day','shown','idle','2026-08-11'),
        ('session-legacy',4,'family-a','parent-a','asset-reaction','best_day','shown','idle','2026-08-11'),
        ('session-legacy',5,'family-a','parent-a','asset-committed','best_day','shown','idle','2026-08-11'),
        ('session-legacy',6,'family-a','parent-a','legacy-video','clear_video','shown','idle','2026-08-11'),
        ('session-legacy',7,'family-a','parent-a','playable-video','clear_video','shown','idle','2026-08-11');
      insert into nightly_review_enrichment (
        session_id,position,family_id,user_id,selected_asset_id,draft_voice_uri,draft_favorite,
        draft_reaction_code,media_commit_state,draft_collection_keys_json,parent_interacted,updated_at
      ) values
        ('session-legacy',0,'family-a','parent-a',null,null,0,null,'idle','["media:photos"]',0,'2026-08-11'),
        ('session-legacy',1,'family-a','parent-a','asset-alternate',null,0,null,'idle',null,0,'2026-08-11'),
        ('session-legacy',2,'family-a','parent-a',null,'file://voice.m4a',0,null,'idle',null,0,'2026-08-11'),
        ('session-legacy',3,'family-a','parent-a',null,null,1,null,'idle',null,0,'2026-08-11'),
        ('session-legacy',4,'family-a','parent-a',null,null,0,'spark','idle',null,0,'2026-08-11'),
        ('session-legacy',5,'family-a','parent-a',null,null,0,null,'saved',null,0,'2026-08-11'),
        ('session-legacy',6,'family-a','parent-a',null,null,0,null,'idle',null,0,'2026-08-11');
    `);

    run(dbPath, `begin immediate; ${LEGACY_PARENT_VIDEO_RECOVERY_MIGRATION_SQL} pragma user_version = 8; commit;`);

    assert.equal(query(dbPath, `select parent_interacted from nightly_review_enrichment
      where session_id='session-legacy' and position=0;`), '0');
    for (const position of [1, 2, 3, 4, 5]) {
      assert.equal(query(dbPath, `select parent_interacted from nightly_review_enrichment
        where session_id='session-legacy' and position=${position};`), '1');
    }
    assert.equal(query(dbPath, `select cast(local_uri is null as text) || '|' || preview_uri || '|' || availability || '|' || source_recovery_required
      from discovery_candidates where asset_id='legacy-video';`), '1|file://sample.jpg|unavailable|1');
    assert.equal(query(dbPath, `select item_state || '|' || last_error_code from nightly_review_items
      where session_id='session-legacy' and position=6;`), 'unavailable|asset_unavailable');
    assert.equal(query(dbPath, `select local_uri || '|' || preview_uri || '|' || availability || '|' || source_recovery_required
      from discovery_candidates where asset_id='playable-video';`), 'file://source.mov|file://poster.jpg|available|0');
  });
});

test('version 9 backfills only concrete canonical side effects', () => {
  withDatabase((dbPath) => {
    migrateV8(dbPath);
    for (const assetId of ['private-asset', 'canonical-asset', 'saved-asset']) {
      run(dbPath, candidateInsert({ familyId: 'family-a', userId: 'parent-a', assetId, state: 'shown' }));
    }
    run(dbPath, `
      insert into nightly_review_sessions (
        session_id,family_id,user_id,local_day,timezone,seed,status,generation_version,model_version,
        current_position,item_count,created_at,updated_at,is_continuation
      ) values (
        'session-side-effects','family-a','parent-a','2026-08-12','America/New_York','seed','active',
        'nightly-queue-v2','curated-ledger-v1',0,3,'2026-08-12','2026-08-12',0
      );
      insert into nightly_review_items (
        session_id,position,family_id,user_id,asset_id,reason_code,item_state,commit_state,last_error_code,updated_at
      ) values
        ('session-side-effects',0,'family-a','parent-a','private-asset','best_day','shown','failed','asset_unavailable','2026-08-12'),
        ('session-side-effects',1,'family-a','parent-a','canonical-asset','best_day','shown','failed','save_failed','2026-08-12'),
        ('session-side-effects',2,'family-a','parent-a','saved-asset','best_day','shown','failed','save_failed','2026-08-12');
      insert into nightly_review_enrichment (
        session_id,position,family_id,user_id,canonical_moment_id,media_commit_state,updated_at
      ) values
        ('session-side-effects',0,'family-a','parent-a',null,'failed','2026-08-12'),
        ('session-side-effects',1,'family-a','parent-a','remote-moment-1','failed','2026-08-12'),
        ('session-side-effects',2,'family-a','parent-a',null,'saved','2026-08-12');
    `);
    run(dbPath, `insert into local_asset_mappings (
      family_id,owner_user_id,asset_id,media_id,last_checked_at,remote_asset_key,moment_id,
      provider_upload_json,updated_at
    ) values (
      'family-a','parent-a','private-asset','media-1','2026-08-12',
      '11111111-1111-4111-8111-111111111111','moment-1',null,'2026-08-12'
    );`);
    run(dbPath, `insert into local_asset_mappings (
      family_id,owner_user_id,asset_id,media_id,last_checked_at,remote_asset_key,moment_id,
      provider_upload_json,updated_at
    ) values
      ('family-a','parent-a','canonical-asset','media-3','2026-08-12',
       '33333333-3333-4333-8333-333333333333','moment-3',null,'2026-08-12'),
      ('family-a','parent-a','saved-asset','media-4','2026-08-12',
       '44444444-4444-4444-8444-444444444444','moment-4',null,'2026-08-12');`);
    run(dbPath, `insert into local_asset_mappings (
      family_id,owner_user_id,asset_id,media_id,last_checked_at,remote_asset_key,moment_id,
      provider_upload_json,updated_at
    ) values (
      'family-a','parent-a','provider-asset','media-2','2026-08-12',
      '22222222-2222-4222-8222-222222222222','moment-2',
      '{"uid":"stream-1","reservationId":"reservation-1","state":"uploaded"}','2026-08-12'
    );`);
    run(dbPath, `begin immediate; ${CANONICAL_SIDE_EFFECT_MIGRATION_SQL} pragma user_version = 9; commit;`);

    assert.equal(query(dbPath, `select canonical_side_effect_started from local_asset_mappings
      where asset_id='private-asset';`), '0');
    assert.equal(query(dbPath, `select canonical_side_effect_started from local_asset_mappings
      where asset_id='provider-asset';`), '1');
    assert.equal(query(dbPath, `select canonical_side_effect_started from local_asset_mappings
      where asset_id='canonical-asset';`), '1');
    assert.equal(query(dbPath, `select canonical_side_effect_started from local_asset_mappings
      where asset_id='saved-asset';`), '1');
    run(dbPath, `update local_asset_mappings set canonical_side_effect_started=1
      where asset_id='private-asset';`);
    assert.equal(query(dbPath, `select canonical_side_effect_started from local_asset_mappings
      where asset_id='private-asset';`), '1');
    assert.equal(query(dbPath, 'pragma user_version;'), '9');
  });
});

test('upgrade preserves the current production local tables and their rows', () => {
  withDatabase((dbPath) => {
    run(dbPath, `
      create table media_items (media_id text primary key, family_id text not null, media_type text not null);
      create table media_sync_cursors (family_id text primary key, cursor text, synced_at text);
      create table upload_jobs (id text primary key, family_id text not null, media_type text not null, status text not null);
      create table local_asset_mappings (family_id text, owner_user_id text, asset_id text, media_id text, last_checked_at text, primary key (family_id, owner_user_id, asset_id));
      insert into media_items values ('saved-1', 'family-a', 'image');
      insert into upload_jobs values ('job-1', 'family-a', 'image', 'queued');
      insert into media_sync_cursors values ('family-a', 'cursor-a', '2026-07-18');
    `);
    migrate(dbPath);
    assert.equal(query(dbPath, 'select count(*) from media_items;'), '1');
    assert.equal(query(dbPath, 'select count(*) from upload_jobs;'), '1');
    assert.equal(query(dbPath, 'select cursor from media_sync_cursors;'), 'cursor-a');
  });
});

test('scopes and lifecycle constraints reject unsafe or free-form rows', () => {
  withDatabase((dbPath) => {
    migrate(dbPath);
    const insert = candidateInsert({ familyId: 'family-a', userId: 'parent-a', assetId: 'asset-1', state: 'eligible' });
    run(dbPath, insert);
    run(dbPath, candidateInsert({ familyId: 'family-a', userId: 'parent-b', assetId: 'asset-1', state: 'eligible' }));
    assert.equal(query(dbPath, "select count(*) from discovery_candidates where asset_id='asset-1';"), '2');
    assert.throws(() => run(dbPath, candidateInsert({ familyId: 'family-a', userId: 'parent-a', assetId: 'bad', state: 'maybe' })));
  });
});

test('overlapping scans remain idempotent and one scope has only one active queue', () => {
  withDatabase((dbPath) => {
    migrate(dbPath);
    run(dbPath, candidateInsert({ familyId: 'family-a', userId: 'parent-a', assetId: 'asset-1', state: 'eligible' }));
    run(dbPath, `${candidateInsert({ familyId: 'family-a', userId: 'parent-a', assetId: 'asset-1', state: 'eligible' })
      .replace(';', " on conflict(family_id,user_id,asset_id) do update set last_analyzed_at='2026-07-19';")}`);
    assert.equal(query(dbPath, "select count(*) from discovery_candidates where family_id='family-a' and user_id='parent-a' and asset_id='asset-1';"), '1');

    run(dbPath, `insert into nightly_review_sessions values (
      'session-a','family-a','parent-a','2026-07-18','America/New_York','seed','active',
      'nightly-queue-v1','curated-ledger-v1',0,0,'2026-07-18','2026-07-18',null,0
    );`);
    assert.throws(() => run(dbPath, `insert into nightly_review_sessions values (
      'session-b','family-a','parent-a','2026-07-19','America/New_York','seed','active',
      'nightly-queue-v1','curated-ledger-v1',0,0,'2026-07-19','2026-07-19',null,0
    );`));
  });
});

test('queue session and item creation roll back together on an invalid item', () => {
  withDatabase((dbPath) => {
    migrate(dbPath);
    assert.throws(() => run(dbPath, `
      begin immediate;
      insert into nightly_review_sessions values (
        'session-rollback','family-a','parent-a','2026-07-18','America/New_York','seed','active',
        'nightly-queue-v1','curated-ledger-v1',0,1,'2026-07-18','2026-07-18',null,0
      );
      insert into nightly_review_items (
        session_id,position,family_id,user_id,asset_id,reason_code,item_state,updated_at
      ) values ('session-rollback',0,'family-a','parent-a','missing-asset','made_up_reason','queued','2026-07-18');
      commit;
    `));
    assert.equal(query(dbPath, "select count(*) from nightly_review_sessions where session_id='session-rollback';"), '0');
  });
});

test('session order, draft and decision survive process-style database reopen', () => {
  withDatabase((dbPath) => {
    migrate(dbPath);
    run(dbPath, candidateInsert({ familyId: 'family-a', userId: 'parent-a', assetId: 'asset-1', state: 'queued' }));
    run(dbPath, `
      insert into nightly_review_sessions values (
        'session-1','family-a','parent-a','2026-07-18','America/New_York','seed','active',
        'nightly-queue-v1','curated-ledger-v1',0,1,'2026-07-18T20:00:00Z','2026-07-18T20:00:00Z',null,0
      );
      insert into nightly_review_items (
        session_id,position,family_id,user_id,asset_id,reason_code,item_state,commit_state,draft_text,updated_at
      ) values ('session-1',0,'family-a','parent-a','asset-1','best_day','shown','saving','The blue blanket','2026-07-18T20:01:00Z');
    `);
    // A separate sqlite3 process is the equivalent of reopening after termination.
    assert.equal(query(dbPath, "select position || '|' || draft_text || '|' || commit_state from nightly_review_items;"), '0|The blue blanket|saving');
    run(dbPath, `
      begin immediate;
      update nightly_review_items set item_state='kept', commit_state='done', decided_at='2026-07-18T20:02:00Z' where session_id='session-1' and position=0;
      update discovery_candidates set lifecycle_state='kept', decided_at='2026-07-18T20:02:00Z' where family_id='family-a' and user_id='parent-a' and asset_id='asset-1';
      update nightly_review_sessions set current_position=1,status='completed',completed_at='2026-07-18T20:02:00Z' where session_id='session-1';
      commit;
    `);
    assert.equal(query(dbPath, "select lifecycle_state from discovery_candidates where asset_id='asset-1';"), 'kept');
    assert.equal(query(dbPath, "select status || '|' || current_position from nightly_review_sessions;"), 'completed|1');
  });
});

test('partial corrupt migration is diagnosable instead of silently accepted', () => {
  withDatabase((dbPath) => {
    run(dbPath, 'create table discovery_candidates (family_id text, user_id text, asset_id text);');
    assert.throws(() => run(dbPath, CANDIDATE_LEDGER_MIGRATION_SQL), /Command failed/);
    const columns = new Set(query(dbPath, 'pragma table_info(discovery_candidates);')
      .split('\n').filter(Boolean).map((line) => line.split('|')[1]));
    const missing = MEDIA_DB_REQUIRED_CANDIDATE_COLUMNS.filter((column) => !columns.has(column));
    assert.deepEqual(missing, [
      'lifecycle_state',
      'scorer_version',
      'last_analyzed_at',
      'capture_timezone',
      'last_seen_scan_key',
      'last_seen_at',
      'unavailable_code',
      'source_recovery_required',
    ]);
  });
});

test('migration wrapper turns partial or storage failures into actionable diagnostics', () => {
  const database = {
    getFirstSync: () => ({ user_version: 0 }),
    withTransactionSync: () => { throw new Error('database or disk is full'); },
  };
  assert.throws(
    () => applyMediaDbMigrations(database),
    /migration failed safely.*freeing device storage/i,
  );
});

test('schema validation rejects a current database missing saved-day coverage', () => {
  const database = {
    getAllSync: (sql) => {
      if (sql.includes('discovery_candidates')) return MEDIA_DB_REQUIRED_CANDIDATE_COLUMNS.map((name) => ({ name }));
      if (sql.includes('nightly_review_enrichment')) {
        return [...MEDIA_DB_REQUIRED_ENRICHMENT_COLUMNS, ...MEDIA_DB_REQUIRED_COLLECTION_DRAFT_COLUMNS]
          .map((name) => ({ name }));
      }
      if (sql.includes('nightly_review_sessions')) return MEDIA_DB_REQUIRED_SESSION_COLUMNS.map((name) => ({ name }));
      if (sql.includes('family_saved_day_facts')) return [];
      if (sql.includes('local_asset_mappings')) return MEDIA_DB_REQUIRED_REMOTE_MAPPING_COLUMNS.map((name) => ({ name }));
      return MEDIA_DB_REQUIRED_SAVED_DAY_COLUMNS.map((name) => ({ name }));
    },
  };
  assert.throws(() => assertCandidateLedgerSchema(database), /saved-day coverage store is incomplete/i);
});

test('private evidence is accepted only in the device-local ledger schema', () => {
  withDatabase((dbPath) => {
    migrate(dbPath);
    run(dbPath, candidateInsert({ familyId: 'family-a', userId: 'parent-a', assetId: 'asset-private', state: 'eligible' }));
    run(dbPath, `update discovery_candidates
      set visual_fingerprint_json='[1,-1]', identity_evidence_json='{"score":0.94}'
      where family_id='family-a' and user_id='parent-a' and asset_id='asset-private';`);
    assert.equal(query(dbPath, `select visual_fingerprint_json || '|' || identity_evidence_json
      from discovery_candidates where asset_id='asset-private';`), '[1,-1]|{"score":0.94}');
  });
});

test('5,000 private candidates ingest and query within a bounded page', () => {
  withDatabase((dbPath) => {
    const migrationStarted = performance.now();
    migrate(dbPath);
    const migrationMs = performance.now() - migrationStarted;
    const insertStarted = performance.now();
    for (let offset = 0; offset < 5000; offset += CANDIDATE_BATCH_SIZE) {
      const rows = [];
      for (let index = offset; index < Math.min(5000, offset + CANDIDATE_BATCH_SIZE); index += 1) {
        const day = `2026-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}`;
        rows.push(`('family-load','parent-load','asset-${index}','image','available',${index},'${day}',0.91,${0.25 + (index % 70) / 100},'event-${index}','curated-ledger-v1','best_day','eligible','scan-load','2026-07-18','2026-07-18')`);
      }
      run(dbPath, `begin immediate; insert into discovery_candidates (
        family_id,user_id,asset_id,media_type,availability,capture_time_ms,local_day,identity_score,capture_quality,
        event_cluster_key,scorer_version,selection_reason_code,lifecycle_state,scan_key,first_seen_at,last_analyzed_at
      ) values ${rows.join(',')}; commit;`);
    }
    const insertMs = performance.now() - insertStarted;
    run(dbPath, `insert into family_saved_day_facts (family_id, local_day, saved_count, refreshed_at)
      select 'family-load', local_day, 1, '2026-07-20'
      from discovery_candidates where family_id='family-load' group by local_day limit 168;`);
    const queryStarted = performance.now();
    const selected = query(dbPath, `with scoped as (
      select c.*, not exists (
        select 1 from family_saved_day_facts f where f.family_id=c.family_id and f.local_day=c.local_day
      ) as coverage_needed
      from discovery_candidates c where c.family_id='family-load' and c.user_id='parent-load'
        and c.lifecycle_state='eligible' and c.availability='available'
    ), ranked as (
      select *, row_number() over (
        partition by local_day order by capture_quality desc, identity_score desc, capture_time_ms desc, asset_id asc
      ) as day_rank from scoped
    ) select count(*) from (
      select asset_id from ranked where day_rank=1 or (day_rank=2 and capture_quality>=0.55)
      order by coverage_needed desc, day_rank asc, capture_quality desc limit 900
    );`);
    const queryMs = performance.now() - queryStarted;
    const databaseBytes = statSync(dbPath).size;

    console.info(`release2-performance migration_ms=${migrationMs.toFixed(1)} insert_5000_ms=${insertMs.toFixed(1)} coverage_query_5000_ms=${queryMs.toFixed(1)} database_bytes=${databaseBytes} query_page_limit=900 ingest_batch_size=${CANDIDATE_BATCH_SIZE}`);

    assert.ok(Number(selected) > 0 && Number(selected) <= 672);
    assert.ok(insertMs < 2500, `insert took ${insertMs.toFixed(1)}ms`);
    assert.ok(queryMs < 250, `coverage query took ${queryMs.toFixed(1)}ms`);
    assert.ok(databaseBytes < 8 * 1024 * 1024, 'database stays below 8 MB for compact fixture rows');
  });
});

test('5,000 kept-media identity mappings remain bounded and use the remote lookup index', () => {
  withDatabase((dbPath) => {
    migrate(dbPath);
    const insertStarted = performance.now();
    for (let offset = 0; offset < 5000; offset += 250) {
      const rows = [];
      for (let index = offset; index < offset + 250; index += 1) {
        const suffix = String(index).padStart(12, '0');
        rows.push(`('family-mapping','parent-mapping','private-local-${index}','media-${index}','2026-07-20','00000000-0000-4000-8000-${suffix}','moment-${index}','2026-07-20')`);
      }
      run(dbPath, `begin immediate; insert into local_asset_mappings (
        family_id,owner_user_id,asset_id,media_id,last_checked_at,remote_asset_key,moment_id,updated_at
      ) values ${rows.join(',')}; commit;`);
    }
    const insertMs = performance.now() - insertStarted;
    const requestedKeys = Array.from({ length: 250 }, (_, position) => {
      const index = position * 19;
      return `'00000000-0000-4000-8000-${String(index).padStart(12, '0')}'`;
    });
    const queryStarted = performance.now();
    const selected = query(dbPath, `select count(*) from local_asset_mappings
      where family_id='family-mapping' and owner_user_id='parent-mapping'
        and remote_asset_key in (${requestedKeys.join(',')});`);
    const queryMs = performance.now() - queryStarted;
    const queryPlan = query(dbPath, `explain query plan select asset_id from local_asset_mappings
      where family_id='family-mapping' and owner_user_id='parent-mapping'
        and remote_asset_key='00000000-0000-4000-8000-000000000123';`);
    const databaseBytes = statSync(dbPath).size;

    console.info(`shared-identity-performance insert_5000_ms=${insertMs.toFixed(1)} lookup_250_ms=${queryMs.toFixed(1)} database_bytes=${databaseBytes} lookup_page_limit=250`);

    assert.equal(selected, '250');
    assert.match(queryPlan, /local_asset_mappings_remote_key_idx/);
    assert.ok(insertMs < 2500, `mapping insert took ${insertMs.toFixed(1)}ms`);
    assert.ok(queryMs < 250, `mapping query took ${queryMs.toFixed(1)}ms`);
    assert.ok(databaseBytes < 5 * 1024 * 1024, '5,000 compact mappings stay below 5 MB');
  });
});

function migrate(dbPath) {
  if (query(dbPath, 'pragma user_version;') === String(MEDIA_DB_SCHEMA_VERSION)) return;
  migrateV1(dbPath);
  run(dbPath, `begin immediate; ${TONIGHT_ENRICHMENT_MIGRATION_SQL} ${FIRST_YEAR_CATCHUP_MIGRATION_SQL} ${PRIVATE_REMOTE_MEDIA_IDENTITY_MIGRATION_SQL} ${TONIGHT_COLLECTION_DRAFT_MIGRATION_SQL} ${TONIGHT_CONTINUATION_MIGRATION_SQL} ${CANONICAL_KEEP_RESUME_MIGRATION_SQL} ${LEGACY_PARENT_VIDEO_RECOVERY_MIGRATION_SQL} ${CANONICAL_SIDE_EFFECT_MIGRATION_SQL} pragma user_version = ${MEDIA_DB_SCHEMA_VERSION}; commit;`);
}

function migrateV1(dbPath) {
  run(dbPath, `begin immediate; ${CANDIDATE_LEDGER_MIGRATION_SQL} pragma user_version = 1; commit;`);
}

function migrateV2(dbPath) {
  migrateV1(dbPath);
  run(dbPath, `begin immediate; ${TONIGHT_ENRICHMENT_MIGRATION_SQL} pragma user_version = 2; commit;`);
}

function migrateV3(dbPath) {
  migrateV2(dbPath);
  run(dbPath, `begin immediate;
    ${FIRST_YEAR_CATCHUP_MIGRATION_SQL}
    create table if not exists local_asset_mappings (
      family_id text, owner_user_id text, asset_id text, media_id text, last_checked_at text,
      primary key (family_id, owner_user_id, asset_id)
    );
    pragma user_version = 3;
    commit;`);
}

function migrateV4(dbPath) {
  migrateV3(dbPath);
  run(dbPath, `begin immediate; ${PRIVATE_REMOTE_MEDIA_IDENTITY_MIGRATION_SQL} pragma user_version = 4; commit;`);
}

function migrateV5(dbPath) {
  migrateV4(dbPath);
  run(dbPath, `begin immediate; ${TONIGHT_COLLECTION_DRAFT_MIGRATION_SQL} pragma user_version = 5; commit;`);
}

function migrateV6(dbPath) {
  migrateV5(dbPath);
  run(dbPath, `begin immediate; ${TONIGHT_CONTINUATION_MIGRATION_SQL} pragma user_version = 6; commit;`);
}

function migrateV7(dbPath) {
  migrateV6(dbPath);
  run(dbPath, `begin immediate; ${CANONICAL_KEEP_RESUME_MIGRATION_SQL} pragma user_version = 7; commit;`);
}

function migrateV8(dbPath) {
  migrateV7(dbPath);
  run(dbPath, `begin immediate; ${LEGACY_PARENT_VIDEO_RECOVERY_MIGRATION_SQL} pragma user_version = 8; commit;`);
}

function candidateInsert({ familyId, userId, assetId, state }) {
  return `insert into discovery_candidates (
    family_id,user_id,asset_id,media_type,availability,scorer_version,lifecycle_state,first_seen_at,last_analyzed_at
  ) values ('${familyId}','${userId}','${assetId}','image','available','curated-ledger-v1','${state}','2026-07-18','2026-07-18');`;
}

function withDatabase(callback) {
  const directory = mkdtempSync(join(tmpdir(), 'olw-media-db-'));
  const dbPath = join(directory, 'media.sqlite');
  try {
    callback(dbPath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function run(dbPath, sql) {
  execFileSync('/usr/bin/sqlite3', ['-bail', dbPath], { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });
}

function query(dbPath, sql) {
  return execFileSync('/usr/bin/sqlite3', ['-batch', '-noheader', dbPath, sql], { encoding: 'utf8' }).trim();
}
