import { selectPostSaveNudge } from './postSaveNudgeModel.js';

const PHOTO_ONLY_FIXTURE_KEY = 'photo-only';
const SUPPORTED_FIXTURES = new Set([PHOTO_ONLY_FIXTURE_KEY]);

const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

export function normalizeAddManualQaFixture(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const key = String(raw || '').trim().toLowerCase();
  return SUPPORTED_FIXTURES.has(key) ? key : null;
}

export function buildAddManualQaFixture(value, {
  now = new Date('2026-07-09T12:00:00Z'),
} = {}) {
  const key = normalizeAddManualQaFixture(value);
  if (!key) return null;
  const capturedAt = validDateOrFallback(now, new Date('2026-07-09T12:00:00Z')).toISOString();
  const assets = [
    {
      uri: ONE_PIXEL_PNG,
      type: 'image',
      width: 1,
      height: 1,
      fileName: 'qa-photo-only.png',
      mimeType: 'image/png',
      creationTime: new Date(capturedAt).getTime(),
    },
  ];

  return {
    key,
    assets,
    moment: {
      id: 'qa-photo-only-moment',
      capturedAt,
      media: [
        {
          id: 'qa-photo-only-media',
          media_type: 'image',
          metadata: { source: 'add-sheet', qaDryRun: true },
        },
      ],
    },
  };
}

export function buildAddManualQaPostSaveNudge(fixture, {
  family = null,
  assets = null,
  note = '',
  voice = null,
  now = new Date('2026-07-09T12:00:00Z'),
} = {}) {
  if (!fixture?.moment?.id) return null;
  return selectPostSaveNudge({
    state: { dailyCounts: {}, dismissedMomentIds: {} },
    moment: {
      id: fixture.moment.id,
      assets: assets?.length ? assets : fixture.assets,
      media: fixture.moment.media,
      voice,
      hasVoice: Boolean(voice?.uri),
      note,
      capturedAt: fixture.moment.capturedAt,
    },
    goals: [],
    firsts: [],
    birthdayISO: family?.babyBirthday,
    babyName: family?.babyName,
    now,
  });
}

function validDateOrFallback(value, fallback) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}
