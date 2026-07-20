import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from './AuthContext';
import { useBilling } from './BillingContext';
import { useFamily } from './FamilyContext';
import { ageAt, formatAge } from './ageModel';
import {
  beginTonightKeep,
  ensureNightlySession,
  failTonightKeep,
  finishTonightKeep,
  markTonightItemShown,
  markCandidatesUnavailable,
  readTonightSession,
  replaceTonightItemWithParentPick,
  restoreCandidateMedia,
  saveTonightDraft,
  skipTonightItem,
} from './candidateLedgerStore';
import { parentReasonLabel } from './nightlyQueueModel';
import { getAssetDetails } from './photos';
import { isMediaPolicyError } from './mediaPolicy';
import { Memories, Tags } from './storage';
import { Body, Button, Caption, Eyebrow, Field, Hero, Screen, Spacer, space, useTheme } from './ui';

export default function TonightScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { family } = useFamily();
  const { user } = useAuth();
  const { entitlement, loading: billingLoading } = useBilling();
  const writer = ['creator', 'partner'].includes(family?.me?.role);
  const canCurate = writer && entitlement?.isActive === true;
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');

  const load = useCallback(() => {
    if (billingLoading) return;
    if (!canCurate || !family?.id || !user?.id) {
      setLoading(false);
      return;
    }
    try {
      const next = readTonightSession({ familyId: family.id, userId: user.id })
        || ensureNightlySession({ familyId: family.id, userId: user.id });
      setSession(next);
      setError('');
    } catch (loadError) {
      setError(parentError(loadError, 'Tonight could not load on this device.'));
    } finally {
      setLoading(false);
    }
  }, [billingLoading, canCurate, family?.id, user?.id]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const activeItem = useMemo(() => {
    if (!session?.items?.length) return null;
    return session.items.find((item) => item.position >= session.currentPosition && ['queued', 'shown', 'unavailable'].includes(item.state))
      || session.items.find((item) => ['queued', 'shown', 'unavailable'].includes(item.state))
      || null;
  }, [session]);
  const keepNeedsRetry = ['saving', 'failed'].includes(activeItem?.commitState)
    && activeItem?.lastErrorCode !== 'asset_unavailable';

  useEffect(() => {
    setDraft(activeItem?.draftText || '');
    if (!activeItem || !session?.sessionId || !family?.id || !user?.id) return;
    markTonightItemShown({
      sessionId: session.sessionId,
      familyId: family.id,
      userId: user.id,
      position: activeItem.position,
    });
  }, [activeItem, family?.id, session?.sessionId, user?.id]);

  const changeDraft = useCallback((text) => {
    setDraft(text);
    if (!activeItem || !session?.sessionId || !family?.id || !user?.id) return;
    saveTonightDraft({
      sessionId: session.sessionId,
      familyId: family.id,
      userId: user.id,
      position: activeItem.position,
      text,
    });
  }, [activeItem, family?.id, session?.sessionId, user?.id]);

  const refreshAfterDecision = useCallback((next) => {
    if (next?.completed) {
      setSession({ ...session, completed: true, status: 'completed', items: session?.items || [] });
    } else {
      setSession(readTonightSession({ familyId: family.id, userId: user.id }) || next);
    }
    setDraft('');
    setError('');
  }, [family?.id, session, user?.id]);

  const keep = async () => {
    if (!activeItem || busy) return;
    setBusy(true);
    setError('');
    try {
      const prepared = beginTonightKeep({
        sessionId: session.sessionId,
        familyId: family.id,
        userId: user.id,
        position: activeItem.position,
      });
      if (!prepared.alreadyComplete) {
        const match = matchFromItem(activeItem);
        try {
          await Tags.setBaby({
            familyId: family.id,
            assetId: activeItem.assetId,
            isBaby: true,
            match,
            videoPosterOnly: false,
            source: 'tonight-curation',
          });
        } catch (saveError) {
          if (activeItem.mediaType !== 'video' || !isMediaPolicyError(saveError)) throw saveError;
          await Tags.setBaby({
            familyId: family.id,
            assetId: activeItem.assetId,
            isBaby: true,
            match,
            videoPosterOnly: true,
            source: 'tonight-curation',
          });
        }
        if (draft.trim()) {
          await Memories.setMine({
            familyId: family.id,
            ownerUserId: user.id,
            assetId: activeItem.assetId,
            note: draft,
          });
        }
      }
      const next = finishTonightKeep({
        sessionId: session.sessionId,
        familyId: family.id,
        userId: user.id,
        position: activeItem.position,
      });
      refreshAfterDecision(next);
    } catch (saveError) {
      const unavailableFailure = isUnavailableError(saveError);
      failTonightKeep({
        sessionId: session.sessionId,
        familyId: family.id,
        userId: user.id,
        position: activeItem.position,
        errorCode: unavailableFailure ? 'asset_unavailable' : 'save_failed',
      });
      if (unavailableFailure) {
        markCandidatesUnavailable({
          familyId: family.id,
          userId: user.id,
          assetIds: [activeItem.assetId],
          reason: 'The original is waiting in iCloud.',
        });
        setSession(readTonightSession({ familyId: family.id, userId: user.id }));
      }
      setError(parentError(saveError, 'This memory did not finish saving. It is safe to try again.'));
    } finally {
      setBusy(false);
    }
  };

  const skip = () => {
    if (!activeItem || busy || keepNeedsRetry) return;
    const next = skipTonightItem({
      sessionId: session.sessionId,
      familyId: family.id,
      userId: user.id,
      position: activeItem.position,
    });
    refreshAfterDecision(next);
  };

  const chooseAnother = async () => {
    if (!activeItem || busy || keepNeedsRetry) return;
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
    const next = replaceTonightItemWithParentPick({
      sessionId: session.sessionId,
      familyId: family.id,
      userId: user.id,
      position: activeItem.position,
      asset: picked,
    });
    setSession(next);
  };

  const retryAvailability = async () => {
    if (!activeItem) return;
    setBusy(true);
    setError('');
    try {
      const info = await getAssetDetails(activeItem.assetId, { downloadFromNetwork: true });
      const localUri = info?.localUri || info?.uri;
      if (!localUri) throw new Error(info?.downloadError || 'The original is still waiting in iCloud.');
      restoreCandidateMedia({
        familyId: family.id,
        userId: user.id,
        assetId: activeItem.assetId,
        localUri,
      });
      load();
    } catch (availabilityError) {
      setError(parentError(availabilityError, 'The original is still unavailable. Open Photos once, then try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (!writer) {
    return (
      <Screen variant="warm" contentStyle={styles.centered}>
        <Eyebrow>Private discovery</Eyebrow>
        <Hero style={styles.centerTitle}>Tonight belongs to the parents.</Hero>
        <Body align="center">Circle members can enjoy memories after a parent keeps them in Our World.</Body>
        <Spacer h={space.xl} />
        <Button variant="ghost" onPress={() => router.replace('/timeline')}>Back to Our World</Button>
      </Screen>
    );
  }

  if (loading || billingLoading) {
    return <Screen variant="warm" contentStyle={styles.centered}><ActivityIndicator color={theme.semantic.primary} /></Screen>;
  }

  if (!canCurate) {
    return (
      <Screen variant="warm" contentStyle={styles.centered}>
        <Eyebrow>Tonight is paused</Eyebrow>
        <Hero style={styles.centerTitle}>Your saved family world is still here.</Hero>
        <Body align="center">When the family plan is active, private photo discovery and new Tonight decisions can continue.</Body>
        <Spacer h={space.xl} />
        <Button variant="ghost" onPress={() => router.replace('/timeline')}>Back to Our World</Button>
      </Screen>
    );
  }

  if (session?.completed) {
    return (
      <Screen variant="warm" contentStyle={styles.centered}>
        <Eyebrow>That's tonight</Eyebrow>
        <Hero style={styles.centerTitle}>The memories you chose are safe in your world.</Hero>
        <Body align="center">Come back tomorrow. There is no catching up you need to finish tonight.</Body>
        <Spacer h={space.xl} />
        <Button onPress={() => router.replace('/timeline')} testID="tonight-complete">Back to Today</Button>
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
        <Button variant="ghost" onPress={() => router.replace('/timeline')}>Back to Today</Button>
      </Screen>
    );
  }

  const captureDate = activeItem.captureTimeMs ? new Date(activeItem.captureTimeMs) : null;
  const age = captureDate && family?.babyBirthday
    ? formatAge(ageAt(family.babyBirthday, captureDate.getTime()))
    : '';
  const unavailable = activeItem.availability !== 'available' || !activeItem.localUri;
  const remaining = session.items.filter((item) => ['queued', 'shown', 'unavailable'].includes(item.state)).length;

  return (
    <Screen bare edges={{ top: true, bottom: true }}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Pressable onPress={() => router.replace('/timeline')} accessibilityRole="button" accessibilityLabel="Close Tonight" style={styles.iconButton}>
            <Ionicons name="close" size={24} color={theme.semantic.text} />
          </Pressable>
          <Caption maxFontSizeMultiplier={1.6}>{activeItem.position + 1} of {session.itemCount} · {remaining} left</Caption>
          <Pressable onPress={() => router.push('/review')} accessibilityRole="button" accessibilityLabel="Open advanced photo review" style={styles.iconButton}>
            <Ionicons name="grid-outline" size={21} color={theme.semantic.text} />
          </Pressable>
        </View>

        <View style={[styles.mediaFrame, { backgroundColor: theme.semantic.cardAlt }]} testID="tonight-media-card">
          {unavailable ? (
            <UnavailableCard onRetry={retryAvailability} busy={busy} theme={theme} />
          ) : activeItem.mediaType === 'video' ? (
            <TonightVideo uri={activeItem.localUri} posterUri={activeItem.previewUri} theme={theme} />
          ) : (
            <Image source={{ uri: activeItem.localUri }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" />
          )}
        </View>

        <ScrollView
          style={styles.detailsScroll}
          contentContainerStyle={styles.details}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <Eyebrow maxFontSizeMultiplier={1.6}>{parentReasonLabel(activeItem.reasonCode)}</Eyebrow>
          <Hero maxFontSizeMultiplier={1.8} style={styles.dateTitle}>{captureDate ? formatCaptureDate(captureDate) : 'A memory worth a look'}</Hero>
          {age ? <Caption maxFontSizeMultiplier={1.8}>{age}</Caption> : null}
          <Spacer h={space.md} />
          <Field
            label="Add one line (optional)"
            value={draft}
            onChangeText={changeDraft}
            placeholder="What do you want to remember?"
            inputProps={{ maxLength: 280, returnKeyType: 'done', maxFontSizeMultiplier: 1.8 }}
            testID="tonight-draft"
          />
          {error || keepNeedsRetry ? (
            <Caption style={[styles.error, { color: theme.colors.danger }]}>
              {error || 'Keep did not finish yet. Try Keep again before moving on.'}
            </Caption>
          ) : null}
          <View style={styles.actions}>
            <Button fullWidth={false} style={styles.action} variant="ghost" onPress={skip} disabled={busy || keepNeedsRetry} testID="tonight-skip">Skip</Button>
            <Button fullWidth={false} style={styles.action} onPress={keep} loading={busy} disabled={unavailable} testID="tonight-keep">Keep</Button>
          </View>
          <Pressable onPress={chooseAnother} disabled={busy || keepNeedsRetry} accessibilityRole="button" style={styles.secondaryAction} testID="tonight-picker">
            <Ionicons name="images-outline" size={18} color={theme.semantic.primary} />
            <Caption style={{ color: theme.semantic.primary, fontWeight: '700' }}>Choose another from Photos</Caption>
          </Pressable>
          <Pressable onPress={() => router.push('/review')} accessibilityRole="button" style={styles.secondaryAction} testID="tonight-advanced-review">
            <Caption>Advanced review grid</Caption>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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

function UnavailableCard({ onRetry, busy, theme }) {
  return (
    <View style={styles.unavailable}>
      <Ionicons name="cloud-download-outline" size={46} color={theme.semantic.primary} />
      <Hero style={styles.unavailableTitle}>The original is waiting.</Hero>
      <Body align="center">Open it once in Photos if iCloud needs a moment, then try again.</Body>
      <Spacer h={space.lg} />
      <Button size="md" variant="ghost" onPress={onRetry} loading={busy}>Try original again</Button>
    </View>
  );
}

function matchFromItem(item) {
  return {
    assetId: item.assetId,
    mediaType: item.mediaType,
    localUri: item.localUri,
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
  if (isUnavailableError(error)) return 'The original is still waiting in iCloud. Open it once in Photos, then try again.';
  return fallback;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  centerTitle: { textAlign: 'center', marginVertical: space.md, fontSize: 34, lineHeight: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, minHeight: 52 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mediaFrame: { flex: 1, minHeight: 220, overflow: 'hidden' },
  detailsScroll: { flexGrow: 0, maxHeight: '55%' },
  details: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.sm },
  dateTitle: { fontSize: 29, lineHeight: 34, marginTop: 3 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  action: { flex: 1 },
  secondaryAction: { minHeight: 42, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.sm },
  error: { marginTop: space.sm, textAlign: 'center' },
  playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  unavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  unavailableTitle: { fontSize: 28, lineHeight: 34, textAlign: 'center', marginTop: space.md, marginBottom: space.sm },
});
