import { supabase } from './supabase';
import { uploadForTag, deleteForTag } from './photoSync';

/**
 * Family-scoped storage for Tags + Memories. Both are now keyed by
 * (family_id, asset_owner_user_id, asset_id) so any member can see what
 * any other member tagged or wrote about a given photo.
 *
 * Until cloud photo upload lands (next milestone), `asset_id` is still a
 * device-local identifier from expo-media-library. We store the
 * `asset_owner_user_id` so partner devices know whose library a tag came
 * from, even though they can't render the image yet.
 */

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id;
}

export const Tags = {
  /**
   * Returns a map keyed by `${ownerUserId}:${assetId}` for all tagged photos
   * in the family. Use the helper `Tags.key(asset, ownerUserId)` to look up.
   */
  async all(familyId) {
    if (!familyId) return {};
    const { data, error } = await supabase
      .from('photo_tags')
      .select('asset_owner_user_id, asset_id, tagged_by_user_id, tagged_at')
      .eq('family_id', familyId);
    if (error) {
      console.warn('Tags.all', error.message);
      return {};
    }
    const out = {};
    (data || []).forEach((row) => {
      const k = `${row.asset_owner_user_id}:${row.asset_id}`;
      out[k] = {
        isBaby: true,
        ownerUserId: row.asset_owner_user_id,
        taggedBy: row.tagged_by_user_id,
        tagged_at: row.tagged_at,
      };
    });
    return out;
  },

  key(assetId, ownerUserId) {
    return `${ownerUserId}:${assetId}`;
  },

  async savedTarget({ familyId, assetId, ownerUserId = null }) {
    const userId = ownerUserId || await currentUserId();
    if (!familyId || !assetId || !userId) return null;
    const { data, error } = await supabase
      .from('photo_tags')
      .select('moment_id, moment_media_id, upload_status')
      .eq('family_id', familyId)
      .eq('asset_owner_user_id', userId)
      .eq('asset_id', assetId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  },

  /**
   * Tag or untag a photo as the baby. Tagging also resizes + uploads
   * thumbnail and full-res to Supabase Storage so partner devices can
   * render the photo even though the local asset_id is meaningless on
   * their library. Awaiting this resolves once the upload (or deletion)
   * is complete; callers may opt to render an optimistic UI in parallel.
   */
  async setBaby({ familyId, assetId, isBaby, match = null, videoPosterOnly = false, source = null }) {
    const userId = await currentUserId();
    if (!userId) throw new Error('Not signed in');
    if (!familyId) throw new Error('No family');
    if (!assetId) throw new Error('Missing asset id');

    if (isBaby) {
      await uploadForTag({ familyId, assetId, match, videoPosterOnly, source });
    } else {
      await deleteForTag({ familyId, assetOwnerUserId: userId, assetId });
    }
    return Tags.all(familyId);
  },
};

export const Memories = {
  /** All memory notes in this family — UI usually wants per-photo. */
  async forFamily(familyId) {
    if (!familyId) return [];
    const { data, error } = await supabase
      .from('memories')
      .select('id, asset_owner_user_id, asset_id, author_user_id, note, created_at, updated_at')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Memories.forFamily', error.message);
      return [];
    }
    return data || [];
  },

  /** All memories on a single photo (multiple if both parents wrote one). */
  async forAsset({ familyId, assetId, ownerUserId }) {
    if (!familyId || !assetId || !ownerUserId) return [];
    const { data, error } = await supabase
      .from('memories')
      .select('id, author_user_id, note, created_at, updated_at')
      .eq('family_id', familyId)
      .eq('asset_owner_user_id', ownerUserId)
      .eq('asset_id', assetId)
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('Memories.forAsset', error.message);
      return [];
    }
    return data || [];
  },

  /**
   * Saves the current user's memory note on a photo. Empty string deletes
   * their note; non-empty inserts or updates. Each user has at most one
   * note per photo via a partial unique index — easier to keep
   * application-side though, so we look up + upsert by id.
   */
  async setMine({ familyId, assetId, ownerUserId, note }) {
    const userId = await currentUserId();
    if (!userId) throw new Error('Not signed in');
    if (!familyId) throw new Error('No family');

    const trimmed = note?.trim() || '';

    const { data: existing, error: selErr } = await supabase
      .from('memories')
      .select('id')
      .eq('family_id', familyId)
      .eq('asset_owner_user_id', ownerUserId)
      .eq('asset_id', assetId)
      .eq('author_user_id', userId)
      .maybeSingle();
    if (selErr) throw selErr;

    if (!trimmed) {
      if (existing) {
        const { error } = await supabase.from('memories').delete().eq('id', existing.id);
        if (error) throw error;
      }
      return null;
    }

    if (existing) {
      const { error } = await supabase
        .from('memories')
        .update({ note: trimmed, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) throw error;
      return { id: existing.id, note: trimmed };
    }

    const { data, error } = await supabase
      .from('memories')
      .insert({
        family_id: familyId,
        asset_owner_user_id: ownerUserId,
        asset_id: assetId,
        author_user_id: userId,
        note: trimmed,
      })
      .select('id, note, created_at')
      .single();
    if (error) throw error;
    return data;
  },
};
