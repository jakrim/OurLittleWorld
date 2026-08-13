import { isMediaPolicyError } from './mediaPolicy';
import { ensureMomentReaction, ensureMomentVoiceNote, updateMoment } from './moments';
import { Tags } from './storage';
import { applyMomentCollectionChoices } from './collections';
import {
  beginTonightKeep,
  markTonightCommitStep,
} from './candidateLedgerStore';
import { executeTonightCommit } from './tonightCommitModel.js';

const defaultDependencies = {
  beginTonightKeep,
  markTonightCommitStep,
  setBaby: (input) => Tags.setBaby(input),
  savedTarget: (input) => Tags.savedTarget(input),
  saveText: ({ familyId, momentId, note }) => updateMoment({
    familyId,
    momentId,
    patch: { captionNote: note },
  }),
  saveVoice: ensureMomentVoiceNote,
  saveReaction: ensureMomentReaction,
  saveCollections: applyMomentCollectionChoices,
};

export async function commitTonightMemory({
  sessionId,
  familyId,
  userId,
  position,
  item,
  match,
  onStep = null,
  dependencies = defaultDependencies,
}) {
  return executeTonightCommit({
    sessionId,
    familyId,
    userId,
    position,
    item,
    match,
    onStep,
    dependencies,
    isMediaPolicyFailure: isMediaPolicyError,
  });
}
