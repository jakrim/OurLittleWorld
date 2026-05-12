// SDK 55 split expo-file-system into a new File-class API (top-level) and the
// classic functional API (now under /legacy). We use the legacy module here
// because it round-trips well with `base64-arraybuffer` and supabase Storage's
// ArrayBuffer upload path.
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import { decode as decodeBase64 } from 'base64-arraybuffer';

import { supabase } from './supabase';

/**
 * Cloud photo pipeline.
 *
 *   uploadForTag({ familyId, assetId })   tag a photo and push thumb + full to Storage
 *   deleteForTag({ photoTag })            remove the storage objects + the tag row
 *   listSharedTagged(familyId)            paged list of family-wide tagged photos with signed URLs
 *   backfillPendingForOwner({familyId})   resume any uploads that haven't completed for this device's library
 *
 * Storage layout (private bucket "family-photos"):
 *   {family_id}/full/{uuid}.jpg
 *   {family_id}/thumb/{uuid}.jpg
 *
 * RLS lets only family members read / write under {family_id}/.
 */

const BUCKET = 'family-photos';
const FULL_MAX_DIM = 1600;
const THUMB_MAX_DIM = 640;
const FULL_QUALITY = 0.85;
const THUMB_QUALITY = 0.75;
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h

const signedUrlCache = new Map(); // key -> { url, expiresAt }

function uuid() {
  // RFC4122-ish v4. Not cryptographically perfect but fine for storage keys.
  const r = (n) => {
    const buf = [];
    for (let i = 0; i < n; i++) buf.push(((Math.random() * 16) | 0).toString(16));
    return buf.join('');
  };
  return `${r(8)}-${r(4)}-4${r(3)}-${(8 + ((Math.random() * 4) | 0)).toString(16)}${r(3)}-${r(12)}`;
}

async function readAsArrayBuffer(uri) {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return decodeBase64(base64);
}

async function resize(uri, maxDim, compress) {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxDim } }],
    { compress, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result; // { uri, width, height }
}

/**
 * Tags a photo and uploads thumb + full to Storage. Atomic from the user's
 * point of view: the tag row exists immediately (status='pending'), then
 * upload + status='ready' happen async.
 */
export async function uploadForTag({ familyId, assetId }) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error('Not signed in');
  if (!familyId) throw new Error('No family');

  const info = await MediaLibrary.getAssetInfoAsync(assetId);
  const localUri = info.localUri || info.uri;
  if (!localUri) throw new Error('Could not load local photo');

  // 1. Insert (or refresh) the tag row in pending state
  const { error: upsertErr } = await supabase.from('photo_tags').upsert(
    {
      family_id: familyId,
      asset_owner_user_id: userId,
      asset_id: assetId,
      tagged_by_user_id: userId,
      tagged_at: new Date().toISOString(),
      creation_time: info.creationTime ? new Date(info.creationTime).toISOString() : null,
      original_width: info.width || null,
      original_height: info.height || null,
      upload_status: 'uploading',
      upload_error: null,
    },
    { onConflict: 'family_id,asset_owner_user_id,asset_id' },
  );
  if (upsertErr) throw upsertErr;

  try {
    const fullId = uuid();
    const thumbId = uuid();
    const fullPath = `${familyId}/full/${fullId}.jpg`;
    const thumbPath = `${familyId}/thumb/${thumbId}.jpg`;

    // Chain: decode the (often 12MP) original once, downscale to "full"
    // size, then downscale that result to "thumb". Halves the JPEG decode
    // cost compared to running both resizes against the original.
    const full = await resize(localUri, FULL_MAX_DIM, FULL_QUALITY);
    const thumb = await resize(full.uri, THUMB_MAX_DIM, THUMB_QUALITY);

    const [fullBuf, thumbBuf] = await Promise.all([
      readAsArrayBuffer(full.uri),
      readAsArrayBuffer(thumb.uri),
    ]);

    const opts = { contentType: 'image/jpeg', upsert: true };
    const [fullRes, thumbRes] = await Promise.all([
      supabase.storage.from(BUCKET).upload(fullPath, fullBuf, opts),
      supabase.storage.from(BUCKET).upload(thumbPath, thumbBuf, opts),
    ]);
    if (fullRes.error) throw fullRes.error;
    if (thumbRes.error) throw thumbRes.error;

    const { error: doneErr } = await supabase
      .from('photo_tags')
      .update({
        storage_object: fullId,
        thumb_object: thumbId,
        original_width: full.width,
        original_height: full.height,
        upload_status: 'ready',
        upload_error: null,
      })
      .eq('family_id', familyId)
      .eq('asset_owner_user_id', userId)
      .eq('asset_id', assetId);
    if (doneErr) throw doneErr;

    return { fullId, thumbId };
  } catch (err) {
    await supabase
      .from('photo_tags')
      .update({ upload_status: 'failed', upload_error: String(err?.message || err) })
      .eq('family_id', familyId)
      .eq('asset_owner_user_id', userId)
      .eq('asset_id', assetId);
    throw err;
  }
}

export async function deleteForTag({ familyId, assetOwnerUserId, assetId }) {
  // Look up the tag to find storage objects
  const { data: row, error: selErr } = await supabase
    .from('photo_tags')
    .select('storage_object, thumb_object')
    .eq('family_id', familyId)
    .eq('asset_owner_user_id', assetOwnerUserId)
    .eq('asset_id', assetId)
    .maybeSingle();
  if (selErr) throw selErr;

  if (row?.storage_object || row?.thumb_object) {
    const paths = [];
    if (row.storage_object) paths.push(`${familyId}/full/${row.storage_object}.jpg`);
    if (row.thumb_object) paths.push(`${familyId}/thumb/${row.thumb_object}.jpg`);
    await supabase.storage.from(BUCKET).remove(paths);
    if (row.storage_object) signedUrlCache.delete(`${familyId}/full/${row.storage_object}.jpg`);
    if (row.thumb_object) signedUrlCache.delete(`${familyId}/thumb/${row.thumb_object}.jpg`);
  }

  const { error: delErr } = await supabase
    .from('photo_tags')
    .delete()
    .eq('family_id', familyId)
    .eq('asset_owner_user_id', assetOwnerUserId)
    .eq('asset_id', assetId);
  if (delErr) throw delErr;
}

/**
 * Returns the full ready-to-display family timeline (all members' tagged
 * photos), each row including pre-fetched signed URLs for thumb + full.
 *
 * Pages through Supabase in chunks because the JS client's PostgREST
 * connection caps each request at ~1000 rows. We keep paging until we run
 * dry or hit `maxRows` (defaults to 5000 — well past any single family's
 * realistic year of saved photos).
 */
export async function listSharedTagged(familyId, { limit = 5000, pageSize = 1000 } = {}) {
  if (!familyId) return [];

  const all = [];
  let from = 0;
  while (all.length < limit) {
    const to = Math.min(from + pageSize - 1, limit - 1);
    const { data, error } = await supabase
      .from('photo_tags')
      .select(
        'family_id, asset_owner_user_id, asset_id, tagged_by_user_id, tagged_at, creation_time, storage_object, thumb_object, original_width, original_height, upload_status',
      )
      .eq('family_id', familyId)
      .eq('upload_status', 'ready')
      .order('creation_time', { ascending: false, nullsFirst: false })
      .range(from, to);
    if (error) {
      console.warn('listSharedTagged', error.message);
      break;
    }
    const batch = data || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  if (!all.length) return [];

  // Batch-sign every URL — Storage caps each `createSignedUrls` call too,
  // so chunk those as well.
  const SIGN_CHUNK = 200;
  const fullPathArr = all.filter((r) => r.storage_object).map((r) => `${familyId}/full/${r.storage_object}.jpg`);
  const thumbPathArr = all.filter((r) => r.thumb_object).map((r) => `${familyId}/thumb/${r.thumb_object}.jpg`);

  const fullByPath = new Map();
  const thumbByPath = new Map();
  await Promise.all([
    signInChunks(fullPathArr, SIGN_CHUNK, fullByPath),
    signInChunks(thumbPathArr, SIGN_CHUNK, thumbByPath),
  ]);

  return all.map((r) => ({
    ...r,
    fullUrl: r.storage_object ? fullByPath.get(`${familyId}/full/${r.storage_object}.jpg`) : null,
    thumbUrl: r.thumb_object ? thumbByPath.get(`${familyId}/thumb/${r.thumb_object}.jpg`) : null,
  }));
}

/**
 * Returns the set of asset IDs already saved in Supabase for the given
 * (family, owner). Used by the scanner to skip photos that are already
 * in the timeline so re-scans only do work on new content.
 */
export async function listSavedAssetIds({ familyId, ownerUserId }) {
  if (!familyId || !ownerUserId) return new Set();
  const out = new Set();
  let from = 0;
  const chunk = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('photo_tags')
      .select('asset_id')
      .eq('family_id', familyId)
      .eq('asset_owner_user_id', ownerUserId)
      .in('upload_status', ['ready', 'uploading'])
      .range(from, from + chunk - 1);
    if (error) {
      console.warn('listSavedAssetIds', error.message);
      break;
    }
    const rows = data || [];
    for (const r of rows) if (r.asset_id) out.add(r.asset_id);
    if (rows.length < chunk) break;
    from += chunk;
  }
  return out;
}

async function signInChunks(paths, chunkSize, into) {
  for (let i = 0; i < paths.length; i += chunkSize) {
    const slice = paths.slice(i, i + chunkSize);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(slice, SIGNED_URL_TTL_SECONDS);
    if (error) {
      console.warn('createSignedUrls', error.message);
      continue;
    }
    for (const item of data || []) into.set(item.path, item.signedUrl);
  }
}

/**
 * Re-uploads any photo_tags rows owned by the current user on this device
 * whose status is 'pending' or 'failed'. Useful after a network glitch or
 * when a partner tags via the partner-only flow we may add later.
 */
export async function backfillPendingForOwner({ familyId }) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId || !familyId) return { uploaded: 0, skipped: 0 };

  const { data: rows, error } = await supabase
    .from('photo_tags')
    .select('asset_id')
    .eq('family_id', familyId)
    .eq('asset_owner_user_id', userId)
    .in('upload_status', ['pending', 'failed', 'uploading']);
  if (error) {
    console.warn('backfillPendingForOwner', error.message);
    return { uploaded: 0, skipped: 0 };
  }

  let uploaded = 0;
  let skipped = 0;
  for (const r of rows || []) {
    try {
      await uploadForTag({ familyId, assetId: r.asset_id });
      uploaded += 1;
    } catch (err) {
      console.warn('backfill skipped', r.asset_id, err.message);
      skipped += 1;
    }
  }
  return { uploaded, skipped };
}
