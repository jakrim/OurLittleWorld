import { isoDateForLocalDay, promptForDate } from './dailyPrompts.js';

export const MISSED_PROMPT_CATCHUP_DAYS = 7;

export function buildMissedPromptCandidates({
  familyId = '',
  babyBirthday = null,
  responses = [],
  userId = null,
  days = MISSED_PROMPT_CATCHUP_DAYS,
  now = new Date(),
} = {}) {
  if (!familyId || !userId) return [];
  const windowDays = Math.max(0, Math.floor(Number(days) || 0));
  if (!windowDays) return [];

  const today = isoDateForLocalDay(now);
  const rowsByDate = groupPromptRowsByDate(responses);
  const candidates = [];

  for (let offset = 1; offset <= windowDays; offset += 1) {
    const promptDate = offsetIsoDate(today, -offset);
    const rows = rowsByDate.get(promptDate) || [];
    const mine = rows.find((row) => row?.author_user_id === userId || row?.authorUserId === userId) || null;
    if (isAnsweredPromptRow(mine)) continue;

    const prompt = promptForDate({ familyId, babyBirthday, date: promptDate });
    const answered = rows.filter(isAnsweredPromptRow);
    candidates.push({
      promptDate,
      prompt,
      promptKey: prompt.key,
      promptText: prompt.text,
      daysAgo: offset,
      responses: rows,
      mine,
      answeredCount: answered.length,
      partnerAnswered: answered.some((row) => (row?.author_user_id || row?.authorUserId) !== userId),
    });
  }

  return candidates;
}

export function selectMissedPromptCatchup(candidates = []) {
  return (candidates || []).find((candidate) => candidate?.promptDate && candidate?.promptText) || null;
}

function groupPromptRowsByDate(responses = []) {
  const grouped = new Map();
  for (const row of responses || []) {
    const promptDate = row?.prompt_date || row?.promptDate;
    if (!promptDate) continue;
    const key = isoDateForLocalDay(promptDate);
    const rows = grouped.get(key) || [];
    rows.push(row);
    grouped.set(key, rows);
  }
  return grouped;
}

function isAnsweredPromptRow(row) {
  if (!row) return false;
  return !!(String(row.response_text || row.responseText || '').trim() || row.moment_id || row.momentId);
}

function offsetIsoDate(isoDate, days) {
  const [year, month, day] = isoDateForLocalDay(isoDate).split('-').map(Number);
  const value = new Date(year, month - 1, day);
  value.setDate(value.getDate() + days);
  return isoDateForLocalDay(value);
}
