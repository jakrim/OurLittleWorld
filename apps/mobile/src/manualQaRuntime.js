export function isManualQaRuntime() {
  const developmentBuild = typeof __DEV__ !== 'undefined' && __DEV__ === true;
  return developmentBuild || process.env.EXPO_PUBLIC_OLW_MANUAL_QA === 'true';
}
