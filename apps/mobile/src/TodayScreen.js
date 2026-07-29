import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
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
  Title,
  glass,
  radius,
  space,
  useTheme,
} from './ui';
import { useFamily } from './FamilyContext';
import { useAuth } from './AuthContext';
import { useBilling } from './BillingContext';
import { dismissCatchupGoal } from './catchupDismissals';
import { buildBlockingAssistantIssue, selectDayCardNudge } from './dayCardNudge';
import { selectTodaySuggestion } from './firstSuggestionModel';
import { readFirstSuggestionState, snoozeFirstSuggestion } from './firstSuggestionStore';
import { ageAt, formatAge, localCalendarDayDiff, localDateFromISODate } from './ageModel.js';
import { getUploadQueueStatus } from './photoSync';
import { buildPhotoIngestionTrustModel } from './photoIngestionTrustModel';
import { pickDigestCoverUri } from './digestCover';
import { digestHasContent } from './digestModel.js';
import { buildDigestViewStatusLabel, buildPromptAnswerStatusLabel } from './secondParentStateModel';
import { countLabel } from './plural';
import { getImportCalibration, getRecentAutoSaves } from './recognitionTrust';
import { useRitualHomeData } from './useRitualHomeData';
import { useMediaLibraryChangeObserver } from './mediaLibraryChanges';
import { useICloudRetryCount } from './iCloudRetryQueue';
import { formatMilestoneDisplayTitle } from './milestoneTitleModel';
import * as Scan from './scanController';
import { ensureNightlySession, getTonightSummary } from './candidateLedgerStore';
import { getNotificationPreferences } from './notificationSettings';
import { getFamilyRitualSettings } from './ritualSettings';
import { maybeScheduleTonightNotification } from './tonightNotifications';
import { refreshFamilySavedDayCoverage } from './savedDayCoverage';
import { trackAnalyticsEvent } from './analytics';
import { bucketCount } from './analyticsEventsModel';
import { analyticsEnvironment, analyticsPlatform } from './analyticsProductContext';
import { localDayInTimeZone } from './firstYearCatchupModel';

const EMPTY_UPLOAD_QUEUE = { total: 0, pending: 0, uploading: 0, failed: 0, lastError: null };
const EMPTY_PHOTO_TRUST_INPUTS = { calibration: null, recentAutoSaves: [] };

export default function TodayScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { family } = useFamily();
  const { user } = useAuth();
  const { entitlement, loading: billingLoading } = useBilling();
  const writer = ['creator', 'partner'].includes(family?.me?.role);
  const canUsePrivateDiscovery = !billingLoading
    && entitlement?.isActive === true
    && writer
    && !!family?.id
    && !!user?.id;
  const [uploadQueue, setUploadQueue] = useState(EMPTY_UPLOAD_QUEUE);
  const [photoTrustInputs, setPhotoTrustInputs] = useState(EMPTY_PHOTO_TRUST_INPUTS);
  const [tonightSummary, setTonightSummary] = useState(null);
  const { pendingChange } = useMediaLibraryChangeObserver({
    familyId: family?.id,
    userId: user?.id,
    enabled: canUsePrivateDiscovery,
  });
  const scanState = Scan.useScanState();
  const iCloudRetry = useICloudRetryCount({
    familyId: canUsePrivateDiscovery ? family.id : null,
    userId: canUsePrivateDiscovery ? user.id : null,
    refreshKey: `${scanState.phase}:${scanState.autoSaveErrors}:${scanState.autoSavedCount}:${pendingChange?.changedAt || ''}:${uploadQueue.total}`,
  });
  const {
    status,
    promptState,
    digest,
    catchupGoal,
    missedPrompt,
    goalRows,
    digestUnread,
    sharedPhotos,
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

  const title = family?.babyName ? `${family.babyName}'s world` : 'today';
  const prompt = promptState?.prompt;
  const mine = promptState?.mine;
  const mineAnswered = !!(mine?.response_text || mine?.moment_id);
  const promptAnswerLabel = useMemo(
    () => buildPromptAnswerStatusLabel({ promptState, membersById, userId: user?.id }),
    [membersById, promptState, user?.id],
  );
  const snoozed = promptState?.snoozed;
  const loadingCold = status === 'idle' || status === 'refreshing';
  const waitingReviewCount = scanState.matches.reduce((count, match) => count + (!match.saved ? 1 : 0), 0);
  const blockingIssue = useMemo(
    () => buildBlockingAssistantIssue({
      uploadQueue,
      iCloudWaitingCount: iCloudRetry.count,
      scanFailed: scanState.phase === 'failed',
    }),
    [iCloudRetry.count, scanState.phase, uploadQueue],
  );
  useFocusEffect(useCallback(() => {
    let alive = true;
    if (!canUsePrivateDiscovery) {
      setUploadQueue(EMPTY_UPLOAD_QUEUE);
      return () => {
        alive = false;
      };
    }
    getUploadQueueStatus({ familyId: family.id })
      .then((status) => {
        if (alive) setUploadQueue(status || EMPTY_UPLOAD_QUEUE);
      })
      .catch(() => {
        if (alive) setUploadQueue(EMPTY_UPLOAD_QUEUE);
      });
    return () => {
      alive = false;
    };
  }, [canUsePrivateDiscovery, family?.id]));
  // Device-local suggestion state (not part of the shared cached payload).
  const [suggestionState, setSuggestionState] = useState(null);
  useFocusEffect(useCallback(() => {
    let alive = true;
    if (canUsePrivateDiscovery) {
      readFirstSuggestionState({ familyId: family.id, userId: user.id })
        .then((state) => { if (alive) setSuggestionState(state); });
    } else {
      setSuggestionState(null);
    }
    return () => { alive = false; };
  }, [canUsePrivateDiscovery, family?.id, user?.id]));
  useFocusEffect(useCallback(() => {
    let alive = true;
    if (!canUsePrivateDiscovery) {
      setTonightSummary(null);
      return () => { alive = false; };
    }
    (async () => {
      try {
        const [preferences, ritualSettings] = await Promise.all([
          getNotificationPreferences({ familyId: family.id, userId: user.id }),
          getFamilyRitualSettings({ familyId: family.id, family }),
        ]);
        await refreshFamilySavedDayCoverage({
          familyId: family.id,
          timezone: ritualSettings.timezone,
        }).catch(() => null);
        if (!alive) return;
        const session = ensureNightlySession({
          familyId: family.id,
          userId: user.id,
          timezone: ritualSettings.timezone === 'local' ? undefined : ritualSettings.timezone,
        });
        setTonightSummary(getTonightSummary({
          familyId: family.id,
          userId: user.id,
          timezone: session?.timezone,
        }));
        if (session?.status === 'active' && !session.completed) {
          const scheduled = await maybeScheduleTonightNotification({
            familyId: family.id,
            userId: user.id,
            session,
            preferences,
            role: family.me.role,
            entitlementActive: entitlement.isActive,
            timezone: session.timezone || ritualSettings.timezone,
            targetTime: ritualSettings.dailyPromptTime,
          });
          if (scheduled?.scheduled) {
            const timezone = session.timezone || ritualSettings.timezone;
            trackAnalyticsEvent('tonight_notification_scheduled', {
              surface: 'notification',
              queue_count_bucket: bucketCount(session.items?.length || 0),
              schedule_day: localDayInTimeZone(scheduled.triggerDate, timezone) === session.localDay
                ? 'same_local_day'
                : 'next_local_day',
            }, {
              family_id: family.id,
              actor_role: family.me.role,
              plan_state: 'active',
              platform: analyticsPlatform('ios'),
              environment: analyticsEnvironment(),
            });
          }
        }
      } catch {
        console.warn('tonight queue summary unavailable');
        if (alive) setTonightSummary(null);
      }
    })();
    return () => { alive = false; };
  }, [canUsePrivateDiscovery, entitlement?.isActive, family, user?.id]));
  useFocusEffect(useCallback(() => {
    let alive = true;
    if (!canUsePrivateDiscovery) {
      setPhotoTrustInputs(EMPTY_PHOTO_TRUST_INPUTS);
      return () => { alive = false; };
    }
    Promise.all([
      getImportCalibration({ familyId: family.id, userId: user.id }).catch(() => null),
      getRecentAutoSaves({ familyId: family.id, userId: user.id }).catch(() => []),
    ]).then(([calibration, recentAutoSaves]) => {
      if (alive) setPhotoTrustInputs({ calibration, recentAutoSaves });
    });
    return () => { alive = false; };
  }, [canUsePrivateDiscovery, family?.id, user?.id]));
  const firstSuggestion = useMemo(
    () => (suggestionState ? selectTodaySuggestion(suggestionState, { goalRows }) : null),
    [goalRows, suggestionState],
  );
  const photoTrustModel = useMemo(
    () => buildPhotoIngestionTrustModel({
      calibration: photoTrustInputs.calibration,
      recentAutoSaves: photoTrustInputs.recentAutoSaves,
      pendingReviewCount: waitingReviewCount,
      autoSaveErrors: scanState.autoSaveErrors,
      babyName: family?.babyName,
      hasDeviceReference: true,
    }),
    [
      family?.babyName,
      photoTrustInputs.calibration,
      photoTrustInputs.recentAutoSaves,
      scanState.autoSaveErrors,
      waitingReviewCount,
    ],
  );
  const nudge = selectDayCardNudge({
    blockingIssue,
    photoTrustNudge: photoTrustModel.todayNudge,
    tonightQueueCount: tonightSummary?.status === 'active' ? tonightSummary.count : 0,
    waitingReviewCount,
    firstSuggestion,
    catchupGoal,
    promptState,
    missedPrompt,
    digestUnread,
    babyName: family?.babyName,
  });
  const promptIsActionable = !!(prompt && !mineAnswered && !snoozed);
  const showPromptCard = !!(prompt && !snoozed && (!promptIsActionable || nudge.kind === 'fallback'));
  const onDismissCatchup = async () => {
    if (!family?.id || !nudge.goalKey) return;
    await dismissCatchupGoal(family.id, nudge.goalKey);
    refresh({ force: true });
  };
  const onSnoozeSuggestion = async () => {
    if (!family?.id || !user?.id || !nudge.goalKey) return;
    const next = await snoozeFirstSuggestion({ familyId: family.id, userId: user.id, goalKey: nudge.goalKey });
    setSuggestionState(next);
  };
  const digestCoverUri = useMemo(
    () => pickDigestCoverUri({
      coverPhoto: digest.coverPhoto,
      latestFirst: firstsSummary?.latest,
      sharedPhotos,
    }),
    [digest.coverPhoto, firstsSummary?.latest, sharedPhotos],
  );
  const hasDigestContent = useMemo(() => digestHasContent(digest), [digest]);
  const showDigestCard = hasDigestContent && (!digestUnread || nudge.kind === 'fallback');
  const digestViewLabel = useMemo(
    () => buildDigestViewStatusLabel({ digestUnread }),
    [digestUnread],
  );
  // The real private queue owns Tonight now. The previous compact list linked
  // to several competing tools, so it stays hidden instead of duplicating the
  // primary Tonight action.
  const tonightModel = { visible: false, items: [] };
  // Only media that can actually render — stale rows fall through to the cover chain (B2).
  const digestStripMedia = useMemo(
    () => (digest.representativeMedia || []).filter((media) => media.thumbUrl || media.fullUrl),
    [digest.representativeMedia],
  );

  return (
    <AppShell
      active="today"
      title={title}
      subtitle={ageInfo.label ? formatAgeLine(ageInfo.label) : undefined}
      showActivityButton
      right={<SearchPill onPress={() => router.push({ pathname: '/library', params: { segment: 'search' } })} />}
    >
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
            {nudge.kind === 'suggested-first' ? (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation?.();
                  onSnoozeSuggestion();
                }}
                accessibilityRole="button"
                accessibilityLabel="Not now"
                hitSlop={8}
                style={styles.skipPrompt}
              >
                <Caption style={{ color: theme.semantic.textMuted }}>Not now</Caption>
              </Pressable>
            ) : null}
          </Card>
        </AnimatedPressable>
      </EntranceView>

      {showPromptCard ? (
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
                  icon={<Ionicons name="pencil-outline" size={14} color={theme.isDark ? theme.colors.ink : theme.colors.bg} />}
                >
                  Answer prompt
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
      ) : loadingCold && nudge.kind === 'fallback' ? (
        <EntranceView index={1}>
          <Card variant="muted">
            <Eyebrow>Daily prompt</Eyebrow>
            <Title style={styles.promptText}>Loading today's question...</Title>
          </Card>
        </EntranceView>
      ) : null}

      {showDigestCard ? (
        <EntranceView index={2}>
          <AnimatedPressable
            onPress={() => router.push('/digest')}
            accessibilityRole="button"
            accessibilityLabel="Open this week's digest"
          >
            <Card>
              <View style={styles.digestHeader}>
                <View style={styles.digestHeaderCopy}>
                  <Eyebrow>This week's digest</Eyebrow>
                  <Title style={styles.digestTitle} numberOfLines={3}>{digest.headline}</Title>
                  <Caption>{digestViewLabel}</Caption>
                </View>
                <View style={styles.cardCue}>
                  <Caption style={styles.digestDate} numberOfLines={2}>{formatWeek(digest.weekStart, digest.weekEnd)}</Caption>
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
      ) : null}

      {tonightModel.visible ? (
        <EntranceView index={3}>
          <TonightSection
            model={tonightModel}
            onOpen={(route) => router.push(route)}
            theme={theme}
          />
        </EntranceView>
      ) : null}

      <EntranceView index={tonightModel.visible ? 4 : 3}>
        <MilestoneTeaser
          summary={firstsSummary}
          babyName={family?.babyName}
          onPress={() => router.push('/firsts')}
          onAdd={() => router.push('/first-compose')}
        />
      </EntranceView>

      <EntranceView index={tonightModel.visible ? 5 : 4}>
        <AnimatedPressable
          onPress={() => router.push('/library')}
          accessibilityRole="button"
          accessibilityLabel="Open Our World to browse saved memories"
        >
          <Card variant="ghost" style={styles.worldPayoffCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.teaserCopy}>
                <Eyebrow>Our World</Eyebrow>
                <Title style={styles.teaserTitle}>All the memories you have kept, in one place.</Title>
                <Caption>Browse days, collections, places, Firsts, letters, and search.</Caption>
              </View>
              <Ionicons name="albums-outline" size={22} color={theme.semantic.primary} />
            </View>
          </Card>
        </AnimatedPressable>
      </EntranceView>
    </AppShell>
  );
}

function SearchPill({ onPress }) {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const iconOnly = fontScale >= 1.5;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Search archive"
      style={[
        styles.searchPill,
        iconOnly && styles.searchPillIconOnly,
        { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border },
      ]}
    >
      <Ionicons name="search" size={14} color={theme.semantic.textSoft} />
      {iconOnly ? null : <Caption maxFontSizeMultiplier={1.3} style={styles.searchPillText}>Search</Caption>}
    </Pressable>
  );
}

function TonightSection({ model, onOpen, theme }) {
  if (!model?.visible) return null;
  return (
    <Card style={styles.tonightCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.teaserCopy}>
          <Eyebrow>{model.title}</Eyebrow>
          <Title style={styles.tonightTitle}>A short reset before tomorrow.</Title>
          <Caption>{model.subtitle}</Caption>
        </View>
        <View style={[styles.tonightIcon, { backgroundColor: theme.colors.primarySoft }]}>
          <Ionicons name="moon-outline" size={20} color={theme.semantic.primary} />
        </View>
      </View>
      <View style={styles.tonightList}>
        {model.items.map((item) => (
          <Pressable
            key={item.kind}
            onPress={() => onOpen(item.route)}
            accessibilityRole="button"
            accessibilityLabel={`${item.actionLabel}: ${item.title}`}
            style={[styles.tonightItem, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}
          >
            <View style={[styles.tonightItemIcon, { backgroundColor: theme.colors.primarySoft }]}>
              <Ionicons name={tonightItemIcon(item.kind)} size={16} color={theme.semantic.primary} />
            </View>
            <View style={styles.tonightCopy}>
              <Caption style={styles.tonightEyebrow}>{item.eyebrow}</Caption>
              <Body style={styles.tonightItemTitle} numberOfLines={2}>{item.title}</Body>
              <Caption numberOfLines={2}>{item.body}</Caption>
            </View>
            <View style={styles.tonightAction}>
              <Caption style={{ color: theme.semantic.primary, fontWeight: '800' }}>{item.actionLabel}</Caption>
              <Ionicons name="chevron-forward" size={14} color={theme.semantic.primary} />
            </View>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

function tonightItemIcon(kind) {
  if (kind === 'prompt') return 'chatbubble-ellipses-outline';
  if (kind === 'review') return 'images-outline';
  if (kind === 'suggested-first') return 'sparkles-outline';
  if (kind === 'recent-stack') return 'albums-outline';
  if (kind === 'digest') return 'calendar-outline';
  return 'moon-outline';
}

function MilestoneTeaser({ summary, babyName, onPress, onAdd }) {
  const theme = useTheme();
  const latest = summary?.latest || null;
  const latestPhoto = summary?.latestPhoto || null;
  const latestPhotoUri = latestPhoto?.thumbUrl || latestPhoto?.fullUrl;
  if (latest) {
    const latestTitle = formatMilestoneDisplayTitle(latest.title);
    return (
      <AnimatedPressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Open firsts. Latest milestone: ${latestTitle}`}
      >
        <Card variant="muted">
          <View style={styles.sectionHeader}>
            <View style={styles.teaserCopy}>
              <Eyebrow>Milestone</Eyebrow>
              <Title style={styles.teaserTitle}>{latestTitle}</Title>
              <Body>{formatShortDate(latest.happened_at || latest.created_at)} · {summary.count} saved so far</Body>
            </View>
            {latestPhotoUri ? (
              <Image source={{ uri: latestPhotoUri }} style={styles.teaserPhoto} contentFit="cover" cachePolicy="memory-disk" />
            ) : (
              <View style={[styles.teaserIcon, { backgroundColor: theme.colors.primarySoft }]}>
                <Ionicons name="flag-outline" size={20} color={theme.semantic.primary} />
              </View>
            )}
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

function formatWeek(start, end) {
  if (!start || !end) return 'This week';
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 'This week';
  const sameMonth = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  const startLabel = a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endLabel = b.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
  return `${startLabel}-${endLabel}`;
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
  searchPillIconOnly: {
    width: 44,
    paddingHorizontal: 0,
    justifyContent: 'center',
  },
  worldPayoffCard: {
    minHeight: 116,
  },
  tonightCard: {
    borderRadius: 14,
    gap: space.md,
  },
  tonightTitle: {
    fontSize: 23,
    lineHeight: 29,
    marginTop: space.xs,
  },
  tonightIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tonightList: {
    gap: space.xs,
  },
  tonightItem: {
    minHeight: 82,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  tonightItemIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tonightCopy: {
    flex: 1,
    minWidth: 0,
  },
  tonightEyebrow: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
  },
  tonightItemTitle: {
    marginTop: 2,
    marginBottom: 2,
    lineHeight: 20,
  },
  tonightAction: {
    minWidth: 58,
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 3,
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
  digestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.md,
  },
  digestHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  inlineHeaderAction: {
    minHeight: 44,
    justifyContent: 'center',
  },
  cardCue: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    flexShrink: 0,
    maxWidth: 94,
  },
  digestDate: {
    flexShrink: 1,
    textAlign: 'right',
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
  teaserPhoto: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    overflow: 'hidden',
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
  monthHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  monthGrid: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.md,
  },
  monthTile: {
    width: '23.5%',
    flexGrow: 0,
    flexShrink: 0,
    aspectRatio: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  monthSyncNote: {
    marginTop: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  monthMoreBadge: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthMoreText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 0,
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
});
