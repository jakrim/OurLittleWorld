import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, InteractionManager, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  AppShell,
  Body,
  Button,
  Caption,
  Card,
  Eyebrow,
  PhotoPlaceholder,
  Title,
  radius,
  space,
  useTheme,
} from './ui';
import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { ageInDaysOn, buildFirstsModel, goalTimingCaption } from './firstsModel';
import {
  buildFirstSuggestion,
  FIRST_SUGGESTION_EYEBROW,
  FIRST_SUGGESTION_FOOTER,
  FIRST_SUGGESTION_SOURCE_CAPTION,
  keepRouteForSuggestion,
  selectSuggestionForDisplay,
} from './firstSuggestionModel';
import { generateFirstSuggestions } from './firstSuggestionScanner';
import { getNotificationPreferences } from './notificationSettings';
import { readFirstSuggestionState, recordFirstSuggestionFeedback, saveGeneratedSuggestions } from './firstSuggestionStore';
import { ageAt, formatAge } from './photos';
import { listSharedTagged } from './photoSync';
import { FIRST_GOAL_DEFINITIONS, Firsts } from './rituals';
import useReducedMotion from './ui/useReducedMotion';

export default function FirstsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { family } = useFamily();
  const { user } = useAuth();
  const reducedMotion = useReducedMotion();
  const [rows, setRows] = useState([]);
  const [goalDefinitions, setGoalDefinitions] = useState(FIRST_GOAL_DEFINITIONS);
  const [photosByKey, setPhotosByKey] = useState({});
  const [suggestionState, setSuggestionState] = useState(null);
  const [firstsLoaded, setFirstsLoaded] = useState(false);
  const [celebratingGoalKey, setCelebratingGoalKey] = useState(null);
  const firstProgressLoadRef = useRef(true);
  const completedGoalKeysRef = useRef(new Set());
  const celebrationProgress = useRef(new Animated.Value(1)).current;
  const celebrationTimeoutRef = useRef(null);

  const load = useCallback(async () => {
    if (!family?.id) {
      setFirstsLoaded(false);
      return;
    }
    const [definitionRows, firstRows, sharedRows] = await Promise.all([
      Firsts.listGoalDefinitions(),
      Firsts.list(family.id),
      listSharedTagged(family.id, { limit: 240 }).catch(() => []),
    ]);
    setGoalDefinitions(definitionRows?.length ? definitionRows : FIRST_GOAL_DEFINITIONS);
    setRows(firstRows);
    setPhotosByKey(Object.fromEntries(
      sharedRows.map((photo) => [`${photo.asset_owner_user_id}:${photo.asset_id}`, photo]),
    ));
    setFirstsLoaded(true);
  }, [family?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useFocusEffect(useCallback(() => {
    let alive = true;
    if (family?.id && user?.id) {
      readFirstSuggestionState({ familyId: family.id, userId: user.id })
        .then((state) => { if (alive) setSuggestionState(state); });
    }
    return () => { alive = false; };
  }, [family?.id, user?.id]));

  useEffect(() => {
    firstProgressLoadRef.current = true;
    completedGoalKeysRef.current = new Set();
    setCelebratingGoalKey(null);
    setFirstsLoaded(false);
  }, [family?.id]);

  const ageDays = ageInDaysOn(family?.babyBirthday);
  const { displayRows, goalProgress, completedCount } = useMemo(
    () => buildFirstsModel(rows, goalDefinitions, ageDays),
    [ageDays, goalDefinitions, rows],
  );
  const completedGoalKeys = useMemo(
    () => goalProgress.goals.filter((goal) => goal.completed).map((goal) => goal.key),
    [goalProgress.goals],
  );

  useEffect(() => {
    if (!firstsLoaded || !family?.id || !user?.id) return undefined;
    let alive = true;
    const task = InteractionManager.runAfterInteractions(async () => {
      const preferences = await getNotificationPreferences({ familyId: family.id, userId: user.id })
        .catch(() => null);
      generateFirstSuggestions({
        familyId: family.id,
        userId: user.id,
        babyBirthday: family?.babyBirthday,
        goalRows: goalProgress.goals,
        preferences,
      })
        .then((state) => { if (alive && state) setSuggestionState(state); })
        .catch((err) => console.warn('generateFirstSuggestions', err?.message));
    });
    return () => {
      alive = false;
      task?.cancel?.();
    };
  }, [family?.babyBirthday, family?.id, firstsLoaded, goalProgress.goals, user?.id]);

  const suggestion = useMemo(
    () => (suggestionState ? selectSuggestionForDisplay(suggestionState, { goalRows: goalProgress.goals }) : null),
    [goalProgress.goals, suggestionState],
  );
  const suggestionGoal = suggestion
    ? goalProgress.goals.find((goal) => goal.key === suggestion.goalKey) || null
    : null;

  const applyFeedback = useCallback((action, assetId = null) => {
    if (!suggestion || !family?.id || !user?.id) return;
    recordFirstSuggestionFeedback({
      familyId: family.id,
      userId: user.id,
      goalKey: suggestion.goalKey,
      action,
      assetId,
    })
      .then(setSuggestionState)
      .catch((err) => console.warn('recordFirstSuggestionFeedback', err?.message));
  }, [family?.id, suggestion, user?.id]);

  const keepSuggestion = useCallback(() => {
    if (!suggestion || !suggestionGoal) return;
    const route = keepRouteForSuggestion(suggestion, suggestionGoal);
    applyFeedback('keep');
    if (route) router.push(route);
  }, [applyFeedback, router, suggestion, suggestionGoal]);

  // Dev-only fixture: long-press the header "+" to seed a suggestion from
  // real archive photos, so the card and Keep handoff are testable without a
  // device photo library or reference profile. Stripped from release builds.
  const seedDevSuggestion = useCallback(async () => {
    if (!__DEV__ || !family?.id || !user?.id) return;
    const dismissedGoals = suggestionState?.dismissedGoals || {};
    const goal = goalProgress.goals.find((item) => !item.completed && !dismissedGoals[item.key]);
    const photos = Object.values(photosByKey).filter((photo) => photo.thumbUrl || photo.fullUrl).slice(0, 4);
    if (!goal || !photos.length) return;
    const baseTime = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const matches = photos.map((photo, index) => ({
      assetId: photo.asset_id,
      score: 0.9,
      captureQuality: 0.9 - index * 0.05,
      creationTime: photo.creation_time
        ? new Date(photo.creation_time).getTime()
        : baseTime + index * 60 * 60 * 1000,
      uri: photo.thumbUrl || photo.fullUrl,
    }));
    const fixture = buildFirstSuggestion({
      goal,
      matches,
      ownerUserId: photos[0].asset_owner_user_id || user.id,
    });
    if (!fixture) return;
    const state = await saveGeneratedSuggestions({
      familyId: family.id,
      userId: user.id,
      suggestions: [fixture],
      generatedGoalKeys: [goal.key],
    });
    setSuggestionState(state);
  }, [family?.id, goalProgress.goals, photosByKey, suggestionState?.dismissedGoals, user?.id]);

  useEffect(() => {
    if (!firstsLoaded) return;
    const nextKeys = new Set(completedGoalKeys);
    if (firstProgressLoadRef.current) {
      firstProgressLoadRef.current = false;
      completedGoalKeysRef.current = nextKeys;
      return;
    }

    const previousKeys = completedGoalKeysRef.current;
    const newlyCompletedKey = completedGoalKeys.find((key) => !previousKeys.has(key));
    completedGoalKeysRef.current = nextKeys;
    if (!newlyCompletedKey || reducedMotion) {
      if (reducedMotion) setCelebratingGoalKey(null);
      return;
    }

    if (celebrationTimeoutRef.current) clearTimeout(celebrationTimeoutRef.current);
    setCelebratingGoalKey(newlyCompletedKey);
    celebrationProgress.stopAnimation();
    celebrationProgress.setValue(0);
    Animated.sequence([
      Animated.timing(celebrationProgress, {
        toValue: 0.82,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(celebrationProgress, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      celebrationTimeoutRef.current = setTimeout(() => setCelebratingGoalKey(null), 900);
    });
  }, [celebrationProgress, completedGoalKeys, firstsLoaded, reducedMotion]);

  useEffect(() => {
    if (!reducedMotion) return;
    if (celebrationTimeoutRef.current) clearTimeout(celebrationTimeoutRef.current);
    celebrationProgress.stopAnimation();
    celebrationProgress.setValue(1);
    setCelebratingGoalKey(null);
  }, [celebrationProgress, reducedMotion]);

  useEffect(() => () => {
    if (celebrationTimeoutRef.current) clearTimeout(celebrationTimeoutRef.current);
    celebrationProgress.stopAnimation();
  }, [celebrationProgress]);

  const subtitle = goalProgress.total
    ? `${goalProgress.completed} of ${goalProgress.total} goals complete`
    : rows.length === 1 ? '1 first saved' : `${rows.length} firsts saved`;
  const openNextGoal = () => {
    if (!goalProgress.next) return;
    router.push({
      pathname: '/first-compose',
      params: {
        title: goalProgress.next.title,
        targetAge: goalProgress.next.targetAgeLabel,
        goalKey: goalProgress.next.key,
      },
    });
  };

  return (
    <AppShell
      active="firsts"
      title="firsts so far."
      subtitle={subtitle}
      right={(
        <Pressable
          onPress={() => router.push('/first-compose')}
          onLongPress={__DEV__ ? seedDevSuggestion : undefined}
          accessibilityRole="button"
          accessibilityLabel="Add a first"
          style={[styles.headerAddButton, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }]}
        >
          <Ionicons name="add" size={18} color={theme.semantic.primary} />
        </Pressable>
      )}
    >
      <Card>
        <Eyebrow>{completedCount} firsts saved</Eyebrow>
        <Title style={styles.heroTitle}>{heroTitleFor(goalProgress)}</Title>
        <Body>Each one you finish becomes a saved First, and the path ahead stays visible without pressure.</Body>
        <View style={styles.progressSegments}>
          {goalProgress.goals.map((item) => (
            <GoalProgressSegment
              key={item.key}
              item={item}
              progress={celebrationProgress}
              celebrating={item.key === celebratingGoalKey}
            />
          ))}
        </View>
        <Pressable
          onPress={openNextGoal}
          disabled={!goalProgress.next}
          accessible={!!goalProgress.next}
          accessibilityRole="button"
          accessibilityLabel={goalProgress.next ? `Add ${goalProgress.next.title}` : undefined}
          accessibilityHint={goalProgress.next ? 'Opens the first composer with this goal filled in.' : undefined}
          accessibilityState={{ disabled: !goalProgress.next }}
          style={[styles.goalPreview, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}
        >
          <Caption>
            {goalProgress.next
              ? 'Next family goal'
              : goalProgress.state === 'complete' ? 'Goal path complete' : 'Catch-up firsts'}
          </Caption>
          <Body style={styles.goalPreviewTitle}>
            {goalProgress.next
              ? `${goalProgress.next.title}${goalProgress.next.targetAgeLabel ? ` · ${goalProgress.next.targetAgeLabel}` : ''}`
              : goalProgress.state === 'complete'
                ? 'Every starter goal has a saved story.'
                : 'Add them whenever the memory comes back.'}
          </Body>
          {goalProgress.next?.description ? <Caption>{goalProgress.next.description}</Caption> : null}
        </Pressable>
      </Card>

      {suggestion ? (
        <SuggestedFirstCard
          theme={theme}
          suggestion={suggestion}
          onKeep={keepSuggestion}
          onNotThis={() => applyFeedback('not_this')}
          onPromote={(assetId) => applyFeedback('choose_another', assetId)}
        />
      ) : null}

      {!rows.length ? <FirstDayGuide theme={theme} goals={goalDefinitions} /> : null}

      {displayRows.map((first) => {
        const photo = first.asset_owner_user_id && first.asset_id
          ? photosByKey[`${first.asset_owner_user_id}:${first.asset_id}`]
          : null;
        const onPress = () => {
          if (!first.done) {
            router.push({
              pathname: '/first-compose',
              params: { title: first.title, targetAge: first.target_age_label, goalKey: first.goal_key },
            });
            return;
          }
          if (first.moment_id) {
            router.push({ pathname: '/moment/[momentId]', params: { momentId: first.moment_id } });
            return;
          }
          if (photo?.moment_id) {
            router.push({ pathname: '/moment/[momentId]', params: { momentId: photo.moment_id } });
            return;
          }
          router.push({ pathname: '/first-compose', params: { id: first.id } });
        };
        return (
        <Pressable
          key={first.id}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={first.done ? `Open first: ${first.title}` : `Add first: ${first.title}`}
          accessibilityHint={!first.done ? `${goalTimingCaption(first, ageDays)}.` : undefined}
        >
          <Card padding="md" style={[styles.firstCard, !first.done && styles.futureCard]}>
            {photo?.thumbUrl || photo?.fullUrl ? (
              <Image
                source={{ uri: photo.thumbUrl || photo.fullUrl }}
                style={styles.thumb}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <PhotoPlaceholder style={[styles.thumb, !first.done && styles.futureThumb]} icon={first.done ? 'flag-outline' : 'ellipse-outline'} />
            )}
            <View style={styles.firstBody}>
              <View style={styles.firstMeta}>
                <AgePill first={first} birthday={family?.babyBirthday} />
                {first.done ? <Caption>{formatDate(first.happened_at || first.created_at)}</Caption> : null}
              </View>
              <Body style={styles.firstTitle}>{first.title}</Body>
              {first.note ? (
                <Caption numberOfLines={2}>{first.note}</Caption>
              ) : !first.done ? (
                <Caption>{goalTimingCaption(first, ageDays)}</Caption>
              ) : null}
            </View>
            <Ionicons
              name={first.done ? 'checkmark-circle' : 'add-circle-outline'}
              size={20}
              color={first.done ? theme.semantic.secondary : theme.semantic.primary}
            />
          </Card>
        </Pressable>
        );
      })}
    </AppShell>
  );
}

function GoalProgressSegment({ item, progress, celebrating }) {
  const theme = useTheme();
  const fillWidth = celebrating
    ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
    : '100%';
  const flagOpacity = progress.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0, 1, 1] });
  const flagTranslateY = progress.interpolate({ inputRange: [0, 0.44, 1], outputRange: [-16, 1, 0] });
  const flagScale = progress.interpolate({ inputRange: [0, 0.44, 1], outputRange: [0.72, 1.12, 1] });

  return (
    <View
      style={[
        styles.progressSegment,
        {
          backgroundColor: theme.semantic.cardAlt,
          borderColor: item.completed ? theme.semantic.primary : theme.semantic.border,
        },
      ]}
    >
      {item.completed ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.progressSegmentFill,
            {
              width: fillWidth,
              backgroundColor: theme.semantic.primary,
            },
          ]}
        />
      ) : null}
      {celebrating ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.progressFlag,
            {
              backgroundColor: theme.semantic.primary,
              opacity: flagOpacity,
              transform: [
                { translateY: flagTranslateY },
                { scale: flagScale },
              ],
            },
          ]}
        >
          <Ionicons name="flag" size={13} color={theme.colors.onPrimary} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function SuggestedFirstCard({ theme, suggestion, onKeep, onNotThis, onPromote }) {
  const primaryUri = suggestion.primary.uri || suggestion.primary.localUri;
  return (
    <Card variant="muted">
      <View style={styles.guideHeader}>
        <View style={[styles.guideIcon, { backgroundColor: theme.colors.primarySoft }]}>
          <Ionicons name="eye-outline" size={18} color={theme.semantic.primary} />
        </View>
        <View style={styles.guideText}>
          <Eyebrow>{FIRST_SUGGESTION_EYEBROW}</Eyebrow>
          <Title style={styles.guideTitle}>{suggestion.title}</Title>
        </View>
      </View>
      <Caption>{`${suggestion.aroundLabel} · ${FIRST_SUGGESTION_SOURCE_CAPTION}`}</Caption>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.suggestionPhotoRow}
      >
        {primaryUri ? (
          <Image
            source={{ uri: primaryUri }}
            style={styles.suggestionPrimaryPhoto}
            contentFit="cover"
            cachePolicy="memory-disk"
            accessibilityLabel="Suggested photo"
          />
        ) : (
          <PhotoPlaceholder style={styles.suggestionPrimaryPhoto} icon="flag-outline" />
        )}
        {suggestion.alternates.map((photo) => {
          const uri = photo.uri || photo.localUri;
          return (
            <Pressable
              key={photo.assetId}
              onPress={() => onPromote(photo.assetId)}
              accessibilityRole="button"
              accessibilityLabel="Choose this photo instead"
              style={styles.suggestionAltPhoto}
            >
              {uri ? (
                <Image
                  source={{ uri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <PhotoPlaceholder style={StyleSheet.absoluteFill} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.suggestionActions}>
        <Button size="md" fullWidth={false} onPress={onKeep}>Keep</Button>
        <Button variant="quiet" size="md" fullWidth={false} onPress={onNotThis}>Not this</Button>
      </View>
      <Caption>{FIRST_SUGGESTION_FOOTER}</Caption>
    </Card>
  );
}

function FirstDayGuide({ theme, goals }) {
  return (
    <Card variant="muted">
      <View style={styles.guideHeader}>
        <View style={[styles.guideIcon, { backgroundColor: theme.colors.primarySoft }]}>
          <Ionicons name="flag-outline" size={18} color={theme.semantic.primary} />
        </View>
        <View style={styles.guideText}>
          <Eyebrow>First day</Eyebrow>
          <Title style={styles.guideTitle}>Nothing has to be complete yet.</Title>
        </View>
      </View>
      <Body>Start with the one you remember most clearly. The rest can stay as soft placeholders until the moment arrives.</Body>
      <View style={styles.guideChips}>
        {(goals?.length ? goals : FIRST_GOAL_DEFINITIONS).slice(0, 3).map((goal) => (
          <Caption key={goal.key} style={[styles.guideChip, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
            {goal.title.toLowerCase()}
          </Caption>
        ))}
      </View>
    </Card>
  );
}

function heroTitleFor(goalProgress) {
  if (goalProgress.state === 'ahead' && goalProgress.upcomingTitles.length) {
    return `Coming up: ${goalProgress.upcomingTitles.map((title) => title.toLowerCase()).join(' and ')}.`;
  }
  if (goalProgress.state === 'catchup') {
    return 'A few firsts are still worth writing down.';
  }
  return 'Family goals for the year ahead.';
}

function AgePill({ first, birthday }) {
  const theme = useTheme();
  const age = useMemo(() => {
    if (!birthday || !first.happened_at) return null;
    return formatAge(ageAt(birthday, new Date(first.happened_at).getTime()));
  }, [birthday, first.happened_at]);
  if (!age) return null;
  return (
    <View style={[styles.agePill, { backgroundColor: theme.colors.primarySoft }]}>
      <Caption style={{ color: theme.semantic.primary, fontWeight: '700' }}>{age}</Caption>
    </View>
  );
}

function formatDate(value) {
  if (!value) return 'Someday';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  heroTitle: {
    fontSize: 24,
    lineHeight: 30,
    marginVertical: space.sm,
  },
  progressSegments: {
    flexDirection: 'row',
    gap: 5,
    marginTop: space.lg,
  },
  progressSegment: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    overflow: 'visible',
  },
  progressSegmentFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 4,
  },
  progressFlag: {
    position: 'absolute',
    right: -8,
    top: -20,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalPreview: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    marginTop: space.lg,
    gap: 3,
  },
  goalPreviewTitle: {
    color: undefined,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
  },
  headerAddButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.sm,
  },
  firstCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
  },
  futureCard: {
    opacity: 0.82,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    marginRight: space.md,
  },
  futureThumb: {
    opacity: 0.72,
  },
  firstBody: {
    flex: 1,
  },
  firstMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  firstTitle: {
    color: undefined,
    fontSize: 15,
    lineHeight: 20,
  },
  agePill: {
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.sm,
  },
  guideIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideText: {
    flex: 1,
  },
  guideTitle: {
    fontSize: 20,
    lineHeight: 25,
  },
  guideChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.lg,
  },
  guideChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: 5,
    textTransform: 'none',
    letterSpacing: 0,
  },
  suggestionPhotoRow: {
    gap: space.sm,
    marginTop: space.md,
    alignItems: 'flex-end',
  },
  suggestionPrimaryPhoto: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
  },
  suggestionAltPhoto: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  suggestionActions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
    marginBottom: space.sm,
  },
});
