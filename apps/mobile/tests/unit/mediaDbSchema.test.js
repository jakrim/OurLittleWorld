import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import { CANDIDATE_BATCH_SIZE } from '../../src/candidateLedgerModel.js';

import {
  CANDIDATE_LEDGER_MIGRATION_SQL,
  applyMediaDbMigrations,
  MEDIA_DB_REQUIRED_CANDIDATE_COLUMNS,
  MEDIA_DB_REQUIRED_ENRICHMENT_COLUMNS,
  MEDIA_DB_SCHEMA_VERSION,
  TONIGHT_ENRICHMENT_MIGRATION_SQL,
} from '../../src/mediaDbSchema.js';

test('candidate ledger migration succeeds on a fresh database and is repeatable', () => {
  withDatabase((dbPath) => {
    migrate(dbPath);
    migrate(dbPath);
    assert.equal(query(dbPath, 'pragma user_version;'), String(MEDIA_DB_SCHEMA_VERSION));
    const tables = query(dbPath, "select name from sqlite_master where type='table' order by name;").split('\n');
    for (const table of ['discovery_candidates', 'candidate_clusters', 'candidate_cluster_members', 'nightly_review_sessions', 'nightly_review_items', 'nightly_review_enrichment']) {
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
    for (const required of MEDIA_DB_REQUIRED_ENRICHMENT_COLUMNS) assert.ok(columns.includes(required));
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
        'nightly-queue-v1','curated-ledger-v1',0,1,'2026-07-18','2026-07-18',null
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

test('upgrade preserves the current production local tables and their rows', () => {
  withDatabase((dbPath) => {
    run(dbPath, `
      create table media_items (media_id text primary key, family_id text not null, media_type text not null);
      create table media_sync_cursors (family_id text primary key, cursor text, synced_at text);
      create table upload_jobs (id text primary key, family_id text not null, media_type text not null, status text not null);
      create table local_asset_mappings (family_id text, owner_user_id text, asset_id text, primary key (family_id, owner_user_id, asset_id));
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
      'nightly-queue-v1','curated-ledger-v1',0,0,'2026-07-18','2026-07-18',null
    );`);
    assert.throws(() => run(dbPath, `insert into nightly_review_sessions values (
      'session-b','family-a','parent-a','2026-07-19','America/New_York','seed','active',
      'nightly-queue-v1','curated-ledger-v1',0,0,'2026-07-19','2026-07-19',null
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
        'nightly-queue-v1','curated-ledger-v1',0,1,'2026-07-18','2026-07-18',null
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
        'nightly-queue-v1','curated-ledger-v1',0,1,'2026-07-18T20:00:00Z','2026-07-18T20:00:00Z',null
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
    assert.deepEqual(missing, ['lifecycle_state', 'scorer_version', 'last_analyzed_at']);
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

test('private ledger implementation has no Supabase, analytics, Sentry or PostHog transport', () => {
  const source = readFileSync(new URL('../../src/candidateLedgerStore.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"]\.\/supabase|trackAnalytics|Sentry|PostHog|posthog/);
  for (const privateField of ['asset_id', 'visual_fingerprint_json', 'identity_evidence_json']) {
    assert.ok(CANDIDATE_LEDGER_MIGRATION_SQL.includes(privateField));
  }
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
    const queryStarted = performance.now();
    const selected = query(dbPath, `with ranked as (
      select asset_id, local_day, row_number() over (partition by local_day order by capture_quality desc, identity_score desc, capture_time_ms desc, asset_id asc) as day_rank
      from discovery_candidates where family_id='family-load' and user_id='parent-load' and lifecycle_state='eligible'
    ) select count(*) from (select asset_id from ranked where day_rank <= 2 limit 900);`);
    const queryMs = performance.now() - queryStarted;
    const databaseBytes = statSync(dbPath).size;

    console.info(`release1-performance migration_ms=${migrationMs.toFixed(1)} insert_5000_ms=${insertMs.toFixed(1)} query_5000_ms=${queryMs.toFixed(1)} database_bytes=${databaseBytes} query_page_limit=900 ingest_batch_size=${CANDIDATE_BATCH_SIZE}`);

    assert.equal(selected, '168');
    assert.ok(insertMs < 2500, `insert took ${insertMs.toFixed(1)}ms`);
    assert.ok(queryMs < 1000, `query took ${queryMs.toFixed(1)}ms`);
    assert.ok(databaseBytes < 8 * 1024 * 1024, 'database stays below 8 MB for compact fixture rows');
  });
});

function migrate(dbPath) {
  migrateV1(dbPath);
  run(dbPath, `begin immediate; ${TONIGHT_ENRICHMENT_MIGRATION_SQL} pragma user_version = ${MEDIA_DB_SCHEMA_VERSION}; commit;`);
}

function migrateV1(dbPath) {
  run(dbPath, `begin immediate; ${CANDIDATE_LEDGER_MIGRATION_SQL} pragma user_version = 1; commit;`);
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
