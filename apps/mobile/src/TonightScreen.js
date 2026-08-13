import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { useAuth } from './AuthContext';
import { useBilling } from './BillingContext';
import { useFamily } from './FamilyContext';
import { Family } from './families';
import { ageAt, formatAge } from './ageModel';
import {
  clearTonightVoiceDraft,
  completeTonightTempCleanup,
  ensureNightlySession,
  failTonightKeep,
  finishTonightKeep,
  listTonightBurstAlternates,
  getTonightCatchupSummary,
  markTonightItemShown,
  markCandidatesUnavailable,
  readTonightSession,
  replaceTonightItemWithParentPick,
  restoreCandidateMedia,
  saveTonightDraft,
  saveTonightCollectionDraft,
  saveTonightReactionDraft,
  saveTonightVoiceDraft,
  selectTonightBurstAlternate,
  startTonightContinuation,
  skipTonightItem,
} from './candidateLedgerStore';
import {
  tonightKeepNeedsRemoteReconciliation,
  tonightKeepNeedsRetry,
} from './tonightKeepBoundaryModel.js';
import { parentReasonLabel } from './nightlyQueueModel';
import { getAssetDetails, getLibraryPermissionStatus } from './photos';
import { commitTonightMemory } from './tonightCommit';
import {
  summarizeTonightCompletion,
  TONIGHT_REACTION_OPTIONS,
} from './tonightEnrichmentModel.js';
import {
  cleanupOrphanedTonightVoiceDrafts,
  deleteTonightVoiceDraft,
  persistTonightVoiceDraft,
} from './tonightVoiceDrafts';
import { cancelTonightNotificationForSession } from './tonightNotifications';
import { getFamilyRitualSettings } from './ritualSettings';
import { refreshFamilySavedDayCoverage } from './savedDayCoverage';
import {
  buildTonightCollectionSuggestions,
  selectedTonightCollectionKeys,
  toggleTonightCollectionKey,
} from './automaticCollectionModel';
import { Body, Button, Caption, Eyebrow, Field, Hero, Screen, Spacer, space, useTheme } from './ui';
import { listMomentArchive } from './moments';
import { reconcileCanonicalKeepSideEffects } from './photoSync';
import SharedMomentEnrichmentCard from './SharedMomentEnrichmentCard';
import { composeGroundedMomentContext } from './groundedContextModel';
import {
  groundedCaptureTime,
  isUnknownCaptureTimeError,
  UNKNOWN_CAPTURE_TIME_MESSAGE,
} from './groundedCaptureTimeModel.js';
import {
  chooseSharedTonightLookback,
  listMomentAnnotations,
  listMomentContextFacts,
  listSavedEventCompanions,
  SHARED_LOOKBACK_QUERY_LIMIT,
} from './sharedEnrichment';
import { trackAnalyticsEvent } from './analytics';
import { analyticsEnvironment, analyticsPlatform } from './analyticsProductContext';
import {
  tonightCompletionProperties,
  tonightDecisionProperties,
  tonightOpenProperties,
} from './curatedMemoryAnalyticsModel';
import {
  TONIGHT_MEDIA_COLLAPSE_DISTANCE,
  TONIGHT_REVIEW_COPY,
  tonightMediaHeights,
} from './tonightReviewLayoutModel';
import { buildTodayManualQaFixture } from './todayManualQaFixtures';
import { isManualQaRuntime } from './manualQaRuntime';

const SAVE_STEP_LABELS = {
  media: 'Saving this memory…',
  text: 'Adding your words…',
  voice: 'Uploading your voice note…',
  reaction: 'Adding your favorite…',
  collection: 'Filing it in your world…',
};

export default function TonightScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const theme = useTheme();
  const { height: viewportHeight } = useWindowDimensions();
  const { family } = useFamily();
  const { user } = useAuth();
  const { entitlement, loading: billingLoading } = useBilling();
  const writer = ['creator', 'partner'].includes(family?.me?.role);
  const canCurate = writer && entitlement?.isActive === true;
  const canUsePrivateDiscovery = !billingLoading && canCurate && !!family?.id && !!user?.id;
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [error, setError] = useState('');
  const [audioNotice, setAudioNotice] = useState('');
  const [draft, setDraft] = useState('');
  const [burstOpen, setBurstOpen] = useState(false);
  const [saveStep, setSaveStep] = useState(null);
  const [catchup, setCatchup] = useState(null);
  const [photoAccess, setPhotoAccess] = useState(null);
  const [lookback, setLookback] = useState(null);
  const [lookbackOpen, setLookbackOpen] = useState(false);
  const [lookbackMembers, setLookbackMembers] = useState({});
  const manualQaFixture = useMemo(
    () => (isManualQaRuntime() ? buildTodayManualQaFixture(params.qa) : null),
    [params.qa],
  );
  const detailsScrollRef = useRef(null);
  const detailsScrollY = useRef(new Animated.Value(0)).current;
  const trackedOpenRef = useRef(null);
  const trackedCompletionRef = useRef(null);
  const mediaHeights = useMemo(
    () => tonightMediaHeights(viewportHeight),
    [viewportHeight],
  );
  const mediaHeight = detailsScrollY.interpolate({
    inputRange: [0, TONIGHT_MEDIA_COLLAPSE_DISTANCE],
    outputRange: [mediaHeights.expanded, mediaHeights.collapsed],
    extrapolate: 'clamp',
  });

  const loadLookback = useCallback(async () => {
    if (!canCurate || !family?.id) return null;
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const archive = await listMomentArchive(family.id, { limit: SHARED_LOOKBACK_QUERY_LIMIT });
    const selected = chooseSharedTonightLookback(
      archive.filter((moment) => new Date(moment.captured_at).getTime() < cutoff
        && moment.media?.some((media) => media.upload_status === 'ready')),
      { localDate: new Date() },
    );
    if (!selected) {
      setLookback(null);
      return null;
    }
    const [annotations, contextFacts, eventCompanions, members] = await Promise.all([
      listMomentAnnotations({ familyId: family.id, momentId: selected.id }),
      listMomentContextFacts({ familyId: family.id, momentId: selected.id }),
      listSavedEventCompanions({ familyId: family.id, momentId: selected.id }),
      Family.members(family.id),
    ]);
    const hydrated = { ...selected, annotations, contextFacts, eventCompanions };
    setLookback(hydrated);
    setLookbackMembers(Object.fromEntries((members || []).map((member) => [member.userId, member.displayName || 'Family'])));
    return hydrated;
  }, [canCurate, family?.id]);

  const load = useCallback(async () => {
    if (manualQaFixture) {
      setSession(manualQaFixture.session);
      setCatchup(null);
      setError('');
      setLoading(false);
      return;
    }
    if (billingLoading) return;
    if (!canCurate || !family?.id || !user?.id) {
      setLoading(false);
      return;
    }
    try {
      let next = readTonightSession({ familyId: family.id, userId: user.id });
      if (!next) {
        const ritualSettings = await getFamilyRitualSettings({
          familyId: family.id,
          family: { babyBirthday: family?.babyBirthday },
        });
        await refreshFamilySavedDayCoverage({
          familyId: family.id,
          timezone: ritualSettings.timezone,
        }).catch(() => null);
        next = ensureNightlySession({
          familyId: family.id,
          userId: user.id,
          timezone: ritualSettings.timezone === 'local' ? undefined : ritualSettings.timezone,
        });
      }
      setSession(next);
      setCatchup(getTonightCatchupSummary({ familyId: family.id, userId: user.id }));
      setError('');
      cleanupOrphanedTonightVoiceDrafts(
        (next?.items || []).map((item) => item.draftVoice?.uri).filter(Boolean),
      ).catch(() => {});
      loadLookback().catch(() => null);
    } catch (loadError) {
      setError(parentError(loadError, 'Tonight could not load on this device.'));
    } finally {
      setLoading(false);
    }
  }, [billingLoading, canCurate, family?.babyBirthday, family?.id, loadLookback, manualQaFixture, user?.id]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  useEffect(() => {
    if (loading || !family?.id || !writer) return;
    const key = session?.sessionId || `empty:${family.id}`;
    if (trackedOpenRef.current === key) return;
    trackedOpenRef.current = key;
    trackAnalyticsEvent(
      'tonight_opened',
      tonightOpenProperties(session, {
        openSource: params?.source === 'notification' ? 'notification' : params?.source === 'today' ? 'today' : 'direct',
      }),
      tonightAnalyticsContext({ family, entitlement }),
    );
  }, [entitlement, family, loading, params?.source, session, writer]);

  useEffect(() => {
    let alive = true;
    if (!canUsePrivateDiscovery) return undefined;
    getLibraryPermissionStatus()
      .then((permission) => {
        if (alive) setPhotoAccess(permission?.accessPrivileges || null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [canUsePrivateDiscovery]);

  const activeItem = useMemo(() => {
    if (!session?.items?.length) return null;
    return session.items.find((item) => item.position >= session.currentPosition && ['queued', 'shown', 'unavailable'].includes(item.state))
      || session.items.find((item) => ['queued', 'shown', 'unavailable'].includes(item.state))
      || null;
  }, [session]);
  const keepNeedsRetry = tonightKeepNeedsRetry(activeItem);
  const activePosition = activeItem?.position;
  const activeDraftText = activeItem?.draftText || '';
  const collectionSuggestions = useMemo(
    () => buildTonightCollectionSuggestions({ item: activeItem, babyBirthday: family?.babyBirthday }),
    [activeItem, family?.babyBirthday],
  );
  const selectedCollectionKeys = useMemo(
    () => selectedTonightCollectionKeys({ suggestions: collectionSuggestions, draftKeys: activeItem?.collectionKeys }),
    [activeItem?.collectionKeys, collectionSuggestions],
  );

  useEffect(() => {
    setBurstOpen(false);
    Keyboard.dismiss();
    detailsScrollY.setValue(0);
    detailsScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [activeItem?.assetId, activeItem?.position, detailsScrollY]);
  const recording = Boolean(recorderState.isRecording);
  const audioSeconds = recording
    ? Math.round((recorderState.durationMillis || 0) / 1000)
    : Math.round(activeItem?.draftVoice?.durationSec || 0);

  const burstAlternates = useMemo(() => {
    if (manualQaFixture || activeItem?.reasonCode !== 'best_burst' || !session?.sessionId || !family?.id || !user?.id) return [];
    try {
      return listTonightBurstAlternates({
        sessionId: session.sessionId,
        familyId: family.id,
        userId: user.id,
        position: activeItem.position,
      });
    } catch {
      return [];
    }
  }, [activeItem, family?.id, manualQaFixture, session?.sessionId, user?.id]);

  useEffect(() => {
    setDraft(activeDraftText);
    setBurstOpen(false);
    setAudioNotice('');
    if (manualQaFixture || activePosition == null || !session?.sessionId || !family?.id || !user?.id) return;
    markTonightItemShown({
      sessionId: session.sessionId,
      familyId: family.id,
      userId: user.id,
      position: activePosition,
    });
  }, [activeDraftText, activePosition, family?.id, manualQaFixture, session?.sessionId, user?.id]);

  useEffect(() => {
    if (manualQaFixture || !activeItem || activeItem.collectionKeys != null || !collectionSuggestions.length) return;
    const next = saveTonightCollectionDraft({
      sessionId: session.sessionId,
      familyId: family.id,
      userId: user.id,
      position: activeItem.position,
      collectionKeys: collectionSuggestions.map((entry) => entry.key),
      parentInitiated: false,
    });
    setSession(next);
  }, [activeItem, collectionSuggestions, family?.id, manualQaFixture, session?.sessionId, user?.id]);

  const changeDraft = useCallback((text) => {
    if (keepNeedsRetry) return;
    setDraft(text);
    if (!activeItem || !session?.sessionId || !family?.id || !user?.id) return;
    saveTonightDraft({
      sessionId: session.sessionId,
      familyId: family.id,
      userId: user.id,
      position: activeItem.position,
      text,
    });
  }, [activeItem, family?.id, keepNeedsRetry, session?.sessionId, user?.id]);

  const refreshAfterDecision = useCallback((next, decision, committedItem = null) => {
    if (next?.completed) {
      const completedSession = {
        ...next,
        completed: true,
        status: 'completed',
        currentPosition: next?.itemCount || 0,
        items: (session?.items || next?.items || []).map((item) => (
          item.position === activeItem?.position
            ? {
                ...item,
                ...(committedItem || {}),
                state: decision,
                commitState: 'done',
              }
            : item
        )),
      };
      cancelTonightNotificationForSession({
        familyId: family.id,
        userId: user.id,
        session,
      }).catch(() => {});
      setSession(completedSession);
      if (trackedCompletionRef.current !== next.sessionId) {
        trackedCompletionRef.current = next.sessionId;
        trackAnalyticsEvent(
          'tonight_completed',
          tonightCompletionProperties(completedSession),
          tonightAnalyticsContext({ family, entitlement }),
        );
      }
    } else {
      setSession(readTonightSession({ familyId: family.id, userId: user.id }) || next);
    }
    setDraft('');
    setError('');
    setSaveStep(null);
    setCatchup(getTonightCatchupSummary({ familyId: family.id, userId: user.id }));
  }, [activeItem?.position, entitlement, family, session, user?.id]);

  const confirmRemoteAbsenceBeforeAbandon = useCallback(async () => {
    if (!tonightKeepNeedsRemoteReconciliation(activeItem)) return true;
    setBusy(true);
    setError('');
    try {
      const sideEffectFound = await reconcileCanonicalKeepSideEffects({
        familyId: family.id,
        ownerUserId: user.id,
        assetId: activeItem.assetId,
      });
      if (!sideEffectFound) return true;
      setSession(readTonightSession({ familyId: family.id, userId: user.id }));
      setError('This Keep already started. Restore the original in Photos, then retry Keep.');
      return false;
    } catch {
      setError('We could not confirm whether this Keep started. Try again while connected.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [activeItem, family?.id, user?.id]);

  const keepGoing = () => {
    if (busy || !family?.id || !user?.id) return;
    setBusy(true);
    setError('');
    try {
      const next = startTonightContinuation({
        familyId: family.id,
        userId: user.id,
        completedSessionId: session.sessionId,
        timezone: session.timezone,
      });
      if (next) {
        setSession(next);
        setCatchup(getTonightCatchupSummary({ familyId: family.id, userId: user.id }));
      } else {
        setCatchup({ ...(catchup || {}), hasMore: false, remainingStrongCount: 0 });
      }
    } catch (continuationError) {
      setError(parentError(continuationError, 'No more strong memories are ready right now.'));
    } finally {
      setBusy(false);
    }
  };

  const keep = async () => {
    if (!activeItem || busy || recording) return;
    setBusy(true);
    setError('');
    setSaveStep(keepNeedsRetry ? 'retry' : 'media');
    try {
      const committed = await commitTonightMemory({
        sessionId: session.sessionId,
        familyId: family.id,
        userId: user.id,
        position: activeItem.position,
        item: {
          ...activeItem,
          collectionKeys: selectedCollectionKeys,
          availableCollectionKeys: collectionSuggestions.map((entry) => entry.key),
        },
        match: matchFromItem(activeItem),
        onStep: (step, state) => {
          if (state === 'saving') setSaveStep(step);
        },
      });
      if (committed?.draftVoice?.uri) {
        try {
          await deleteTonightVoiceDraft(committed.draftVoice.uri);
          completeTonightTempCleanup({
            sessionId: session.sessionId,
            familyId: family.id,
            userId: user.id,
            position: activeItem.position,
            success: true,
          });
        } catch {
          completeTonightTempCleanup({
            sessionId: session.sessionId,
            familyId: family.id,
            userId: user.id,
            position: activeItem.position,
            success: false,
          });
          throw new Error('The private recording still needs local cleanup');
        }
      }
      const next = finishTonightKeep({
        sessionId: session.sessionId,
        familyId: family.id,
        userId: user.id,
        position: activeItem.position,
      });
      trackAnalyticsEvent(
        'tonight_item_decided',
        tonightDecisionProperties(committed || activeItem, 'kept', { retried: keepNeedsRetry }),
        tonightAnalyticsContext({ family, entitlement }),
      );
      refreshAfterDecision(next, 'kept', committed);
    } catch (saveError) {
      const unavailableFailure = isUnavailableError(saveError);
      const unknownCaptureTime = isUnknownCaptureTimeError(saveError);
      failTonightKeep({
        sessionId: session.sessionId,
        familyId: family.id,
        userId: user.id,
        position: activeItem.position,
        errorCode: unavailableFailure
          ? 'asset_unavailable'
          : unknownCaptureTime ? 'capture_time_unknown' : 'save_failed',
      });
      if (unavailableFailure) {
        markCandidatesUnavailable({
          familyId: family.id,
          userId: user.id,
          assetIds: [activeItem.assetId],
          reason: 'The original is waiting in iCloud.',
        });
        trackAnalyticsEvent(
          'tonight_item_decided',
          tonightDecisionProperties(activeItem, 'unavailable', { retried: keepNeedsRetry }),
          tonightAnalyticsContext({ family, entitlement }),
        );
      }
      setSession(readTonightSession({ familyId: family.id, userId: user.id }));
      setError(parentError(saveError, 'This memory did not finish saving. Your draft is safe; try Keep again.'));
    } finally {
      setBusy(false);
      setSaveStep(null);
    }
  };

  const skip = async () => {
    if (!activeItem || busy || keepNeedsRetry || recording) return;
    const remoteAbsenceConfirmed = await confirmRemoteAbsenceBeforeAbandon();
    if (!remoteAbsenceConfirmed) return;
    const next = skipTonightItem({
      sessionId: session.sessionId,
      familyId: family.id,
      userId: user.id,
      position: activeItem.position,
      remoteAbsenceConfirmed,
    });
    if (next.discardedVoiceUri) await deleteTonightVoiceDraft(next.discardedVoiceUri).catch(() => {});
    trackAnalyticsEvent(
      'tonight_item_decided',
      tonightDecisionProperties(activeItem, 'skipped'),
      tonightAnalyticsContext({ family, entitlement }),
    );
    refreshAfterDecision(next, 'skipped');
  };

  const chooseAnother = async () => {
    if (!activeItem || busy || keepNeedsRetry || recording) return;
    const remoteAbsenceConfirmed = await confirmRemoteAbsenceBeforeAbandon();
    if (!remoteAbsenceConfirmed) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: false,
      presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
      quality: 1,
      exif: true,
      shouldDownloadFromNetwork: true,
      videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
    });
    const picked = result.assets?.[0];
    if (result.canceled || !picked) return;
    if (!picked.assetId) {
      Alert.alert('Open Add instead?', 'This picker did not return a Photos library identifier, so use Add to keep it safely.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Add', onPress: () => router.push('/add') },
      ]);
      return;
    }
    const details = await getAssetDetails(picked.assetId, { downloadFromNetwork: true }).catch(() => null);
    const next = replaceTonightItemWithParentPick({
      sessionId: session.sessionId,
      familyId: family.id,
      userId: user.id,
      position: activeItem.position,
      asset: {
        ...picked,
        uri: details?.localUri || details?.uri || picked.uri,
        mediaType: details?.mediaType || picked.type,
        creationTime: groundedCaptureTime(details?.creationTime, picked.creationTime),
        duration: details?.duration ?? picked.duration,
        width: details?.width ?? picked.width,
        height: details?.height ?? picked.height,
      },
      remoteAbsenceConfirmed,
    });
    if (next.discardedVoiceUri) await deleteTonightVoiceDraft(next.discardedVoiceUri).catch(() => {});
    setSession(next);
  };

  const selectBurstPhoto = async (assetId) => {
    if (busy || keepNeedsRetry || recording) return;
    const remoteAbsenceConfirmed = await confirmRemoteAbsenceBeforeAbandon();
    if (!remoteAbsenceConfirmed) return;
    const next = selectTonightBurstAlternate({
      sessionId: session.sessionId,
      familyId: family.id,
      userId: user.id,
      position: activeItem.position,
      assetId,
      remoteAbsenceConfirmed,
    });
    setSession(next);
  };

  const toggleFavorite = () => {
    if (busy || keepNeedsRetry) return;
    const next = saveTonightReactionDraft({
      sessionId: session.sessionId,
      familyId: family.id,
      userId: user.id,
      position: activeItem.position,
      favorite: !activeItem.favorite,
      reactionCode: activeItem.reactionCode,
    });
    setSession(next);
  };

  const chooseReaction = (reactionCode) => {
    if (busy || keepNeedsRetry) return;
    const next = saveTonightReactionDraft({
      sessionId: session.sessionId,
      familyId: family.id,
      userId: user.id,
      position: activeItem.position,
      favorite: activeItem.favorite,
      reactionCode: activeItem.reactionCode === reactionCode ? null : reactionCode,
    });
    setSession(next);
  };

  const toggleCollection = (key) => {
    if (busy || keepNeedsRetry) return;
    const nextKeys = toggleTonightCollectionKey({ selectedKeys: selectedCollectionKeys, key });
    const next = saveTonightCollectionDraft({
      sessionId: session.sessionId,
      familyId: family.id,
      userId: user.id,
      position: activeItem.position,
      collectionKeys: nextKeys,
    });
    setSession(next);
  };

  const startRecording = async () => {
    if (audioBusy || busy || keepNeedsRetry) return;
    setAudioBusy(true);
    setAudioNotice('');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone access needed', 'Allow microphone access to add your voice to this memory.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setAudioNotice('Recording… tap Stop when you are done.');
    } catch {
      setAudioNotice('Recording could not start. Try once more.');
    } finally {
      setAudioBusy(false);
    }
  };

  const stopRecording = useCallback(async ({ interrupted = false } = {}) => {
    if (!recorderState.isRecording || audioBusy || !activeItem || !session?.sessionId) return;
    setAudioBusy(true);
    try {
      await recorder.stop();
      if (!recorder.uri) throw new Error('Recording did not produce an audio file');
      const durableUri = await persistTonightVoiceDraft({
        sourceUri: recorder.uri,
        sessionId: session.sessionId,
        position: activeItem.position,
      });
      const durationSec = recorder.currentTime
        || (recorderState.durationMillis ? recorderState.durationMillis / 1000 : null);
      const previousUri = activeItem.draftVoice?.uri;
      const next = saveTonightVoiceDraft({
        sessionId: session.sessionId,
        familyId: family.id,
        userId: user.id,
        position: activeItem.position,
        voice: {
          uri: durableUri,
          durationSec,
          mimeType: 'audio/mp4',
          waveform: buildWaveform(durationSec || 8),
        },
      });
      setSession(next);
      if (previousUri && previousUri !== durableUri) await deleteTonightVoiceDraft(previousUri).catch(() => {});
      setAudioNotice(interrupted
        ? 'Recording stopped when the app left the foreground. Your voice draft is safe.'
        : 'Voice draft saved on this device.');
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      setAudioNotice('That recording did not finish. Your other draft choices are still safe.');
    } finally {
      setAudioBusy(false);
    }
  }, [activeItem, audioBusy, family?.id, recorder, recorderState.durationMillis, recorderState.isRecording, session?.sessionId, user?.id]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && recorderState.isRecording) stopRecording({ interrupted: true });
    });
    return () => subscription.remove();
  }, [recorderState.isRecording, stopRecording]);

  const removeVoice = async () => {
    if (!activeItem?.draftVoice?.uri || audioBusy || keepNeedsRetry) return;
    const cleared = clearTonightVoiceDraft({
      sessionId: session.sessionId,
      familyId: family.id,
      userId: user.id,
      position: activeItem.position,
    });
    await deleteTonightVoiceDraft(cleared.discardedVoiceUri).catch(() => {});
    setSession(cleared.session);
    setAudioNotice('Voice draft removed.');
  };

  const retryAvailability = async () => {
    if (!activeItem) return;
    setBusy(true);
    setError('');
    try {
      const info = await getAssetDetails(activeItem.assetId, { downloadFromNetwork: true });
      const localUri = info?.localUri || info?.uri;
      if (!localUri) throw new Error(info?.downloadError || 'The original is still waiting in iCloud.');
      if (activeItem.mediaType === 'video' && info?.mediaType !== 'video') {
        throw new Error('Photos did not return the original video.');
      }
      restoreCandidateMedia({
        familyId: family.id,
        userId: user.id,
        assetId: activeItem.assetId,
        localUri,
        previewUri: activeItem.previewUri,
      });
      load();
    } catch (availabilityError) {
      setError(parentError(availabilityError, 'The original is still unavailable. Open Photos once, then try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (!writer && !manualQaFixture) return <TonightDenied router={router} kind="circle" />;
  if ((loading || billingLoading) && !manualQaFixture) {
    return <Screen variant="warm" contentStyle={styles.centered}><ActivityIndicator color={theme.semantic.primary} /></Screen>;
  }
  if (!canCurate && !manualQaFixture) return <TonightDenied router={router} kind="lapsed" />;

  if (lookbackOpen && lookback) {
    const lookbackMedia = lookback.media?.[0] || null;
    const lookbackAge = family?.babyBirthday
      ? formatAge(ageAt(family.babyBirthday, new Date(lookback.captured_at).getTime()))
      : '';
    const context = composeGroundedMomentContext({
      capturedAt: lookback.captured_at,
      babyBirthday: family?.babyBirthday,
      placeName: lookback.place_name,
      contextFacts: lookback.contextFacts,
      eventCompanions: lookback.eventCompanions,
    });
    return (
      <Screen variant="warm" scroll contentStyle={styles.lookbackScreen}>
        <View style={styles.lookbackHeader}>
          <Pressable onPress={() => setLookbackOpen(false)} accessibilityRole="button" accessibilityLabel="Back to Tonight summary" style={styles.iconButton}>
            <Ionicons name="chevron-back" size={24} color={theme.semantic.text} />
          </Pressable>
          <Caption>A saved memory</Caption>
          <View style={styles.iconButton} />
        </View>
        <View style={[styles.lookbackMedia, { backgroundColor: theme.semantic.cardAlt }]} testID="tonight-shared-lookback">
          {lookbackMedia?.media_type === 'video' && lookbackMedia.fullUrl ? (
            <TonightVideo uri={lookbackMedia.fullUrl} posterUri={lookbackMedia.posterUrl || lookbackMedia.thumbUrl} theme={theme} />
          ) : lookbackMedia?.fullUrl || lookbackMedia?.thumbUrl ? (
            <Image source={{ uri: lookbackMedia.fullUrl || lookbackMedia.thumbUrl }} style={StyleSheet.absoluteFill} contentFit="contain" />
          ) : (
            <View style={styles.centered}><Ionicons name="images-outline" size={36} color={theme.semantic.textMuted} /></View>
          )}
        </View>
        <Eyebrow>Look back together</Eyebrow>
        <Hero style={styles.lookbackTitle}>{lookback.title || formatCaptureDate(new Date(lookback.captured_at))}</Hero>
        <Caption>{[lookbackAge, formatCaptureDate(new Date(lookback.captured_at))].filter(Boolean).join(' · ')}</Caption>
        {context.length ? (
          <View style={styles.lookbackContext}>
            {context.map((fact) => (
              <View key={fact.key} style={styles.lookbackContextRow}>
                <Ionicons name={fact.icon} size={16} color={theme.semantic.primary} />
                <Caption style={styles.lookbackContextText}>{fact.label}</Caption>
              </View>
            ))}
          </View>
        ) : null}
        <SharedMomentEnrichmentCard
          familyId={family.id}
          momentId={lookback.id}
          userId={user?.id}
          canWrite={canCurate}
          annotations={lookback.annotations || []}
          voiceNotes={lookback.voiceNotes || []}
          membersById={lookbackMembers}
          theme={theme}
          onSaved={loadLookback}
          analyticsSurface="tonight"
        />
        <Button variant="ghost" onPress={() => setLookbackOpen(false)}>Done for tonight</Button>
      </Screen>
    );
  }

  if (session?.completed) {
    const summary = summarizeTonightCompletion(session.items);
    const enrichment = summary.withText + summary.withVoice + summary.withReaction;
    return (
      <Screen variant="warm" contentStyle={styles.centered}>
        <Eyebrow>That's tonight</Eyebrow>
        <Hero style={styles.centerTitle}>{completionTitle(summary)}</Hero>
        <Body align="center">
          {enrichment
            ? completionContext(summary)
            : 'The choices are saved. There is nothing else you need to finish tonight.'}
        </Body>
        {photoAccess === 'limited' ? (
          <Caption style={styles.completionNote} align="center">
            This is based only on the photos you selected for Our Little World.
          </Caption>
        ) : null}
        {catchup?.hasMore ? (
          <Caption style={styles.completionNote} align="center">
            More strong memories are ready whenever you want another small set.
          </Caption>
        ) : null}
        {error ? <Caption style={[styles.error, { color: theme.colors.danger }]}>{error}</Caption> : null}
        <Spacer h={space.xl} />
        {lookback ? (
          <Button variant="quiet" onPress={() => setLookbackOpen(true)} testID="tonight-open-lookback">
            Revisit a saved memory
          </Button>
        ) : null}
        {lookback ? <Spacer h={space.sm} /> : null}
        <Button onPress={() => router.replace('/timeline')} testID="tonight-complete">Back to Today</Button>
        {catchup?.hasMore ? <Spacer h={space.sm} /> : null}
        {catchup?.hasMore ? (
          <Button variant="ghost" onPress={keepGoing} loading={busy} testID="tonight-keep-going">Keep going</Button>
        ) : null}
      </Screen>
    );
  }

  if (!session || !activeItem) {
    return (
      <Screen variant="warm" contentStyle={styles.centered}>
        <Eyebrow>Tonight</Eyebrow>
        <Hero style={styles.centerTitle}>Nothing needs your attention.</Hero>
        <Body align="center">We only make a set when there are memories strong enough to show you.</Body>
        {error ? <Caption style={[styles.error, { color: theme.colors.danger }]}>{error}</Caption> : null}
        <Spacer h={space.xl} />
        {lookback ? (
          <Button onPress={() => setLookbackOpen(true)} testID="tonight-open-lookback">Revisit a saved memory</Button>
        ) : null}
        {lookback ? <Spacer h={space.sm} /> : null}
        <Button variant="ghost" onPress={() => router.replace('/timeline')}>Back to Today</Button>
      </Screen>
    );
  }

  const captureDate = activeItem.captureTimeMs ? new Date(activeItem.captureTimeMs) : null;
  const age = captureDate && family?.babyBirthday
    ? formatAge(ageAt(family.babyBirthday, captureDate.getTime()))
    : '';
  const unavailable = activeItem.availability !== 'available' || !activeItem.localUri;
  const statusCopy = saveStep ? (saveStep === 'retry' ? 'Retrying this save…' : SAVE_STEP_LABELS[saveStep]) : '';

  return (
    <Screen bare edges={{ top: true, bottom: true }}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Pressable onPress={() => router.replace('/timeline')} accessibilityRole="button" accessibilityLabel="Close Tonight" style={styles.iconButton}>
            <Ionicons name="close" size={24} color={theme.semantic.text} />
          </Pressable>
          <Caption maxFontSizeMultiplier={1.6}>{activeItem.position + 1} of {session.itemCount}</Caption>
          <View style={styles.iconButton} />
        </View>

        <Animated.View
          style={[styles.mediaFrame, { height: mediaHeight, backgroundColor: theme.semantic.cardAlt }]}
          testID="tonight-media-card"
        >
          {unavailable ? (
            <UnavailableCard
              onRetry={retryAvailability}
              busy={busy}
              theme={theme}
              reason={activeItem.unavailableReason}
            />
          ) : activeItem.mediaType === 'video' ? (
            <TonightVideo uri={activeItem.localUri} posterUri={activeItem.previewUri} theme={theme} />
          ) : (
            <Image source={{ uri: activeItem.localUri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
          )}
        </Animated.View>

        <Animated.ScrollView
          key={`${session.sessionId}:${activeItem.position}:${activeItem.assetId}`}
          ref={detailsScrollRef}
          style={styles.detailsScroll}
          contentContainerStyle={styles.details}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: detailsScrollY } } }],
            { useNativeDriver: false },
          )}
          scrollEventThrottle={16}
        >
          <Eyebrow maxFontSizeMultiplier={1.6}>{parentReasonLabel(activeItem.reasonCode)}</Eyebrow>
          <Hero maxFontSizeMultiplier={1.8} style={styles.dateTitle}>{captureDate ? formatCaptureDate(captureDate) : 'A memory worth a look'}</Hero>
          {age ? <Caption maxFontSizeMultiplier={1.8}>{age}</Caption> : null}

          {burstAlternates.length > 1 ? (
            <BurstChooser
              open={burstOpen}
              onToggle={() => setBurstOpen((value) => !value)}
              alternates={burstAlternates}
              onSelect={selectBurstPhoto}
              disabled={busy || keepNeedsRetry || recording}
              theme={theme}
            />
          ) : null}

          <Spacer h={space.md} />
          <Field
            label={TONIGHT_REVIEW_COPY.noteLabel}
            value={draft}
            onChangeText={changeDraft}
            placeholder="What do you want to remember?"
            inputProps={{
              maxLength: 280,
              returnKeyType: 'done',
              blurOnSubmit: true,
              onSubmitEditing: Keyboard.dismiss,
              maxFontSizeMultiplier: 1.8,
              editable: !busy && !keepNeedsRetry,
            }}
            testID="tonight-draft"
          />

          <View style={styles.enrichmentRow}>
            <Pressable
              onPress={toggleFavorite}
              disabled={busy || keepNeedsRetry}
              accessibilityRole="button"
              accessibilityLabel={activeItem.favorite ? 'Remove favorite' : 'Favorite this memory'}
              accessibilityState={{ selected: activeItem.favorite }}
              style={[
                styles.enrichmentButton,
                { borderColor: theme.semantic.border, backgroundColor: activeItem.favorite ? theme.colors.primarySoft : theme.semantic.cardAlt },
              ]}
              testID="tonight-favorite"
            >
              <Ionicons name={activeItem.favorite ? 'heart' : 'heart-outline'} size={19} color={theme.semantic.primary} />
              <Caption maxFontSizeMultiplier={1.5}>{activeItem.favorite ? 'Favorited' : 'Favorite'}</Caption>
            </Pressable>
            {TONIGHT_REACTION_OPTIONS.map((option) => {
              const selected = activeItem.reactionCode === option.code;
              return (
                <Pressable
                  key={option.code}
                  onPress={() => chooseReaction(option.code)}
                  disabled={busy || keepNeedsRetry}
                  accessibilityRole="button"
                  accessibilityLabel={selected ? `Remove reaction ${option.label}` : option.label}
                  accessibilityState={{ selected }}
                  style={[
                    styles.emojiButton,
                    { borderColor: selected ? theme.semantic.primary : theme.semantic.border, backgroundColor: theme.semantic.cardAlt },
                  ]}
                  testID={`tonight-reaction-${option.code}`}
                >
                  <Caption maxFontSizeMultiplier={1.4} style={styles.emoji}>{option.emoji}</Caption>
                </Pressable>
              );
            })}
          </View>

          {collectionSuggestions.length ? (
            <View style={styles.collectionDraft}>
              <View style={styles.collectionDraftHeader}>
                <Caption style={styles.collectionDraftTitle}>Collections</Caption>
                <Caption>{TONIGHT_REVIEW_COPY.collectionCaption}</Caption>
              </View>
              <View style={styles.collectionChipRow}>
                {collectionSuggestions.map((suggestion) => {
                  const selected = selectedCollectionKeys.includes(suggestion.key);
                  return (
                    <Pressable
                      key={suggestion.key}
                      onPress={() => toggleCollection(suggestion.key)}
                      disabled={busy || keepNeedsRetry}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`${suggestion.title} collection`}
                      accessibilityHint={selected
                        ? 'Leaves this collection out when you Keep.'
                        : 'Adds this collection when you Keep.'}
                      style={[
                        styles.collectionChip,
                        {
                          borderColor: selected ? theme.semantic.primary : theme.semantic.border,
                          backgroundColor: selected ? theme.colors.primarySoft : theme.semantic.cardAlt,
                        },
                      ]}
                      testID={`tonight-collection-${suggestion.key}`}
                    >
                      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={theme.semantic.primary} />
                      <Caption style={styles.collectionChipText}>{suggestion.title}</Caption>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <VoiceDraftCard
            voice={activeItem.draftVoice}
            recording={recording}
            seconds={audioSeconds}
            busy={audioBusy}
            disabled={busy || keepNeedsRetry}
            notice={audioNotice}
            onStart={startRecording}
            onStop={() => stopRecording()}
            onRemove={removeVoice}
            theme={theme}
          />

        </Animated.ScrollView>

        <View style={[styles.decisionDock, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }]}>
          {statusCopy || error || keepNeedsRetry ? (
            <Caption style={[styles.error, { color: error ? theme.colors.danger : theme.semantic.muted }]}>
              {statusCopy || error || TONIGHT_REVIEW_COPY.retryKeep}
            </Caption>
          ) : null}
          <View style={styles.actions}>
            <Button fullWidth={false} style={styles.action} variant="ghost" onPress={skip} disabled={busy || keepNeedsRetry || recording} testID="tonight-skip">Skip</Button>
            <Button fullWidth={false} style={styles.action} onPress={keep} loading={busy} disabled={unavailable || recording} testID="tonight-keep">
              {keepNeedsRetry ? 'Retry Keep' : 'Keep'}
            </Button>
          </View>
          <Pressable
            onPress={chooseAnother}
            disabled={busy || keepNeedsRetry || recording}
            accessibilityRole="button"
            accessibilityLabel="Choose another memory from Photos"
            style={styles.secondaryAction}
            testID="tonight-picker"
          >
            <Ionicons name="images-outline" size={17} color={theme.semantic.primary} />
            <Caption style={{ color: theme.semantic.primary, fontWeight: '700' }}>{TONIGHT_REVIEW_COPY.anotherLabel}</Caption>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function TonightDenied({ router, kind }) {
  const circle = kind === 'circle';
  return (
    <Screen variant="warm" contentStyle={styles.centered}>
      <Eyebrow maxFontSizeMultiplier={1.4}>{circle ? 'Private discovery' : 'Tonight is paused'}</Eyebrow>
      <Hero maxFontSizeMultiplier={1.4} style={styles.centerTitle}>{circle ? 'Tonight belongs to the parents.' : 'Your saved family world is still here.'}</Hero>
      <Body maxFontSizeMultiplier={1.5} align="center">
        {circle
          ? 'Circle members can enjoy memories after a parent keeps them in Our World.'
          : 'When the family plan is active, private photo discovery and new Tonight decisions can continue.'}
      </Body>
      <Spacer h={space.xl} />
      <Button size="md" variant="ghost" onPress={() => router.replace('/timeline')}>Back to Our World</Button>
    </Screen>
  );
}

function TonightVideo({ uri, posterUri, theme }) {
  const [ready, setReady] = useState(false);
  const player = useVideoPlayer({ uri }, (instance) => {
    instance.loop = false;
    instance.audioMixingMode = 'auto';
  });
  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls
        fullscreenOptions={{ enable: true, orientation: 'default' }}
        allowsVideoFrameAnalysis={false}
        onFirstFrameRender={() => setReady(true)}
      />
      {!ready && posterUri ? <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFill} contentFit="contain" pointerEvents="none" /> : null}
      {!ready ? <View pointerEvents="none" style={styles.playOverlay}><Ionicons name="play-circle" size={56} color={theme.colors.onPrimary} /></View> : null}
    </View>
  );
}

function VoiceDraftCard({ voice, recording, seconds, busy, disabled, notice, onStart, onStop, onRemove, theme }) {
  return (
    <View style={[styles.voiceCard, { borderColor: theme.semantic.border, backgroundColor: theme.semantic.cardAlt }]}>
      <View style={styles.voiceHeader}>
        <View style={styles.voiceTitle}>
          <Ionicons name="mic-outline" size={18} color={theme.semantic.primary} />
          <Caption>{recording ? `Recording · ${seconds}s` : voice ? `Voice note · ${seconds}s` : 'Add a voice note'}</Caption>
        </View>
        {voice && !recording ? (
          <Pressable onPress={onRemove} disabled={busy || disabled} accessibilityRole="button" accessibilityLabel="Remove voice draft" testID="tonight-voice-delete">
            <Ionicons name="trash-outline" size={19} color={theme.colors.danger} />
          </Pressable>
        ) : null}
      </View>
      {recording ? <Waveform values={buildWaveform(Math.max(2, seconds))} color={theme.semantic.primary} /> : null}
      {voice?.uri && !recording ? <VoiceDraftPlayer voice={voice} theme={theme} /> : null}
      <Button
        size="sm"
        variant={recording ? 'dark' : 'ghost'}
        onPress={recording ? onStop : onStart}
        loading={busy}
        disabled={disabled}
        testID={recording ? 'tonight-voice-stop' : 'tonight-voice-record'}
      >
        {recording ? 'Stop recording' : voice ? 'Record again' : 'Record voice'}
      </Button>
      {notice ? <Caption style={styles.voiceNotice}>{notice}</Caption> : null}
    </View>
  );
}

function VoiceDraftPlayer({ voice, theme }) {
  const player = useAudioPlayer({ uri: voice.uri }, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const toggle = () => {
    if (status.playing) player.pause();
    else player.play();
  };
  return (
    <View style={styles.voicePlayback}>
      <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={status.playing ? 'Pause voice draft' : 'Play voice draft'} style={styles.voicePlayButton} testID="tonight-voice-play">
        <Ionicons name={status.playing ? 'pause-circle' : 'play-circle'} size={34} color={theme.semantic.primary} />
      </Pressable>
      <View style={styles.voiceWaveform}><Waveform values={voice.waveform} color={theme.semantic.primary} /></View>
    </View>
  );
}

function BurstChooser({ open, onToggle, alternates, onSelect, disabled, theme }) {
  const selected = alternates.find((item) => item.selected);
  return (
    <View style={[styles.burstCard, { borderColor: theme.semantic.border }]} testID="tonight-burst">
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel="Review similar photos"
        accessibilityState={{ expanded: open }}
        style={styles.burstHeader}
        testID="tonight-burst-toggle"
      >
        <View style={styles.burstCopy}>
          <Caption style={{ fontWeight: '700' }}>Best of {alternates.length} similar photos</Caption>
          <Caption>{selected?.recommended ? 'Our clearest pick is selected.' : 'You chose another photo from this burst.'}</Caption>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.semantic.primary} />
      </Pressable>
      {open ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.burstList}>
          {alternates.map((alternate) => (
            <Pressable
              key={alternate.assetId}
              onPress={() => onSelect(alternate.assetId)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`${alternate.recommended ? 'Recommended photo. ' : ''}${alternate.selected ? 'Selected' : 'Choose this photo'}`}
              accessibilityState={{ selected: alternate.selected }}
              style={[styles.burstThumb, { borderColor: alternate.selected ? theme.semantic.primary : theme.semantic.border }]}
              testID={`tonight-burst-${alternate.assetId}`}
            >
              <Image source={{ uri: alternate.previewUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              {alternate.selected ? <View style={[styles.burstCheck, { backgroundColor: theme.semantic.primary }]}><Ionicons name="checkmark" size={13} color={theme.colors.onPrimary} /></View> : null}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function UnavailableCard({ onRetry, busy, theme, reason }) {
  const removed = /no longer|could not be found/i.test(String(reason || ''));
  return (
    <View style={styles.unavailable}>
      <Ionicons name={removed ? 'images-outline' : 'cloud-download-outline'} size={38} color={theme.semantic.primary} />
      <Hero maxFontSizeMultiplier={1.25} style={styles.unavailableTitle}>
        {removed ? 'This one left Photos.' : 'The original is waiting.'}
      </Hero>
      <Body maxFontSizeMultiplier={1.3} align="center">
        {removed
          ? 'You can skip it here. Anything already kept remains safely in Our World.'
          : 'Open it once in Photos if iCloud needs a moment, then try again.'}
      </Body>
      {!removed ? (
        <>
          <Spacer h={space.sm} />
          <Button size="md" variant="ghost" onPress={onRetry} loading={busy}>Try original again</Button>
        </>
      ) : null}
    </View>
  );
}

function Waveform({ values = [], color }) {
  const bars = values.length ? values : buildWaveform(8);
  return (
    <View style={styles.waveform} accessibilityElementsHidden>
      {bars.slice(0, 28).map((value, index) => (
        <View key={`${index}-${value}`} style={[styles.waveBar, { height: 5 + Number(value || 0) * 18, backgroundColor: color }]} />
      ))}
    </View>
  );
}

function buildWaveform(durationSec) {
  const count = 28;
  const seed = Math.max(1, Math.round(Number(durationSec || 1) * 10));
  return Array.from({ length: count }, (_, index) => 0.22 + (((seed * (index + 7) * 17) % 73) / 100));
}

function matchFromItem(item) {
  return {
    assetId: item.assetId,
    mediaType: item.mediaType,
    localUri: item.localUri,
    previewUri: item.previewUri,
    videoUri: item.mediaType === 'video' ? item.localUri : null,
    uri: item.previewUri || item.localUri,
    creationTime: item.captureTimeMs,
    duration: item.durationSec,
    width: item.width,
    height: item.height,
    curation: { reason: item.reasonCode, role: 'tonight', dayKey: item.localDay },
  };
}

function formatCaptureDate(date) {
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function isUnavailableError(error) {
  return /icloud|download|load media|unavailable/i.test(String(error?.message || error || ''));
}

function parentError(error, fallback) {
  if (isUnknownCaptureTimeError(error)) return UNKNOWN_CAPTURE_TIME_MESSAGE;
  if (isUnavailableError(error)) return 'The original is still waiting in iCloud. Open it once in Photos, then try again.';
  return fallback;
}

function completionTitle(summary) {
  if (!summary.kept) return 'You looked through tonight’s set.';
  if (summary.kept === 1) return 'One memory kept close.';
  return `${summary.kept} memories kept close.`;
}

function completionContext(summary) {
  const details = [];
  if (summary.withText) details.push(`${summary.withText} with your words`);
  if (summary.withVoice) details.push(`${summary.withVoice} with your voice`);
  if (summary.withReaction) details.push(`${summary.withReaction} favorited or reacted to`);
  return `${details.join(' · ')}. Everything confirmed is now in your shared family world.`;
}

function tonightAnalyticsContext({ family, entitlement }) {
  return {
    family_id: family?.id || null,
    actor_role: family?.me?.role || 'unknown',
    plan_state: entitlement?.isActive ? 'active' : 'lapsed',
    platform: analyticsPlatform(Platform.OS),
    environment: analyticsEnvironment(),
  };
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  lookbackScreen: { gap: space.md, paddingBottom: space.xxl },
  lookbackHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lookbackMedia: { width: '100%', aspectRatio: 4 / 5, borderRadius: 24, overflow: 'hidden' },
  lookbackTitle: { marginTop: -space.xs },
  lookbackContext: { gap: space.xs },
  lookbackContextRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  lookbackContextText: { flex: 1 },
  centerTitle: { textAlign: 'center', marginVertical: space.md, fontSize: 34, lineHeight: 40 },
  completionNote: { marginTop: space.md, maxWidth: 340 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, minHeight: 52 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mediaFrame: { width: '100%', overflow: 'hidden' },
  detailsScroll: { flex: 1 },
  details: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.xxl },
  dateTitle: { fontSize: 29, lineHeight: 34, marginTop: 3 },
  decisionDock: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm },
  actions: { flexDirection: 'row', gap: space.sm },
  action: { flex: 1 },
  secondaryAction: { minHeight: 42, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.sm },
  error: { marginTop: space.sm, textAlign: 'center' },
  playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  unavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  unavailableTitle: { fontSize: 28, lineHeight: 34, textAlign: 'center', marginTop: space.md, marginBottom: space.sm },
  enrichmentRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  enrichmentButton: { minHeight: 42, borderWidth: 1, borderRadius: 14, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  collectionDraft: { marginTop: space.md, gap: space.sm },
  collectionDraftHeader: { gap: 2 },
  collectionDraftTitle: { fontWeight: '800' },
  collectionChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  collectionChip: { minHeight: 38, borderWidth: 1, borderRadius: 999, paddingHorizontal: space.sm, flexDirection: 'row', alignItems: 'center', gap: 5 },
  collectionChipText: { fontWeight: '700' },
  emojiButton: { width: 42, height: 42, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 20, lineHeight: 25 },
  voiceCard: { borderWidth: 1, borderRadius: 16, padding: space.md, marginTop: space.md, gap: space.sm },
  voiceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  voiceTitle: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  voiceNotice: { textAlign: 'center' },
  voicePlayback: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  voicePlayButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  voiceWaveform: { flex: 1 },
  waveform: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 2, overflow: 'hidden' },
  waveBar: { width: 3, minHeight: 5, borderRadius: 2, opacity: 0.72 },
  burstCard: { borderWidth: 1, borderRadius: 16, marginTop: space.md, overflow: 'hidden' },
  burstHeader: { minHeight: 54, paddingHorizontal: space.md, paddingVertical: space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  burstCopy: { flex: 1, gap: 2 },
  burstList: { paddingHorizontal: space.md, paddingBottom: space.md, gap: space.sm },
  burstThumb: { width: 82, height: 82, borderRadius: 12, borderWidth: 2, overflow: 'hidden' },
  burstCheck: { position: 'absolute', right: 4, top: 4, width: 21, height: 21, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
