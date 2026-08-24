import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { useFamily } from './FamilyContext';
import { listMomentDayDetails } from './moments';
import {
  Body,
  Caption,
  Eyebrow,
  PhotoPlaceholder,
  Screen,
  Title,
  glass,
  radius,
  space,
  useTheme,
} from './ui';

export default function DailyAlbumDayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const theme = useTheme();
  const { family } = useFamily();
  const day = Array.isArray(params.day) ? params.day[0] : params.day;
  const timezone = (Array.isArray(params.timezone) ? params.timezone[0] : params.timezone)
    || Intl.DateTimeFormat().resolvedOptions().timeZone
    || 'UTC';
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    listMomentDayDetails(family?.id, { day, timezone })
      .then((rows) => { if (alive) setRecords(rows || []); })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [day, family?.id, timezone]);

  const counts = useMemo(() => records.reduce((total, record) => ({
    photos: total.photos + Number(record.imageCount || 0),
    videos: total.videos + Number(record.videoCount || 0),
  }), { photos: 0, videos: 0 }), [records]);

  const openMoment = (record) => {
    if (!record?.moment?.id) return;
    router.push({ pathname: '/moment/[momentId]', params: { momentId: record.moment.id } });
  };

  return (
    <Screen variant="dawn" bare contentStyle={styles.screen}>
      <FlatList
        data={records}
        numColumns={2}
        keyExtractor={(record) => record.key}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.content}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openMoment(item)}
            accessibilityRole="button"
            accessibilityLabel={`Open memory from ${formatTime(item.capturedAt)}`}
            style={[styles.tile, { backgroundColor: theme.semantic.cardAlt }]}
          >
            {item.thumbUrl ? (
              <Image source={{ uri: item.thumbUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <PhotoPlaceholder seed={item.key} style={StyleSheet.absoluteFill} />
            )}
            <View style={styles.scrim} />
            {item.videoCount ? (
              <View style={styles.playBadge}>
                <Ionicons name="play" size={14} color={theme.colors.onPrimary} />
              </View>
            ) : null}
            <Caption style={styles.time}>{formatTime(item.capturedAt)}</Caption>
          </Pressable>
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
                <Eyebrow>One day</Eyebrow>
                <Title style={styles.title}>{formatDayTitle(day)}</Title>
                <Caption>{formatCounts(counts.photos, counts.videos)}</Caption>
              </View>
            </View>
            <Body>Every distinct memory kept for this day stays here; open any one for its full story.</Body>
            {loading ? <ActivityIndicator color={theme.semantic.primary} /> : null}
            {error ? <Caption>The memories from this day could not finish loading. Go back and try again.</Caption> : null}
          </View>
        )}
        ListEmptyComponent={!loading && !error ? (
          <View style={styles.empty}>
            <Title>No saved memories on this day.</Title>
            <Body>This remains an honest gap in the family record.</Body>
          </View>
        ) : null}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

function formatDayTitle(day) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) ? new Date(`${day}T12:00:00`) : new Date(day);
  if (Number.isNaN(date.getTime())) return 'Saved day';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Saved memory';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatCounts(photos, videos) {
  return [
    photos ? `${photos} ${photos === 1 ? 'photo' : 'photos'}` : '',
    videos ? `${videos} ${videos === 1 ? 'video' : 'videos'}` : '',
  ].filter(Boolean).join(' · ') || 'Saved memories';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.md },
  row: { gap: space.md },
  header: { paddingTop: space.sm, paddingBottom: space.lg, gap: space.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerText: { flex: 1 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 26, lineHeight: 32, marginTop: space.xs },
  tile: { flex: 1, aspectRatio: 0.82, borderRadius: radius.lg, overflow: 'hidden', marginBottom: space.md },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: glass.mediaScrim },
  playBadge: {
    position: 'absolute',
    left: space.sm,
    top: space.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: glass.mediaChrome,
    alignItems: 'center',
    justifyContent: 'center',
  },
  time: { position: 'absolute', left: space.sm, bottom: space.sm, color: glass.inverseTextBody },
  empty: { minHeight: 320, alignItems: 'center', justifyContent: 'center', gap: space.sm },
});
