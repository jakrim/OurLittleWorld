import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  AppShell,
  Body,
  Button,
  Caption,
  Card,
  Eyebrow,
  PhotoPlaceholder,
  SegmentedControl,
  Title,
  radius,
  space,
  useTheme,
} from './ui';
import { useFamily } from './FamilyContext';
import { useAuth } from './AuthContext';
import { ageAt, formatAge } from './photos';
import { deleteForTag } from './photoSync';
import PhotoActionSheet from './PhotoActionSheet';
import { useRitualHomeData } from './useRitualHomeData';
import { buildPlaceClusters } from './visionSceneLabeler';
import * as Scan from './scanController';

export default function TodayScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { family } = useFamily();
  const { user } = useAuth();
  const [segment, setSegment] = useState('timeline');
  const [actionPhoto, setActionPhoto] = useState(null);
  const {
    status,
    promptState,
    digest,
    sharedPhotos,
    recentPhotos,
    todayMatches,
    refresh,
    snoozePrompt: snoozePromptCached,
  } = useRitualHomeData({ familyId: family?.id, userId: user?.id });

  const age = useMemo(() => {
    if (!family?.babyBirthday) return '';
    return formatAge(ageAt(family.babyBirthday, Date.now()));
  }, [family?.babyBirthday]);

  const snoozePrompt = async () => {
    if (!family?.id) return;
    try {
      await snoozePromptCached();
    } catch (err) {
      Alert.alert('Could not snooze', err?.message || String(err));
    }
  };

  const openPhoto = (photo) => {
    if (!photo?.asset_id) return;
    const params = { assetId: photo.asset_id };
    if (photo.asset_owner_user_id) params.ownerUserId = photo.asset_owner_user_id;
    const previewUri = photo.thumbUrl || photo.fullUrl;
    if (previewUri) params.uri = previewUri;
    if (photo.creation_time) params.creationTime = String(new Date(photo.creation_time).getTime());
    router.push({ pathname: '/photo/[assetId]', params });
  };

  const onLongPressPhoto = (photo) => {
    setActionPhoto(photo);
  };

  const removePhoto = async () => {
    if (!family?.id || !actionPhoto) return;
    const photo = actionPhoto;
    setActionPhoto(null);
    try {
      await deleteForTag({
        familyId: family.id,
        assetOwnerUserId: photo.asset_owner_user_id,
        assetId: photo.asset_id,
      });
      refresh({ force: true });
    } catch (err) {
      Alert.alert('Could not remove', err?.message || String(err));
    }
  };

  const title = family?.babyName ? `${family.babyName}'s world` : 'today';
  const prompt = promptState?.prompt;
  const mine = promptState?.mine;
  const snoozed = promptState?.snoozed;
  const loadingCold = status === 'idle' || status === 'refreshing';
  const monthSections = useMemo(
    () => groupByMonth(sharedPhotos, family?.babyBirthday),
    [family?.babyBirthday, sharedPhotos],
  );
  const places = useMemo(
    () => buildPlaceClusters({ shared: sharedPhotos, metadataByKey: {}, memoriesByKey: {} }),
    [sharedPhotos],
  );

  const photoSheetActions = actionPhoto ? [
    {
      icon: 'open-outline',
      label: 'Open moment',
      onPress: () => {
        const photo = actionPhoto;
        setActionPhoto(null);
        openPhoto(photo);
      },
    },
    {
      icon: 'trash-outline',
      label: 'Remove from timeline',
      destructive: true,
      onPress: removePhoto,
    },
  ] : [];

  return (
    <AppShell active="today" title={title} subtitle={age ? `${age} old` : undefined}>
      <ScanBanner onPress={() => router.push('/review')} />

      <Card style={styles.dayCard}>
        <View style={styles.dayRow}>
          <View style={[styles.dayBadge, { backgroundColor: theme.colors.primarySoft }]}>
            <Title style={[styles.dayNumber, { color: theme.semantic.primary }]}>{new Date().getDate()}</Title>
          </View>
          <View style={styles.dayText}>
            <Eyebrow>Today</Eyebrow>
            <Body>{age ? `${age} old` : 'A small place for today.'}</Body>
          </View>
          <Caption>day {daysSince(family?.babyBirthday) || '...'}</Caption>
        </View>
      </Card>

      <SegmentedControl
        value={segment}
        onChange={setSegment}
        options={[
          { value: 'timeline', label: 'Timeline' },
          { value: 'places', label: 'Places' },
          { value: 'on-this-day', label: 'On this day' },
        ]}
      />

      {prompt && !snoozed ? (
        <Card variant="muted">
          <Eyebrow>Daily prompt</Eyebrow>
          <Title style={styles.promptText}>{prompt.text}</Title>
          {mine?.response_text ? (
            <Body>{mine.response_text}</Body>
          ) : null}
          {promptState?.answeredCount > 0 ? (
            <Caption>
              {promptState.answeredCount === 1 ? '1 parent answered' : `${promptState.answeredCount} parents answered`}
            </Caption>
          ) : null}
          <View style={styles.actionRow}>
            <Button
              size="sm"
              fullWidth={false}
              variant="dark"
              onPress={() => router.push('/prompt')}
              icon={<Ionicons name="pencil-outline" size={14} color={theme.isDark ? theme.colors.ink : theme.colors.bg} />}
            >
              {mine?.response_text ? 'Edit note' : 'Write it'}
            </Button>
            {!mine?.response_text ? (
              <Button size="sm" fullWidth={false} variant="quiet" onPress={snoozePrompt}>
                Snooze
              </Button>
            ) : null}
          </View>
        </Card>
      ) : loadingCold ? (
        <Card variant="muted">
          <Eyebrow>Daily prompt</Eyebrow>
          <Title style={styles.promptText}>Loading today's question...</Title>
        </Card>
      ) : null}

      <Card>
        <View style={styles.sectionHeader}>
          <View>
            <Eyebrow>This week's digest</Eyebrow>
            <Title style={styles.digestTitle}>{digest.headline}</Title>
          </View>
          <Caption>{formatWeek(digest.weekStart, digest.weekEnd)}</Caption>
        </View>
        <View style={styles.digestCover}>
          {digest.coverPhoto?.thumbUrl || digest.coverPhoto?.fullUrl ? (
            <Image
              source={{ uri: digest.coverPhoto.thumbUrl || digest.coverPhoto.fullUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <PhotoPlaceholder style={StyleSheet.absoluteFill} />
          )}
        </View>
        <View style={styles.digestGrid}>
          <Metric label="photos" value={digest.photoCount} />
          <Metric label="notes" value={digest.memoryCount} />
          <Metric label="firsts" value={digest.firstsCount} />
          <Metric label="letters" value={digest.letterCount} />
        </View>
      </Card>

      {segment === 'timeline' ? (
        <>
          <PhotoRail title="For you, today" photos={recentPhotos} onPress={openPhoto} onLongPress={onLongPressPhoto} />
          <MonthTimeline
            sections={monthSections}
            onPress={openPhoto}
            onLongPress={onLongPressPhoto}
            youUserId={user?.id}
          />
        </>
      ) : segment === 'on-this-day' ? (
        <PhotoRail title="On this day" photos={todayMatches} onPress={openPhoto} onLongPress={onLongPressPhoto} empty="No matching moments from this date yet." />
      ) : (
        <PlacesPreview places={places} onPress={openPhoto} onLongPress={onLongPressPhoto} />
      )}

      <PhotoActionSheet
        photo={actionPhoto}
        visible={!!actionPhoto}
        onClose={() => setActionPhoto(null)}
        actions={photoSheetActions}
        subtitle={actionPhoto ? 'What should happen with this moment?' : undefined}
      />
    </AppShell>
  );
}

function PhotoRail({ title, photos, onPress, onLongPress, empty = 'No saved photos yet.' }) {
  return (
    <View>
      <View style={styles.sectionHeader}>
        <Title style={styles.railTitle}>{title}</Title>
        <Caption>See all</Caption>
      </View>
      {photos.length ? (
        <View style={styles.photoGrid}>
          {photos.map((photo) => (
            <Pressable
              key={`${photo.asset_owner_user_id}:${photo.asset_id}`}
              onPress={() => onPress(photo)}
              onLongPress={() => onLongPress?.(photo)}
              delayLongPress={220}
              style={styles.photoTile}
            >
              {photo.thumbUrl || photo.fullUrl ? (
                <Image source={{ uri: photo.thumbUrl || photo.fullUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <PhotoPlaceholder style={StyleSheet.absoluteFill} />
              )}
            </Pressable>
          ))}
        </View>
      ) : (
        <Card variant="ghost">
          <Body>{empty}</Body>
        </Card>
      )}
    </View>
  );
}

function MonthTimeline({ sections, onPress, onLongPress, youUserId }) {
  if (!sections.length) return null;
  return (
    <View style={styles.monthList}>
      {sections.map((section) => (
        <Card key={section.key} padding="md" style={styles.monthCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Eyebrow>{section.monthLabel}</Eyebrow>
              {section.ageLabel ? <Title style={styles.monthAge}>{section.ageLabel}</Title> : null}
            </View>
            <Caption>{section.items.length} moments</Caption>
          </View>
          <View style={styles.monthGrid}>
            {section.items.slice(0, 9).map((photo, index) => (
              <Pressable
                key={`${photo.asset_owner_user_id}:${photo.asset_id}`}
                onPress={() => onPress(photo)}
                onLongPress={() => onLongPress(photo)}
                delayLongPress={220}
                style={[styles.monthTile, index === 0 && styles.monthHeroTile]}
              >
                {photo.thumbUrl || photo.fullUrl ? (
                  <Image source={{ uri: photo.thumbUrl || photo.fullUrl }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <PhotoPlaceholder style={StyleSheet.absoluteFill} />
                )}
                {photo.asset_owner_user_id !== youUserId ? <View style={styles.partnerDot} /> : null}
              </Pressable>
            ))}
          </View>
        </Card>
      ))}
    </View>
  );
}

function PlacesPreview({ places, onPress, onLongPress }) {
  if (!places.length) {
    return (
      <Card>
        <Eyebrow>Places</Eyebrow>
        <Title style={styles.digestTitle}>No mapped moments yet.</Title>
        <Body>Photos with location data will collect here as the archive grows.</Body>
      </Card>
    );
  }
  return (
    <View style={styles.placeList}>
      {places.slice(0, 6).map((place) => (
        <Card key={place.id} padding="md" style={styles.placeCard}>
          <View style={styles.placeCopy}>
            <Eyebrow>{place.label}</Eyebrow>
            <Title style={styles.placeTitle}>{place.photos.length} moments here</Title>
            <Caption>{place.topScenes.slice(0, 2).join(' · ') || 'Family outing'}</Caption>
          </View>
          <View style={styles.placeThumbs}>
            {place.photos.slice(0, 3).map((photo) => (
              <Pressable
                key={`${photo.asset_owner_user_id}:${photo.asset_id}`}
                onPress={() => onPress(photo)}
                onLongPress={() => onLongPress(photo)}
                delayLongPress={220}
                style={styles.placeThumb}
              >
                {photo.thumbUrl || photo.fullUrl ? (
                  <Image source={{ uri: photo.thumbUrl || photo.fullUrl }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <PhotoPlaceholder style={StyleSheet.absoluteFill} />
                )}
              </Pressable>
            ))}
          </View>
        </Card>
      ))}
    </View>
  );
}

function ScanBanner({ onPress }) {
  const scan = Scan.useScanState();
  const borderline = scan.matches.reduce(
    (count, match) => count + ((!match.saved && (match.score ?? 0) < 0.78) ? 1 : 0),
    0,
  );
  const queued = scan.autoSaveQueueLength || 0;
  if (scan.phase === 'idle') return null;
  if ((scan.phase === 'done' || scan.phase === 'aborted') && queued === 0 && borderline === 0) return null;
  const pct = scan.total ? Math.min(100, Math.round((scan.seen / scan.total) * 100)) : null;
  const title = scan.phase === 'scanning'
    ? `Scanning${pct != null ? ` · ${pct}%` : ''}`
    : queued > 0
      ? `Auto-saving ${queued.toLocaleString()}`
      : `${borderline.toLocaleString()} borderline waiting`;
  return (
    <Pressable onPress={onPress} style={styles.scanBanner}>
      <Ionicons name="sparkles-outline" size={17} />
      <View style={{ flex: 1 }}>
        <Body style={styles.scanTitle}>{title}</Body>
        <Caption>Tap to review the photos that need a parent.</Caption>
      </View>
      <Ionicons name="chevron-forward" size={17} />
    </Pressable>
  );
}

function groupByMonth(items, babyBirthday) {
  const sorted = [...(items || [])]
    .filter((item) => item.creation_time)
    .sort((a, b) => +new Date(b.creation_time) - +new Date(a.creation_time));
  const buckets = new Map();
  for (const item of sorted) {
    const dt = new Date(item.creation_time);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    if (!buckets.has(key)) {
      const monthLabel = dt.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toLowerCase();
      const age = babyBirthday ? ageAt(babyBirthday, dt.getTime()) : null;
      buckets.set(key, {
        key,
        monthLabel,
        ageLabel: age ? formatAge(age) : '',
        items: [],
      });
    }
    buckets.get(key).items.push(item);
  }
  return Array.from(buckets.values());
}

function Metric({ label, value }) {
  return (
    <View style={styles.metric}>
      <Title style={styles.metricValue}>{value}</Title>
      <Caption>{label}</Caption>
    </View>
  );
}

function daysSince(isoDate) {
  if (!isoDate) return null;
  const start = new Date(`${isoDate}T00:00:00`);
  return Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000));
}

function formatWeek(start, end) {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  return `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

const styles = StyleSheet.create({
  dayCard: {
    borderRadius: 14,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  dayNumber: {
    fontSize: 21,
    lineHeight: 25,
  },
  dayText: {
    flex: 1,
  },
  promptText: {
    fontSize: 23,
    lineHeight: 29,
    marginTop: space.sm,
    marginBottom: space.lg,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.md,
  },
  digestTitle: {
    fontSize: 22,
    lineHeight: 27,
    marginTop: space.xs,
  },
  digestGrid: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.lg,
  },
  digestCover: {
    width: '100%',
    aspectRatio: 1.8,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginTop: space.lg,
  },
  metric: {
    flex: 1,
  },
  metricValue: {
    fontSize: 21,
    lineHeight: 24,
  },
  railTitle: {
    fontSize: 21,
    lineHeight: 26,
    marginBottom: space.md,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  photoTile: {
    width: '31.5%',
    aspectRatio: 0.82,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  monthList: {
    gap: space.lg,
  },
  monthCard: {
    borderRadius: 18,
  },
  monthAge: {
    fontSize: 21,
    lineHeight: 25,
    marginTop: 2,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.md,
  },
  monthTile: {
    width: '31.8%',
    aspectRatio: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  monthHeroTile: {
    width: '65.5%',
    aspectRatio: 1.35,
  },
  partnerDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.86)',
  },
  placeList: {
    gap: space.md,
  },
  placeCard: {
    borderRadius: 18,
  },
  placeCopy: {
    marginBottom: space.md,
  },
  placeTitle: {
    fontSize: 21,
    lineHeight: 25,
    marginTop: 2,
  },
  placeThumbs: {
    flexDirection: 'row',
    gap: space.xs,
  },
  placeThumb: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  scanBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.66)',
  },
  scanTitle: {
    color: undefined,
    fontSize: 14,
    lineHeight: 18,
  },
});
