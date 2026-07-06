import { ageInDaysOn, normalizeTitle } from './firstsModel.js';

export const POST_SAVE_NUDGE_MAX_PER_DAY = 2; // tunable

export function selectPostSaveNudge({
  moment,
  goals = [],
  firsts = [],
  birthdayISO = null,
  babyName = null,
  state = null,
  now = new Date(),
  maxPerDay = POST_SAVE_NUDGE_MAX_PER_DAY,
} = {}) {
  const momentId = moment?.id;
  if (!momentId) return null;
  if (!canShowPostSaveNudge({ state, momentId, now, maxPerDay })) return null;

  const hasPhoto = momentHasPhoto(moment);
  const hasVoice = momentHasVoice(moment);
  const hasNoteText = Boolean(String(moment?.note ?? moment?.caption_note ?? '').trim());
  const linkedFirst = Boolean(moment?.linkedFirst || moment?.firstId || moment?.first_id);
  const ageDays = ageInDaysOn(birthdayISO, now);

  if (hasPhoto) {
    const goal = selectInWindowFirstGoal(goals, firsts, ageDays);
    if (goal) return firstNudge({ goal, momentId });
  }

  if (hasPhoto && !hasVoice && !hasNoteText) {
    return {
      kind: 'voice',
      momentId,
      question: "Add a 20-second voice note while it's fresh?",
      actionLabel: 'Open moment',
      route: { pathname: '/moment/[momentId]', params: { momentId } },
    };
  }

  if (linkedFirst || hasVoice) {
    const context = buildLetterContext({ capturedAt: moment.capturedAt, ageDays, babyName });
    return {
      kind: 'letter',
      momentId,
      question: 'Leave one line for the eighteenth-birthday letter?',
      actionLabel: 'Write letter',
      route: {
        pathname: '/letter-compose',
        params: {
          title: context.title,
          body: context.body,
        },
      },
    };
  }

  return null;
}

export function normalizePostSaveNudgeState(input = {}) {
  return {
    dailyCounts: { ...(input?.dailyCounts || {}) },
    dismissedMomentIds: { ...(input?.dismissedMomentIds || {}) },
  };
}

export function canShowPostSaveNudge({
  state = null,
  momentId,
  now = new Date(),
  maxPerDay = POST_SAVE_NUDGE_MAX_PER_DAY,
} = {}) {
  const normalized = normalizePostSaveNudgeState(state);
  if (!momentId) return false;
  if (normalized.dismissedMomentIds[momentId]) return false;
  const dayKey = postSaveNudgeDayKey(now);
  return Number(normalized.dailyCounts[dayKey] || 0) < maxPerDay;
}

export function markPostSaveNudgeShown(state = null, now = new Date()) {
  const normalized = normalizePostSaveNudgeState(state);
  const dayKey = postSaveNudgeDayKey(now);
  return {
    ...normalized,
    dailyCounts: {
      ...normalized.dailyCounts,
      [dayKey]: Number(normalized.dailyCounts[dayKey] || 0) + 1,
    },
  };
}

export function markPostSaveNudgeDismissed(state = null, momentId, now = new Date()) {
  const normalized = normalizePostSaveNudgeState(state);
  if (!momentId) return normalized;
  return {
    ...normalized,
    dismissedMomentIds: {
      ...normalized.dismissedMomentIds,
      [momentId]: now.getTime(),
    },
  };
}

export function postSaveNudgeDayKey(date = new Date()) {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function selectInWindowFirstGoal(goals, firsts, ageDays) {
  if (ageDays == null) return null;
  const { completedKeys, completedTitles } = completionSets(firsts);
  return [...(goals || [])]
    .filter((goal) => {
      const key = goalKey(goal);
      if (key && completedKeys.has(key)) return false;
      if (completedTitles.has(normalizeTitle(goalTitle(goal)))) return false;
      const min = goalMinDays(goal);
      const max = goalMaxDays(goal);
      return min != null && max != null && ageDays >= min && ageDays <= max;
    })
    .sort((a, b) => Number(goalSortOrder(a) || 0) - Number(goalSortOrder(b) || 0))[0] || null;
}

function firstNudge({ goal, momentId }) {
  const title = goalTitle(goal);
  const targetAge = goalTargetAgeLabel(goal);
  const goalKeyValue = goalKey(goal);
  return {
    kind: 'first',
    momentId,
    goalKey: goalKeyValue,
    question: `Could this be a First? (${lowerFirstTitle(title)} · around now)`,
    actionLabel: 'Add first',
    route: {
      pathname: '/first-compose',
      params: {
        momentId,
        title,
        targetAge,
        goalKey: goalKeyValue,
      },
    },
  };
}

function completionSets(firsts) {
  const completed = (firsts || []).filter((row) => row?.done !== false);
  return {
    completedKeys: new Set(completed.map((row) => row.goal_key || row.goalKey).filter(Boolean)),
    completedTitles: new Set(completed.map((row) => normalizeTitle(row.title)).filter(Boolean)),
  };
}

function momentHasPhoto(moment) {
  if (moment?.hasPhoto != null) return Boolean(moment.hasPhoto);
  const assets = [...(moment?.assets || []), ...(moment?.media || [])];
  return assets.some((asset) => {
    const type = String(asset?.type || asset?.mediaType || asset?.media_type || '').toLowerCase();
    if (type === 'image' || type === 'photo') return true;
    if (type === 'video') return false;
    return Boolean(asset?.uri || asset?.localUri || asset?.thumbUrl || asset?.fullUrl);
  });
}

function momentHasVoice(moment) {
  if (moment?.hasVoice != null) return Boolean(moment.hasVoice);
  return Boolean(moment?.voice?.uri || moment?.voice?.id || moment?.voiceNotes?.length);
}

function buildLetterContext({ capturedAt, ageDays, babyName }) {
  const date = formatLetterDate(capturedAt);
  const age = formatAgeContext(ageDays);
  const pieces = [date, age].filter(Boolean);
  const context = pieces.length ? `On ${pieces.join(', ')}` : 'From a saved moment';
  const body = babyName
    ? `${context}, ${babyName} was becoming more themself.\n\n`
    : `${context}.\n\n`;
  return {
    title: date ? `A line from ${date}` : 'A line from today',
    body,
  };
}

function formatLetterDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatAgeContext(ageDays) {
  if (ageDays == null || !Number.isFinite(ageDays) || ageDays < 0) return '';
  if (ageDays < 60) return `${ageDays} days old`;
  if (ageDays < 730) return `${Math.round(ageDays / 30)} months old`;
  return `${Math.floor(ageDays / 365)} years old`;
}

function lowerFirstTitle(title) {
  return String(title || 'a first').replace(/^First\b/, 'first');
}

function goalKey(goal) {
  return goal?.key ?? goal?.goal_key;
}

function goalTitle(goal) {
  return goal?.title || 'A first';
}

function goalTargetAgeLabel(goal) {
  return goal?.targetAgeLabel ?? goal?.target_age_label ?? '';
}

function goalMinDays(goal) {
  return goal?.targetAgeMinDays ?? goal?.target_age_min_days;
}

function goalMaxDays(goal) {
  return goal?.targetAgeMaxDays ?? goal?.target_age_max_days;
}

function goalSortOrder(goal) {
  return goal?.sortOrder ?? goal?.sort_order;
}
