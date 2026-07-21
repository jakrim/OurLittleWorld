import { buildTonightCommitPlan, tonightReactionCodes } from './tonightEnrichmentModel.js';

export async function executeTonightCommit({
  sessionId,
  familyId,
  userId,
  position,
  item,
  match,
  onStep = null,
  isMediaPolicyFailure = () => false,
  dependencies,
}) {
  const scope = { sessionId, familyId, userId, position };
  const prepared = dependencies.beginTonightKeep(scope);
  if (prepared.alreadyComplete) return prepared.item;
  let current = { ...(item || {}), ...(prepared.item || {}) };
  const plan = buildTonightCommitPlan(current);

  current = await commitStep({
    scope,
    step: plan[0],
    current,
    dependencies,
    onStep,
    action: async () => {
      try {
        await dependencies.setBaby({
          familyId,
          assetId: current.assetId,
          isBaby: true,
          match,
          videoPosterOnly: false,
          source: 'tonight-curation',
        });
      } catch (error) {
        if (current.mediaType !== 'video' || !isMediaPolicyFailure(error)) throw error;
        await dependencies.setBaby({
          familyId,
          assetId: current.assetId,
          isBaby: true,
          match,
          videoPosterOnly: true,
          source: 'tonight-curation',
        });
      }
      const target = await dependencies.savedTarget({ familyId, assetId: current.assetId, ownerUserId: userId });
      if (!target?.moment_id) throw new Error('Saved memory target is not ready yet');
      return { canonicalMomentId: target.moment_id };
    },
  });

  const momentId = current.canonicalMomentId;
  if (!momentId) throw new Error('Saved memory target is not ready yet');

  for (const step of plan.slice(1)) {
    current = await commitStep({
      scope,
      step,
      current,
      dependencies,
      onStep,
      action: () => commitEnrichmentStep({
        step: step.key,
        current,
        familyId,
        userId,
        momentId,
        dependencies,
      }),
    });
  }
  return current;
}

async function commitStep({ scope, step, current, dependencies, action, onStep }) {
  if (step.complete) return current;
  if (!step.needed) return {
    ...current,
    ...dependencies.markTonightCommitStep({ ...scope, step: step.key, state: 'skipped' }),
  };
  onStep?.(step.key, 'saving');
  current = dependencies.markTonightCommitStep({ ...scope, step: step.key, state: 'saving' });
  try {
    const result = await action();
    const saved = dependencies.markTonightCommitStep({
      ...scope,
      step: step.key,
      state: 'saved',
      ...(result?.canonicalMomentId ? { canonicalMomentId: result.canonicalMomentId } : {}),
    });
    onStep?.(step.key, 'saved');
    return { ...current, ...saved };
  } catch (error) {
    dependencies.markTonightCommitStep({ ...scope, step: step.key, state: 'failed' });
    onStep?.(step.key, 'failed');
    error.tonightCommitStep = step.key;
    throw error;
  }
}

async function commitEnrichmentStep({ step, current, familyId, userId, momentId, dependencies }) {
  if (step === 'text') {
    return dependencies.saveText({ familyId, ownerUserId: userId, assetId: current.assetId, note: current.draftText });
  }
  if (step === 'voice') {
    return dependencies.saveVoice({
      familyId,
      momentId,
      voice: current.draftVoice,
      voiceNoteId: current.canonicalVoiceNoteId,
      voiceObjectId: current.canonicalVoiceObjectId,
    });
  }
  if (step === 'reaction') {
    for (const emoji of tonightReactionCodes(current)) await dependencies.saveReaction({ familyId, momentId, emoji });
  }
  if (step === 'collection') {
    return dependencies.saveCollections({
      familyId,
      momentId,
      availableKeys: current.availableCollectionKeys || [],
      selectedKeys: current.collectionKeys || [],
    });
  }
  return null;
}
