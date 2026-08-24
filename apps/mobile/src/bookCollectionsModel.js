import { buildFirstsSummary } from './firstsSummaryModel.js';
import { childScopeContext, filterRowsForChildScope } from './childScopeModel.js';

export function buildBookCollectionSummaries({
  firsts = [],
  letters = [],
  sharedPhotos = [],
  now = new Date(),
  childId = null,
} = {}) {
  const scope = childScopeContext(childId);
  const scopedFirsts = filterRowsForChildScope(firsts, scope.childId);
  const scopedSharedPhotos = filterRowsForChildScope(sharedPhotos, scope.childId);
  return {
    ...scope,
    firsts: buildFirstsSummary(scopedFirsts, scopedSharedPhotos),
    letters: buildLettersSummary(letters, now, { childId: scope.childId }),
  };
}

export function buildLettersSummary(letters = [], now = new Date(), { childId = null } = {}) {
  const rows = filterRowsForChildScope(letters, childId).filter(Boolean);
  const latest = [...rows].sort((a, b) => latestTimestamp(b) - latestTimestamp(a))[0] || null;
  const states = rows.reduce((acc, letter) => {
    const state = letterOpenState(letter, now);
    if (state === 'open') acc.openCount += 1;
    if (state === 'sealed') acc.sealedCount += 1;
    return acc;
  }, { openCount: 0, sealedCount: 0 });

  return {
    count: rows.length,
    latest,
    latestState: latest ? letterOpenState(latest, now) : null,
    ...states,
  };
}

export function letterOpenState(letter, now = new Date()) {
  if (!letter?.open_on) return 'open';
  const openMs = localDateMs(letter?.open_on);
  if (openMs == null) return 'saved';
  const nowMs = timestampMs(now) ?? Date.now();
  return openMs <= nowMs ? 'open' : 'sealed';
}

function latestTimestamp(row) {
  return timestampMs(row?.created_at)
    ?? timestampMs(row?.updated_at)
    ?? localDateMs(row?.open_on)
    ?? 0;
}

function timestampMs(value) {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function localDateMs(value) {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const ms = new Date(`${raw}T00:00:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}
