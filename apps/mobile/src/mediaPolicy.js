import { Alert } from 'react-native';
import { File } from 'expo-file-system';

import { supabase } from './supabase';
import { getFamilyEntitlement } from './billing';
import { confirmMediaUploadFinalized } from './mediaUploadRecoveryModel.js';

/**
 * Media policy for uploads. Wraps the plan entitlement checks and the
 * reserve/finalize/release quota RPCs from the media_quotas migration.
 *
 * Copy rules: never say "compressed", "limited", "too large", or
 * "storage error" — the plan language is app quality / Vault / poster-only.
 */

export const OVER_LIMIT_VIDEO_MESSAGE =
  'This video is longer than the Family plan can save as a playable memory. '
  + 'Keep the poster and note, or move to Vault for longer videos and original backup.';

export const UPGRADE_PROMPT_MESSAGE =
  'Vault gives your family more room for longer videos and original backup. Your existing memories stay in place.';

export class MediaPolicyError extends Error {
  constructor(reason, message) {
    super(message || OVER_LIMIT_VIDEO_MESSAGE);
    this.name = 'MediaPolicyError';
    this.reason = reason;
  }
}

export function isMediaPolicyError(err) {
  return err?.name === 'MediaPolicyError';
}

export function fileSizeOf(uri) {
  try {
    return Number(new File(uri).size) || null;
  } catch {
    return null;
  }
}

/** Local pre-check against the plan's per-video caps. */
export function checkVideoPolicy({ durationSec, sourceBytes, entitlement }) {
  if (!entitlement) return { allowed: true, reason: null };
  if (Number.isFinite(durationSec) && durationSec > entitlement.maxVideoDurationSec) {
    return { allowed: false, reason: 'video_too_long' };
  }
  if (Number.isFinite(sourceBytes) && sourceBytes > entitlement.maxVideoSourceBytes) {
    return { allowed: false, reason: 'video_source_too_large' };
  }
  return { allowed: true, reason: null };
}

export async function assertVideoWithinPlan({ familyId, durationSec, sourceBytes }) {
  let entitlement = null;
  try {
    entitlement = await getFamilyEntitlement(familyId);
  } catch (err) {
    console.warn('mediaPolicy entitlement check skipped', err?.message);
    return null;
  }
  const verdict = checkVideoPolicy({ durationSec, sourceBytes, entitlement });
  if (!verdict.allowed) throw new MediaPolicyError(verdict.reason);
  return entitlement;
}

/**
 * Reserve quota before an upload. Policy rejections throw MediaPolicyError;
 * infrastructure errors fail open (upload proceeds, server still counts
 * usage at finalize) so a flaky network can't brick saving memories.
 */
export async function reserveMediaUpload({ familyId, mediaType, bytes, durationSec = 0, quotaClass = 'optimized', required = false }) {
  try {
    const { data, error } = await supabase.rpc('reserve_media_upload', {
      target_family_id: familyId,
      p_media_type: mediaType,
      p_bytes: Math.max(0, Math.round(bytes || 0)),
      p_duration_sec: Math.max(0, Math.round(durationSec || 0)),
      p_quota_class: quotaClass,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    if (!row.allowed) throw new MediaPolicyError(row.reason);
    return row.reservation_id;
  } catch (err) {
    if (isMediaPolicyError(err)) throw err;
    if (required) throw err;
    console.warn('reserveMediaUpload skipped', err?.message);
    return null;
  }
}

export async function finalizeMediaUpload(reservationId, { bytes = null, durationSec = null } = {}) {
  if (!reservationId) return null;
  return confirmMediaUploadFinalized({
    reservationId,
    finalize: async () => {
      const { error } = await supabase.rpc('finalize_media_upload', {
        p_reservation_id: reservationId,
        p_actual_bytes: bytes == null ? null : Math.max(0, Math.round(bytes)),
        p_actual_duration_sec: durationSec == null ? null : Math.max(0, Math.round(durationSec)),
      });
      if (error) throw error;
    },
    read: async () => {
      const { data, error } = await supabase
        .from('media_upload_reservations')
        .select('id, status')
        .eq('id', reservationId)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
  });
}

export async function releaseMediaUpload(reservationId) {
  if (!reservationId) return;
  const { error } = await supabase.rpc('release_media_upload', { p_reservation_id: reservationId });
  if (error) console.warn('releaseMediaUpload', error.message);
}

/**
 * Over-limit prompt per the plan copy. "Save a highlight" is intentionally
 * absent until native trimming ships.
 */
export function promptOverLimitVideo({ onPosterOnly, onSeeVault, onCancel } = {}) {
  const buttons = [];
  if (onSeeVault) buttons.push({ text: 'See Vault', onPress: onSeeVault });
  if (onPosterOnly) buttons.push({ text: 'Keep poster only', onPress: onPosterOnly });
  buttons.push({ text: 'Not now', style: 'cancel', onPress: onCancel });
  Alert.alert('Longer than your plan saves', OVER_LIMIT_VIDEO_MESSAGE, buttons);
}
