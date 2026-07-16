import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { listMomentArchive } from './moments';
import {
  buildSavedDailyAlbum,
  dailyArchiveRecordsFromMoments,
} from './dailyCurationModel';

const DAILY_ARCHIVE_LIMIT = 5000;

export default function DailyAlbumScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { family } = useFamily();
  const [moments, setMoments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    listMomentArchive(family?.id, { limit: DAILY_ARCHIVE_LIMIT })
      .then((rows) => {
        if (alive) setMoments(rows || []);
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
  }, [family?.id]);

  const model = useMemo(() => buildSavedDailyAlbum(
    dailyArchiveRecordsFromMoments(moments),
    { babyBirthday: family?.babyBirthday, recentLimit: 365 },
  ), [family?.babyBirthday, moments]);
  const days = model.firstYearDays.length ? model.firstYearDays : model.days;
  const childName = family?.babyName || 'Baby';

  const openRecord = (record) => {
    if (!record?.moment?.id) return;
    router.push({ pathname: '/moment/[momentId]', params: { momentId: record.moment.id } });
  };

  return (
    <Screen variant="dawn" bare contentStyle={styles.screen}>
      <FlatList
        style={styles.list}
        data={days}
        keyExtractor={(day) => day.dayKey}
        renderItem={({ item }) => (
          <DailyDayCard day={item} onOpen={openRecord} theme={theme} />
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
            <Body>Run photo review to let Our Little World find the first daily anchors.</Body>
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mediaRail}
        >
          {day.records.map((record) => (
            <Pressable
              key={record.key}
              onPress={() => onOpen(record)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${formatDayTitle(day.dayKey)} memory`}
              style={[styles.mediaTile, { backgroundColor: theme.semantic.cardAlt }]}
            >
              {record.thumbUrl ? (
                <Image source={{ uri: record.thumbUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <PhotoPlaceholder seed={record.key} style={StyleSheet.absoluteFill} />
              )}
              <View style={styles.mediaScrim} />
              {record.videoCount ? (
                <View style={styles.playBadge}>
                  <Ionicons name="play" size={13} color={theme.colors.onPrimary} />
                </View>
              ) : null}
              {record.imageCount + record.videoCount > 1 ? (
                <View style={styles.countBadge}>
                  <Caption style={styles.countText}>{record.imageCount + record.videoCount}</Caption>
                </View>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
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
  mediaRail: {
    gap: space.sm,
    paddingRight: space.xs,
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
  countBadge: {
    position: 'absolute',
    right: space.sm,
    bottom: space.sm,
    minWidth: 30,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 7,
    backgroundColor: glass.mediaChrome,
    borderColor: glass.mediaChromeBorder,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: glass.inverseTextBody,
    fontWeight: '800',
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
