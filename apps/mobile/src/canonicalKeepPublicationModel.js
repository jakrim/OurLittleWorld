import { requireGroundedCaptureIso } from './groundedCaptureTimeModel.js';
import { mediaUploadMetadata } from './mediaUploadMetadataModel.js';

const TRANSPORTS = new Set(['image', 'video-stream', 'video-direct', 'video-poster']);

export function buildCanonicalKeepPublicationParams(input = {}) {
  const transport = String(input.transport || '');
  if (!TRANSPORTS.has(transport)) throw new Error('Canonical Keep transport is invalid');
  for (const key of ['familyId', 'reservationId', 'momentId', 'mediaId', 'remoteAssetKey']) {
    if (!input[key]) throw new Error('Canonical Keep publication scope is incomplete');
  }
  // A media Keep must retain a capture time grounded in Photos or the durable
  // private candidate. Publication never substitutes Keep time for an unknown
  // date; the parent can retry the original or choose another memory instead.
  const captureTime = requireGroundedCaptureIso(input.creationTime);
  return {
    target_family_id: input.familyId,
    p_reservation_id: input.reservationId,
    p_transport: transport,
    p_moment_id: input.momentId,
    p_media_id: input.mediaId,
    p_asset_id: input.remoteAssetKey,
    p_captured_at: captureTime,
    p_tagged_at: input.taggedAt || null,
    p_creation_time: captureTime,
    p_latitude: finiteOrNull(input.latitude),
    p_longitude: finiteOrNull(input.longitude),
    p_location_fetched_at: input.locationFetchedAt || null,
    p_file_name: input.fileName || null,
    p_mime_type: input.mimeType || null,
    p_full_object: input.fullObjectId || null,
    p_thumb_object: input.thumbObjectId || null,
    p_poster_object: input.posterObjectId || null,
    p_full_storage_path: input.fullStoragePath || null,
    p_thumb_storage_path: input.thumbStoragePath || null,
    p_poster_storage_path: input.posterStoragePath || null,
    p_width: integerOrNull(input.width),
    p_height: integerOrNull(input.height),
    p_duration_sec: finiteOrNull(input.durationSec),
    p_metadata: mediaUploadMetadata(input.metadata),
    p_stream_uid: input.streamUid || null,
    p_source_bytes: integerOrNull(input.sourceBytes),
    p_optimized_bytes: integerOrNull(input.optimizedBytes),
    p_playback_seconds: integerOrNull(input.playbackSeconds),
    p_actual_bytes: integerOrNull(input.actualBytes),
    p_actual_duration_sec: integerOrNull(input.actualDurationSec),
  };
}

export function canonicalKeepPublicationResult(data, expected) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row
    || row.moment_id !== expected?.momentId
    || row.moment_media_id !== expected?.mediaId
    || !row.photo_tag_id) {
    throw new Error('Canonical Keep publication was not confirmed');
  }
  return {
    momentId: row.moment_id,
    mediaId: row.moment_media_id,
    alreadyPublished: row.already_published === true,
  };
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value) {
  const number = finiteOrNull(value);
  return number == null ? null : Math.max(0, Math.round(number));
}
