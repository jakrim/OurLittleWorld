export function analyticsEnvironment() {
  const configured = process.env.EXPO_PUBLIC_OUR_LITTLE_WORLD_ANALYTICS_ENVIRONMENT;
  if (configured === 'production' || configured === 'preview') return configured;
  return 'development';
}

export function analyticsPlatform(platform) {
  if (platform === 'ios') return 'ios';
  if (platform === 'web') return 'web';
  return 'unknown';
}

export function productKeyForTier(tier, cadence) {
  const normalizedTier = tier === 'vault' ? 'vault' : 'family';
  const normalizedCadence = cadence === 'monthly' ? 'month' : 'year';
  return `${normalizedTier}_${normalizedCadence}`;
}

export function mediaKindForAssets(assets, hasVoice = false) {
  const kinds = new Set((assets || []).map((asset) => asset?.type).filter(Boolean));
  if (kinds.has('video') && kinds.has('image')) return 'photo_video';
  if (kinds.has('video')) return 'video';
  if (kinds.has('image')) return 'photo';
  if (hasVoice) return 'voice';
  return 'none';
}

export function sanitizeAcquisitionContext(input = {}) {
  const output = {};
  for (const key of ['campaign', 'angle', 'creative', 'channel']) {
    const value = typeof input[key] === 'string' ? input[key].trim().slice(0, 120) : '';
    if (value && !value.includes('://') && !value.includes('@') && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(value)) {
      output[key] = value;
    }
  }
  const landingPage = typeof input.landing_page === 'string' ? input.landing_page.trim().slice(0, 120) : '';
  if (/^\/[a-zA-Z0-9/_-]*$/.test(landingPage)) output.landing_page = landingPage;
  return output;
}
