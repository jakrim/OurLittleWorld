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
  assert.match(controller, /await onAssetsSeen\(\{ assetIds: sourceAssetIds, scanKey \}\)/);
  assert.match(launcher, /if \(change\?\.requiresFullLibraryScan\) \{[\s\S]*reconcileCompletedFullScan/);
  assert.match(launcher, /if \(!change\?\.requiresFullLibraryScan\) \{[\s\S]*cachedAnalysisIds/);
  assert.match(launcher, /getFamilyRitualSettings/);
  assert.match(launcher, /captureTimezone/);
  assert.match(launcher, /birthdayISO: family\.babyBirthday,[\s\S]*captureTimezone/);
});

test('family saved-day coverage fetches only bounded date facts before queue creation', () => {
  const coverage = source('savedDayCoverage.js');
  const today = source('TodayScreen.js');
  const tonight = source('TonightScreen.js');
  assert.match(coverage, /SAVED_DAY_COVERAGE_PAGE_SIZE = 500/);
  assert.match(coverage, /\.select\('captured_at'\)/);
  assert.doesNotMatch(coverage, /asset_id|local_identifier|fingerprint|identity|media_url/i);
  assert.ok(today.indexOf('await refreshFamilySavedDayCoverage') < today.indexOf('const session = ensureNightlySession'));
  assert.ok(tonight.indexOf('await refreshFamilySavedDayCoverage') < tonight.indexOf('next = ensureNightlySession'));
});

test('365-day browsing uses a lightweight bounded archive instead of hydrating 5,000 rich moments', () => {
  const moments = source('moments.js');
  const daily = source('DailyAlbumScreen.js');
  const start = moments.indexOf('export async function listMomentDayArchive');
  const end = moments.indexOf('export async function getFamilyArchiveCounts', start);
  const indexPath = moments.slice(start, end);
  const detailStart = moments.indexOf('export async function listMomentDayDetails', end);
  const detailEnd = moments.indexOf('export async function getMomentDetail', detailStart);
  const detailPath = moments.slice(detailStart, detailEnd);
  assert.match(indexPath, /MOMENT_DAY_INDEX_MAX_MOMENTS/);
  assert.match(indexPath, /\.select\('id, captured_at, moment_media \(id, media_type, metadata, sort_order\)'\)/);
  assert.doesNotMatch(indexPath, /voice_notes|moment_tags|moment_reactions|local_identifier/);
  assert.match(detailPath, /utcRangeForLocalDay/);
  assert.match(detailPath, /\.select\('id, captured_at, moment_media \(id, media_type, metadata, sort_order\)'\)/);
  assert.doesNotMatch(detailPath, /voice_notes|moment_tags|moment_reactions|local_identifier/);
  assert.match(daily, /listMomentDayArchive/);
  assert.match(daily, /\/daily-album\/\[day\]/);
  assert.doesNotMatch(daily, /listMomentArchive/);
  const library = source('LibraryScreen.js');
  assert.match(library, /LIBRARY_RICH_ARCHIVE_LIMIT = 500/);
  assert.match(library, /listMomentDayArchive/);
  assert.doesNotMatch(library, /listMomentArchive\(family\.id, \{ limit: 5000 \}\)/);
});

test('Keep going uses the completed session day and never creates a second notification', () => {
  const ledger = source('candidateLedgerStore.js');
  const tonight = source('TonightScreen.js');
  const start = ledger.indexOf('export function startTonightContinuation');
  const end = ledger.indexOf('function createNightlySession', start);
  const continuation = ledger.slice(start, end);
  assert.match(continuation, /completedSessionId/);
  assert.match(continuation, /const day = completed\.local_day/);
  assert.match(continuation, /continuation: true/);
  assert.match(ledger, /seed not like '%:more:%'/);
  assert.match(tonight, /testID="tonight-keep-going"/);
  assert.doesNotMatch(continuation, /Notification|maybeScheduleTonightNotification/);
});

test('burst alternate finalization supersedes the original and reconciles effective availability', () => {
  const ledger = source('candidateLedgerStore.js');
  assert.match(ledger, /decidedAssetId !== item\.asset_id[\s\S]*lifecycle_state = 'superseded'/);
  assert.match(ledger, /e\.selected_asset_id = \?/);
  assert.match(ledger, /coalesce\(\([\s\S]*e\.selected_asset_id[\s\S]*\), asset_id\)/);
  assert.match(ledger, /promoteUnavailableClusterRepresentatives/);
  assert.match(ledger, /representative\.availability <> 'available'/);
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
  const firstValue = source('firstValuePreviewScan.js');

  assert.ok(launcher.indexOf("reason: 'role-cannot-scan'") < launcher.indexOf('const permission ='));
  assert.ok(launcher.indexOf("reason: 'inactive-entitlement'") < launcher.indexOf('const permission ='));
  assert.ok(background.indexOf("reason: 'inactive-entitlement'") < background.indexOf('const permission ='));
  assert.ok(background.indexOf('const powerGate =') < background.indexOf('const permission ='));
  assert.ok(foreground.indexOf('const powerGate =') < foreground.indexOf('const permission ='));
  assert.match(foreground, /!entitlement\?\.isActive/);
  assert.match(foreground, /\['creator', 'partner'\]/);
  assert.match(manual, /const canScan = writer && \(entitlement\?\.isActive === true \|\| firstValueRequested\)/);
  assert.match(manual, /if \(!family \|\| !user \|\| billingLoading \|\| !canScan\) return;[\s\S]*await startLibraryScan/);
  assert.ok(firstValue.indexOf("reason: 'role-cannot-scan'") < firstValue.indexOf('const permission ='));
  assert.match(firstValue, /writeFirstValuePreview[\s\S]*Scan\.abort\(\)/);
  assert.doesNotMatch(firstValue, /Tags\.setBaby|uploadForTag|supabase|publishFamilyLibraryConnection/);
  assert.doesNotMatch(manual, /readAutoIngestPowerGate|low-power-mode/);
});

test('Today and Library gate photo observers and write utilities behind writer entitlement', () => {
  const today = source('TodayScreen.js');
  const library = source('LibraryScreen.js');

  assert.match(today, /const canUsePrivateDiscovery = !billingLoading[\s\S]*entitlement\?\.isActive === true[\s\S]*writer/);
  assert.match(today, /useMediaLibraryChangeObserver\(\{[\s\S]*enabled: canUsePrivateDiscovery/);
  assert.match(library, /const canManageLibrary = !billingLoading[\s\S]*entitlement\?\.isActive === true[\s\S]*writer/);
  assert.match(library, /useMediaLibraryChangeObserver\(\{[\s\S]*enabled: canManageLibrary/);
  assert.match(library, /if \(canManageLibrary\) \{\s*silentlyRepairUploadsForOwner/);
  assert.match(library, /if \(!canManageLibrary\) return;\s*setShowLocalPhotos/);
  assert.match(library, /onOpenCameraRoll=\{canManageLibrary \? openCameraRollTools : null\}/);
  assert.match(library, /onRepair=\{repairUploadQueue\}/);
});

test('navigation has one Today owner and keeps archive browsing in Our World', () => {
  const guards = source('navigation/RouteGuards.js');
  const today = source('TodayScreen.js');
  const library = source('LibraryScreen.js');

  assert.match(guards, /return <RouteRedirect href=\{gate\.href \|\| '\/timeline'\} \/>/);
  assert.doesNotMatch(guards, /return <TodayScreen/);
  assert.doesNotMatch(today, /<SegmentedControl|<MonthTimeline|<PhotoRail|<PlacesPreview/);
  assert.match(today, /Open Our World to browse saved memories/);
  assert.match(library, /<DailyAlbumPanel/);
  assert.match(library, /<AutomaticCollectionsPreview/);
  assert.match(library, /value: 'places'/);
  assert.match(library, /value: 'search'/);
});

test('lapsed families can browse saved archive routes but cannot enter write routes', () => {
  const guards = source('navigation/RouteGuards.js');
  const libraryRoute = readFileSync(new URL('../../app/library.jsx', import.meta.url), 'utf8');
  const dayRoute = readFileSync(new URL('../../app/daily-album/[day].jsx', import.meta.url), 'utf8');
  const addRoute = readFileSync(new URL('../../app/add.jsx', import.meta.url), 'utf8');
  const appShell = source('ui/AppShell.js');
  const bottomTabs = source('ui/BottomTabs.js');
  const library = source('LibraryScreen.js');
  assert.match(guards, /reason: 'read-only-archive', href: '\/library'/);
  assert.match(guards, /!allowReadOnlyArchive && gate\.reason === 'read-only-archive'/);
  assert.match(libraryRoute, /ProtectedRoute allowReadOnlyArchive/);
  assert.match(dayRoute, /ProtectedRoute allowReadOnlyArchive/);
  assert.doesNotMatch(addRoute, /allowReadOnlyArchive/);
  assert.match(appShell, /entitlement\?\.isActive === true[\s\S]*family\?\.me\?\.role/);
  assert.match(bottomTabs, /tab\.key !== 'add' \|\| canAdd/);
  assert.match(library, /Saved letters remain available to read/);
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

test('Tonight analytics is isolated behind coarse properties and prohibits private draft fields', () => {
  const analytics = source('analyticsEventsModel.js');
  for (const field of ['draftVoiceUri', 'voicePath', 'reactionCode', 'retryId', 'assetId', 'localUri']) {
    assert.match(analytics, new RegExp(`['"]${field}['"]`));
  }
  const tonight = source('TonightScreen.js');
  const ledger = source('candidateLedgerStore.js');
  assert.match(tonight, /tonightDecisionProperties/);
  assert.match(tonight, /tonightCompletionProperties/);
  assert.doesNotMatch(tonight, /Sentry|PostHog/);
  assert.doesNotMatch(ledger, /trackAnalytics|Sentry|PostHog|from ['"]\.\/supabase/);
});

test('Today and Tonight require an active entitlement before queue reads or writes', () => {
  const today = source('TodayScreen.js');
  const tonight = source('TonightScreen.js');
  const review = source('ReviewMatchesScreen.js');
  const route = readFileSync(new URL('../../app/tonight.jsx', import.meta.url), 'utf8');

  assert.match(today, /const canUsePrivateDiscovery = !billingLoading[\s\S]*entitlement\?\.isActive === true/);
  assert.ok(tonight.indexOf('if (!canCurate') < tonight.indexOf('let next = readTonightSession'));
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
