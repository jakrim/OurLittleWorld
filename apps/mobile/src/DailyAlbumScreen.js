import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  Body,
  Caption,
  Card,
  Eyebrow,
  PhotoPlaceholder,
  Screen,
  Title,
  glass,
  radius,
  space,
  useTheme,
} from './ui';
import { useFamily } from './FamilyContext';
import { listMomentDayArchive } from './moments';
import { buildSavedDailyAlbum } from './dailyCurationModel';
import { getFamilyRitualSettings } from './ritualSettings';

const DAILY_ARCHIVE_LIMIT = 5000;

export default function DailyAlbumScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { family } = useFamily();
  const [records, setRecords] = useState([]);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    getFamilyRitualSettings({
      familyId: family?.id,
      family: { babyBirthday: family?.babyBirthday },
    })
      .then((settings) => {
        const zone = settings?.timezone && settings.timezone !== 'local'
          ? settings.timezone
          : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        if (alive) setTimezone(zone);
        return listMomentDayArchive(family?.id, { momentLimit: DAILY_ARCHIVE_LIMIT, timezone: zone });
      })
      .then((rows) => {
        if (alive) setRecords(rows || []);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [family?.babyBirthday, family?.id]);

  const model = useMemo(() => buildSavedDailyAlbum(records, {
    babyBirthday: family?.babyBirthday,
    recentLimit: 365,
    timezone,
  }), [family?.babyBirthday, records, timezone]);
  const days = model.firstYearDays.length ? model.firstYearDays : model.days;
  const childName = family?.babyName || 'Baby';

  const openDay = (dayKey) => {
    if (!dayKey) return;
    router.push({ pathname: '/daily-album/[day]', params: { day: dayKey, timezone } });
  };

  return (
    <Screen variant="dawn" bare contentStyle={styles.screen}>
      <FlatList
        style={styles.list}
        data={days}
        keyExtractor={(day) => day.dayKey}
        renderItem={({ item }) => (
          <DailyDayCard day={item} onOpen={openDay} theme={theme} />
        )}
        ListHeaderComponent={(
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Pressable
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                style={[styles.backButton, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }]}
              >
                <Ionicons name="chevron-back" size={20} color={theme.semantic.primary} />
              </Pressable>
              <View style={styles.headerText}>
                <Eyebrow>Day by day</Eyebrow>
                <Title style={styles.title}>365 days of {childName}.</Title>
              </View>
            </View>
            <Card variant="muted">
              <Title style={styles.coverageTitle}>
                {model.firstYearPhotoDays.toLocaleString()} of {model.firstYearElapsedDays.toLocaleString()}
              </Title>
              <Body>elapsed first-year days have a saved photo.</Body>
              <Caption style={styles.coverageCaption}>
                One strongest eligible photo anchors a day. Distinct standouts and special videos stay beside it. Empty days remain honest.
              </Caption>
              {model.firstYearElapsedDays ? (
                <Caption style={styles.coverageCaption}>
                  For this part of the first year, about {model.firstYearTargetBand.lower.toLocaleString()}–{model.firstYearTargetBand.upper.toLocaleString()} distinct photos and videos are a planning range—not a goal or limit.
                </Caption>
              ) : null}
            </Card>
            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={theme.semantic.primary} />
                <Caption>Opening the family album…</Caption>
              </View>
            ) : null}
            {error ? (
              <Card variant="muted">
                <Title style={styles.errorTitle}>The album could not finish loading.</Title>
                <Caption>Return to Our World and try opening the day-by-day album again.</Caption>
              </Card>
            ) : null}
          </View>
        )}
        ListEmptyComponent={!loading ? (
          <View style={styles.empty}>
            <PhotoPlaceholder style={styles.emptyPhoto} />
            <Title>No saved photo days yet.</Title>
            <Body>Tonight will begin adding strong daily memories here when they are ready.</Body>
          </View>
        ) : null}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
      />
    </Screen>
  );
}

function DailyDayCard({ day, onOpen, theme }) {
  const hasMedia = day.records?.length > 0;
  const photoCount = day.records?.reduce((sum, record) => sum + Number(record.imageCount || 0), 0) || 0;
  const videoCount = day.records?.reduce((sum, record) => sum + Number(record.videoCount || 0), 0) || 0;
  const cover = day.records?.[0] || null;
  return (
    <View style={[styles.dayCard, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }]}>
      <View style={styles.dayHeader}>
        <View>
          <Eyebrow>{day.dayNumber ? `Day ${day.dayNumber}` : 'Saved day'}</Eyebrow>
          <Title style={styles.dayTitle}>{formatDayTitle(day.dayKey)}</Title>
        </View>
        {hasMedia ? (
          <Caption>{formatCounts(photoCount, videoCount)}</Caption>
        ) : (
          <Caption>No eligible photo</Caption>
        )}
      </View>
      {hasMedia ? (
        <Pressable
          onPress={() => onOpen(day.dayKey)}
          accessibilityRole="button"
          accessibilityLabel={`Open all memories from ${formatDayTitle(day.dayKey)}`}
          style={[styles.dayOpenRow, { backgroundColor: theme.semantic.cardAlt }]}
        >
          <View style={[styles.mediaTile, { backgroundColor: theme.semantic.cardAlt }]}>
            {cover?.thumbUrl ? (
              <Image source={{ uri: cover.thumbUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <PhotoPlaceholder seed={cover?.key || day.dayKey} style={StyleSheet.absoluteFill} />
            )}
            <View style={styles.mediaScrim} />
            {videoCount ? (
              <View style={styles.playBadge}>
                <Ionicons name="play" size={13} color={theme.colors.onPrimary} />
              </View>
            ) : null}
          </View>
          <View style={styles.dayOpenCopy}>
            <Body>See this day</Body>
            <Caption>{formatCounts(photoCount, videoCount)}</Caption>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.semantic.textMuted} />
        </Pressable>
      ) : (
        <View style={[styles.gapRow, { backgroundColor: theme.semantic.cardAlt }]}>
          <Ionicons name="ellipse-outline" size={18} color={theme.semantic.textMuted} />
          <Caption>No eligible baby photo was saved for this day.</Caption>
        </View>
      )}
    </View>
  );
}

function formatDayTitle(dayKey) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || ''))
    ? new Date(`${dayKey}T12:00:00`)
    : new Date(dayKey);
  if (Number.isNaN(date.getTime())) return 'Saved day';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCounts(photos, videos) {
  return [
    photos ? `${photos} ${photos === 1 ? 'photo' : 'photos'}` : '',
    videos ? `${videos} ${videos === 1 ? 'video' : 'videos'}` : '',
  ].filter(Boolean).join(' · ');
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  header: {
    gap: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  headerText: {
    flex: 1,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    marginTop: space.xs,
  },
  coverageTitle: {
    fontSize: 34,
    lineHeight: 39,
  },
  coverageCaption: {
    marginTop: space.sm,
  },
  loading: {
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  errorTitle: {
    fontSize: 18,
    lineHeight: 23,
    marginBottom: space.xs,
  },
  dayCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
    gap: space.md,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
  },
  dayTitle: {
    fontSize: 18,
    lineHeight: 23,
    marginTop: 3,
  },
  dayOpenRow: {
    borderRadius: radius.lg,
    padding: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  dayOpenCopy: {
    flex: 1,
  },
  mediaTile: {
    width: 116,
    height: 140,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  mediaScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: glass.mediaScrim,
  },
  playBadge: {
    position: 'absolute',
    left: space.sm,
    bottom: space.sm,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: glass.mediaChrome,
    borderColor: glass.mediaChromeBorder,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gapRow: {
    minHeight: 60,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  empty: {
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
  emptyPhoto: {
    width: 140,
    height: 140,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
});
