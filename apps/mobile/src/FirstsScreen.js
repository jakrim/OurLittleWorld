import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
import { useFamily } from './FamilyContext';
import { ageInDaysOn, buildFirstsModel } from './firstsModel';
import { ageAt, formatAge } from './photos';
import { listSharedTagged } from './photoSync';
import { FIRST_GOAL_DEFINITIONS, Firsts } from './rituals';

export default function FirstsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { family } = useFamily();
  const [rows, setRows] = useState([]);
  const [goalDefinitions, setGoalDefinitions] = useState(FIRST_GOAL_DEFINITIONS);
  const [photosByKey, setPhotosByKey] = useState({});

  const load = useCallback(async () => {
    if (!family?.id) return;
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
  }, [family?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const { displayRows, goalProgress, completedCount } = useMemo(
    () => buildFirstsModel(rows, goalDefinitions, ageInDaysOn(family?.babyBirthday)),
    [family?.babyBirthday, goalDefinitions, rows],
  );
  const subtitle = goalProgress.total
    ? `${goalProgress.completed} of ${goalProgress.total} goals complete`
    : rows.length === 1 ? '1 first saved' : `${rows.length} firsts saved`;

  return (
    <AppShell
      active="firsts"
      title="firsts so far."
      subtitle={subtitle}
      right={(
        <Pressable
          onPress={() => router.push('/first-compose')}
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
          {goalProgress.goals.map((item) => {
            return (
              <View
                key={item.key}
                style={[
                  styles.progressSegment,
                  {
                    backgroundColor: item.completed ? theme.semantic.primary : theme.semantic.cardAlt,
                    borderColor: item.completed ? theme.semantic.primary : theme.semantic.border,
                  },
                ]}
              />
            );
          })}
        </View>
        <View style={[styles.goalPreview, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
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
        </View>
        <Button
          size="md"
          fullWidth={false}
          style={styles.heroButton}
          onPress={() => router.push('/first-compose')}
          icon={<Ionicons name="add" size={16} color={theme.colors.onPrimary} />}
        >
          Add a first
        </Button>
      </Card>

      {!rows.length ? <FirstDayGuide theme={theme} goals={goalDefinitions} onAdd={() => router.push('/first-compose')} /> : null}

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
          accessibilityHint={!first.done ? `Suggested around ${first.target_age_label || 'someday'}.` : undefined}
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
                <Caption>{formatDate(first.happened_at || first.created_at)}</Caption>
              </View>
              <Body style={styles.firstTitle}>{first.title}</Body>
              {first.note ? (
                <Caption numberOfLines={2}>{first.note}</Caption>
              ) : !first.done ? (
                <Caption>Suggested around {first.target_age_label || 'someday'}</Caption>
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

function FirstDayGuide({ theme, goals, onAdd }) {
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
      <Button
        size="md"
        fullWidth={false}
        style={styles.guideButton}
        onPress={onAdd}
        icon={<Ionicons name="add" size={16} color={theme.colors.onPrimary} />}
      >
        Save the first one
      </Button>
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
  if (!value) return 'someday';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  heroTitle: {
    fontSize: 24,
    lineHeight: 30,
    marginVertical: space.sm,
  },
  heroButton: {
    marginTop: space.lg,
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
  guideButton: {
    marginTop: space.lg,
  },
});
