import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBookHomeModel,
  buildBookUtilityAlerts,
} from '../../src/bookHomeModel.js';

test('book home model covers an empty archive', () => {
  const home = buildBookHomeModel({
    moments: [],
    sharedPhotos: [],
    firsts: [],
    letters: [],
    digests: [],
    childBirthday: '2026-01-01',
    promptResponses: [],
    voiceNotes: [],
    uploadRepairState: { total: 0 },
    exportLimitations: [],
    lapsedSubscriptionPolicy: null,
    now: new Date('2026-07-09T12:00:00'),
  });

  assert.deepEqual(home.stats, {
    moments: 0,
    photos: 0,
    videos: 0,
    voiceNotes: 0,
    firsts: 0,
    bookReadyMoments: 0,
    bookReadyPhotos: 0,
    bookReadyVideos: 0,
    bookReadyVoiceNotes: 0,
  });
  assert.deepEqual(home.bookReadyStats, home.stats);
  assert.equal(home.currentMonthChapter, null);
  assert.equal(home.latestSavedMoment, null);
  assert.equal(home.firstsSummary.count, 0);
  assert.equal(home.lettersSummary.count, 0);
  assert.equal(home.promptSummary.answeredCount, 0);
  assert.equal(home.voiceSummary.count, 0);
  assert.equal(home.digestSummary.count, 0);
  assert.equal(home.printExportReadiness.state, 'empty');
  assert.equal(home.printExportReadiness.policy.finalized, false);
  assert.equal(home.subtitle, 'Approve a moment to begin');
  assert.deepEqual(home.utilityAlerts, []);
});

test('auto-saved archive-only moments do not make the book preview ready', () => {
  const months = Array.from({ length: 12 }, (_, index) => `2026-07-${String(index + 1).padStart(2, '0')}T12:00:00Z`);
  const home = buildBookHomeModel({
    moments: months.map((capturedAt, index) => momentRow(`auto-${index}`, '', capturedAt, {
      media: [
        {
          id: `auto-media-${index}`,
          media_type: 'image',
          thumbUrl: `${index}.jpg`,
          metadata: { source: 'scan-auto-save', captureQuality: 0.91 },
        },
      ],
    })),
    sharedPhotos: [],
    firsts: [],
    letters: [],
    digests: [],
    childBirthday: '2026-01-01',
    promptResponses: [],
    voiceNotes: [],
    uploadRepairState: { total: 0 },
    now: new Date('2026-07-09T12:00:00'),
  });

  assert.equal(home.stats.moments, 12);
  assert.equal(home.bookReadyStats.moments, 0);
  assert.equal(home.records.every((record) => record.savedToArchive), true);
  assert.equal(home.records.every((record) => !record.bookEligible), true);
  assert.equal(home.currentMonthChapter.bookReadyRecords.length, 0);
  assert.equal(home.printExportReadiness.state, 'archive_only');
  assert.match(home.printExportReadiness.body, /saved in the archive/);
});

test('book home model covers a new archive with first saved context and repair alert', () => {
  const home = buildBookHomeModel({
    moments: [
      momentRow('m-new', 'Rolling over', '2026-07-08T12:00:00Z', {
        media: [{ id: 'media-new', media_type: 'image', thumbUrl: 'roll.jpg' }],
      }),
    ],
    sharedPhotos: [],
    firsts: [],
    letters: [],
    digests: [],
    childBirthday: '2026-01-01',
    promptResponses: [
      {
        id: 'prompt-1',
        response_text: 'Loved tummy time today.',
        prompt_date: '2026-07-08',
        moment_id: 'm-new',
      },
    ],
    voiceNotes: [
      { id: 'voice-1', moment_id: 'm-new', created_at: '2026-07-08T12:01:00Z' },
    ],
    uploadRepairState: {
      total: 1,
      failed: 1,
      uploading: 0,
      pending: 0,
      lastError: 'RPC stack trace should stay out of parent copy',
    },
    now: new Date('2026-07-09T12:00:00'),
  });

  assert.equal(home.stats.moments, 1);
  assert.equal(home.stats.photos, 1);
  assert.equal(home.stats.voiceNotes, 1);
  assert.equal(home.currentMonthChapter.title, 'July 2026');
  assert.match(home.currentMonthChapter.ageLabel, /Around 6 months/);
  assert.equal(home.latestSavedMoment.id, 'm-new');
  assert.equal(home.promptSummary.answeredCount, 1);
  assert.equal(home.promptSummary.linkedMomentCount, 1);
  assert.equal(home.voiceSummary.count, 1);
  assert.equal(home.printExportReadiness.state, 'building');
  assert.equal(home.utilityAlerts[0].kind, 'upload_repair');
  assert.equal(home.utilityAlerts[0].title, 'Some memories did not finish saving');
  assert.doesNotMatch(home.utilityAlerts[0].body, /RPC|stack trace/i);
});

test('book home model can scope child-owned rows without hiding legacy rows', () => {
  const home = buildBookHomeModel({
    childId: 'child-a',
    moments: [
      momentRow('m-a', 'Child A moment', '2026-07-08T12:00:00Z', {
        child_id: 'child-a',
        media: [{ id: 'media-a', media_type: 'image', thumbUrl: 'a.jpg' }],
      }),
      momentRow('m-b', 'Child B moment', '2026-07-07T12:00:00Z', {
        child_id: 'child-b',
        media: [{ id: 'media-b', media_type: 'image', thumbUrl: 'b.jpg' }],
      }),
      momentRow('m-legacy', 'Legacy moment', '2026-07-06T12:00:00Z', {
        media: [{ id: 'media-legacy', media_type: 'image', thumbUrl: 'legacy.jpg' }],
      }),
    ],
    sharedPhotos: [],
    firsts: [
      { id: 'first-a', child_id: 'child-a', title: 'First A', done: true, happened_at: '2026-07-08' },
      { id: 'first-b', child_id: 'child-b', title: 'First B', done: true, happened_at: '2026-07-07' },
    ],
    letters: [
      { id: 'letter-a', child_id: 'child-a', title: 'Letter A', created_at: '2026-07-08T13:00:00Z' },
      { id: 'letter-b', child_id: 'child-b', title: 'Letter B', created_at: '2026-07-07T13:00:00Z' },
    ],
    digests: [
      { id: 'digest-family', momentCount: 2, generatedAt: '2026-07-09T12:00:00Z' },
      { id: 'digest-b', child_id: 'child-b', momentCount: 1, generatedAt: '2026-07-08T12:00:00Z' },
    ],
    childBirthday: '2026-01-01',
    promptResponses: [
      { id: 'prompt-family', response_text: 'Family-level prompt.', prompt_date: '2026-07-08' },
      { id: 'prompt-b', child_id: 'child-b', response_text: 'Other child prompt.', prompt_date: '2026-07-07' },
    ],
    voiceNotes: [
      { id: 'voice-a', child_id: 'child-a', moment_id: 'm-a', created_at: '2026-07-08T12:01:00Z' },
      { id: 'voice-b', child_id: 'child-b', moment_id: 'm-b', created_at: '2026-07-07T12:01:00Z' },
    ],
    uploadRepairState: { total: 0 },
    now: new Date('2026-07-09T12:00:00'),
  });

  assert.equal(home.childId, 'child-a');
  assert.equal(home.childScoped, true);
  assert.deepEqual(home.records.map((record) => record.id), ['m-a', 'm-legacy']);
  assert.equal(home.stats.photos, 2);
  assert.equal(home.stats.voiceNotes, 1);
  assert.equal(home.firstsSummary.count, 1);
  assert.equal(home.lettersSummary.count, 1);
  assert.equal(home.promptSummary.answeredCount, 1);
  assert.equal(home.digestSummary.count, 1);
  assert.equal(home.records.some((record) => record.id === 'm-b'), false);
});

test('book home model covers an active archive with firsts, letters, prompts, voice, and digests', () => {
  const sharedPhotos = [
    {
      asset_owner_user_id: 'parent-1',
      asset_id: 'first-photo',
      thumbUrl: 'first.jpg',
      moment_id: 'm-first',
    },
  ];
  const home = buildBookHomeModel({
    moments: [
      momentRow('m-latest', 'Splash day', '2026-07-06T10:00:00Z', {
        media: [{ id: 'media-latest', media_type: 'video', posterUrl: 'splash.jpg' }],
      }),
      momentRow('m-first', 'First laugh', '2026-06-20T10:00:00Z', {
        tags: ['first:laugh'],
        media: [{ id: 'media-first', media_type: 'image', thumbUrl: 'laugh.jpg' }],
      }),
      momentRow('m-voice', 'Voice note', '2026-06-18T10:00:00Z', {
        voiceNotes: [{ id: 'voice-inline', created_at: '2026-06-18T10:02:00Z' }],
      }),
      momentRow('m-old', 'Park blanket', '2026-06-01T10:00:00Z', {
        media: [{ id: 'media-old', media_type: 'image', thumbUrl: 'park.jpg' }],
      }),
    ],
    sharedPhotos,
    firsts: [
      {
        id: 'first-laugh',
        title: 'First laugh',
        done: true,
        asset_owner_user_id: 'parent-1',
        asset_id: 'first-photo',
        happened_at: '2026-06-21',
      },
    ],
    letters: [
      { id: 'letter-open', title: 'A tiny joke', created_at: '2026-06-20T12:00:00Z', open_on: '2026-07-01' },
      { id: 'letter-sealed', title: 'For later', created_at: '2026-07-01T12:00:00Z', open_on: '2030-01-01' },
    ],
    digests: [
      { id: 'digest-1', weekStart: '2026-06-28', generatedAt: '2026-07-05T12:00:00Z', momentCount: 3, voiceNoteCount: 1 },
    ],
    childBirthday: '2026-01-01',
    promptResponses: [
      { id: 'prompt-answered', response_text: 'Bath giggles.', prompt_date: '2026-07-06' },
      { id: 'prompt-empty', response_text: '', prompt_date: '2026-07-07' },
    ],
    voiceNotes: [],
    uploadRepairState: { total: 0 },
    now: new Date('2026-07-09T12:00:00'),
  });

  assert.equal(home.chapters.length, 2);
  assert.equal(home.latestSavedMoment.id, 'm-latest');
  assert.equal(home.stats.videos, 1);
  assert.equal(home.stats.firsts, 1);
  assert.equal(home.firstsSummary.count, 1);
  assert.equal(home.firstsSummary.latestPhoto.thumbUrl, 'first.jpg');
  assert.equal(home.lettersSummary.count, 2);
  assert.equal(home.lettersSummary.sealedCount, 1);
  assert.equal(home.promptSummary.count, 2);
  assert.equal(home.promptSummary.answeredCount, 1);
  assert.equal(home.digestSummary.count, 1);
  assert.equal(home.digestSummary.voiceNoteCount, 1);
  assert.equal(home.voiceSummary.count, 1);
  assert.equal(home.printExportReadiness.state, 'building');
  assert.match(home.subtitle, /^Current chapter: July 2026$/);

  const july = home.chapters.find((chapter) => chapter.title === 'July 2026');
  const june = home.chapters.find((chapter) => chapter.title === 'June 2026');
  assert.deepEqual(july.contextItems.map((item) => item.kind), ['prompt', 'letter']);
  assert.deepEqual(june.contextItems.map((item) => item.kind), ['first', 'letter', 'voice']);
  assert.match(june.contextItems.find((item) => item.kind === 'first').caption, /First saved/);
  assert.match(july.contextItems.find((item) => item.kind === 'prompt').caption, /Prompt answered/);
});

test('book home chapters can be built from firsts, letters, and prompt answers without media', () => {
  const home = buildBookHomeModel({
    moments: [],
    sharedPhotos: [],
    firsts: [{ id: 'first-food', title: 'First bite', done: true, happened_at: '2026-07-04' }],
    letters: [{ id: 'letter-food', title: 'For the first bite', created_at: '2026-07-05T12:00:00Z', open_on: '2030-01-01' }],
    digests: [],
    childBirthday: '2026-01-01',
    promptResponses: [
      {
        id: 'prompt-food',
        response_text: 'Mess everywhere.',
        prompt_text: 'What surprised you today?',
        prompt_date: '2026-07-06',
      },
    ],
    voiceNotes: [],
    uploadRepairState: { total: 0 },
    now: new Date('2026-07-09T12:00:00'),
  });

  assert.equal(home.records.length, 0);
  assert.equal(home.chapters.length, 1);
  assert.equal(home.currentMonthChapter.title, 'July 2026');
  assert.equal(home.currentMonthChapter.summary, '3 book notes');
  assert.deepEqual(
    home.currentMonthChapter.contextItems.map((item) => item.kind),
    ['prompt', 'letter', 'first'],
  );
});

test('book home model covers a mature archive with export readiness and policy alerts', () => {
  const months = [
    '2026-07-05T12:00:00Z',
    '2026-07-04T12:00:00Z',
    '2026-06-15T12:00:00Z',
    '2026-06-01T12:00:00Z',
    '2026-05-20T12:00:00Z',
    '2026-05-10T12:00:00Z',
    '2026-04-21T12:00:00Z',
    '2026-04-11T12:00:00Z',
    '2026-03-30T12:00:00Z',
    '2026-03-12T12:00:00Z',
    '2026-02-25T12:00:00Z',
    '2026-02-14T12:00:00Z',
  ];

  const home = buildBookHomeModel({
    moments: months.map((capturedAt, index) => momentRow(`m-${index}`, `Moment ${index}`, capturedAt, {
      media: [{ id: `media-${index}`, media_type: 'image', thumbUrl: `${index}.jpg` }],
    })),
    sharedPhotos: [],
    firsts: [{ id: 'first-smile', title: 'First smile', done: true, happened_at: '2026-02-14' }],
    letters: [{ id: 'letter-1', title: 'Half-year note', created_at: '2026-07-01T12:00:00Z', open_on: '2030-01-01' }],
    digests: [
      { id: 'digest-1', weekStart: '2026-06-28', generatedAt: '2026-07-05T12:00:00Z', momentCount: 4 },
      { id: 'digest-2', weekStart: '2026-05-31', generatedAt: '2026-06-07T12:00:00Z', momentCount: 3 },
    ],
    childBirthday: '2026-01-01',
    promptResponses: [
      { id: 'prompt-1', response_text: 'She started reaching for the spoon.', prompt_date: '2026-07-01' },
    ],
    voiceNotes: [{ id: 'voice-extra', moment_id: 'm-0', created_at: '2026-07-05T12:05:00Z' }],
    uploadRepairState: { total: 0 },
    exportLimitations: ['Video export is preview-only'],
    lapsedSubscriptionPolicy: {
      finalized: true,
      state: 'lapsed',
      title: 'Export policy needs review',
      body: 'Review the current read-only and export rules before sharing.',
      actionLabel: 'Review policy',
      scope: ['photos', 'videos', 'voice', 'letters', 'firsts', 'prompts'],
    },
    now: new Date('2026-07-09T12:00:00'),
  });

  assert.equal(home.stats.moments, 12);
  assert.equal(home.stats.photos, 12);
  assert.equal(home.chapters.length, 6);
  assert.equal(home.yearSummaries[0].year, 2026);
  assert.equal(home.printExportReadiness.state, 'print_ready');
  assert.match(home.printExportReadiness.body, /parent-approved preview/);
  assert.deepEqual(home.printExportReadiness.limitations.map((item) => item.label), ['Video export is preview-only']);
  assert.equal(home.printExportReadiness.policy.finalized, true);
  assert.deepEqual(
    home.utilityAlerts.map((alert) => alert.kind),
    ['export_limitation', 'lapsed_subscription_policy'],
  );
});

test('book utility alerts keep repair copy parent-safe', () => {
  const alerts = buildBookUtilityAlerts({
    uploadRepairState: {
      total: 2,
      failed: 1,
      uploading: 1,
      pending: 0,
      lastError: 'Storage provider stack trace',
    },
  });

  assert.equal(alerts[0].severity, 'blocking');
  assert.equal(alerts[0].actionLabel, 'Retry');
  assert.match(alerts[0].body, /1 memory needs a retry/);
  assert.doesNotMatch(alerts[0].body, /Storage provider|stack trace/i);
});

function momentRow(id, title, capturedAt, overrides = {}) {
  return {
    id,
    title,
    caption_note: '',
    captured_at: capturedAt,
    created_at: capturedAt,
    place_name: '',
    media: [],
    voiceNotes: [],
    tags: [],
    ...overrides,
  };
}
