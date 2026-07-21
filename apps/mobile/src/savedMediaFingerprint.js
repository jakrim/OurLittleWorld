import { File } from 'expo-file-system';

import { supabase } from './supabase';
export { savedFingerprintTelemetry } from './savedMediaFingerprintModel';

export const SAVED_MEDIA_FINGERPRINT_ALGORITHM = 'content-md5-v1';

export async function registerReadySavedFileFingerprint({ familyId, momentId, mediaId, fileUri }) {
  if (!familyId || !momentId || !mediaId || !fileUri) return null;
  let digest = null;
  try {
    digest = new File(fileUri).md5;
  } catch {
    return null;
  }
  if (!/^[a-f0-9]{32}$/.test(String(digest || ''))) return null;
  const { data, error } = await supabase.rpc('register_saved_media_fingerprint', {
    target_family_id: familyId,
    target_moment_id: momentId,
    target_moment_media_id: mediaId,
    target_algorithm: SAVED_MEDIA_FINGERPRINT_ALGORITHM,
    target_digest: digest,
  });
  if (error) throw error;
  return data;
}
