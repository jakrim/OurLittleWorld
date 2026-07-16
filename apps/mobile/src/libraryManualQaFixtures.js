const ZERO_UPLOAD_QUEUE = Object.freeze({
  total: 0,
  pending: 0,
  uploading: 0,
  failed: 0,
  lastError: null,
});

const EMPTY_FIXTURE_KEY = 'empty';
const LARGE_NO_FIRSTS_FIXTURE_KEY = 'large-no-firsts';
const CONNECTED_FIRST_LETTER_FIXTURE_KEY = 'connected-first-letter';
const SUPPORTED_FIXTURES = new Set([
  EMPTY_FIXTURE_KEY,
  LARGE_NO_FIRSTS_FIXTURE_KEY,
  CONNECTED_FIRST_LETTER_FIXTURE_KEY,
]);

export function normalizeLibraryManualQaFixture(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const key = String(raw || '').trim().toLowerCase();
  return SUPPORTED_FIXTURES.has(key) ? key : null;
}

export function buildLibraryManualQaFixture(value, {
  userId = 'qa-parent',
  now = new Date('2026-07-09T12:00:00Z'),
} = {}) {
  const key = normalizeLibraryManualQaFixture(value);
  if (!key) return null;

  const base = {
    key,
    shared: [],
    moments: [],
    firsts: [],
    letters: [],
    promptResponses: [],
    recentAutoSaves: [],
    importCalibration: null,
    uploadQueue: { ...ZERO_UPLOAD_QUEUE },
    pendingChange: null,
    iCloudRetry: { count: 0, entries: [] },
  };

  if (key === EMPTY_FIXTURE_KEY) return base;

  if (key === CONNECTED_FIRST_LETTER_FIXTURE_KEY) {
    return {
      ...base,
      ...buildConnectedFirstLetterRows({ userId, now }),
    };
  }

  const { moments, shared } = buildLargeNoFirstsRows({ userId, now });
  return {
    ...base,
    moments,
    shared,
  };
}

export function buildLibraryManualQaMomentDetail(value, momentId, {
  userId = 'qa-parent',
  now = new Date('2026-07-09T12:00:00Z'),
} = {}) {
  const fixture = buildLibraryManualQaFixture(value, { userId, now });
  if (!fixture) return null;
  const moment = (fixture.moments || []).find((item) => item.id === momentId);
  if (!moment) return null;
  return {
    ...moment,
    author_user_id: userId || 'qa-parent',
    reactions: [],
    shared_with: [],
    connectedFirsts: (fixture.firsts || []).filter((first) => first.moment_id === moment.id),
    connectedLetters: (fixture.letters || []).filter((letter) => letter.source_moment_id === moment.id),
    connectedDigest: null,
  };
}

function buildLargeNoFirstsRows({ userId, now }) {
  const moments = [];
  const shared = [];
  const anchor = validDateOrFallback(now, new Date('2026-07-09T12:00:00Z'));

  for (let index = 0; index < 500; index += 1) {
    const capturedAt = hoursBefore(anchor, index * 12);
    const place = index % 5 === 0
      ? { label: 'At the park', latitude: 40.7812, longitude: -73.9665 }
      : { label: 'At home', latitude: 40.7128, longitude: -74.0060 };
    const momentId = `qa-moment-${index + 1}`;
    const assetId = `qa-asset-${index + 1}`;

    moments.push({
      id: momentId,
      title: `Saved photo ${index + 1}`,
      caption_note: '',
      captured_at: capturedAt,
      created_at: capturedAt,
      place_name: place.label,
      media: [
        {
          id: `qa-media-${index + 1}`,
          media_type: 'image',
          metadata: { source: 'add-sheet', captureQuality: 0.9 },
        },
      ],
      voiceNotes: [],
      tags: [],
    });

    shared.push({
      asset_owner_user_id: userId || 'qa-parent',
      asset_id: assetId,
      moment_id: momentId,
      creation_time: capturedAt,
      tagged_at: capturedAt,
      latitude: place.latitude,
      longitude: place.longitude,
      location_label: place.label,
      child_id: null,
    });
  }

  return { moments, shared };
}

function buildConnectedFirstLetterRows({ userId, now }) {
  const parentId = userId || 'qa-parent';
  const capturedAt = validDateOrFallback(now, new Date('2026-07-09T12:00:00Z')).toISOString();
  const firstMomentId = 'qa-moment-first-smile';
  const secondMomentId = 'qa-moment-first-steps';
  const firstAssetId = 'qa-asset-first-smile';
  const secondAssetId = 'qa-asset-first-steps';
  const firstId = 'qa-first-smile';
  const letterId = 'qa-letter-birthday-eve';
  const moments = [
    {
      id: firstMomentId,
      title: 'Morning smile',
      caption_note: 'Parent-approved note for the family record.',
      captured_at: '2026-07-03T12:00:00Z',
      created_at: '2026-07-03T12:00:00Z',
      place_name: 'At home',
      media: [
        {
          id: 'qa-media-first-smile',
          media_type: 'image',
          metadata: { source: 'add-sheet', captureQuality: 0.93 },
        },
      ],
      voiceNotes: [],
      tags: ['first:smile'],
    },
    {
      id: secondMomentId,
      title: 'Standing at the sofa',
      caption_note: '',
      captured_at: '2026-06-20T12:00:00Z',
      created_at: '2026-06-20T12:00:00Z',
      place_name: 'At home',
      media: [
        {
          id: 'qa-media-first-steps',
          media_type: 'image',
          metadata: { source: 'add-sheet', captureQuality: 0.89 },
        },
      ],
      voiceNotes: [],
      tags: ['first:standing'],
    },
  ];
  const shared = [
    {
      asset_owner_user_id: parentId,
      asset_id: firstAssetId,
      moment_id: firstMomentId,
      creation_time: '2026-07-03T12:00:00Z',
      tagged_at: capturedAt,
      latitude: 40.7128,
      longitude: -74.0060,
      location_label: 'At home',
      child_id: null,
    },
    {
      asset_owner_user_id: parentId,
      asset_id: secondAssetId,
      moment_id: secondMomentId,
      creation_time: '2026-06-20T12:00:00Z',
      tagged_at: capturedAt,
      latitude: 40.7128,
      longitude: -74.0060,
      location_label: 'At home',
      child_id: null,
    },
  ];
  const firsts = [
    {
      id: firstId,
      title: 'First smile',
      note: 'Parent confirmed this belongs with Firsts.',
      done: true,
      goal_key: 'smile',
      target_age_label: '6-8 weeks',
      happened_at: '2026-07-03',
      created_at: capturedAt,
      moment_id: firstMomentId,
      asset_owner_user_id: parentId,
      asset_id: firstAssetId,
      child_id: null,
    },
    {
      id: 'qa-first-standing',
      title: 'First standing practice',
      note: '',
      done: true,
      goal_key: 'standing',
      target_age_label: '8-10 months',
      happened_at: '2026-06-20',
      created_at: capturedAt,
      moment_id: secondMomentId,
      asset_owner_user_id: parentId,
      asset_id: secondAssetId,
      child_id: null,
    },
  ];
  const letters = [
    {
      id: letterId,
      title: 'For your first birthday',
      body: 'A parent-written birthday note.',
      created_at: '2026-07-04T12:00:00Z',
      updated_at: '2026-07-04T12:00:00Z',
      open_on: null,
      author_user_id: parentId,
      source_moment_id: firstMomentId,
      source_first_id: firstId,
      child_id: null,
    },
  ];

  return { moments, shared, firsts, letters };
}

function hoursBefore(date, hours) {
  const next = new Date(date);
  next.setUTCHours(next.getUTCHours() - hours);
  return next.toISOString();
}

function validDateOrFallback(value, fallback) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}
