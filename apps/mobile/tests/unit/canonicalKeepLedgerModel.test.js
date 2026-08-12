import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { reconcileCanonicalKeepInDatabase } from '../../src/canonicalKeepLedgerModel.js';
import { PRESERVE_CANDIDATE_LIFECYCLE_ON_ANALYSIS_SQL } from '../../src/candidateLedgerModel.js';
import {
  CANDIDATE_LEDGER_MIGRATION_SQL,
  TONIGHT_ENRICHMENT_MIGRATION_SQL,
} from '../../src/mediaDbSchema.js';

const scope = { familyId: 'family-a', userId: 'parent-a', assetId: 'asset-kept' };

test('canonical Keep retires an already queued candidate and completes its session', () => {
  withDatabase((database, dbPath) => {
    seedCandidate(dbPath, { assetId: scope.assetId, state: 'queued' });
    seedSession(dbPath, { assetId: scope.assetId });

    const result = reconcileCanonicalKeepInDatabase({
      database,
      ...scope,
      now: new Date('2026-08-12T12:00:00.000Z'),
    });

    assert.deepEqual(result, { retiredItems: 1, completedSessions: 1 });
    assert.equal(query(dbPath, `select lifecycle_state from discovery_candidates where asset_id='asset-kept';`), 'kept');
    assert.equal(query(dbPath, `select item_state || '|' || commit_state from nightly_review_items;`), 'kept|done');
    assert.equal(query(dbPath, `select status || '|' || current_position from nightly_review_sessions;`), 'completed|1');
  });
});

test('a Keep-first tombstone survives late candidate analysis and cannot re-enter the lane', () => {
  withDatabase((database, dbPath) => {
    reconcileCanonicalKeepInDatabase({
      database,
      ...scope,
      now: new Date('2026-08-12T12:00:00.000Z'),
    });
    run(dbPath, `insert into discovery_candidates (
      family_id,user_id,asset_id,media_type,availability,capture_quality,scorer_version,
      lifecycle_state,scan_key,first_seen_at,last_analyzed_at
    ) values (
      'family-a','parent-a','asset-kept','image','available',0.96,'curated-ledger-v1',
      'eligible','late-analysis','2026-08-12','2026-08-12'
    ) on conflict(family_id,user_id,asset_id) do update set
      capture_quality=excluded.capture_quality,
      lifecycle_state=${PRESERVE_CANDIDATE_LIFECYCLE_ON_ANALYSIS_SQL},
      scan_key=excluded.scan_key,
      last_analyzed_at=excluded.last_analyzed_at;`);

    assert.equal(query(dbPath, `select lifecycle_state || '|' || scan_key from discovery_candidates
      where asset_id='asset-kept';`), 'kept|late-analysis');
    assert.equal(query(dbPath, `select count(*) from discovery_candidates
      where asset_id='asset-kept' and lifecycle_state='eligible';`), '0');
  });
});

test('Tonight preserves its active item until enrichment finishes while locking the candidate kept', () => {
  withDatabase((database, dbPath) => {
    seedCandidate(dbPath, { assetId: scope.assetId, state: 'shown' });
    seedSession(dbPath, { assetId: scope.assetId, state: 'shown', commitState: 'saving' });

    const result = reconcileCanonicalKeepInDatabase({
      database,
      ...scope,
      activeTonightItem: { sessionId: 'session-1', position: 0 },
      now: new Date('2026-08-12T12:00:00.000Z'),
    });

    assert.deepEqual(result, { retiredItems: 0, completedSessions: 0 });
    assert.equal(query(dbPath, `select lifecycle_state from discovery_candidates where asset_id='asset-kept';`), 'kept');
    assert.equal(query(dbPath, `select item_state || '|' || commit_state from nightly_review_items;`), 'shown|saving');
    assert.equal(query(dbPath, `select status from nightly_review_sessions;`), 'active');
  });
});

function seedCandidate(dbPath, { assetId, state }) {
  run(dbPath, `insert into discovery_candidates (
    family_id,user_id,asset_id,media_type,availability,scorer_version,lifecycle_state,first_seen_at,last_analyzed_at
  ) values ('family-a','parent-a','${assetId}','image','available','curated-ledger-v1','${state}','2026-08-12','2026-08-12');`);
}

function seedSession(dbPath, { assetId, state = 'queued', commitState = 'idle' }) {
  run(dbPath, `insert into nightly_review_sessions (
    session_id,family_id,user_id,local_day,timezone,seed,status,generation_version,model_version,
    current_position,item_count,created_at,updated_at
  ) values (
    'session-1','family-a','parent-a','2026-08-12','UTC','seed','active','nightly-queue-v2',
    'curated-ledger-v1',0,1,'2026-08-12','2026-08-12'
  );
  insert into nightly_review_items (
    session_id,position,family_id,user_id,asset_id,reason_code,item_state,commit_state,updated_at
  ) values (
    'session-1',0,'family-a','parent-a','${assetId}','best_day','${state}','${commitState}','2026-08-12'
  );`);
}

function withDatabase(callback) {
  const directory = mkdtempSync(join(tmpdir(), 'olw-canonical-keep-'));
  const dbPath = join(directory, 'media.sqlite');
  try {
    run(dbPath, `begin immediate; ${CANDIDATE_LEDGER_MIGRATION_SQL} ${TONIGHT_ENRICHMENT_MIGRATION_SQL} commit;`);
    callback(sqliteAdapter(dbPath), dbPath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function sqliteAdapter(dbPath) {
  return {
    withTransactionSync: (callback) => callback(),
    runSync: (sql, params = []) => run(dbPath, bind(sql, params)),
    getAllSync: (sql, params = []) => {
      const output = execFileSync('/usr/bin/sqlite3', ['-json', dbPath, bind(sql, params)], { encoding: 'utf8' }).trim();
      return output ? JSON.parse(output) : [];
    },
    getFirstSync(sql, params = []) {
      return this.getAllSync(sql, params)[0] || null;
    },
  };
}

function bind(sql, params) {
  let index = 0;
  const bound = sql.replace(/\?/g, () => sqlValue(params[index++]));
  assert.equal(index, params.length, 'every SQLite parameter is bound');
  return bound;
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function run(dbPath, sql) {
  execFileSync('/usr/bin/sqlite3', ['-bail', dbPath], { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });
}

function query(dbPath, sql) {
  return execFileSync('/usr/bin/sqlite3', ['-batch', '-noheader', dbPath, sql], { encoding: 'utf8' }).trim();
}
