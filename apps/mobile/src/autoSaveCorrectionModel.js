import { childIdForRow } from './childScopeModel.js';
import { assistantFeedbackTransparency, FEEDBACK_KINDS } from './assistantFeedbackTransparencyModel.js';

export const AUTO_SAVE_MEDIA_SOURCE = 'scan-auto-save';
export const AUTO_SAVE_CORRECTION_REVIEW_THRESHOLD = 1;
const FACE_MATCH_CORRECTION_COPY = assistantFeedbackTransparency(FEEDBACK_KINDS.FACE_MATCH_CORRECTION);

export const AUTO_SAVE_CORRECTION_COPY = {
  confirmTitle: 'Remove assistant-added photo?',
  confirmBody: FACE_MATCH_CORRECTION_COPY.confirmBody,
  successTitle: 'Removed from auto-save',
  successBody: FACE_MATCH_CORRECTION_COPY.successBody,
  actionLabel: 'Not this',
};

export function isAutoSavedMemory(value) {
  return metadataForAutoSave(value).source === AUTO_SAVE_MEDIA_SOURCE;
}

export function autoSaveCorrectionTarget(value = {}) {
  const row = value?.photo || value?.media || value?.row || value;
  const metadata = metadataForAutoSave(row);
  const assetId = row?.asset_id || row?.assetId || row?.local_identifier || row?.localIdentifier || metadata.localAssetId || null;
  const assetOwnerUserId = row?.asset_owner_user_id || row?.assetOwnerUserId || row?.owner_user_id || row?.ownerUserId || null;
  const creationTime = row?.creation_time || row?.creationTime || row?.captured_at || row?.capturedAt || metadata.creationTime || null;
  const mediaType = row?.media_type || row?.mediaType || row?.moment_media?.media_type || row?.type || null;
  const childId = childIdForRow(row);
  return {
    isAutoSaved: metadata.source === AUTO_SAVE_MEDIA_SOURCE,
    assetId,
    assetOwnerUserId,
    childId,
    momentId: row?.moment_id || row?.momentId || null,
    mediaId: row?.moment_media_id || row?.momentMediaId || row?.id || null,
    match: {
      assetId,
      childId,
      mediaType: mediaType || 'image',
      score: finiteOrNull(row?.score) ?? finiteOrNull(metadata.recognitionScore),
      faceCount: finiteOrNull(row?.faceCount) ?? finiteOrNull(metadata.faceCount),
      captureQuality: finiteOrNull(row?.captureQuality) ?? finiteOrNull(metadata.captureQuality),
      creationTime,
    },
  };
}

export function autoSaveCorrectionNeedsReview(correctionCount, threshold = AUTO_SAVE_CORRECTION_REVIEW_THRESHOLD) {
  return Number(correctionCount || 0) >= Number(threshold || AUTO_SAVE_CORRECTION_REVIEW_THRESHOLD);
}

function metadataForAutoSave(value) {
  return value?.metadata || value?.moment_media?.metadata || value?.media?.metadata || {};
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
