export function analyticsEnvironment() {
  const configured = process.env.EXPO_PUBLIC_OUR_LITTLE_WORLD_ANALYTICS_ENVIRONMENT;
  if (configured === 'production' || configured === 'preview') return configured;
  return 'development';
}

export function analyticsPlatform(platform) {
  if (platform === 'ios') return 'ios';
  if (platform === 'android') return 'android';
  if (platform === 'web') return 'web';
  return 'unknown';
}

export function childAgeBand(birthday, now = new Date()) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(String(birthday || ''))
    ? new Date(`${birthday}T12:00:00`)
    : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return 'unknown';
  const days = Math.floor((now.getTime() - parsed.getTime()) / 86400000);
  if (days < 0) return 'prenatal';
  if (days < 92) return '0_3m';
  if (days < 183) return '3_6m';
  if (days < 366) return '6_12m';
  if (days < 731) return '12_24m';
  return '24m_plus';
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
