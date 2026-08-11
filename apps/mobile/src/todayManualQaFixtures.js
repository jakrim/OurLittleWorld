import { syntheticMemoryUri } from './libraryManualQaFixtures.js';

export function buildTodayManualQaFixture(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (String(raw || '').trim().toLowerCase() !== 'photo-first') return null;
  const captures = [
    Date.parse('2026-08-09T18:15:00Z'),
    Date.parse('2026-06-14T15:30:00Z'),
    Date.parse('2026-02-02T11:45:00Z'),
    Date.parse('2025-10-18T16:05:00Z'),
  ];
  const items = captures.map((captureTimeMs, position) => ({
    sessionId: 'qa-tonight-photo-first',
    position,
    assetId: `qa-tonight-${position + 1}`,
    reasonCode: position === 0 ? 'best_day' : 'first_year_coverage',
    state: 'queued',
    commitState: 'idle',
    draftText: '',
    favorite: false,
    reactionCode: null,
    collectionKeys: [],
    mediaType: position === 2 ? 'video' : 'image',
    localUri: syntheticMemoryUri(position),
    previewUri: syntheticMemoryUri(position),
    availability: 'available',
    captureTimeMs,
    localDay: new Date(captureTimeMs).toISOString().slice(0, 10),
  }));
  return {
    session: {
      sessionId: 'qa-tonight-photo-first',
      localDay: '2026-08-10',
      timezone: 'America/New_York',
      status: 'active',
      currentPosition: 0,
      itemCount: items.length,
      completed: false,
      items,
    },
    summary: {
      sessionId: 'qa-tonight-photo-first',
      count: items.length,
      status: 'active',
    },
  };
}

export function todayManualQaRouteParams(fixture) {
  return fixture ? { source: 'today', qa: 'photo-first' } : { source: 'today' };
}
