export const PHYSICAL_DISCOVERY_QA_LIMIT = 30;

export const PHYSICAL_DISCOVERY_QA_CATEGORIES = Object.freeze([
  'useful',
  'adultOnly',
  'duplicate',
  'weak',
]);

export function buildPhysicalDiscoveryQaCandidates(rows = [], {
  limit = PHYSICAL_DISCOVERY_QA_LIMIT,
} = {}) {
  const boundedLimit = Math.max(0, Math.min(PHYSICAL_DISCOVERY_QA_LIMIT, Number(limit || 0)));
  return (rows || [])
    .map((row) => ({
      mediaUri: row?.preview_uri || row?.local_uri || null,
      mediaType: row?.media_type === 'video' ? 'video' : 'image',
    }))
    .filter((candidate) => !!candidate.mediaUri)
    .slice(0, boundedLimit);
}

export function emptyPhysicalDiscoveryQaCounts() {
  return {
    useful: 0,
    adultOnly: 0,
    duplicate: 0,
    weak: 0,
  };
}

export function recordPhysicalDiscoveryQaClassification(counts, category) {
  if (!PHYSICAL_DISCOVERY_QA_CATEGORIES.includes(category)) {
    throw new Error('Unknown physical discovery QA category');
  }
  return {
    ...emptyPhysicalDiscoveryQaCounts(),
    ...(counts || {}),
    [category]: Number(counts?.[category] || 0) + 1,
  };
}

export function physicalDiscoveryQaSummary(counts = emptyPhysicalDiscoveryQaCounts()) {
  const total = PHYSICAL_DISCOVERY_QA_CATEGORIES.reduce(
    (sum, category) => sum + Number(counts?.[category] || 0),
    0,
  );
  return {
    total,
    usefulChildPrecision: total ? Number(counts.useful || 0) / total : null,
    adultOnlyFalsePositives: Number(counts.adultOnly || 0),
    duplicates: Number(counts.duplicate || 0),
    weak: Number(counts.weak || 0),
  };
}
