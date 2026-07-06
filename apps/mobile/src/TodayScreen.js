import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  AppShell,
  AnimatedPressable,
  Body,
  Button,
  Caption,
  Card,
  Eyebrow,
  EntranceView,
  ENTRANCE_STAGGER_MS,
  PhotoPlaceholder,
  SegmentedContent,
  SegmentedControl,
  Title,
  glass,
  radius,
  space,
  useTheme,
} from './ui';
import { useFamily } from './FamilyContext';
import { useAuth } from './AuthContext';
import { dismissCatchupGoal } from './catchupDismissals';
import { selectDayCardNudge } from './dayCardNudge';
import { ageAt, formatAge, localCalendarDayDiff, localDateFromISODate } from './ageModel.js';
import { deleteForTag } from './photoSync';
import PhotoActionSheet from './PhotoActionSheet';
import { pickDigestCoverUri } from './digestCover';
import { countLabel } from './plural';
import { useRitualHomeData } from './useRitualHomeData';
import { buildPlaceClusters } from './visionSceneLabeler';
import { describeMediaLibraryChange, useMediaLibraryChangeObserver } from './mediaLibraryChanges';
import { useICloudRetryCount } from './iCloudRetryQueue';
import * as Scan from './scanController';

export default function TodayScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { family } = useFamily();
  const { user } = useAuth();
  const [segment, setSegment] = useState('timeline');
  const [actionPhoto, setActionPhoto] = useState(null);
  const { pendingChange } = useMediaLibraryChangeObserver({
    familyId: family?.id,
    userId: user?.id,
    enabled: !!family?.id && !!user?.id,
  });
  const {
    status,
    promptState,
    digest,
    catchupGoal,
    digestUnread,
    sharedPhotos,
    recentPhotos,
    todayMatches,
    firstsSummary,
    membersById,
    refresh,
    snoozePrompt: snoozePromptCached,
  } = useRitualHomeData({
    familyId: family?.id,
    userId: user?.id,
    babyBirthday: family?.babyBirthday,
    babyName: family?.babyName,
  });

  const ageInfo = useMemo(() => {
    if (!family?.babyBirthday) return { label: '' };
    const value = ageAt(family.babyBirthday, Date.now());
    return { label: value ? formatAge(value) : '' };
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
    if (photo.moment_id) {
      router.push({ pathname: '/moment/[momentId]', params: { momentId: photo.moment_id } });
      return;
    }
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
  const mineAnswered = !!(mine?.response_text || mine?.moment_id);
  const promptAnswerLabel = useMemo(
    () => promptAnswerStatusLabel({ promptState, membersById, userId: user?.id }),
    [membersById, promptState, user?.id],
  );
  const snoozed = promptState?.snoozed;
  const loadingCold = status === 'idle' || status === 'refreshing';
  const activeSegment = segment === 'on-this-day' && !todayMatches.length ? 'timeline' : segment;
  const scanState = Scan.useScanState();
  const waitingReviewCount = scanState.matches.reduce((count, match) => count + (!match.saved ? 1 : 0), 0);
  const nudge = selectDayCardNudge({
    waitingReviewCount,
    catchupGoal,
    promptState,
    digestUnread,
    babyName: family?.babyName,
  });
  const onDismissCatchup = async () => {
    if (!family?.id || !nudge.goalKey) return;
    await dismissCatchupGoal(family.id, nudge.goalKey);
    refresh({ force: true });
  };
  const monthSections = useMemo(
    () => groupByMonth(sharedPhotos, family?.babyBirthday),
    [family?.babyBirthday, sharedPhotos],
  );
  const places = useMemo(
    () => buildPlaceClusters({ shared: sharedPhotos, metadataByKey: {}, memoriesByKey: {} }),
    [sharedPhotos],
  );
  const digestCoverUri = useMemo(
    () => pickDigestCoverUri({
      coverPhoto: digest.coverPhoto,
      latestFirst: firstsSummary?.latest,
      sharedPhotos,
    }),
    [digest.coverPhoto, firstsSummary?.latest, sharedPhotos],
  );
  // Only media that can actually render — stale rows fall through to the cover chain (B2).
  const digestStripMedia = useMemo(
    () => (digest.representativeMedia || []).filter((media) => media.thumbUrl || media.fullUrl),
    [digest.representativeMedia],
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
    <AppShell
      active="today"
      title={title}
      subtitle={ageInfo.label ? formatAgeLine(ageInfo.label) : undefined}
      right={<SearchPill onPress={() => router.push({ pathname: '/library', params: { segment: 'search' } })} />}
    >
      <ScanBanner
        babyName={family?.babyName}
        familyId={family?.id}
        userId={user?.id}
        pendingChange={pendingChange}
        onPress={() => router.push('/review')}
        onScanPress={() => router.push('/scan')}
      />

      <EntranceView index={0}>
        <AnimatedPressable
          onPress={nudge.route ? () => router.push(nudge.route) : undefined}
          disabled={!nudge.route}
          accessibilityRole="button"
          accessibilityLabel={nudge.title}
          accessibilityState={{ disabled: !nudge.route }}
        >
          <Card style={styles.dayCard}>
            <View style={styles.dayRow}>
              <View style={styles.dayText}>
                <Eyebrow>{nudge.eyebrow}</Eyebrow>
                <Body>{nudge.title}</Body>
              </View>
              <Caption style={[styles.dayCount, { color: theme.semantic.secondary }]}>day {daysSince(family?.babyBirthday) ?? '...'}</Caption>
            </View>
            {nudge.kind === 'catchup' ? (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation?.();
                  onDismissCatchup();
                }}
                accessibilityRole="button"
                accessibilityLabel="Not yet"
                hitSlop={8}
                style={styles.skipPrompt}
              >
                <Caption style={{ color: theme.semantic.textMuted }}>Not yet</Caption>
              </Pressable>
            ) : null}
          </Card>
        </AnimatedPressable>
      </EntranceView>

      {prompt && !snoozed ? (
        mineAnswered ? (
          <EntranceView index={1}>
            <AnimatedPressable
              onPress={() => router.push('/prompt')}
              accessibilityRole="button"
              accessibilityLabel="Edit today's prompt response"
            >
              <Card variant="muted">
                <View style={styles.promptAnsweredRow}>
                  <View style={[styles.promptSavedIcon, { backgroundColor: theme.colors.primarySoft }]}>
                    <Ionicons name="checkmark" size={16} color={theme.semantic.primary} />
                  </View>
                  <View style={styles.promptAnsweredCopy}>
                    <Eyebrow>Daily prompt</Eyebrow>
                    <Title style={styles.promptSavedTitle}>Saved for today.</Title>
                    {promptAnswerLabel ? <Caption>{promptAnswerLabel}</Caption> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.semantic.textMuted} />
                </View>
              </Card>
            </AnimatedPressable>
          </EntranceView>
        ) : (
          <EntranceView index={1}>
            <Card variant="muted">
              <Eyebrow>Daily prompt</Eyebrow>
              <Title style={styles.promptText}>{prompt.text}</Title>
              {promptAnswerLabel ? <Caption>{promptAnswerLabel}</Caption> : null}
              <View style={styles.actionRow}>
                <Button
                  size="sm"
                  fullWidth={false}
                  variant="dark"
                  onPress={() => router.push('/prompt')}
                  icon={<Ionicons name="mic-outline" size={14} color={theme.isDark ? theme.colors.ink : theme.colors.bg} />}
                >
                  Voice note
                </Button>
                <Button
                  size="sm"
                  fullWidth={false}
                  variant="ghost"
                  onPress={() => router.push('/prompt')}
                  icon={<Ionicons name="pencil-outline" size={14} color={theme.semantic.primary} />}
                >
                  {mine?.response_text ? 'Edit note' : 'Write it'}
                </Button>
              </View>
              <Pressable
                onPress={snoozePrompt}
                accessibilityRole="button"
                accessibilityLabel="Skip today's prompt"
                hitSlop={8}
                style={styles.skipPrompt}
              >
                <Caption style={{ color: theme.semantic.textMuted }}>Skip today</Caption>
              </Pressable>
            </Card>
          </EntranceView>
        )
      ) : loadingCold ? (
        <EntranceView index={1}>
          <Card variant="muted">
            <Eyebrow>Daily prompt</Eyebrow>
            <Title style={styles.promptText}>Loading today's question...</Title>
          </Card>
        </EntranceView>
      ) : null}

      <EntranceView index={2}>
        <AnimatedPressable
          onPress={() => router.push('/digest')}
          accessibilityRole="button"
          accessibilityLabel="Open this week's digest"
        >
          <Card>
            <View style={styles.sectionHeader}>
              <View>
                <Eyebrow>This week's digest</Eyebrow>
                <Title style={styles.digestTitle}>{digest.headline}</Title>
              </View>
              <View style={styles.cardCue}>
                <Caption>{formatWeek(digest.weekStart, digest.weekEnd)}</Caption>
                <Ionicons name="chevron-forward" size={17} color={theme.semantic.textMuted} />
              </View>
            </View>
            {digestStripMedia.length ? (
              <View style={styles.digestStrip}>
                {digestStripMedia.slice(0, 4).map((media, index) => (
                  <Pressable
                    key={media.mediaId || `${media.momentId}:${index}`}
                    onPress={(event) => {
                      event.stopPropagation?.();
                      if (media.momentId) {
                        router.push({ pathname: '/moment/[momentId]', params: { momentId: media.momentId } });
                      }
                    }}
                    disabled={!media.momentId}
                    accessibilityRole="button"
                    accessibilityLabel={`Open digest moment ${index + 1}`}
                    accessibilityState={{ disabled: !media.momentId }}
                    style={[styles.digestStripTile, { backgroundColor: theme.semantic.cardAlt }]}
                  >
                    <Image
                      source={{ uri: media.thumbUrl || media.fullUrl }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  </Pressable>
                ))}
              </View>
            ) : digestCoverUri ? (
              <View style={styles.digestCover}>
                <Image
                  source={{ uri: digestCoverUri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              </View>
            ) : null}
            <View style={styles.digestGrid}>
              <Metric label={countLabel(digest.momentCount ?? digest.photoCount, 'moment')} value={digest.momentCount ?? digest.photoCount} />
              <Metric label={countLabel(digest.milestoneCount ?? digest.firstsCount, 'milestone')} value={digest.milestoneCount ?? digest.firstsCount} />
              <Metric label="voice" value={digest.voiceNoteCount || 0} />
              <Metric label={countLabel(digest.letterCount, 'letter')} value={digest.letterCount} />
            </View>
          </Card>
        </AnimatedPressable>
      </EntranceView>

      <EntranceView index={3}>
        <MilestoneTeaser
          summary={firstsSummary}
          babyName={family?.babyName}
          onPress={() => router.push('/firsts')}
          onAdd={() => router.push('/first-compose')}
        />
      </EntranceView>

      {/* The control sits directly above the content it switches (H1). */}
      <EntranceView index={4}>
        <SegmentedControl
          value={activeSegment}
          onChange={setSegment}
          options={[
            { value: 'timeline', label: 'Timeline' },
            { value: 'places', label: 'Places' },
            // A segment that is always empty is worse than no segment (A4).
            ...(todayMatches.length ? [{ value: 'on-this-day', label: 'On this day' }] : []),
          ]}
        />
      </EntranceView>

      <EntranceView index={5}>
        <SegmentedContent segmentKey={activeSegment}>
          {activeSegment === 'timeline' ? (
            <>
              <PhotoRail
                title="For you, today"
                photos={recentPhotos}
                babyBirthday={family?.babyBirthday}
                onPress={openPhoto}
                onLongPress={onLongPressPhoto}
                onSeeAll={() => router.push('/library')}
                empty="No saved moments yet."
                emptyActionLabel="Add your first"
                onEmptyAction={() => router.push('/add')}
              />
              <MonthTimeline
                sections={monthSections}
                onPress={openPhoto}
                onLongPress={onLongPressPhoto}
                youUserId={user?.id}
              />
            </>
          ) : activeSegment === 'on-this-day' ? (
            <PhotoRail
              title="On this day"
              photos={todayMatches}
              babyBirthday={family?.babyBirthday}
              onPress={openPhoto}
              onLongPress={onLongPressPhoto}
              empty="No matching moments from this date yet."
              onSeeAll={() => setSegment('timeline')}
            />
          ) : (
            <PlacesPreview places={places} onPress={openPhoto} onLongPress={onLongPressPhoto} />
          )}
        </SegmentedContent>
      </EntranceView>

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

function promptAnswerStatusLabel({ promptState, membersById = {}, userId } = {}) {
  const answered = (promptState?.responses || []).filter((row) => row?.response_text || row?.moment_id);
  if (!answered.length) return null;
  const mineAnswered = promptState?.mineAnswered
    ?? answered.some((row) => row.author_user_id === userId);
  const partnerResponse = answered.find((row) => row.author_user_id !== userId);
  const partnerId = partnerResponse?.author_user_id
    || Object.keys(membersById || {}).find((id) => id && id !== userId);
  const partnerName = promptMemberName(membersById?.[partnerId], 'your co-parent');
  const partnerNameAtStart = partnerName === 'your co-parent' ? 'Your co-parent' : partnerName;

  if (mineAnswered) {
    if (promptState?.partnerAnswered || partnerResponse) return `${partnerNameAtStart} answered too`;
    return `You answered · ${partnerName} hasn't yet`;
  }
  if (partnerResponse) return `${partnerNameAtStart} answered · you haven't yet`;
  return 'Someone answered';
}

function promptMemberName(value, fallback) {
  const name = String(value || '').trim();
  if (!name) return fallback;
  return name.split(/\s+/)[0] || fallback;
}

function SearchPill({ onPress }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Search archive"
      style={[styles.searchPill, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }]}
    >
      <Ionicons name="search" size={14} color={theme.semantic.textSoft} />
      <Caption style={styles.searchPillText}>Search</Caption>
    </Pressable>
  );
}

function MilestoneTeaser({ summary, babyName, onPress, onAdd }) {
  const theme = useTheme();
  const latest = summary?.latest || null;
  if (latest) {
    return (
      <AnimatedPressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Open firsts. Latest milestone: ${latest.title}`}
      >
        <Card variant="muted">
          <View style={styles.sectionHeader}>
            <View style={styles.teaserCopy}>
              <Eyebrow>Milestone</Eyebrow>
              <Title style={styles.teaserTitle}>{latest.title}</Title>
              <Body>{formatShortDate(latest.happened_at || latest.created_at)} · {summary.count} saved so far</Body>
            </View>
            <View style={[styles.teaserIcon, { backgroundColor: theme.colors.primarySoft }]}>
              <Ionicons name="flag-outline" size={20} color={theme.semantic.primary} />
            </View>
          </View>
        </Card>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      onPress={onAdd}
      accessibilityRole="button"
      accessibilityLabel={`Add ${babyName ? `${babyName}'s` : 'a'} first`}
    >
      <Card variant="muted">
        <View style={styles.sectionHeader}>
          <View style={styles.teaserCopy}>
            <Eyebrow>Milestone</Eyebrow>
            <Title style={styles.teaserTitle}>Save {babyName ? `${babyName}'s` : 'their'} first tiny win.</Title>
            <Body>Start with a smile, laugh, roll, word, or any first worth keeping.</Body>
          </View>
          <View style={[styles.teaserIcon, { backgroundColor: theme.colors.primarySoft }]}>
            <Ionicons name="add-circle-outline" size={21} color={theme.semantic.primary} />
          </View>
        </View>
      </Card>
    </AnimatedPressable>
  );
}

function PhotoRail({
  title,
  photos,
  babyBirthday,
  onPress,
  onLongPress,
  onSeeAll,
  empty = 'No saved photos yet.',
  emptyActionLabel,
  onEmptyAction,
}) {
  const theme = useTheme();
  return (
    <View>
      <View style={styles.sectionHeader}>
        <Title style={styles.railTitle}>{title}</Title>
        {onSeeAll ? (
          <Pressable
            onPress={onSeeAll}
            accessibilityRole="button"
            accessibilityLabel={`See all ${title}`}
            hitSlop={8}
            style={styles.inlineHeaderAction}
          >
            <Caption>See all</Caption>
          </Pressable>
        ) : null}
      </View>
      {photos.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoRailContent}
        >
          {photos.map((photo, index) => (
            <EntranceView key={`${photo.asset_owner_user_id}:${photo.asset_id}`} index={index} delayMs={ENTRANCE_STAGGER_MS * 2}>
              <Pressable
                onPress={() => onPress(photo)}
                onLongPress={() => onLongPress?.(photo)}
                delayLongPress={220}
                accessibilityRole="button"
                accessibilityLabel={`Open ${title} moment ${index + 1}`}
                accessibilityHint={onLongPress ? 'Long press for more actions.' : undefined}
                style={styles.photoRailTile}
              >
                {photo.thumbUrl || photo.fullUrl ? (
                  <Image source={{ uri: photo.thumbUrl || photo.fullUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <PhotoPlaceholder style={StyleSheet.absoluteFill} />
                )}
                <View style={[styles.photoChip, { backgroundColor: glass.mediaChrome, borderColor: glass.mediaChromeBorder }]}>
                  <Caption style={[styles.photoChipText, { color: theme.colors.bg }]}>
                    {railChipLabel({ photo, index, babyBirthday, title })}
                  </Caption>
                </View>
              </Pressable>
            </EntranceView>
          ))}
        </ScrollView>
      ) : (
        <Card variant="ghost">
          <Body>{empty}</Body>
          {emptyActionLabel ? (
            <Button
              size="sm"
              fullWidth={false}
              style={styles.emptyRailButton}
              onPress={onEmptyAction}
              icon={<Ionicons name="add" size={14} color={theme.colors.onPrimary} />}
            >
              {emptyActionLabel}
            </Button>
          ) : null}
        </Card>
      )}
    </View>
  );
}

function MonthTimeline({ sections, onPress, onLongPress, youUserId }) {
  if (!sections.length) return null;
  return (
    <View style={styles.monthList}>
      {sections.map((section, sectionIndex) => (
        <EntranceView key={section.key} index={sectionIndex} delayMs={ENTRANCE_STAGGER_MS * 3}>
          <Card padding="md" style={styles.monthCard}>
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
                  accessibilityRole="button"
                  accessibilityLabel={`Open moment ${index + 1} from ${section.monthLabel}`}
                  accessibilityHint="Long press for more actions."
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
        </EntranceView>
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
      {places.slice(0, 6).map((place, placeIndex) => (
        <EntranceView key={place.id} index={placeIndex} delayMs={ENTRANCE_STAGGER_MS * 2}>
          <Card padding="md" style={styles.placeCard}>
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
                  accessibilityRole="button"
                  accessibilityLabel={`Open moment from ${place.label}`}
                  accessibilityHint="Long press for more actions."
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
        </EntranceView>
      ))}
    </View>
  );
}

function ScanBanner({ babyName, familyId, userId, pendingChange, onPress, onScanPress }) {
  const scan = Scan.useScanState();
  const waiting = scan.matches.reduce((count, match) => count + (!match.saved ? 1 : 0), 0);
  const queued = scan.autoSaveQueueLength || 0;
  const iCloudRetry = useICloudRetryCount({
    familyId,
    userId,
    refreshKey: `${scan.phase}:${scan.autoSaveErrors}:${scan.autoSavedCount}:${pendingChange?.changedAt || ''}`,
  });
  const iCloudWaiting = iCloudRetry.count || 0;
  const iCloudLabel = `${iCloudWaiting.toLocaleString()} ${iCloudWaiting === 1 ? 'photo is' : 'photos are'} waiting for iCloud`;
  if (scan.phase === 'idle') {
    if (iCloudWaiting > 0) {
      return (
        <Pressable
          onPress={onScanPress}
          accessibilityRole="button"
          accessibilityLabel="Retry iCloud photos"
          style={styles.scanBanner}
        >
          <Ionicons name="cloud-download-outline" size={17} />
          <View style={{ flex: 1 }}>
            <Body style={styles.scanTitle}>{iCloudLabel}</Body>
            <Caption>Open Photos or try again when the originals finish downloading.</Caption>
          </View>
          <Ionicons name="chevron-forward" size={17} />
        </Pressable>
      );
    }
    if (!pendingChange) return null;
    return (
      <Pressable
        onPress={onScanPress}
        accessibilityRole="button"
        accessibilityLabel="Scan photo library updates"
        style={styles.scanBanner}
      >
        <Ionicons name="sync-outline" size={17} />
        <View style={{ flex: 1 }}>
          <Body style={styles.scanTitle}>Photo library changed</Body>
          <Caption>{describeMediaLibraryChange(pendingChange)} · tap to scan updates.</Caption>
        </View>
        <Ionicons name="chevron-forward" size={17} />
      </Pressable>
    );
  }
  if ((scan.phase === 'done' || scan.phase === 'aborted') && queued === 0 && waiting === 0 && iCloudWaiting === 0) return null;
  const pct = scan.total ? Math.min(100, Math.round((scan.seen / scan.total) * 100)) : null;
  const title = scan.phase === 'scanning'
    ? `Scanning${pct != null ? ` · ${pct}%` : ''}`
    : queued > 0
      ? `Auto-saving ${queued.toLocaleString()}`
      : iCloudWaiting > 0
        ? iCloudLabel
        : `${waiting.toLocaleString()} new ${waiting === 1 ? 'moment' : 'moments'} of ${babyName || 'your little one'}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Review scan matches"
      style={styles.scanBanner}
    >
      <Ionicons name="sparkles-outline" size={17} />
      <View style={{ flex: 1 }}>
        <Body style={styles.scanTitle}>{title}</Body>
        <Caption>
          {iCloudWaiting > 0
            ? `${iCloudLabel}; they will retry on the next scan.`
            : waiting > 0
              ? 'Take a look before they join the vault.'
              : 'Tap to review the media that needs a parent.'}
        </Caption>
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
  const start = localDateFromISODate(isoDate);
  if (!start) return null;
  return Math.max(0, localCalendarDayDiff(start, new Date()));
}

function formatAgeLine(label) {
  if (!label) return '';
  if (/\bold$/i.test(label) || label === 'birth day' || label.startsWith('before')) return label;
  return `${label} old`;
}

function railChipLabel({ photo, index, babyBirthday, title }) {
  if (String(title || '').toLowerCase().includes('on this day')) return photo?.onThisDayLabel || 'On this day';
  if (babyBirthday && photo?.creation_time) {
    const age = ageAt(babyBirthday, new Date(photo.creation_time).getTime());
    const label = formatAge(age);
    if (label) return label.replace(' old', '');
  }
  return index === 0 ? 'For you' : 'Today';
}

function formatWeek(start, end) {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  return `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function formatShortDate(value) {
  if (!value) return 'Someday';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  searchPill: {
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginRight: space.sm,
  },
  searchPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  dayCard: {
    borderRadius: 14,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayCount: {
    fontStyle: 'italic',
    fontWeight: '800',
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
  promptAnsweredRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  promptSavedIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptAnsweredCopy: {
    flex: 1,
    minWidth: 0,
  },
  promptSavedTitle: {
    fontSize: 20,
    lineHeight: 25,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.lg,
  },
  skipPrompt: {
    alignSelf: 'flex-start',
    marginTop: space.sm,
    minHeight: 28,
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.md,
  },
  inlineHeaderAction: {
    minHeight: 44,
    justifyContent: 'center',
  },
  cardCue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  digestStrip: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.lg,
  },
  digestStripTile: {
    flex: 1,
    aspectRatio: 0.82,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  metric: {
    flex: 1,
  },
  metricValue: {
    fontSize: 21,
    lineHeight: 24,
  },
  teaserCopy: {
    flex: 1,
    minWidth: 0,
  },
  teaserTitle: {
    fontSize: 22,
    lineHeight: 27,
    marginTop: space.xs,
    marginBottom: space.xs,
  },
  teaserIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
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
  photoRailContent: {
    gap: space.sm,
    paddingRight: space.xl,
  },
  photoRailTile: {
    width: 122,
    height: 156,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  photoChip: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
  },
  photoChipText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    textTransform: 'none',
    letterSpacing: 0,
  },
  emptyRailButton: {
    marginTop: space.md,
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
    backgroundColor: glass.softWhiteDot,
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
    backgroundColor: glass.softWhitePanel,
  },
  scanTitle: {
    color: undefined,
    fontSize: 14,
    lineHeight: 18,
  },
});
