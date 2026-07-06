import { embedFace } from './faceMatcher';
import { fetchPhotosPage, getAssetDetails } from './photos';
import { addReferenceImage } from './recognitionReferences';
import {
  AUTO_SEED_MONTH_SAMPLE_LIMIT,
  buildAutoSeedWindows,
  selectAutoSeedCluster,
  selectAutoSeedPreview,
  selectAutoSeedReferences,
} from './referenceAutoSeedModel';

export async function bootstrapBirthdayReference({
  familyId,
  userId,
  birthdayISO,
  now = new Date(),
  embedFaceFn = embedFace,
  fetchPhotosPageFn = fetchPhotosPage,
  getAssetDetailsFn = getAssetDetails,
} = {}) {
  if (!familyId || !userId || !birthdayISO) {
    return { status: 'fallback', reason: 'missing-context' };
  }

  const sampled = await sampleBirthdayWindows({
    birthdayISO,
    now,
    fetchPhotosPageFn,
  });
  if (!sampled.length) {
    return { status: 'fallback', reason: 'no-photos' };
  }

  const faces = [];
  for (const candidate of sampled) {
    const details = await getAssetDetailsFn(candidate.assetId).catch(() => null);
    const enriched = {
      ...candidate,
      ...(details || {}),
      assetId: candidate.assetId,
      bucketKey: candidate.bucketKey,
      bucketKind: candidate.bucketKind,
      creationTime: details?.creationTime || candidate.creationTime,
    };
    const embedded = await embedFaceFn(enriched.localUri || enriched.uri || candidate.localUri || candidate.uri);
    if (!embedded?.embedding?.length || embedded.faceCount === 0) continue;
    faces.push({
      ...enriched,
      embedding: embedded.embedding,
      faceCount: embedded.faceCount || 1,
      primaryBox: embedded.primaryBox || null,
    });
  }

  const selection = selectAutoSeedCluster({ faces });
  if (selection.status !== 'matched') {
    return selection;
  }

  const seeds = selectAutoSeedReferences(selection.cluster.members);
  if (!seeds.length) {
    return { status: 'fallback', reason: 'no-seed-references' };
  }

  for (const seed of seeds) {
    await addReferenceImage({
      familyId,
      userId,
      birthdayISO,
      uri: seed.localUri || seed.uri || null,
      assetId: seed.assetId,
      embedding: seed.embedding,
      faceCount: seed.faceCount || 1,
      capturedAt: seed.creationTime || Date.now(),
      source: 'auto-seed',
    });
  }

  return {
    status: 'seeded',
    referenceCount: seeds.length,
    preview: selectAutoSeedPreview(selection.cluster.members) || seeds[seeds.length - 1],
    coverage: selection.coverage,
    nonEmptyMonthBucketCount: selection.nonEmptyMonthBucketCount,
  };
}

async function sampleBirthdayWindows({
  birthdayISO,
  now,
  fetchPhotosPageFn,
}) {
  const windows = buildAutoSeedWindows(birthdayISO, now);
  const seen = new Set();
  const sampled = [];

  for (const window of windows) {
    const page = await fetchPhotosPageFn({
      pageSize: AUTO_SEED_MONTH_SAMPLE_LIMIT,
      createdAfterMs: window.startMs,
      createdBeforeMs: window.endMs,
    });
    for (const asset of page.assets || []) {
      const assetId = asset.assetId || asset.id;
      if (!assetId || seen.has(assetId)) continue;
      seen.add(assetId);
      sampled.push({
        ...asset,
        assetId,
        bucketKey: window.key,
        bucketKind: window.kind,
      });
    }
  }

  return sampled;
}
