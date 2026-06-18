import { supabase } from './supabase';

/**
 * Family / couple data layer for Our Little World. A "family" is the
 * unit of sharing — both parents (and eventually grandparents, etc.)
 * read and write the same baby profile, photo tags, and memories.
 *
 * Tables (see latest migration; mirrored in src/schema.sql):
 *   families         (id, name, baby_name, baby_birthday, created_by)
 *   family_members   (family_id, user_id, display_name, relationship_label, role)
 *   family_invites   (id, family_id, code, expires_at, used_by)
 *   photo_tags       (family_id, asset_owner_user_id, asset_id, tagged_by)
 *   memories         (id, family_id, asset_owner_user_id, asset_id, author_user_id, note)
 *
 * RPCs:
 *   redeem_family_invite(code text, member_display_name text, member_relationship_label text) -> family_id
 *   generate_invite_code() -> text
 */

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id;
}

function hasMissingRelationshipColumn(error) {
  return String(error?.message || '').toLowerCase().includes('relationship_label');
}

export const RELATIONSHIP_PRESETS = [
  { value: 'husband', label: 'Husband' },
  { value: 'wife', label: 'Wife' },
  { value: 'partner', label: 'Partner' },
  { value: 'mom', label: 'Mom' },
  { value: 'dad', label: 'Dad' },
  { value: 'custom', label: 'Custom' },
];

export function normalizeRelationshipLabel(value) {
  return String(value || '').trim() || null;
}

export function relationshipTitle(value) {
  const normalized = normalizeRelationshipLabel(value);
  if (!normalized) return 'Partner';
  return RELATIONSHIP_PRESETS.find((item) => item.value === normalized)?.label || normalized;
}

export const Family = {
  /**
   * Returns the user's primary family + their membership row, or null if the
   * user hasn't joined or created one yet. The first family by joined_at wins
   * (we don't yet support multiple families per user — that's a future toggle).
   */
  async current() {
    const userId = await currentUserId();
    if (!userId) return null;

    let { data, error } = await supabase
      .from('family_members')
      .select('display_name, relationship_label, role, joined_at, family:family_id (id, name, baby_name, baby_birthday, created_by, created_at)')
      .eq('user_id', userId)
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error && hasMissingRelationshipColumn(error)) {
      const fallback = await supabase
        .from('family_members')
        .select('display_name, role, joined_at, family:family_id (id, name, baby_name, baby_birthday, created_by, created_at)')
        .eq('user_id', userId)
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.warn('Family.current', error.message);
      return null;
    }
    if (!data?.family) return null;

    return {
      id: data.family.id,
      name: data.family.name,
      babyName: data.family.baby_name || '',
      babyBirthday: data.family.baby_birthday || '',
      createdBy: data.family.created_by,
      createdAt: data.family.created_at,
      me: {
        userId,
        displayName: data.display_name,
        relationshipLabel: data.relationship_label,
        role: data.role,
        joinedAt: data.joined_at,
      },
    };
  },

  async create({ name, babyName, babyBirthday, displayName, relationshipLabel }) {
    const userId = await currentUserId();
    if (!userId) throw new Error('Not signed in');

    const { data: family, error: famErr } = await supabase
      .from('families')
      .insert({
        name: name?.trim() || 'Our Little World',
        baby_name: babyName?.trim() || null,
        baby_birthday: babyBirthday || null,
        created_by: userId,
      })
      .select()
      .single();
    if (famErr) throw famErr;

    const memberPayload = {
      family_id: family.id,
      user_id: userId,
      display_name: displayName?.trim() || null,
      relationship_label: normalizeRelationshipLabel(relationshipLabel),
      role: 'creator',
    };
    let { error: memErr } = await supabase.from('family_members').insert(memberPayload);
    if (memErr && hasMissingRelationshipColumn(memErr)) {
      const fallbackPayload = { ...memberPayload };
      delete fallbackPayload.relationship_label;
      const fallback = await supabase.from('family_members').insert(fallbackPayload);
      memErr = fallback.error;
    }
    if (memErr) throw memErr;

    return family.id;
  },

  /** Update baby info (name, birthday, family name). */
  async update(familyId, patch) {
    const payload = {};
    if (patch.name !== undefined) payload.name = patch.name?.trim() || null;
    if (patch.babyName !== undefined) payload.baby_name = patch.babyName?.trim() || null;
    if (patch.babyBirthday !== undefined) {
      const trimmed = patch.babyBirthday == null ? '' : String(patch.babyBirthday).trim();
      if (!trimmed) throw new Error('Birth date is required');
      payload.baby_birthday = trimmed;
    }
    if (Object.keys(payload).length === 0) return;

    const { error } = await supabase
      .from('families')
      .update(payload)
      .eq('id', familyId);
    if (error) throw error;
  },

  async updateMyMembership(familyId, patch) {
    const userId = await currentUserId();
    if (!userId) throw new Error('Not signed in');
    if (!familyId) throw new Error('No family');
    const payload = {};
    if (patch.displayName !== undefined) payload.display_name = patch.displayName?.trim() || null;
    if (patch.relationshipLabel !== undefined) payload.relationship_label = normalizeRelationshipLabel(patch.relationshipLabel);
    if (Object.keys(payload).length === 0) return;

    const { error } = await supabase
      .from('family_members')
      .update(payload)
      .eq('family_id', familyId)
      .eq('user_id', userId);
    if (error && hasMissingRelationshipColumn(error)) return;
    if (error) throw error;
  },

  /** All members in the given family, including display names + roles. */
  async members(familyId) {
    let { data, error } = await supabase
      .from('family_members')
      .select('user_id, display_name, relationship_label, role, joined_at')
      .eq('family_id', familyId)
      .order('joined_at', { ascending: true });
    if (error && hasMissingRelationshipColumn(error)) {
      const fallback = await supabase
        .from('family_members')
        .select('user_id, display_name, role, joined_at')
        .eq('family_id', familyId)
        .order('joined_at', { ascending: true });
      data = fallback.data;
      error = fallback.error;
    }
    if (error) throw error;
    return (data || []).map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      relationshipLabel: row.relationship_label,
      role: row.role,
      joinedAt: row.joined_at,
    }));
  },
};

export const Invites = {
  /**
   * Creates a one-time, 7-day code that anyone signed-in can redeem to join
   * the family. Returns the full row so callers can show the code + share it.
   */
  async create(familyId) {
    const userId = await currentUserId();
    if (!userId) throw new Error('Not signed in');

    const { data: codeRow, error: codeErr } = await supabase.rpc('generate_invite_code');
    if (codeErr) throw codeErr;

    const { data, error } = await supabase
      .from('family_invites')
      .insert({
        family_id: familyId,
        code: codeRow,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw error;

    return {
      id: data.id,
      code: data.code,
      expiresAt: data.expires_at,
      createdAt: data.created_at,
    };
  },

  /**
   * Redeems an invite code via the security-definer RPC, atomically joining
   * the family and marking the invite as used. Returns the family_id.
   */
  async redeem(code, displayName, relationshipLabel) {
    const trimmed = code?.trim().toUpperCase();
    if (!trimmed) throw new Error('Enter the invite code');
    let { data, error } = await supabase.rpc('redeem_family_invite', {
      invite_code: trimmed,
      member_display_name: displayName?.trim() || null,
      member_relationship_label: normalizeRelationshipLabel(relationshipLabel),
    });
    if (error && String(error?.message || '').includes('member_relationship_label')) {
      const fallback = await supabase.rpc('redeem_family_invite', {
        invite_code: trimmed,
        member_display_name: displayName?.trim() || null,
      });
      data = fallback.data;
      error = fallback.error;
    }
    if (error) throw error;
    return data; // family_id
  },
};
