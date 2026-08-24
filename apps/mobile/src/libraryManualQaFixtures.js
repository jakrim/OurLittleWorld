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
const COLLECTIONS_FIXTURE_KEY = 'collections';
const SUPPORTED_FIXTURES = new Set([
  EMPTY_FIXTURE_KEY,
  LARGE_NO_FIRSTS_FIXTURE_KEY,
  CONNECTED_FIRST_LETTER_FIXTURE_KEY,
  COLLECTIONS_FIXTURE_KEY,
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
    collections: [],
  };

  if (key === EMPTY_FIXTURE_KEY) return base;

  if (key === CONNECTED_FIRST_LETTER_FIXTURE_KEY) {
    return {
      ...base,
      ...buildConnectedFirstLetterRows({ userId, now }),
    };
  }

  if (key === COLLECTIONS_FIXTURE_KEY) {
    return {
      ...base,
      ...buildCollectionsRows({ userId, now }),
    };
  }

  const { moments, shared } = buildLargeNoFirstsRows({ userId, now });
  return {
    ...base,
    moments,
    shared,
  };
}

function buildCollectionsRows({ userId, now }) {
  const { moments, shared } = buildLargeNoFirstsRows({ userId, now });
  const sample = moments.slice(0, 24);
  const photoIds = sample.map((moment) => moment.id);
  const parkIds = sample.filter((moment) => moment.place_name === 'At the park').map((moment) => moment.id);
  const monthIds = sample.filter((moment) => moment.captured_at.startsWith('2026-07')).map((moment) => moment.id);
  const authorIds = sample.filter((_, index) => index % 2 === 0).map((moment) => moment.id);
  const collections = [
    fixtureCollection('qa-collection-photos', 'media:photos', 'media', 'Photos', 'media_type', photoIds),
    fixtureCollection('qa-collection-month', 'month:2026-07', 'month', 'July 2026', 'date_month', monthIds),
    fixtureCollection('qa-collection-park', 'place:qa-park', 'place', 'At the park', 'parent_place', parkIds),
    fixtureCollection('qa-collection-author', 'author:qa-parent', 'author', 'Added by a parent', 'author', authorIds),
  ];
  return { moments: sample, shared: shared.slice(0, 24), collections };
}

function fixtureCollection(id, collectionKey, kind, title, sourceCode, momentIds) {
  return {
    id,
    family_id: 'qa-family',
    collection_key: collectionKey,
    kind,
    title,
    source_code: sourceCode,
    confidence_band: sourceCode === 'parent_place' ? 'parent' : 'factual',
    model_version: 'factual-collections-v1',
    moment_count: momentIds.length,
    latest_captured_at: null,
    moment_ids: momentIds,
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
    const mediaUri = syntheticMemoryUri(index);

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
          thumbUrl: mediaUri,
          fullUrl: mediaUri,
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
      thumbUrl: mediaUri,
      fullUrl: mediaUri,
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
  const smileUri = syntheticMemoryUri(1);
  const standingUri = syntheticMemoryUri(2);
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
          thumbUrl: smileUri,
          fullUrl: smileUri,
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
          thumbUrl: standingUri,
          fullUrl: standingUri,
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
      thumbUrl: smileUri,
      fullUrl: smileUri,
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
      thumbUrl: standingUri,
      fullUrl: standingUri,
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

export function syntheticMemoryUri(index = 0) {
  const palettes = [
    ['#d98272', '#f7d8c5', '#6f4139'],
    ['#7f9d93', '#dce9df', '#405a53'],
    ['#a68bb5', '#eee1f1', '#594662'],
    ['#c89a58', '#f4e3bd', '#6e522d'],
  ];
  const [background, blanket, ink] = palettes[Math.abs(Number(index || 0)) % palettes.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1125" viewBox="0 0 900 1125">
    <rect width="900" height="1125" fill="${background}"/>
    <circle cx="720" cy="170" r="220" fill="${blanket}" opacity=".45"/>
    <path d="M0 820 Q230 690 450 810 T900 790 V1125 H0Z" fill="${blanket}"/>
    <ellipse cx="450" cy="465" rx="228" ry="245" fill="#f4c9a9"/>
    <path d="M244 420 Q275 188 463 196 Q650 205 671 426 Q580 335 450 346 Q330 350 244 420Z" fill="${ink}"/>
    <circle cx="368" cy="470" r="20" fill="${ink}"/>
    <circle cx="535" cy="470" r="20" fill="${ink}"/>
    <path d="M375 570 Q450 635 533 566" fill="none" stroke="${ink}" stroke-width="20" stroke-linecap="round"/>
    <circle cx="286" cy="548" r="31" fill="#e9978a" opacity=".55"/>
    <circle cx="614" cy="548" r="31" fill="#e9978a" opacity=".55"/>
    <path d="M250 805 Q450 670 650 805 L730 1125 H170Z" fill="#fff" opacity=".86"/>
    <text x="56" y="70" font-family="system-ui, sans-serif" font-size="18" fill="${ink}" opacity=".52">SYNTHETIC QA MEMORY</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
