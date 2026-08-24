import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('private shared-enrichment drafts have no network, logging, or error-reporting transport', () => {
  const draftStore = source('../../src/sharedAnnotationDraftStore.js');
  const draftModel = source('../../src/sharedAnnotationDraftModel.js');
  const component = source('../../src/SharedMomentEnrichmentCard.js');

  assert.doesNotMatch(`${draftStore}\n${draftModel}`, /from ['"]\.\/supabase|trackAnalytics|PostHog|Sentry|console\./i);
  assert.doesNotMatch(component, /from ['"]\.\/supabase|PostHog|Sentry|console\./i);
  assert.match(component, /trackAnalyticsEvent\('shared_annotation_saved',\s*\{\s*surface:\s*analyticsSurface,\s*annotation_kind:/s);
  const eventCall = component.slice(
    component.indexOf("trackAnalyticsEvent('shared_annotation_saved'"),
    component.indexOf('await onSaved?.()'),
  );
  assert.doesNotMatch(eventCall, /\b(text|voice|uri|moment_id|asset_id|draft_text)\s*:/i);
  assert.match(draftStore, /shared-annotation-drafts-v1/);
  assert.match(draftModel, /familyId.*userId.*momentId/s);
});

test('saved-media fingerprints are registered only after canonical ready writes and never logged', () => {
  const fingerprint = source('../../src/savedMediaFingerprint.js');
  const moments = source('../../src/moments.js');
  const photoSync = source('../../src/photoSync.js');

  assert.doesNotMatch(fingerprint, /trackAnalytics|PostHog|Sentry|console\./i);
  assert.match(fingerprint, /register_saved_media_fingerprint/);
  assert.match(moments, /upload_status:\s*'ready'[\s\S]{0,500}registerReadySavedFileFingerprint/);
  assert.match(photoSync, /upload_status:\s*'ready'[\s\S]{0,900}registerReadySavedFileFingerprint/);
  assert.match(`${moments}\n${photoSync}`, /registerReadySavedFileFingerprint\([\s\S]*?\)\.catch\(\(\) => null\)/);
});

test('shared Tonight lookbacks query only already-kept moments and never the private candidate ledger', () => {
  const tonight = source('../../src/TonightScreen.js');
  const moments = source('../../src/moments.js');
  const archiveQuery = moments.slice(
    moments.indexOf('export async function listMomentArchive('),
    moments.indexOf('export async function listMomentArchiveByIds('),
  );

  assert.match(archiveQuery, /from\('moments'\)/);
  assert.doesNotMatch(archiveQuery, /candidateLedger|mediaDb|local_asset_id|fingerprint/i);
  assert.match(tonight, /listMomentArchive/);
  assert.match(tonight, /media\.upload_status === 'ready'/);
  assert.match(tonight, /SHARED_LOOKBACK_QUERY_LIMIT/);
  assert.match(tonight, /Revisit a saved memory/);
});

test('shared structures are included in archive export without exporting exact-group fingerprints', () => {
  const exportService = source('../../src/archiveExport.js');
  const exportModel = source('../../src/archiveExportModel.js');
  const enrichment = source('../../src/sharedEnrichment.js');

  assert.match(`${exportService}\n${exportModel}`, /annotations/);
  assert.match(`${exportService}\n${exportModel}`, /collections/);
  assert.doesNotMatch(`${exportService}\n${exportModel}`, /saved_event_groups|fingerprint_digest|content-md5/i);
  assert.match(enrichment, /\.range\(range\.from, range\.to\)/);
});
