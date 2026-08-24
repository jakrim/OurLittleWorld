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

function compareFrame(a, b) {
  return Number(b.score?.score || 0) - Number(a.score?.score || 0)
    || Number(b.score?.captureQuality || 0) - Number(a.score?.captureQuality || 0)
    || Number(b.score?.sharpness || 0) - Number(a.score?.sharpness || 0)
    || Number(a.candidate?.frameTimeMs || 0) - Number(b.candidate?.frameTimeMs || 0);
}
