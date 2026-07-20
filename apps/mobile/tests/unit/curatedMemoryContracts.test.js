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
  const commit = source('tonightCommit.js');
  const moments = source('moments.js');
  const ledger = source('candidateLedgerStore.js');
  assert.match(tonight, /commitTonightMemory/);
  assert.match(commit, /Tags\.setBaby/);
  assert.match(commit, /Memories\.setMine/);
  assert.match(commit, /ensureMomentVoiceNote/);
  assert.match(commit, /ensureMomentReaction/);
  assert.doesNotMatch(tonight, /from ['"]\.\/supabase|\.from\(['"]moment_media|\.from\(['"]photo_tags/);
  assert.match(tonight, /function parentError\(error, fallback\)[\s\S]*return fallback;/);
  assert.doesNotMatch(tonight, /return message &&/);
  assert.match(tonight, /const keepNeedsRetry = \['saving', 'failed'\]/);
  assert.match(moments, /Voice retry identity does not match this memory/);
  assert.match(moments, /existing\?\.upload_status === 'ready'/);
  assert.match(ledger, /Finish retrying this Keep before skipping the memory/);
  assert.match(ledger, /Finish retrying this Keep before choosing another memory/);
});

test('Tonight voice drafts are private, durable, removable and interruption-safe', () => {
  const tonight = source('TonightScreen.js');
  const voiceFiles = source('tonightVoiceDrafts.js');
  const ledger = source('candidateLedgerStore.js');
  assert.match(tonight, /requestRecordingPermissionsAsync/);
  assert.match(tonight, /Linking\.openSettings/);
  assert.match(tonight, /AppState\.addEventListener/);
  assert.match(tonight, /stopRecording\(\{ interrupted: true \}\)/);
  assert.match(tonight, /deleteTonightVoiceDraft/);
  assert.match(voiceFiles, /documentDirectory/);
  assert.match(voiceFiles, /copyAsync/);
  assert.match(voiceFiles, /deleteAsync/);
  assert.doesNotMatch(voiceFiles, /supabase|analytics|Sentry|PostHog|console\./i);
  assert.match(ledger, /draft_voice_uri/);
  assert.match(ledger, /discardedVoiceUri/);
});

test('best-of-burst alternates are bounded, clear, available and do not mutate decisions on selection', () => {
  const ledger = source('candidateLedgerStore.js');
  const start = ledger.indexOf('export function listTonightBurstAlternates');
  const end = ledger.indexOf('export function beginTonightKeep');
  const burst = ledger.slice(start, end);
  assert.match(ledger, /NIGHTLY_BURST_ALTERNATE_LIMIT = 12/);
  assert.match(burst, /c\.identity_band = 'clear'/);
  assert.match(burst, /c\.availability = 'available'/);
  assert.match(burst, /c\.capture_quality >= \?/);
  assert.match(burst, /not in \('kept', 'skipped', 'rejected', 'unavailable'\)/);
  const selectStart = burst.indexOf('export function selectTonightBurstAlternate');
  const selection = burst.slice(selectStart);
  assert.match(selection, /selected_asset_id = \?/);
  assert.doesNotMatch(selection, /updateCandidateDecision|lifecycle_state = 'kept'|lifecycle_state = 'skipped'/);
});

test('Tonight notification creation is queue-backed and role-entitlement gated', () => {
  const today = source('TodayScreen.js');
  const scheduler = source('tonightNotifications.js');
  const queueStart = today.indexOf('const session = ensureNightlySession');
  assert.ok(queueStart > 0 && queueStart < today.indexOf('maybeScheduleTonightNotification', queueStart));
  assert.match(today, /entitlementActive: entitlement\.isActive/);
  assert.match(today, /role: family\.me\.role/);
  assert.match(scheduler, /route: TONIGHT_NOTIFICATION_ROUTE/);
  assert.doesNotMatch(scheduler, /assetId|draft_voice|fingerprint|identity_score/);
});

test('Tonight private draft fields are prohibited from analytics', () => {
  const analytics = source('analyticsEventsModel.js');
  for (const field of ['draftVoiceUri', 'voicePath', 'reactionCode', 'retryId', 'assetId', 'localUri']) {
    assert.match(analytics, new RegExp(`['"]${field}['"]`));
  }
  const tonight = source('TonightScreen.js');
  const ledger = source('candidateLedgerStore.js');
  assert.doesNotMatch(tonight, /trackAnalytics|Sentry|PostHog/);
  assert.doesNotMatch(ledger, /trackAnalytics|Sentry|PostHog|from ['"]\.\/supabase/);
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
