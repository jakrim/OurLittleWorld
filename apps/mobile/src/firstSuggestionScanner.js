// Targeted on-device generation for Suggested Firsts (S3). For each due goal
// it pages the photo library inside the goal's age window, scores candidates
// against the family reference profile, and persists at most one suggestion
// per goal. Quiet by design: throttled per goal, capped per run, and a silent
// no-op without the native matcher, library permission, or a reference
// profile. Testable decision logic lives in firstSuggestionModel.js.

import { isNative, matchAgainstReferenceProfile } from './faceMatcher';
import {
  buildFirstSuggestion,
  shouldGenerateForGoal,
  suggestionWindowForGoal,
} from './firstSuggestionModel';
import { readFirstSuggestionState, saveGeneratedSuggestions } from './firstSuggestionStore';
import { fetchPhotosPage, getLibraryPermissionStatus } from './photos';
import { readReferenceProfile } from './recognitionReferences';

export const FIRST_SUGGESTION_SCAN_CAP = 240; // tunable, assets per goal window
export const FIRST_SUGGESTION_GOALS_PER_RUN = 2; // tunable
const PAGE_SIZE = 60;

// goalRows carry `.completed` (buildFirstsModel output). Returns the updated
// suggestion state, or null when nothing was due or generation isn't possible.
export async function generateFirstSuggestions({
  familyId,
  userId,
  babyBirthday,
  goalRows = [],
  now = new Date(),
} = {}) {
  if (!familyId || !userId || !babyBirthday || !isNative) return null;
  const permission = await getLibraryPermissionStatus().catch(() => null);
  if (!permission?.granted) return null;

  const state = await readFirstSuggestionState({ familyId, userId });
  const dueGoals = goalRows
    .filter((goal) => shouldGenerateForGoal({ state, goal, babyBirthday, now }))
    .slice(0, FIRST_SUGGESTION_GOALS_PER_RUN);
  if (!dueGoals.length) return null;

  const profile = await readReferenceProfile({ familyId, userId });
  if (!profile?.references?.length) return null;

  const suggestions = [];
  const generatedGoalKeys = [];
  for (const goal of dueGoals) {
    const window = suggestionWindowForGoal({ goal, babyBirthday, now });
    if (!window) continue;
    generatedGoalKeys.push(goal.key);
    const matches = await scanWindowForMatches({ window, profile, babyBirthday });
    const suggestion = buildFirstSuggestion({
      goal,
      matches,
      ownerUserId: userId,
      now,
      excludedAssetIds: state.excludedAssetIds,
    });
    if (suggestion) suggestions.push(suggestion);
  }
  if (!generatedGoalKeys.length) return null;

  return saveGeneratedSuggestions({ familyId, userId, suggestions, generatedGoalKeys, now });
}

async function scanWindowForMatches({ window, profile, babyBirthday }) {
  const matches = [];
  let after;
  let seen = 0;

  while (seen < FIRST_SUGGESTION_SCAN_CAP) {
    const page = await fetchPhotosPage({
      pageSize: PAGE_SIZE,
      after,
      createdAfterMs: window.createdAfterMs,
      createdBeforeMs: window.createdBeforeMs,
    });
    const assets = page?.assets || [];
    if (!assets.length) break;
    seen += assets.length;

    const candidates = assets
      .map((asset) => ({
        assetId: asset.id,
        localUri: asset.localUri || asset.uri,
        uri: asset.uri || null,
        creationTime: asset.creationTime ?? null,
      }))
      .filter((candidate) => candidate.assetId && candidate.localUri);

    if (candidates.length) {
      const scored = await matchAgainstReferenceProfile({
        profile,
        birthdayISO: babyBirthday,
        candidates,
      });
      const byId = new Map(candidates.map((candidate) => [candidate.assetId, candidate]));
      for (const result of scored) {
        const candidate = byId.get(result.assetId);
        matches.push({
          ...result,
          creationTime: candidate?.creationTime ?? null,
          uri: candidate?.uri || null,
          localUri: candidate?.localUri || null,
        });
      }
    }

    if (!page.hasNextPage) break;
    after = page.endCursor;
  }

  return matches;
}
