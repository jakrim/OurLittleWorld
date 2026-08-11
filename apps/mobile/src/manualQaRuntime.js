export function isManualQaRuntime() {
  const developmentBuild = typeof __DEV__ !== 'undefined' && __DEV__ === true;
  return developmentBuild || process.env.EXPO_PUBLIC_OLW_MANUAL_QA === 'true';
}

const ROUTABLE_SYNTHETIC_FIXTURES = new Set([
  'photo-first',
  'empty',
  'large-no-firsts',
  'connected-first-letter',
  'collections',
]);

export function isSyntheticManualQaRoute(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return isManualQaRuntime()
    && ROUTABLE_SYNTHETIC_FIXTURES.has(String(raw || '').trim().toLowerCase());
}
