import { supabase } from './supabase';
import { isoDateForLocalDay, promptForDate } from './dailyPrompts';

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id;
}

function compactPatch(input, map) {
  const out = {};
  Object.entries(map).forEach(([from, to]) => {
    if (input[from] !== undefined) out[to] = input[from];
  });
  return out;
}

function hasMissingLetterAudienceColumn(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('audience') || message.includes('starter_key');
}

export function addYearsToIsoDate(isoDate, years) {
  if (!isoDate) return isoDateForLocalDay(new Date(Date.now() + years * 365.25 * 24 * 60 * 60 * 1000));
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year + years, month - 1, day);
  return isoDateForLocalDay(date);
}

export function weekRangeFor(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    weekStart: isoDateForLocalDay(start),
    weekEnd: isoDateForLocalDay(end),
    startMs: start.getTime(),
    endMs: end.getTime() + 24 * 60 * 60 * 1000 - 1,
  };
}

export const DailyPrompts = {
  async getToday({ familyId }) {
    const userId = await currentUserId();
    if (!familyId || !userId) return { prompt: promptForDate({ familyId }), responses: [], mine: null };
    const promptDate = isoDateForLocalDay();
    const prompt = promptForDate({ familyId, date: promptDate });
    const { data, error } = await supabase
      .from('daily_prompt_responses')
      .select('id, author_user_id, response_text, snoozed_until, created_at, updated_at')
      .eq('family_id', familyId)
      .eq('prompt_date', promptDate)
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('DailyPrompts.getToday', error.message);
      return { prompt, responses: [], mine: null, promptDate };
    }
    const responses = data || [];
    return {
      prompt,
      promptDate,
      responses,
      mine: responses.find((row) => row.author_user_id === userId) || null,
    };
  },

  async saveResponse({ familyId, responseText }) {
    const userId = await currentUserId();
    if (!userId) throw new Error('Not signed in');
    if (!familyId) throw new Error('No family');
    const promptDate = isoDateForLocalDay();
    const prompt = promptForDate({ familyId, date: promptDate });
    const { data, error } = await supabase
      .from('daily_prompt_responses')
      .upsert({
        family_id: familyId,
        prompt_date: promptDate,
        prompt_key: prompt.key,
        prompt_text: prompt.text,
        author_user_id: userId,
        response_text: responseText?.trim() || null,
        snoozed_until: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'family_id,prompt_date,author_user_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async snoozeToday({ familyId }) {
    const userId = await currentUserId();
    if (!userId) throw new Error('Not signed in');
    if (!familyId) throw new Error('No family');
    const promptDate = isoDateForLocalDay();
    const prompt = promptForDate({ familyId, date: promptDate });
    const until = new Date();
    until.setHours(23, 59, 59, 999);
    const { data, error } = await supabase
      .from('daily_prompt_responses')
      .upsert({
        family_id: familyId,
        prompt_date: promptDate,
        prompt_key: prompt.key,
        prompt_text: prompt.text,
        author_user_id: userId,
        response_text: null,
        snoozed_until: until.toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'family_id,prompt_date,author_user_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

export const Firsts = {
  async list(familyId) {
    if (!familyId) return [];
    const { data, error } = await supabase
      .from('firsts')
      .select('*')
      .eq('family_id', familyId)
      .order('happened_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Firsts.list', error.message);
      return [];
    }
    return data || [];
  },

  async get(familyId, id) {
    if (!familyId || !id) return null;
    const { data, error } = await supabase
      .from('firsts')
      .select('*')
      .eq('family_id', familyId)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.warn('Firsts.get', error.message);
      return null;
    }
    return data || null;
  },

  async create({ familyId, title, note, happenedAt, assetOwnerUserId, assetId }) {
    const userId = await currentUserId();
    if (!userId) throw new Error('Not signed in');
    if (!familyId) throw new Error('No family');
    const { data, error } = await supabase
      .from('firsts')
      .insert({
        family_id: familyId,
        created_by_user_id: userId,
        title: title?.trim(),
        note: note?.trim() || null,
        happened_at: happenedAt || null,
        asset_owner_user_id: assetOwnerUserId || null,
        asset_id: assetId || null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, patch) {
    const payload = compactPatch(patch, {
      title: 'title',
      note: 'note',
      happenedAt: 'happened_at',
      assetOwnerUserId: 'asset_owner_user_id',
      assetId: 'asset_id',
    });
    payload.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('firsts')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from('firsts').delete().eq('id', id);
    if (error) throw error;
  },
};

export const Letters = {
  async list(familyId, { audience } = {}) {
    if (!familyId) return [];
    let query = supabase
      .from('letters')
      .select('*')
      .eq('family_id', familyId);
    if (audience) query = query.eq('audience', audience);
    query = audience === 'spouse'
      ? query.order('created_at', { ascending: false })
      : query.order('open_on', { ascending: true }).order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) {
      console.warn('Letters.list', error.message);
      return [];
    }
    return data || [];
  },

  async get(familyId, id) {
    if (!familyId || !id) return null;
    const { data, error } = await supabase
      .from('letters')
      .select('*')
      .eq('family_id', familyId)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.warn('Letters.get', error.message);
      return null;
    }
    return data || null;
  },

  async create({ familyId, title, body, openOn, audience = 'child', starterKey }) {
    const userId = await currentUserId();
    if (!userId) throw new Error('Not signed in');
    if (!familyId) throw new Error('No family');
    const normalizedAudience = audience === 'spouse' ? 'spouse' : 'child';
    const payload = {
      family_id: familyId,
      author_user_id: userId,
      title: title?.trim() || null,
      body: body?.trim(),
      open_on: normalizedAudience === 'spouse' ? isoDateForLocalDay() : openOn,
      audience: normalizedAudience,
      starter_key: starterKey || null,
    };
    let { data, error } = await supabase
      .from('letters')
      .insert(payload)
      .select()
      .single();
    if (error && normalizedAudience === 'child' && hasMissingLetterAudienceColumn(error)) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.audience;
      delete fallbackPayload.starter_key;
      const fallback = await supabase
        .from('letters')
        .insert(fallbackPayload)
        .select()
        .single();
      data = fallback.data;
      error = fallback.error;
    }
    if (error) throw error;
    return data;
  },

  async open(id) {
    const { data, error } = await supabase
      .from('letters')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteOwn(id) {
    const { error } = await supabase.from('letters').delete().eq('id', id);
    if (error) throw error;
  },
};

export const WeeklyDigests = {
  async getLatest(familyId) {
    if (!familyId) return null;
    const { data, error } = await supabase
      .from('weekly_digests')
      .select('*')
      .eq('family_id', familyId)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn('WeeklyDigests.getLatest', error.message);
      return null;
    }
    return data ? normalizeDigestRow(data) : null;
  },

  async ensureForCurrentWeek({ familyId, photos = [], memories = [], firsts = [], letters = [] } = {}) {
    if (!familyId) return this.build({ photos, memories, firsts, letters });
    const digest = this.build({ photos, memories, firsts, letters });
    const cover = digest.coverPhoto;
    const payload = {
      family_id: familyId,
      week_start: digest.weekStart,
      week_end: digest.weekEnd,
      headline: digest.headline,
      photo_count: digest.photoCount,
      memory_count: digest.memoryCount,
      firsts_count: digest.firstsCount,
      letter_count: digest.letterCount,
      cover_asset_owner_user_id: cover?.asset_owner_user_id || null,
      cover_asset_id: cover?.asset_id || null,
      generated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('weekly_digests')
      .upsert(payload, { onConflict: 'family_id,week_start' })
      .select()
      .single();
    if (error) {
      console.warn('WeeklyDigests.ensureForCurrentWeek', error.message);
      return digest;
    }
    return {
      ...normalizeDigestRow(data),
      coverPhoto: cover || null,
    };
  },

  build({ photos = [], memories = [], firsts = [], letters = [] } = {}) {
    const range = weekRangeFor();
    const inRange = (value) => {
      if (!value) return false;
      const ms = new Date(value).getTime();
      return ms >= range.startMs && ms <= range.endMs;
    };
    const weekPhotos = photos.filter((photo) => inRange(photo.creation_time));
    const weekMemories = memories.filter((memory) => inRange(memory.created_at));
    const weekFirsts = firsts.filter((first) => inRange(first.happened_at || first.created_at));
    const weekLetters = letters.filter((letter) => inRange(letter.created_at));
    const counts = {
      photoCount: weekPhotos.length,
      memoryCount: weekMemories.length,
      firstsCount: weekFirsts.length,
      letterCount: weekLetters.length,
    };
    const headline = counts.firstsCount
      ? 'A week with a first worth saving.'
      : counts.photoCount
        ? 'A week of small arrivals.'
        : counts.letterCount
          ? 'A week with words saved for later.'
          : 'A quiet week, still worth keeping.';
    const coverPhoto = pickDigestCoverPhoto({ weekPhotos, memories });
    return {
      ...range,
      ...counts,
      headline,
      coverPhoto,
    };
  },
};

function normalizeDigestRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    headline: row.headline,
    photoCount: row.photo_count || 0,
    memoryCount: row.memory_count || 0,
    firstsCount: row.firsts_count || 0,
    letterCount: row.letter_count || 0,
    coverAssetOwnerUserId: row.cover_asset_owner_user_id || null,
    coverAssetId: row.cover_asset_id || null,
    generatedAt: row.generated_at || null,
    coverPhoto: null,
  };
}

function pickDigestCoverPhoto({ weekPhotos, memories }) {
  if (!weekPhotos.length) return null;
  const memoryKeys = new Set(
    (memories || []).map((memory) => `${memory.asset_owner_user_id}:${memory.asset_id}`),
  );
  return weekPhotos.find((photo) => memoryKeys.has(`${photo.asset_owner_user_id}:${photo.asset_id}`))
    || weekPhotos[0];
}
