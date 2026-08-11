import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPhotoBookHtml } from '../../src/archiveExportModel.js';
import { savedFingerprintTelemetry } from '../../src/savedMediaFingerprintModel.js';
import {
  annotationDraftAnalytics,
  annotationDraftKey,
  clearSharedAnnotationDraft,
  saveSharedAnnotationDraft,
} from '../../src/sharedAnnotationDraftModel.js';
import { sharedAnnotationExportRanges } from '../../src/sharedEnrichmentModel.js';
import { chooseSharedTonightLookback } from '../../src/sharedLookbackModel.js';

test('shared annotation drafts remain scoped and analytics contain only coarse state', async () => {
  const rows = new Map();
  const storage = {
    getItem: async (key) => rows.get(key) || null,
    setItem: async (key, value) => rows.set(key, value),
    removeItem: async (key) => rows.delete(key),
  };
  const scope = { familyId: 'family-a', userId: 'parent-a', momentId: 'moment-a' };
  const draft = await saveSharedAnnotationDraft(scope, {
    text: 'Private parent words',
    voice: { uri: 'file:///private/voice.m4a', durationSec: 4 },
  }, storage);
  assert.match(annotationDraftKey(scope), /family-a:parent-a:moment-a$/);
  assert.deepEqual(annotationDraftAnalytics(draft), {
    has_text: true,
    has_voice: true,
    commit_state: 'draft',
  });
  let deletedVoice = null;
  await clearSharedAnnotationDraft(scope, { storage, deleteVoice: async (uri) => { deletedVoice = uri; } });
  assert.equal(deletedVoice, 'file:///private/voice.m4a');
  assert.equal(rows.size, 0);
});

test('saved lookbacks and fingerprint telemetry expose no private identity evidence', () => {
  const chosen = chooseSharedTonightLookback([
    { id: 'kept-b', captured_at: '2026-07-02' },
    { id: 'kept-a', captured_at: '2026-07-01' },
  ], { localDate: new Date('2026-08-10T12:00:00Z') });
  assert.ok(['kept-a', 'kept-b'].includes(chosen.id));
  assert.deepEqual(savedFingerprintTelemetry({ fingerprint_digest: 'private' }), { grouped_after_keep: true });
  assert.deepEqual(sharedAnnotationExportRanges({ limit: 1200 }), [
    { from: 0, to: 499, take: 500 },
    { from: 500, to: 999, take: 500 },
    { from: 1000, to: 1199, take: 200 },
  ]);
});

test('archive output includes parent contributions and factual collections only', () => {
  const html = buildPhotoBookHtml({
    family: { babyName: 'Child' },
    annotations: [{ annotation_type: 'text', body: 'A parent note', author_user_id: 'parent-a' }],
    annotationAuthors: { 'parent-a': 'Parent' },
    collections: [{ title: 'First year', moment_count: 1 }],
    generatedAt: new Date('2026-08-10T12:00:00Z'),
    saved_event_groups: [{ fingerprint_digest: 'must-not-export' }],
  });
  assert.match(html, /Parent contributions/);
  assert.match(html, /A parent note/);
  assert.match(html, /First year/);
  assert.doesNotMatch(html, /must-not-export|fingerprint_digest/);
});
