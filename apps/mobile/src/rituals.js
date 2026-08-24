import { supabase } from './supabase';
import { isoDateForLocalDay, promptForDate } from './dailyPrompts';
import { buildBookWorthinessForMoment, sortBookHighlightCandidates } from './bookWorthinessModel';
import { MISSED_PROMPT_CATCHUP_DAYS, buildMissedPromptCandidates } from './missedPromptModel';
import { deleteLetterAttachments, getLetterAttachments } from './moments';

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

function normalizedPromptDate(promptDate = null) {
  if (!promptDate) return isoDateForLocalDay();
  const value = Array.isArray(promptDate) ? promptDate[0] : promptDate;
  const raw = String(value || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return isoDateForLocalDay(raw);
  return isoDateForLocalDay();
}

function offsetIsoDate(isoDate, days) {
  const [year, month, day] = isoDateForLocalDay(isoDate).split('-').map(Number);
  const value = new Date(year, month - 1, day);
  value.setDate(value.getDate() + days);
  return isoDateForLocalDay(value);
}

// Age windows (days) are generous starting points, tunable — mirrored in
// supabase/migrations/20260705120000_goal_definition_age_windows.sql.
export const FIRST_GOAL_DEFINITIONS = [
  {
    key: 'smile',
    title: 'First smile',
    targetAgeLabel: '6-8 weeks',
    targetAgeMinDays: 42,
    targetAgeMaxDays: 70,
    description: 'A first little social spark to save for the family story.',
    sortOrder: 10,
  },
  {
    key: 'laugh',
    title: 'First laugh',
    targetAgeLabel: '3-4 months',
    targetAgeMinDays: 90,
    targetAgeMaxDays: 135,
    description: 'The first laugh that made everyone stop and listen.',
    sortOrder: 20,
  },
  {
    key: 'roll',
    title: 'First roll',
    targetAgeLabel: '4-6 months',
    targetAgeMinDays: 120,
    targetAgeMaxDays: 195,
    description: 'A new way to move through the world.',
    sortOrder: 30,
  },
  {
    key: 'food',
    title: 'First solid food',
    targetAgeLabel: '6 months',
    targetAgeMinDays: 165,
    targetAgeMaxDays: 240,
    description: 'The first taste that became part of the archive.',
    sortOrder: 40,
  },
  {
    key: 'crawl',
    title: 'First crawl',
    targetAgeLabel: '7-10 months',
    targetAgeMinDays: 210,
    targetAgeMaxDays: 320,
    description: 'The beginning of going places on purpose.',
    sortOrder: 50,
  },
  {
    key: 'word',
    title: 'First word',
    targetAgeLabel: '9-14 months',
    targetAgeMinDays: 270,
    targetAgeMaxDays: 430,
    description: 'A sound that starts turning into their own voice.',
    sortOrder: 60,
  },
  {
    key: 'steps',
    title: 'First steps',
    targetAgeLabel: '10-18 months',
    targetAgeMinDays: 300,
    targetAgeMaxDays: 560,
    description: 'The first tiny proof of everywhere they are headed.',
    sortOrder: 70,
  },
];

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
  async listResponses(familyId, { limit = 200 } = {}) {
    if (!familyId) return [];
    const { data, error } = await supabase
      .from('daily_prompt_responses')
      .select('id, author_user_id, response_text, moment_id, prompt_date, prompt_key, prompt_text, snoozed_until, created_at, updated_at')
      .eq('family_id', familyId)
      .order('prompt_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.warn('DailyPrompts.listResponses', error.message);
      return [];
    }
    return data || [];
  },

  async getToday({ familyId, babyBirthday }) {
    return this.getForDate({ familyId, babyBirthday, promptDate: isoDateForLocalDay() });
  },

  async getForDate({ familyId, babyBirthday, promptDate }) {
    const userId = await currentUserId();
    const date = normalizedPromptDate(promptDate);
    const prompt = promptForDate({ familyId, date, babyBirthday });
    if (!familyId || !userId) return { prompt, responses: [], mine: null, promptDate: date };
    const { data, error } = await supabase
      .from('daily_prompt_responses')
      .select('id, author_user_id, response_text, moment_id, prompt_date, prompt_key, prompt_text, snoozed_until, created_at, updated_at')
      .eq('family_id', familyId)
      .eq('prompt_date', date)
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('DailyPrompts.getForDate', error.message);
      return { prompt, responses: [], mine: null, promptDate: date };
    }
    const responses = data || [];
    return {
      prompt,
      promptDate: date,
      responses,
      mine: responses.find((row) => row.author_user_id === userId) || null,
    };
  },

  async listMissed({
    familyId,
    babyBirthday,
    userId: suppliedUserId = null,
    days = MISSED_PROMPT_CATCHUP_DAYS,
    now = new Date(),
  } = {}) {
    const userId = suppliedUserId || await currentUserId();
    if (!familyId || !userId) return [];
    const today = isoDateForLocalDay(now);
    const startDate = offsetIsoDate(today, -Math.max(0, Math.floor(Number(days) || 0)));
    const { data, error } = await supabase
      .from('daily_prompt_responses')
      .select('id, author_user_id, response_text, moment_id, prompt_date, prompt_key, prompt_text, snoozed_until, created_at, updated_at')
      .eq('family_id', familyId)
      .gte('prompt_date', startDate)
      .lt('prompt_date', today)
      .order('prompt_date', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('DailyPrompts.listMissed', error.message);
      return [];
    }
    return buildMissedPromptCandidates({
      familyId,
      babyBirthday,
      responses: data || [],
      userId,
      days,
      now,
    });
  },

  async saveResponse({ familyId, responseText, momentId, babyBirthday, promptDate }) {
    const userId = await currentUserId();
    if (!userId) throw new Error('Not signed in');
    if (!familyId) throw new Error('No family');
    const date = normalizedPromptDate(promptDate);
    const prompt = promptForDate({ familyId, date, babyBirthday });
    const { data, error } = await supabase
      .from('daily_prompt_responses')
      .upsert({
        family_id: familyId,
        prompt_date: date,
        prompt_key: prompt.key,
        prompt_text: prompt.text,
        author_user_id: userId,
        response_text: responseText?.trim() || null,
        moment_id: momentId || null,
        snoozed_until: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'family_id,prompt_date,author_user_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async snoozeToday({ familyId, babyBirthday }) {
    const userId = await currentUserId();
    if (!userId) throw new Error('Not signed in');
    if (!familyId) throw new Error('No family');
    const promptDate = isoDateForLocalDay();
    const prompt = promptForDate({ familyId, date: promptDate, babyBirthday });
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
  async listGoalDefinitions() {
    const { data, error } = await supabase
      .from('goal_definitions')
      .select('key, title, description, target_age_label, target_age_min_days, target_age_max_days, sort_order')
      .eq('goal_type', 'first')
      .eq('active', true)
      .order('sort_order', { ascending: true });
    if (error) {
      console.warn('Firsts.listGoalDefinitions', error.message);
      return FIRST_GOAL_DEFINITIONS;
    }
    if (!data?.length) return FIRST_GOAL_DEFINITIONS;
    const fallbackByKey = Object.fromEntries(FIRST_GOAL_DEFINITIONS.map((goal) => [goal.key, goal]));
    return data.map((row) => ({
      key: row.key,
      title: row.title,
      description: row.description,
      targetAgeLabel: row.target_age_label,
      targetAgeMinDays: row.target_age_min_days ?? fallbackByKey[row.key]?.targetAgeMinDays ?? null,
      targetAgeMaxDays: row.target_age_max_days ?? fallbackByKey[row.key]?.targetAgeMaxDays ?? null,
      sortOrder: row.sort_order,
    }));
  },

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
    if (!data) return null;
    const attachments = await getLetterAttachments({ familyId, letterId: id }).catch((attachmentError) => {
      console.warn('Letters.get attachments', attachmentError?.message || attachmentError);
      return { media: [], voiceNotes: [] };
    });
    return { ...data, ...attachments };
  },

  async listForMoment(familyId, momentId) {
    if (!familyId || !momentId) return [];
    const { data, error } = await supabase
      .from('firsts')
      .select('*')
      .eq('family_id', familyId)
      .eq('moment_id', momentId)
      .order('happened_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Firsts.listForMoment', error.message);
      return [];
    }
    return data || [];
  },

  async create({ familyId, title, note, happenedAt, assetOwnerUserId, assetId, targetAgeLabel, momentId, goalKey, done = true }) {
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
        target_age_label: targetAgeLabel || null,
        moment_id: momentId || null,
        goal_key: goalKey || null,
        done,
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
      targetAgeLabel: 'target_age_label',
      momentId: 'moment_id',
      goalKey: 'goal_key',
      done: 'done',
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
  async list(familyId) {
    if (!familyId) return [];
    const query = supabase
      .from('letters')
      .select('*')
      .eq('family_id', familyId)
      .order('open_on', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: false });
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

  async create({ familyId, title, body, openOn, sourceMomentId, sourceFirstId }) {
    const userId = await currentUserId();
    if (!userId) throw new Error('Not signed in');
    if (!familyId) throw new Error('No family');
    const payload = {
      family_id: familyId,
      author_user_id: userId,
      title: title?.trim() || null,
      body: body?.trim() || '',
      open_on: openOn || null,
      sealed_at: openOn ? new Date().toISOString() : null,
      source_moment_id: sourceMomentId || null,
      source_first_id: sourceFirstId || null,
    };
    const { data, error } = await supabase
      .from('letters')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async listConnectedToMoment(familyId, { momentId, firstIds = [] } = {}) {
    if (!familyId || (!momentId && !firstIds.length)) return [];
    const rows = new Map();
    if (momentId) {
      const { data, error } = await supabase
        .from('letters')
        .select('*')
        .eq('family_id', familyId)
        .eq('source_moment_id', momentId)
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('Letters.listConnectedToMoment source_moment_id', error.message);
      } else {
        for (const row of data || []) rows.set(row.id, row);
      }
    }
    if (firstIds.length) {
      const { data, error } = await supabase
        .from('letters')
        .select('*')
        .eq('family_id', familyId)
        .in('source_first_id', firstIds)
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('Letters.listConnectedToMoment source_first_id', error.message);
      } else {
        for (const row of data || []) rows.set(row.id, row);
      }
    }
    return [...rows.values()].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
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

  async deleteOwn(id, familyId = null) {
    if (familyId) {
      await deleteLetterAttachments({ familyId, letterId: id }).catch((error) => {
        console.warn('Letters.deleteOwn attachment cleanup', error?.message || error);
      });
    }
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

  async getForMomentDate(familyId, capturedAt) {
    if (!familyId || !capturedAt) return null;
    const date = new Date(capturedAt);
    if (Number.isNaN(date.getTime())) return null;
    const day = isoDateForLocalDay(date);
    const { data, error } = await supabase
      .from('weekly_digests')
      .select('*')
      .eq('family_id', familyId)
      .lte('week_start', day)
      .gte('week_end', day)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn('WeeklyDigests.getForMomentDate', error.message);
      return null;
    }
    return data ? normalizeDigestRow(data) : null;
  },

  async ensureForCurrentWeek({ familyId, photos = [], memories = [], firsts = [], letters = [], moments = [] } = {}) {
    if (!familyId) return this.build({ photos, memories, firsts, letters, moments });
    const digest = this.build({ photos, memories, firsts, letters, moments });
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
      representative_media: digest.representativeMedia,
      moment_count: digest.momentCount,
      milestone_count: digest.milestoneCount,
      voice_note_count: digest.voiceNoteCount,
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
      representativeMedia: digest.representativeMedia,
    };
  },

  build({ photos = [], memories = [], firsts = [], letters = [], moments = [] } = {}) {
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
    const weekMoments = moments.filter((moment) => inRange(moment.captured_at || moment.created_at));
    const representativeMedia = pickRepresentativeMedia(weekMoments);
    const voiceNoteCount = weekMoments.reduce((sum, moment) => sum + (moment.voiceNotes?.length || 0), 0);
    const counts = {
      photoCount: weekPhotos.length,
      memoryCount: weekMemories.length,
      firstsCount: weekFirsts.length,
      letterCount: weekLetters.length,
      momentCount: weekMoments.length || weekPhotos.length,
      milestoneCount: weekFirsts.filter((first) => first.done !== false).length,
      voiceNoteCount,
    };
    const headline = counts.milestoneCount
      ? 'A week with a first worth saving.'
      : counts.voiceNoteCount
        ? 'A week with voices kept close.'
        : counts.momentCount
        ? 'A week of small arrivals.'
        : counts.letterCount
          ? 'A week with words saved for later.'
          : 'A quiet week, still worth keeping.';
    const coverPhoto = representativeMedia[0] || pickDigestCoverPhoto({ weekPhotos, memories });
    return {
      ...range,
      ...counts,
      headline,
      coverPhoto,
      representativeMedia,
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
    momentCount: row.moment_count ?? row.photo_count ?? 0,
    milestoneCount: row.milestone_count ?? row.firsts_count ?? 0,
    voiceNoteCount: row.voice_note_count || 0,
    representativeMedia: Array.isArray(row.representative_media) ? row.representative_media : [],
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

function pickRepresentativeMedia(weekMoments) {
  const out = [];
  const ranked = sortBookHighlightCandidates(weekMoments || [], (moment) => buildBookWorthinessForMoment(moment).bookScore);
  const eligible = ranked.filter((moment) => buildBookWorthinessForMoment(moment).bookEligible);
  const fallback = ranked.filter((moment) => !eligible.includes(moment));
  for (const moment of [...eligible, ...fallback]) {
    for (const media of moment.media || []) {
      const bookWorthiness = buildBookWorthinessForMoment(moment);
      out.push({
        momentId: moment.id,
        mediaId: media.id,
        mediaType: media.media_type || 'image',
        thumbUrl: media.thumbUrl || media.posterUrl || media.fullUrl || null,
        fullUrl: media.fullUrl || null,
        capturedAt: moment.captured_at || moment.created_at || null,
        bookEligible: bookWorthiness.bookEligible,
        bookScore: bookWorthiness.bookScore,
      });
      if (out.length >= 4) return out;
    }
  }
  return out;
}
