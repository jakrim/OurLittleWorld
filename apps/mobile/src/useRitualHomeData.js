import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router/react-navigation';

import { loadCatchupDismissals } from './catchupDismissals';
import { getReadDigestWeek } from './digestReadState';
import { digestHasContent } from './digestModel.js';
import { Family } from './families';
import { ageInDaysOn, buildFirstsModel, selectCatchupGoal } from './firstsModel';
import { listMomentArchive } from './moments';
import {
  MONTHVERSARY_MAX_PER_BUCKET,
  annualTodayMatches,
  isUnderTwo,
  monthversaryBuckets,
  monthversaryLabel,
} from './onThisDay';
import { hydrateMediaUrls, listSharedTagged, listSharedTaggedPage } from './photoSync';
import { Memories } from './storage';
import { DailyPrompts, FIRST_GOAL_DEFINITIONS, Firsts, Letters, WeeklyDigests } from './rituals';

// v3: prompt selection now depends on babyBirthday (A3).
const CACHE_VERSION = 'v3';
const REFRESH_TTL_MS = 30 * 1000;

export function ritualHomeCacheKey({ familyId, userId }) {
  if (!familyId || !userId) return null;
  return `olw:ritual-home:${CACHE_VERSION}:${familyId}:${userId}`;
}

function annotatePromptState(promptState, userId) {
  const responses = promptState?.responses || [];
  const mine = promptState?.mine || responses.find((row) => row.author_user_id === userId) || null;
  const answered = responses.filter((row) => !!row.response_text || !!row.moment_id);
  const snoozed = !!(
    mine?.snoozed_until
    && new Date(mine.snoozed_until).getTime() > Date.now()
    && !mine?.response_text
  );
  return {
    ...(promptState || {}),
    responses,
    mine,
    answeredCount: answered.length,
    mineAnswered: !!mine?.response_text || !!mine?.moment_id,
    partnerAnswered: answered.some((row) => row.author_user_id !== userId),
    snoozed,
  };
}

function buildDerivedPayload({ raw, userId }) {
  const shared = raw.shared || [];
  const memories = raw.memories || [];
  const firsts = raw.firsts || [];
  const letters = raw.letters || [];
  const moments = raw.moments || [];
  const promptState = annotatePromptState(raw.promptState, userId);
  // Real annual matches win; month-versary buckets fill the first two years.
  const annual = annualTodayMatches(shared);
  const todayMatches = annual.length ? annual : (raw.monthversary || []);
  const digest = raw.digest || WeeklyDigests.build({ photos: shared, memories, firsts, letters, moments });
  const { goalProgress } = buildFirstsModel(firsts, FIRST_GOAL_DEFINITIONS, raw.ageDays ?? null);

  return {
    updatedAt: Date.now(),
    promptState,
    digest,
    catchupGoal: selectCatchupGoal(goalProgress.goals, raw.ageDays ?? null, raw.catchupDismissals || {}),
    digestUnread: digestHasContent(digest) && digest.weekStart !== raw.digestReadWeek,
    sharedPhotos: shared,
    recentPhotos: shared.slice(0, 12),
    todayMatches,
    firstsSummary: {
      count: firsts.length,
      latest: firsts[0] || null,
    },
    lettersSummary: {
      count: letters.length,
      latest: letters[0] || null,
    },
    membersById: raw.membersById || {},
  };
}

async function readCache({ familyId, userId }) {
  const key = ritualHomeCacheKey({ familyId, userId });
  if (!key) return null;
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeCache({ familyId, userId, payload }) {
  const key = ritualHomeCacheKey({ familyId, userId });
  if (!key || !payload) return;
  await AsyncStorage.setItem(key, JSON.stringify(payload));
}

async function fetchMonthversaryMatches({ familyId, babyBirthday, babyName }) {
  if (!isUnderTwo(ageInDaysOn(babyBirthday))) return [];
  const buckets = monthversaryBuckets({ birthdayISO: babyBirthday });
  const perBucket = await Promise.all(buckets.map(async (bucket) => {
    const { rows } = await listSharedTaggedPage(familyId, {
      limit: MONTHVERSARY_MAX_PER_BUCKET,
      capturedOnOrAfter: bucket.start.toISOString(),
      capturedBefore: bucket.end.toISOString(),
    });
    return rows.map((row) => ({ ...row, onThisDayLabel: monthversaryLabel(babyName, bucket.monthsAgo) }));
  }));
  return hydrateMediaUrls(perBucket.flat(), { variant: 'thumb' });
}

async function fetchRitualHomePayload({ familyId, userId, babyBirthday, babyName }) {
  const [shared, memories, firsts, letters, promptState, members, moments, monthversary, catchupDismissals, digestReadWeek] = await Promise.all([
    listSharedTagged(familyId, { limit: 120 }).catch(() => []),
    Memories.forFamily(familyId).catch(() => []),
    Firsts.list(familyId).catch(() => []),
    Letters.list(familyId).catch(() => []),
    DailyPrompts.getToday({ familyId, babyBirthday }).catch(() => null),
    Family.members(familyId).catch(() => []),
    listMomentArchive(familyId, { limit: 160 }).catch(() => []),
    fetchMonthversaryMatches({ familyId, babyBirthday, babyName }).catch(() => []),
    loadCatchupDismissals(familyId),
    getReadDigestWeek(familyId),
  ]);

  const digest = await WeeklyDigests.ensureForCurrentWeek({
    familyId,
    photos: shared,
    memories,
    firsts,
    letters,
    moments,
  }).catch(() => WeeklyDigests.build({ photos: shared, memories, firsts, letters, moments }));

  return buildDerivedPayload({
    userId,
    raw: {
      shared,
      memories,
      firsts,
      letters,
      moments,
      monthversary,
      catchupDismissals,
      digestReadWeek,
      ageDays: ageInDaysOn(babyBirthday),
      promptState,
      digest,
      membersById: Object.fromEntries(members.map((m) => [m.userId, m.displayName || 'Family'])),
    },
  });
}

export async function patchCachedPromptState({ familyId, userId, promptRow }) {
  if (!familyId || !userId || !promptRow) return null;
  const cached = await readCache({ familyId, userId });
  if (!cached?.promptState) return null;
  const responses = [...(cached.promptState.responses || [])];
  const index = responses.findIndex((row) => row.author_user_id === promptRow.author_user_id);
  if (index >= 0) responses[index] = { ...responses[index], ...promptRow };
  else responses.push(promptRow);
  const next = {
    ...cached,
    updatedAt: Date.now(),
    promptState: annotatePromptState({
      ...cached.promptState,
      responses,
      mine: promptRow.author_user_id === userId ? promptRow : cached.promptState.mine,
    }, userId),
  };
  await writeCache({ familyId, userId, payload: next });
  return next;
}

export async function readCachedPromptState({ familyId, userId }) {
  const cached = await readCache({ familyId, userId });
  return cached?.promptState || null;
}

export function useRitualHomeData({ familyId, userId, babyBirthday = null, babyName = null }) {
  const [payload, setPayload] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const lastRefreshRef = useRef(0);
  const payloadRef = useRef(null);
  const refreshPromiseRef = useRef(null);

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  useEffect(() => {
    let alive = true;
    if (!familyId || !userId) {
      setPayload(null);
      setStatus('idle');
      return () => {
        alive = false;
      };
    }
    readCache({ familyId, userId }).then((cached) => {
      if (!alive || !cached) return;
      setPayload(cached);
      setStatus('cached');
    });
    return () => {
      alive = false;
    };
  }, [familyId, userId]);

  const refresh = useCallback(async ({ force = false } = {}) => {
    if (!familyId || !userId) return null;
    const now = Date.now();
    if (!force && refreshPromiseRef.current) return refreshPromiseRef.current;
    if (!force && payloadRef.current && now - lastRefreshRef.current < REFRESH_TTL_MS) {
      return payloadRef.current;
    }

    setStatus((current) => (current === 'idle' ? 'refreshing' : current));
    setError(null);
    const promise = fetchRitualHomePayload({ familyId, userId, babyBirthday, babyName })
      .then(async (next) => {
        lastRefreshRef.current = Date.now();
        await writeCache({ familyId, userId, payload: next });
        setPayload(next);
        setStatus('ready');
        return next;
      })
      .catch((err) => {
        setError(err);
        setStatus((current) => (payloadRef.current ? current : 'error'));
        return payloadRef.current;
      })
      .finally(() => {
        refreshPromiseRef.current = null;
      });
    refreshPromiseRef.current = promise;
    return promise;
  }, [babyBirthday, babyName, familyId, userId]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const cached = await readCache({ familyId, userId });
        if (alive && cached) {
          setPayload(cached);
          setStatus('cached');
        }
        if (alive) refresh({ force: !cached });
      })();
      return () => {
        alive = false;
      };
    }, [familyId, refresh, userId]),
  );

  const savePromptResponse = useCallback(async (responseText) => {
    if (!familyId || !userId) return null;
    const row = await DailyPrompts.saveResponse({ familyId, responseText, babyBirthday });
    const next = await patchCachedPromptState({ familyId, userId, promptRow: row });
    if (next) setPayload(next);
    refresh({ force: true });
    return row;
  }, [babyBirthday, familyId, refresh, userId]);

  const snoozePrompt = useCallback(async () => {
    if (!familyId || !userId) return null;
    const row = await DailyPrompts.snoozeToday({ familyId, babyBirthday });
    const next = await patchCachedPromptState({ familyId, userId, promptRow: row });
    if (next) setPayload(next);
    refresh({ force: true });
    return row;
  }, [babyBirthday, familyId, refresh, userId]);

  return useMemo(() => ({
    status,
    error,
    promptState: payload?.promptState || null,
    digest: payload?.digest || WeeklyDigests.build(),
    catchupGoal: payload?.catchupGoal || null,
    digestUnread: payload?.digestUnread || false,
    sharedPhotos: payload?.sharedPhotos || [],
    recentPhotos: payload?.recentPhotos || [],
    todayMatches: payload?.todayMatches || [],
    firstsSummary: payload?.firstsSummary || { count: 0, latest: null },
    lettersSummary: payload?.lettersSummary || { count: 0, latest: null },
    membersById: payload?.membersById || {},
    refresh,
    savePromptResponse,
    snoozePrompt,
  }), [error, payload, refresh, savePromptResponse, snoozePrompt, status]);
}
