// Pure model logic for the Firsts screen. No React Native imports — unit-tested with node --test.

export function ageInDaysOn(birthdayISO, now = new Date()) {
  if (!birthdayISO) return null;
  const birth = new Date(`${birthdayISO}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - birth.getTime()) / (24 * 60 * 60 * 1000));
}

export function buildFirstsModel(rows, goals, ageDays = null) {
  const completed = (rows || []).map((row) => ({ ...row, done: row.done !== false }));
  const { completedKeys, completedTitles } = buildCompletionSets(completed);
  const placeholders = buildGoalPlaceholders(goals, completedKeys, completedTitles);
  const goalRows = [...goals]
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((goal) => ({
      ...goal,
      completed: completedKeys.has(goal.key) || completedTitles.has(normalizeTitle(goal.title)),
    }));
  const upcoming = goalRows.filter((goal) => !goal.completed && goalIsUpcoming(goal, ageDays));
  const allComplete = goalRows.length > 0 && goalRows.every((goal) => goal.completed);
  return {
    displayRows: [...completed, ...placeholders],
    completedCount: completed.length,
    goalProgress: {
      goals: goalRows,
      total: goalRows.length,
      completed: goalRows.filter((goal) => goal.completed).length,
      next: upcoming[0] || null,
      upcomingTitles: upcoming.slice(0, 2).map((goal) => goal.title),
      state: allComplete ? 'complete' : upcoming.length ? 'ahead' : 'catchup',
    },
  };
}

function goalIsUpcoming(goal, ageDays) {
  if (ageDays == null || goal.targetAgeMaxDays == null) return true;
  return goal.targetAgeMaxDays >= ageDays;
}

// 'past' | 'now' | 'future' | null (no window or unknown age)
export function goalWindowState(row, ageDays) {
  const min = row.target_age_min_days ?? row.targetAgeMinDays;
  const max = row.target_age_max_days ?? row.targetAgeMaxDays;
  if (ageDays == null || min == null || max == null) return null;
  if (ageDays > max) return 'past';
  if (ageDays < min) return 'future';
  return 'now';
}

export function goalTimingCaption(row, ageDays) {
  const label = row.target_age_label ?? row.targetAgeLabel;
  const state = goalWindowState(row, ageDays);
  if (state === 'past') return `From around ${label} — add it whenever you remember it`;
  if (state === 'now') return 'Happening around now';
  return `Suggested around ${label || 'someday'}`;
}

export const CATCHUP_DISMISS_DAYS = 30; // tunable

// Oldest past-window incomplete goal, skipping ones dismissed in the last
// CATCHUP_DISMISS_DAYS. dismissedAtByKey: { [goalKey]: epochMs }.
export function selectCatchupGoal(goalRows, ageDays, dismissedAtByKey = {}, now = new Date()) {
  if (ageDays == null) return null;
  const cutoff = now.getTime() - CATCHUP_DISMISS_DAYS * 24 * 60 * 60 * 1000;
  return [...goalRows]
    .filter((goal) => !goal.completed && goal.targetAgeMaxDays != null && ageDays > goal.targetAgeMaxDays)
    .sort((a, b) => a.targetAgeMaxDays - b.targetAgeMaxDays)
    .find((goal) => {
      const dismissedAt = dismissedAtByKey[goal.key];
      return !(dismissedAt && dismissedAt > cutoff);
    }) || null;
}

function buildCompletionSets(completed) {
  const completedKeys = new Set(completed.map((row) => row.goal_key).filter(Boolean));
  const completedTitles = new Set(completed.map((row) => normalizeTitle(row.title)));
  return { completedKeys, completedTitles };
}

function buildGoalPlaceholders(goals, completedKeys, completedTitles) {
  return goals
    .filter((item) => !completedKeys.has(item.key) && !completedTitles.has(normalizeTitle(item.title)))
    .map((item) => ({
      id: `goal:${item.key}`,
      goal_key: item.key,
      title: item.title,
      target_age_label: item.targetAgeLabel,
      target_age_min_days: item.targetAgeMinDays ?? null,
      target_age_max_days: item.targetAgeMaxDays ?? null,
      description: item.description,
      happened_at: null,
      created_at: null,
      done: false,
    }));
}

export function normalizeTitle(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
