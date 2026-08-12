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

function hasMissingPaletteColumn(error) {
  return String(error?.message || '').toLowerCase().includes('palette_preference');
}

function hasMissingCreateFamilyRpc(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 'PGRST202' || message.includes('create_family');
}

function hasMissingCompleteInitialFamilyProfileRpc(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 'PGRST202' || message.includes('complete_initial_family_profile');
}

function hasMissingUpdateMyMembershipRpc(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 'PGRST202' || message.includes('update_my_family_membership');
}

function hasMissingUpdateMemberRoleRpc(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 'PGRST202' || message.includes('update_family_member_role');
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const r = (n) => {
    const buf = [];
    for (let i = 0; i < n; i += 1) buf.push(((Math.random() * 16) | 0).toString(16));
    return buf.join('');
  };
  return `${r(8)}-${r(4)}-4${r(3)}-${(8 + ((Math.random() * 4) | 0)).toString(16)}${r(3)}-${r(12)}`;
}

function familyMemberSelect({ relationship = true, palette = true } = {}) {
  const memberColumns = [
    'display_name',
    relationship ? 'relationship_label' : null,
    'role',
    'joined_at',
  ].filter(Boolean);
  const familyColumns = [
    'id',
    'name',
    'baby_name',
    'baby_birthday',
    palette ? 'palette_preference' : null,
    'created_by',
    'created_at',
  ].filter(Boolean);

  return `${memberColumns.join(', ')}, family:family_id (${familyColumns.join(', ')})`;
}

export const RELATIONSHIP_PRESETS = [
  { value: 'husband', label: 'Husband' },
  { value: 'wife', label: 'Wife' },
  { value: 'partner', label: 'Partner' },
  { value: 'mom', label: 'Mom' },
  { value: 'dad', label: 'Dad' },
  { value: 'custom', label: 'Custom' },
];

const WRITER_ROLES = new Set(['creator', 'partner']);
const TWO_PARENT_LIMIT_MESSAGE = 'This family already has two co-parents. Make someone view-only before adding another co-parent.';
let supportsRelationshipLabel = true;
let supportsPalettePreference = true;

function isWriterRole(role) {
  return WRITER_ROLES.has(role);
}

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

    const variants = [
      { relationship: supportsRelationshipLabel, palette: supportsPalettePreference },
      { relationship: supportsRelationshipLabel, palette: false },
      { relationship: false, palette: supportsPalettePreference },
      { relationship: false, palette: false },
    ];

    let data = null;
    let error = null;
    const tried = new Set();
    for (const variant of variants) {
      const key = `${variant.relationship}:${variant.palette}`;
      if (tried.has(key)) continue;
      tried.add(key);

      const result = await supabase
        .from('family_members')
        .select(familyMemberSelect(variant))
        .eq('user_id', userId)
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      data = result.data;
      error = result.error;
      if (!error) break;
      if (hasMissingRelationshipColumn(error)) supportsRelationshipLabel = false;
      if (hasMissingPaletteColumn(error)) supportsPalettePreference = false;
      if (!hasMissingRelationshipColumn(error) && !hasMissingPaletteColumn(error)) break;
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
      palettePreference: data.family.palette_preference || null,
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

    const rpcResult = await supabase.rpc('create_family', {
      p_family_name: name?.trim() || null,
      p_baby_name: babyName?.trim() || null,
      p_baby_birthday: babyBirthday || null,
      p_member_display_name: displayName?.trim() || null,
      p_member_relationship_label: normalizeRelationshipLabel(relationshipLabel),
    });
    if (!rpcResult.error) return rpcResult.data;
    if (!hasMissingCreateFamilyRpc(rpcResult.error)) throw rpcResult.error;

    const familyId = uuid();
    const { error: famErr } = await supabase
      .from('families')
      .insert({
        id: familyId,
        name: name?.trim() || 'Our Little World',
        baby_name: babyName?.trim() || null,
        baby_birthday: babyBirthday || null,
        created_by: userId,
      });
    if (famErr) throw famErr;

    const memberPayload = {
      family_id: familyId,
      user_id: userId,
      display_name: displayName?.trim() || null,
      relationship_label: normalizeRelationshipLabel(relationshipLabel),
      role: 'creator',
    };
    let { error: memErr } = await supabase.from('family_members').insert(memberPayload);
    if (memErr && hasMissingRelationshipColumn(memErr)) {
      supportsRelationshipLabel = false;
      const fallbackPayload = { ...memberPayload };
      delete fallbackPayload.relationship_label;
      const fallback = await supabase.from('family_members').insert(fallbackPayload);
      memErr = fallback.error;
    }
    if (memErr) throw memErr;

    return familyId;
  },

  /** Update baby info (name, birthday, family name). */
  async update(familyId, patch) {
    const payload = {};
    if (patch.name !== undefined) payload.name = patch.name?.trim() || null;
    if (patch.babyName !== undefined) payload.baby_name = patch.babyName?.trim() || null;
    if (patch.palettePreference !== undefined) payload.palette_preference = patch.palettePreference || null;
    if (patch.babyBirthday !== undefined) {
      const trimmed = patch.babyBirthday == null ? '' : String(patch.babyBirthday).trim();
      if (!trimmed) throw new Error('Birth date is required');
      payload.baby_birthday = trimmed;
    }
    if (Object.keys(payload).length === 0) return;

    let { error } = await supabase
      .from('families')
      .update(payload)
      .eq('id', familyId);
    if (error && hasMissingPaletteColumn(error) && patch.palettePreference !== undefined) {
      supportsPalettePreference = false;
      delete payload.palette_preference;
      if (Object.keys(payload).length === 0) return;
      const fallback = await supabase
        .from('families')
        .update(payload)
        .eq('id', familyId);
      error = fallback.error;
    }
    if (error) throw error;
  },

  /**
   * Complete the child profile before the family has an entitlement.
   *
   * This deliberately uses a narrow server contract rather than relaxing the
   * normal family update policy. The RPC is creator-only, write-once, and
   * idempotent for an exact replay; established profiles still require the
   * ordinary entitled update path above.
   */
  async completeInitialProfile(familyId, { babyName, babyBirthday }) {
    if (!familyId) throw new Error('No family');
    const normalizedName = babyName?.trim() || '';
    const normalizedBirthday = babyBirthday == null ? '' : String(babyBirthday).trim();
    if (!normalizedName) throw new Error('Child name is required');
    if (!normalizedBirthday) throw new Error('Birth date is required');

    const { error } = await supabase.rpc('complete_initial_family_profile', {
      target_family_id: familyId,
      target_baby_name: normalizedName,
      target_baby_birthday: normalizedBirthday,
    });
    if (!error) return;
    if (hasMissingCompleteInitialFamilyProfileRpc(error)) {
      throw new Error('Family setup is temporarily unavailable. Please try again later.');
    }
    throw error;
  },

  async updateMyMembership(familyId, patch) {
    const userId = await currentUserId();
    if (!userId) throw new Error('Not signed in');
    if (!familyId) throw new Error('No family');
    const payload = {};
    if (patch.displayName !== undefined) payload.display_name = patch.displayName?.trim() || null;
    if (patch.relationshipLabel !== undefined) payload.relationship_label = normalizeRelationshipLabel(patch.relationshipLabel);
    if (Object.keys(payload).length === 0) return;

    const rpcResult = await supabase.rpc('update_my_family_membership', {
      target_family_id: familyId,
      membership_patch: payload,
    });
    if (!rpcResult.error) return;
    if (!hasMissingUpdateMyMembershipRpc(rpcResult.error)) throw rpcResult.error;

    let { error } = await supabase
      .from('family_members')
      .update(payload)
      .eq('family_id', familyId)
      .eq('user_id', userId);
    if (error && hasMissingRelationshipColumn(error)) {
      supportsRelationshipLabel = false;
      delete payload.relationship_label;
      if (Object.keys(payload).length === 0) return;
      const fallback = await supabase
        .from('family_members')
        .update(payload)
        .eq('family_id', familyId)
        .eq('user_id', userId);
      error = fallback.error;
    }
    if (error) throw error;
  },

  async updateMemberRole(familyId, userId, role) {
    if (!familyId) throw new Error('No family');
    if (!userId) throw new Error('No member');
    const nextRole = role === 'circle' ? 'circle' : 'partner';
    if (nextRole === 'partner') {
      const { data: rows, error: countErr } = await supabase
        .from('family_members')
        .select('user_id, role')
        .eq('family_id', familyId);
      if (countErr) throw countErr;
      const current = (rows || []).find((row) => row.user_id === userId);
      const otherWriters = (rows || []).filter((row) => row.user_id !== userId && isWriterRole(row.role)).length;
      if (!isWriterRole(current?.role) && otherWriters >= 2) {
        throw new Error(TWO_PARENT_LIMIT_MESSAGE);
      }
    }
    const rpcResult = await supabase.rpc('update_family_member_role', {
      target_family_id: familyId,
      target_user_id: userId,
      target_role: nextRole,
    });
    if (!rpcResult.error) return;
    if (!hasMissingUpdateMemberRoleRpc(rpcResult.error)) throw rpcResult.error;

    const { error } = await supabase
      .from('family_members')
      .update({ role: nextRole })
      .eq('family_id', familyId)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async removeCircleMember(familyId, userId) {
    if (!familyId) throw new Error('No family');
    if (!userId) throw new Error('No member');
    const { error } = await supabase
      .from('family_members')
      .delete()
      .eq('family_id', familyId)
      .eq('user_id', userId)
      .eq('role', 'circle');
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
      supportsRelationshipLabel = false;
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
  async create(familyId, { role = 'partner' } = {}) {
    const userId = await currentUserId();
    if (!userId) throw new Error('Not signed in');
    const inviteRole = role === 'circle' ? 'circle' : 'partner';
    if (inviteRole === 'partner') {
      const { data: rows, error: membersErr } = await supabase
        .from('family_members')
        .select('role')
        .eq('family_id', familyId);
      if (membersErr) throw membersErr;
      if ((rows || []).filter((row) => isWriterRole(row.role)).length >= 2) {
        throw new Error(TWO_PARENT_LIMIT_MESSAGE);
      }
    }

    const { data: codeRow, error: codeErr } = await supabase.rpc('generate_invite_code');
    if (codeErr) throw codeErr;

    let { data, error } = await supabase
      .from('family_invites')
      .insert({
        family_id: familyId,
        code: codeRow,
        created_by: userId,
        role: inviteRole,
      })
      .select()
      .single();
    if (error && inviteRole === 'partner' && String(error?.message || '').toLowerCase().includes('role')) {
      const fallback = await supabase
        .from('family_invites')
        .insert({
          family_id: familyId,
          code: codeRow,
          created_by: userId,
        })
        .select()
        .single();
      data = fallback.data;
      error = fallback.error;
    }
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
