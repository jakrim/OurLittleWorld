export function collapseScoredMediaCandidates({
  candidates = [],
  scored = [],
  cutoff = null,
} = {}) {
  const candidateById = new Map((candidates || []).map((candidate) => [candidate.assetId, candidate]));
  const scoreById = new Map((scored || []).map((row) => [row.assetId, row]));
  const bySource = new Map();

  for (const candidate of candidates || []) {
    const sourceId = candidate.sourceAssetId || candidate.assetId;
    if (!sourceId) continue;
    if (!bySource.has(sourceId)) bySource.set(sourceId, []);
    bySource.get(sourceId).push(candidate);
  }

  const out = [];
  for (const [sourceId, sourceCandidates] of bySource) {
    const rows = sourceCandidates
      .map((candidate) => ({ candidate, score: scoreById.get(candidate.assetId) }))
      .filter((row) => row.score);
    const passing = cutoff == null
      ? rows
      : rows.filter((row) => Number(row.score.score || 0) >= cutoff);
    if (!passing.length) continue;
    const best = [...passing].sort(compareFrame)[0];
    const candidate = candidateById.get(best.candidate.assetId) || best.candidate;
    const isVideo = candidate.mediaType === 'video';
    out.push({
      assetId: sourceId,
      candidateId: best.score.assetId,
      mediaType: candidate.mediaType || 'image',
      score: best.score.score,
      faceCount: best.score.faceCount,
      captureQuality: best.score.captureQuality ?? null,
      faceSizeRatio: best.score.faceSizeRatio ?? null,
      sharpness: best.score.sharpness ?? null,
      smileScore: best.score.smileScore ?? best.score.likelySmileScore ?? null,
      featureVector: best.score.featureVector || best.score.embedding || best.score.featurePrint || null,
      visualFingerprint: best.score.visualFingerprint || null,
      creationTime: candidate.creationTime,
      uri: candidate.previewUri || candidate.localUri,
      localUri: candidate.localUri,
      frameTimeMs: candidate.frameTimeMs,
      duration: candidate.duration,
      videoUri: candidate.videoUri,
      fileName: candidate.fileName,
      videoSampledFrames: isVideo ? sourceCandidates.length : null,
      videoMatchedFrames: isVideo ? passing.length : null,
      videoPresenceRatio: isVideo ? passing.length / Math.max(1, sourceCandidates.length) : null,
      accepted: true,
      saved: false,
    });
  }
  return out.sort((a, b) => Number(b.creationTime || 0) - Number(a.creationTime || 0));
}

/**
 * Returns one durable, device-local analysis row for every source asset that
 * native analysis completed. Passing rows become review candidates; weak,
 * adult-only and no-face rows remain rejected evidence in the local ledger so
 * a relaunch does not repeatedly analyze the same photo.
 */
export function collapseAnalyzedMediaCandidates({
  candidates = [],
  scored = [],
  processedAssetIds = [],
} = {}) {
  const completedCandidates = completelyAnalyzedMediaCandidates(candidates, processedAssetIds);
  const collapsed = collapseScoredMediaCandidates({
    candidates: completedCandidates,
    scored,
    cutoff: null,
  });
  const completedSources = new Set(
    completedCandidates.map((candidate) => candidate.sourceAssetId || candidate.assetId).filter(Boolean),
  );
  const represented = new Set(collapsed.map((row) => row.assetId));
  const rejectedWithoutScore = [];
  for (const sourceId of completedSources) {
    if (represented.has(sourceId)) continue;
    const candidate = completedCandidates.find((row) => (row.sourceAssetId || row.assetId) === sourceId);
    if (!candidate) continue;
    rejectedWithoutScore.push({
      assetId: sourceId,
      candidateId: candidate.assetId,
      mediaType: candidate.mediaType || 'image',
      score: null,
      faceCount: 0,
      captureQuality: null,
      creationTime: candidate.creationTime,
      uri: candidate.previewUri || candidate.localUri,
      localUri: candidate.localUri,
      frameTimeMs: candidate.frameTimeMs,
      duration: candidate.duration,
      videoUri: candidate.videoUri,
      fileName: candidate.fileName,
      accepted: false,
      saved: false,
    });
  }
  return collapsed.concat(rejectedWithoutScore)
    .sort((a, b) => Number(b.creationTime || 0) - Number(a.creationTime || 0));
}

export function completelyAnalyzedMediaCandidates(candidates = [], processedAssetIds = []) {
  const processed = new Set(processedAssetIds.filter(Boolean));
  const bySource = new Map();
  for (const candidate of candidates || []) {
    const sourceId = candidate?.sourceAssetId || candidate?.assetId;
    if (!sourceId || !candidate?.assetId) continue;
    if (!bySource.has(sourceId)) bySource.set(sourceId, []);
    bySource.get(sourceId).push(candidate);
  }
  const completed = [];
  for (const sourceCandidates of bySource.values()) {
    if (sourceCandidates.every((candidate) => processed.has(candidate.assetId))) {
      completed.push(...sourceCandidates);
    }
  }
  return completed;
}

function compareFrame(a, b) {
  return Number(b.score?.score || 0) - Number(a.score?.score || 0)
    || Number(b.score?.captureQuality || 0) - Number(a.score?.captureQuality || 0)
    || Number(b.score?.sharpness || 0) - Number(a.score?.sharpness || 0)
    || Number(a.candidate?.frameTimeMs || 0) - Number(b.candidate?.frameTimeMs || 0);
}
