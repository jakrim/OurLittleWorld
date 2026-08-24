import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAddMomentState } from '../../src/addMomentModel.js';
import { buildPhotoBookHtml, EXPORT_PREVIEW_LIMITATIONS } from '../../src/archiveExportModel.js';
import { assistantFeedbackTransparency, FEEDBACK_KINDS } from '../../src/assistantFeedbackTransparencyModel.js';
import { autoSaveCorrectionNeedsReview } from '../../src/autoSaveCorrectionModel.js';
import { buildBookCollectionSummaries } from '../../src/bookCollectionsModel.js';
import { buildBookHomeModel } from '../../src/bookHomeModel.js';
import { selectDayCardNudge } from '../../src/dayCardNudge.js';
import {
  applySuggestionFeedback,
  buildFirstSuggestion,
  normalizeFirstSuggestionState,
  shouldGenerateForGoal,
} from '../../src/firstSuggestionModel.js';
import { buildMomentConnectionChips } from '../../src/momentConnectionChips.js';
import { selectPostSaveNudge } from '../../src/postSaveNudgeModel.js';
import {
  AUTO_SAVE_MODE_AUTO,
  AUTO_SAVE_MODE_REVIEW_FIRST,
  TRUST_CLEAN_BATCH_MIN,
  buildPhotoIngestionTrustModel,
} from '../../src/photoIngestionTrustModel.js';
import {
  SCAN_AUTO_SAVE_SOURCE,
  buildScanAutoSaveRuntimePlan,
} from '../../src/scanAutoSaveModel.js';
import { buildPlaceClusters } from '../../src/visionSceneLabeler.js';

const now = new Date('2026-07-09T12:00:00');
const childBirthday = '2025-07-23';

test('section 15: brand-new family with no photos stays empty without invented memories', () => {
  const home = buildBookHomeModel({
    moments: [],
    sharedPhotos: [],
    firsts: [],
    letters: [],
    digests: [],
    childBirthday,
    promptResponses: [],
    voiceNotes: [],
    now,
  });
  const collections = buildBookCollectionSummaries({ firsts: [], letters: [], now });
  const today = selectDayCardNudge({});

  assert.equal(home.stats.moments, 0);
  assert.equal(home.printExportReadiness.state, 'empty');
  assert.equal(home.subtitle, 'Approve a moment to begin');
  assert.equal(collections.firsts.count, 0);
  assert.equal(collections.letters.count, 0);
  assert.equal(today.kind, 'fallback');
  assertNoFabrication({ home, today, collections });
});

test('section 15: large photo library with no firsts prioritizes book-ready photo navigation', () => {
  const moments = Array.from({ length: 500 }, (_, index) => momentRow(`moment-${index}`, {
    title: `Saved photo ${index + 1}`,
    captured_at: daysBefore('2026-07-05T12:00:00Z', index),
    media: [
      {
        id: `media-${index}`,
        media_type: 'image',
        thumbUrl: `${index}.jpg`,
        metadata: { source: 'add-sheet', captureQuality: 0.92 },
      },
    ],
  }));
  const home = buildBookHomeModel({
    moments,
    sharedPhotos: [],
    firsts: [],
    letters: [],
    digests: [],
    childBirthday,
    promptResponses: [],
    voiceNotes: [],
    now,
  });
  const places = buildPlaceClusters({
    shared: [
      photoRow('home-1', { latitude: 40.1, longitude: -73.9, creation_time: '2026-07-01T08:00:00Z' }),
      photoRow('home-2', { latitude: 40.1002, longitude: -73.9002, creation_time: '2026-07-02T08:00:00Z' }),
      photoRow('outing-1', { latitude: 40.8, longitude: -73.2, creation_time: '2026-07-03T15:00:00Z' }),
    ],
    metadataByKey: {},
    memoriesByKey: { 'parent:outing-1': [{ note: 'Outside on the blanket.' }] },
  });

  assert.equal(home.stats.moments, 500);
  assert.equal(home.stats.photos, 500);
  assert.equal(home.bookReadyStats.moments, 500);
  assert.equal(home.firstsSummary.count, 0);
  assert.equal(home.lettersSummary.count, 0);
  assert.equal(home.printExportReadiness.state, 'print_ready');
  assert.ok(home.chapters.length >= 3);
  assert.ok(home.currentMonthChapter.bookReadyRecords.length > 0);
  assert.equal(places[0].label, 'At home');
  assert.equal(places.length, 2);
  for (const place of places) {
    assert.doesNotMatch(place.label, /\d+(\.\d+)?°|^-?\d+(\.\d+)?:-?\d+(\.\d+)?$/);
  }
});

test('section 15: several firsts and one letter surface confirmed book connections', () => {
  const home = buildBookHomeModel({
    moments: [
      momentRow('moment-smile', {
        title: 'Morning smile',
        captured_at: '2025-09-14T12:00:00Z',
        tags: ['first:smile'],
        media: [{ id: 'media-smile', media_type: 'image', thumbUrl: 'smile.jpg' }],
      }),
      momentRow('moment-steps', {
        title: 'Standing at the sofa',
        captured_at: '2026-06-20T12:00:00Z',
        tags: ['first:steps'],
        media: [{ id: 'media-steps', media_type: 'image', thumbUrl: 'steps.jpg' }],
      }),
    ],
    sharedPhotos: [
      { asset_owner_user_id: 'parent', asset_id: 'smile-photo', thumbUrl: 'smile.jpg', moment_id: 'moment-smile' },
    ],
    firsts: [
      {
        id: 'first-smile',
        title: 'First smile',
        done: true,
        happened_at: '2025-09-14',
        moment_id: 'moment-smile',
        asset_owner_user_id: 'parent',
        asset_id: 'smile-photo',
      },
      {
        id: 'first-steps',
        title: 'First steps',
        done: true,
        happened_at: '2026-06-20',
        moment_id: 'moment-steps',
      },
    ],
    letters: [
      {
        id: 'letter-1',
        title: 'For your first birthday',
        body: 'One parent-written line.',
        created_at: '2026-07-01T12:00:00Z',
      },
    ],
    digests: [],
    childBirthday,
    promptResponses: [],
    voiceNotes: [],
    now,
  });
  const chips = buildMomentConnectionChips({
    moment: {
      id: 'moment-smile',
      captured_at: '2025-09-14T12:00:00Z',
      media: [{ id: 'media-smile', media_type: 'image' }],
      caption_note: 'Parent wrote this.',
    },
    firsts: [{ id: 'first-smile', title: 'First smile' }],
    letters: [{ id: 'letter-1', title: 'For your first birthday' }],
    canWrite: true,
  });

  assert.equal(home.firstsSummary.count, 2);
  assert.equal(home.firstsSummary.latestPhoto.thumbUrl, 'smile.jpg');
  assert.equal(home.lettersSummary.count, 1);
  assert.equal(home.lettersSummary.openCount, 1);
  assert.ok(home.chapters.some((chapter) => chapter.contextItems.some((item) => item.kind === 'first')));
  assert.ok(home.chapters.some((chapter) => chapter.contextItems.some((item) => item.kind === 'letter')));
  assert.deepEqual(chips.slice(0, 2).map((chip) => chip.label), ['First', 'Letter']);
});

test('section 15: photo-only save is allowed and produces one approval-preserving nudge', () => {
  const addState = buildAddMomentState({ assets: [{ uri: 'file:///photo.jpg' }] });
  const nudge = selectPostSaveNudge({
    moment: {
      id: 'moment-photo-only',
      assets: [{ type: 'image', uri: 'file:///photo.jpg' }],
      capturedAt: '2026-07-06T14:00:00.000Z',
    },
    goals: [],
    firsts: [],
    birthdayISO: childBirthday,
    now,
  });

  assert.equal(addState.canSave, true);
  assert.equal(addState.hasContext, false);
  assert.equal(nudge.kind, 'voice');
  assert.equal(nudge.question, "Add a 20-second voice note while it's fresh?");
  assertNoFabrication({ nudge });
});

test('section 15: assistant suggestion dismissal quiets only that suggestion lane', () => {
  const goal = {
    key: 'smile',
    title: 'First smile',
    targetAgeLabel: '6-8 weeks',
    targetAgeMinDays: 42,
    targetAgeMaxDays: 70,
  };
  const suggestion = buildFirstSuggestion({
    goal,
    matches: [
      {
        assetId: 'asset-smile',
        score: 0.82,
        captureQuality: 0.9,
        creationTime: new Date('2025-09-14T12:00:00Z').getTime(),
        uri: 'ph://asset-smile',
      },
    ],
  });
  let state = normalizeFirstSuggestionState({ suggestionsByGoal: { smile: suggestion } });
  state = applySuggestionFeedback(state, { goalKey: 'smile', action: 'not_this', now });
  const transparency = assistantFeedbackTransparency(FEEDBACK_KINDS.FIRST_SUGGESTION_NOT_THIS);

  assert.equal(state.suggestionsByGoal.smile, undefined);
  assert.equal(state.excludedAssetIds['asset-smile'], true);
  assert.equal(shouldGenerateForGoal({ state, goal, babyBirthday: childBirthday, now }), false);
  assert.match(transparency.footer, /Nothing is saved until you keep it/);
  assert.match(transparency.footer, /only quiets First suggestions on this device/);
  assert.doesNotMatch(transparency.footer, /teach(?:es)? the model|learns from/i);
});

test('section 15: calibrated auto-save starts review-first and pauses after corrections', () => {
  const firstScan = buildPhotoIngestionTrustModel({
    pendingReviewCount: 12,
    babyName: 'River',
  });
  const cleanCorrections = Array.from({ length: TRUST_CLEAN_BATCH_MIN }, (_, index) => ({
    assetId: `asset-${index}`,
    score: 0.94,
    verdict: 'keep',
  }));
  const ready = buildPhotoIngestionTrustModel({
    calibration: { autoSaveEnabled: false, corrections: cleanCorrections },
  });
  const active = buildPhotoIngestionTrustModel({
    calibration: { autoSaveEnabled: true, corrections: cleanCorrections },
    recentAutoSaves: [{ assetId: 'asset-recent' }],
  });
  const needsReview = buildPhotoIngestionTrustModel({
    calibration: { autoSaveEnabled: true, corrections: cleanCorrections },
    negativeExamples: [{ assetId: 'asset-recent', score: 0.96, verdict: 'removed' }],
  });
  const firstScanPlan = buildScanAutoSaveRuntimePlan({
    calibration: null,
    matches: [{ assetId: 'asset-first-clear', score: 0.97, captureQuality: 0.9 }],
  });
  const activePlan = buildScanAutoSaveRuntimePlan({
    calibration: { autoSaveEnabled: true, corrections: cleanCorrections },
    matches: [
      { assetId: 'asset-clear', score: 0.96, captureQuality: 0.9 },
      { assetId: 'asset-soft', score: 0.96, captureQuality: 0.1 },
      { assetId: 'asset-review', score: 0.82, captureQuality: 0.9 },
    ],
  });

  assert.equal(firstScan.state, 'review_required');
  assert.equal(firstScan.route, '/review');
  assert.equal(ready.state, 'auto_save_ready');
  assert.equal(ready.autoSaveSetting.value, AUTO_SAVE_MODE_REVIEW_FIRST);
  assert.equal(active.state, 'auto_save_active');
  assert.equal(active.autoSaveSetting.value, AUTO_SAVE_MODE_AUTO);
  assert.equal(needsReview.state, 'needs_correction_review');
  assert.equal(firstScanPlan.enabled, false);
  assert.deepEqual(firstScanPlan.autoSaveMatches, []);
  assert.equal(activePlan.source, SCAN_AUTO_SAVE_SOURCE);
  assert.deepEqual(activePlan.autoSaveMatches.map((match) => match.assetId), ['asset-clear']);
  assert.deepEqual(activePlan.reviewMatches.map((match) => match.assetId), ['asset-soft', 'asset-review']);
  assert.equal(autoSaveCorrectionNeedsReview(1), true);
  assert.match(active.autoSaveSetting.footnote, /never deletes saved memories or Photos originals/);
  assertNoFabrication({ firstScan, ready, active, needsReview, activePlan });
});

test('section 15: export preview includes parent-owned book material and current limits', () => {
  const home = buildBookHomeModel({
    moments: Array.from({ length: 12 }, (_, index) => momentRow(`moment-${index}`, {
      title: `Book moment ${index + 1}`,
      captured_at: daysBefore('2026-07-05T12:00:00Z', index * 14),
      caption_note: 'Parent-approved note.',
      media: [
        {
          id: `media-${index}`,
          media_type: 'image',
          thumbUrl: `${index}.jpg`,
          metadata: { source: 'add-sheet', captureQuality: 0.91 },
        },
      ],
    })),
    firsts: [{ id: 'first-laugh', title: 'First laugh', done: true, happened_at: '2026-01-14' }],
    letters: [{ id: 'letter-1', title: 'Birthday eve', body: 'We are almost there.', created_at: '2026-07-01T12:00:00Z' }],
    digests: [],
    childBirthday,
    promptResponses: [
      { id: 'prompt-1', prompt_text: 'What surprised you?', response_text: 'The tiny wave.', prompt_date: '2026-07-02' },
    ],
    voiceNotes: [],
    now,
  });
  const html = buildPhotoBookHtml({
    family: { babyName: 'River' },
    stats: home.stats,
    years: home.yearSummaries,
    firsts: [{ id: 'first-laugh', title: 'First laugh', done: true, happened_at: '2026-01-14' }],
    letters: [{ id: 'letter-1', title: 'Birthday eve', body: 'We are almost there.' }],
    promptResponses: [
      { id: 'prompt-1', prompt_text: 'What surprised you?', response_text: 'The tiny wave.', prompt_date: '2026-07-02' },
    ],
    chapters: home.chapters,
    limitations: EXPORT_PREVIEW_LIMITATIONS,
    generatedAt: now,
  });

  assert.equal(home.printExportReadiness.state, 'print_ready');
  assert.match(home.printExportReadiness.body, /parent-approved preview/);
  assert.match(html, /Memories are always exportable/);
  assert.match(html, /First laugh/);
  assert.match(html, /Birthday eve/);
  assert.match(html, /What surprised you\?/);
  assert.match(html, /Private share links and print fulfillment/);
  assertNoFabrication({ home, html });
});

function momentRow(id, overrides = {}) {
  return {
    id,
    title: '',
    caption_note: '',
    captured_at: '2026-07-01T12:00:00Z',
    created_at: '2026-07-01T12:00:00Z',
    place_name: '',
    media: [],
    voiceNotes: [],
    tags: [],
    ...overrides,
  };
}

function photoRow(assetId, overrides = {}) {
  return {
    asset_owner_user_id: 'parent',
    asset_id: assetId,
    creation_time: '2026-07-01T12:00:00Z',
    ...overrides,
  };
}

function daysBefore(iso, days) {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function assertNoFabrication(value) {
  assert.doesNotMatch(
    JSON.stringify(value),
    /your baby felt|your baby loved|this was the first time|we found .*first|AI found|confidence score|teach(?:es)? the model|learns from|delete originals/i,
  );
}
