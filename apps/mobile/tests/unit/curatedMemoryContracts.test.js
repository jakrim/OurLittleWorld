import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (name) => readFileSync(new URL(`../../src/${name}`, import.meta.url), 'utf8');

test('scan persistence happens batch-by-batch before live state and checkpoint completion', () => {
  const controller = source('scanController.js');
  const launcher = source('libraryScanLauncher.js');
  const persistIndex = controller.indexOf('await onCandidates?.({ matches: newMatches, scanKey })');
  const stateIndex = controller.indexOf('const liveMatches = state.matches.concat(newMatches)');

  assert.ok(persistIndex > 0 && persistIndex < stateIndex, 'candidate batch is durable before live state advances');
  assert.match(launcher, /if \(finalState\?\.phase !== 'done'\) return;/);
  assert.match(launcher, /persistScanCandidates/);
  assert.match(launcher, /listCachedAnalysisAssetIds/);
});

test('scan and review progress use independent stores', () => {
  const checkpoint = source('scanCheckpoints.js');
  const ledger = source('candidateLedgerStore.js');
  assert.doesNotMatch(checkpoint, /discovery_candidates|nightly_review/);
  assert.doesNotMatch(ledger, /writeScanCheckpoint|scan_checkpoints/);
  assert.match(ledger, /lifecycle_state not in \('kept', 'skipped', 'rejected'\)/);
  assert.match(ledger, /status = 'active'/);
  assert.match(ledger, /else 'superseded'/);
  assert.match(ledger, /c\.lifecycle_state in \('queued', 'shown', 'kept', 'skipped'\)/);
  assert.match(ledger, /item_state in \('queued', 'shown', 'unavailable'\)/);
  assert.match(ledger, /item_state = 'unavailable'/);
});

test('private photo access fails closed for Circle and lapsed states before Photos is touched', () => {
  const launcher = source('libraryScanLauncher.js');
  const background = source('backgroundAutoIngestTask.js');
  const foreground = source('useForegroundAutoIngest.js');
  const manual = source('ScanProgressScreen.js');

  assert.ok(launcher.indexOf("reason: 'role-cannot-scan'") < launcher.indexOf('const permission ='));
  assert.ok(launcher.indexOf("reason: 'inactive-entitlement'") < launcher.indexOf('const permission ='));
  assert.ok(background.indexOf("reason: 'inactive-entitlement'") < background.indexOf('const permission ='));
  assert.match(foreground, /!entitlement\?\.isActive/);
  assert.match(foreground, /\['creator', 'partner'\]/);
  assert.match(manual, /const canScan = writer && entitlement\?\.isActive === true/);
  assert.match(manual, /if \(!family \|\| !user \|\| billingLoading \|\| !canScan\) return;[\s\S]*await startLibraryScan/);
});

test('Tonight keep uses the established tag upload and memory-note path', () => {
  const tonight = source('TonightScreen.js');
  const ledger = source('candidateLedgerStore.js');
  assert.match(tonight, /Tags\.setBaby/);
  assert.match(tonight, /Memories\.setMine/);
  assert.doesNotMatch(tonight, /from ['"]\.\/supabase|\.from\(['"]moment_media|\.from\(['"]photo_tags/);
  assert.match(tonight, /function parentError\(error, fallback\)[\s\S]*return fallback;/);
  assert.doesNotMatch(tonight, /return message &&/);
  assert.match(tonight, /const keepNeedsRetry = \['saving', 'failed'\]/);
  assert.match(ledger, /Finish retrying this Keep before skipping the memory/);
  assert.match(ledger, /Finish retrying this Keep before choosing another memory/);
});

test('Today and Tonight require an active entitlement before queue reads or writes', () => {
  const today = source('TodayScreen.js');
  const tonight = source('TonightScreen.js');
  const review = source('ReviewMatchesScreen.js');
  const route = readFileSync(new URL('../../app/tonight.jsx', import.meta.url), 'utf8');

  assert.match(today, /billingLoading \|\| !entitlement\?\.isActive/);
  assert.ok(tonight.indexOf('if (!canCurate') < tonight.indexOf('const next = readTonightSession'));
  assert.match(tonight, /entitlement\?\.isActive === true/);
  assert.match(review, /const canCurate = writer && entitlement\?\.isActive === true/);
  assert.match(route, /ProtectedRoute allowMissingSubscription/);
});

test('candidate observability never logs asset identifiers or private analysis evidence', () => {
  for (const file of ['scanController.js', 'libraryScanLauncher.js', 'ReviewMatchesScreen.js', 'candidateLedgerStore.js']) {
    const implementation = source(file);
    assert.doesNotMatch(implementation, /console\.(?:log|warn|error)\([^\n]*assetId/);
    assert.doesNotMatch(implementation, /console\.(?:log|warn|error)\([^\n]*(?:fingerprint|identityEvidence|localUri)/i);
  }
});
