import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View, StyleSheet, Pressable, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { Screen, Button, BrandedBackHeader, Hero, Body, Caption, V, H, Spacer, glass, space, radius, shadow, useTheme } from './ui';
import { embedFace, isNative } from './faceMatcher';
import { useFamily } from './FamilyContext';
import { useAuth } from './AuthContext';
import * as Scan from './scanController';
import {
  addReferenceImage,
  clearAutoSeedReferences,
  clearReferenceProfile,
  confirmRepresentativeReference,
  readReferenceProfile,
  representativeReference,
  referenceStorageKey as makeReferenceStorageKey,
} from './recognitionReferences';
import { bootstrapBirthdayReference } from './referenceAutoSeed';
import { autoSeedProgressCopy, autoSeedProgressPercent } from './referenceAutoSeedModel';

/**
 * "Pick a photo of your baby." We embed it via the native face matcher
 * and stash the embedding in AsyncStorage (per-user, per-device) so the
 * scan screen can use it. Wife and husband each pick their own reference
 * because each device has its own library.
 *
 * Behaviour notes:
 *   - If a previous reference exists for this (family, user), we restore
 *     it on mount so the user can re-enter without re-picking.
 *   - The back chevron / iOS swipe-back returns to wherever they came
 *     from (we use `navigate`, not `replace`).
 */
export default function ReferencePhotoScreen() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams();
  const { family } = useFamily();
  const { user } = useAuth();
  const progressPreviewRequested = __DEV__ && params.progressPreview === '1';
  const firstValueRequested = params.source === 'first_value';
  const autoSeedRequested = params.autoSeed === '1' || progressPreviewRequested;
  const autoSeedStarted = useRef(false);
  const autoSeedSignal = useRef(null);

  const [picked, setPicked] = useState(null);   // { uri, width, height, assetId }
  const [embedding, setEmbedding] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [restored, setRestored] = useState(false);
  const [referenceCount, setReferenceCount] = useState(0);
  const [autoSeedState, setAutoSeedState] = useState({ status: autoSeedRequested ? 'idle' : 'manual' });

  // Restore the previously-saved reference if one exists.
  useEffect(() => {
    if (!family?.id || !user?.id) return;
    let alive = true;
    (async () => {
      try {
        const profile = await readReferenceProfile({ familyId: family.id, userId: user.id });
        if (!alive) return;
        const representative = representativeReference(profile);
        setReferenceCount(profile.references.length);
        if (representative?.uri) setPicked({ uri: representative.uri, assetId: representative.assetId });
        if (representative?.embedding?.length) setEmbedding(representative);
        if (representative?.uri || representative?.embedding) setRestored(true);
      } catch {}
    })();
    return () => { alive = false; };
  }, [family?.id, user?.id]);

  useEffect(() => {
    if (!autoSeedRequested || !family?.id || !user?.id) return;
    if (progressPreviewRequested) {
      setAutoSeedState({
        status: 'running',
        progress: { phase: 'analyzing', completed: 48, total: 180, facesFound: 22 },
      });
      return;
    }
    if (autoSeedStarted.current) return;
    autoSeedStarted.current = true;
    if (!isNative) {
      setAutoSeedState({ status: 'manual', reason: 'native-unavailable' });
      return;
    }

    let alive = true;
    const signal = { aborted: false };
    autoSeedSignal.current = signal;
    setAutoSeedState({
      status: 'running',
      progress: { phase: 'sampling', completed: 0, total: 0, facesFound: 0 },
    });
    (async () => {
      try {
        const result = await bootstrapBirthdayReference({
          familyId: family.id,
          userId: user.id,
          birthdayISO: family.babyBirthday,
          signal,
          onProgress: (progress) => {
            if (!alive || signal.aborted) return;
            setAutoSeedState((current) => (
              current.status === 'running'
                ? { ...current, progress }
                : current
            ));
          },
        });
        if (!alive || signal.aborted) return;
        if (__DEV__ && result.diagnostics) {
          console.info('discovery diagnostics', result.diagnostics);
        }
        if (result.status === 'seeded') {
          const preview = result.preview;
          setPicked({
            uri: preview?.localUri || preview?.uri || null,
            width: preview?.width,
            height: preview?.height,
            assetId: preview?.assetId || null,
          });
          setEmbedding({
            embedding: preview?.embedding || null,
            faceCount: preview?.faceCount || 1,
          });
          setReferenceCount(result.referenceCount || 0);
          setRestored(true);
          setError(null);
          setAutoSeedState({ status: 'ready', coverage: result.coverage });
        } else {
          setAutoSeedState({ status: 'manual', reason: result.reason });
        }
      } catch (err) {
        console.warn('auto seed reference failed', err?.message);
        if (alive) setAutoSeedState({ status: 'manual', reason: 'error' });
      }
    })();
    return () => {
      alive = false;
      signal.aborted = true;
      if (autoSeedSignal.current === signal) autoSeedSignal.current = null;
    };
  }, [autoSeedRequested, family?.babyBirthday, family?.id, progressPreviewRequested, user?.id]);

  const pick = async () => {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
      exif: false,
      shouldDownloadFromNetwork: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const a = result.assets[0];
    setPicked({ uri: a.uri, width: a.width, height: a.height, assetId: a.assetId || null });
    setEmbedding(null);
    setRestored(false);
    setAutoSeedState({ status: 'manual' });

    if (!isNative) {
      // No native module yet — accept any photo; we'll fall back to
      // chronological browsing in the next screen.
      return;
    }
    setBusy(true);
    try {
      const emb = await embedFace(a.uri);
      if (!emb || emb.faceCount === 0 || !emb.embedding?.length) {
        setError("Couldn't find a clear face in that photo. Try one that's well-lit.");
        setEmbedding(null);
      } else {
        setEmbedding(emb);
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const pickDifferentFromAutoSeed = async () => {
    if (!family || !user) return;
    await clearAutoSeedReferences({ familyId: family.id, userId: user.id });
    setPicked(null);
    setEmbedding(null);
    setRestored(false);
    setReferenceCount(0);
    setError(null);
    setAutoSeedState({ status: 'manual', reason: 'user-correction' });
    await pick();
  };

  const chooseManualInstead = async () => {
    if (autoSeedSignal.current) autoSeedSignal.current.aborted = true;
    setAutoSeedState({ status: 'manual', reason: 'user-chose-manual' });
    if (family?.id && user?.id) {
      await clearAutoSeedReferences({ familyId: family.id, userId: user.id });
    }
    await pick();
  };

  const onContinue = async () => {
    if (!family || !user) return;
    if (autoSeedState.status === 'ready') {
      await confirmRepresentativeReference({ familyId: family.id, userId: user.id });
      Scan.reset();
      router.push(firstValueRequested ? { pathname: '/scan', params: { source: 'first_value' } } : '/scan');
      return;
    }
    if (isNative && !embedding) {
      Alert.alert('Pick a photo first', 'When birthday-first discovery cannot find a likely match, one clear face photo helps this device review likely photos.');
      return;
    }
    await addReferenceImage({
      familyId: family.id,
      userId: user.id,
      birthdayISO: family.babyBirthday,
      uri: picked?.uri || null,
      assetId: picked?.assetId || null,
      embedding: embedding?.embedding || null,
      faceCount: embedding?.faceCount || 1,
      capturedAt: embedding?.capturedAt || picked?.creationTime || Date.now(),
      source: restored ? (embedding?.source || 'existing-reference') : 'seed',
      parentConfirmed: true,
      captureQuality: embedding?.captureQuality,
      sharpness: embedding?.sharpness,
      faceSizeRatio: embedding?.faceSizeRatio,
      primaryBox: embedding?.primaryBox,
      yaw: embedding?.yaw,
      roll: embedding?.roll,
      brightness: embedding?.brightness,
      setRepresentative: true,
    });
    // Picking a new reference always means a fresh scan — clear stale matches.
    Scan.reset();
    router.push(firstValueRequested ? { pathname: '/scan', params: { source: 'first_value' } } : '/scan');
  };

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/timeline');
  };

  const autoSeeding = autoSeedState.status === 'running' || autoSeedState.status === 'idle';
  const autoConfirming = autoSeedState.status === 'ready';
  const hasUsableReference = autoConfirming || (!isNative ? !!picked : !!embedding?.embedding?.length);
  const progress = autoSeedState.progress || { phase: 'sampling', completed: 0, total: 0, facesFound: 0 };
  const progressCopy = autoSeedProgressCopy(progress);
  const progressPercent = autoSeedProgressPercent(progress);
  const automaticFallback = autoSeedRequested
    && autoSeedState.status === 'manual'
    && !['user-chose-manual', 'user-correction'].includes(autoSeedState.reason);

  const onClearReference = async () => {
    if (!family || !user) return;
    Alert.alert(
      'Use a different photo?',
      'This will clear the saved reference so you can pick a new one.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearReferenceProfile({ familyId: family.id, userId: user.id });
            setPicked(null);
            setEmbedding(null);
            setRestored(false);
            setReferenceCount(0);
            setError(null);
          },
        },
      ],
    );
  };

  return (
    <Screen variant="warm" scroll>
      <BrandedBackHeader onBack={onBack} style={styles.topRow} />

      <V gap="lg" style={{ paddingTop: space.lg, paddingBottom: space.xxl }}>
        <Hero>{heroCopy({ autoSeeding, autoConfirming, restored, babyName: family?.babyName })}</Hero>
        <Body>{bodyCopy({ autoSeeding, autoConfirming, restored, babyName: family?.babyName })}</Body>

        <Spacer h={space.md} />

        <Pressable
          onPress={autoConfirming ? pickDifferentFromAutoSeed : pick}
          disabled={autoSeeding || busy}
          accessibilityRole="button"
          accessibilityLabel={autoConfirming ? 'Pick a different reference photo' : 'Pick reference photo'}
          style={[
            styles.frame,
            {
              backgroundColor: theme.semantic.cardAlt,
              borderColor: theme.semantic.border,
            },
            autoSeeding && styles.progressFrame,
          ]}
        >
          {autoSeeding ? (
            <View
              style={styles.placeholder}
              testID="birthday-discovery-progress"
              accessibilityLiveRegion="polite"
            >
              <ActivityIndicator color={theme.semantic.primary} />
              <Spacer h={space.md} />
              <Body align="center" style={{ color: theme.semantic.textSoft }}>{progressCopy.title}</Body>
              <View
                style={[styles.progressTrack, { backgroundColor: theme.semantic.border }]}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: progressPercent }}
              >
                <View style={[styles.progressFill, { backgroundColor: theme.semantic.primary, width: `${progressPercent}%` }]} />
              </View>
              <Caption align="center" style={{ marginTop: 4 }}>
                {progressCopy.detail}
              </Caption>
              <Caption align="center" style={[styles.progressPercent, { color: theme.semantic.textMuted }]}>
                {progressPercent}% - stays on this device
              </Caption>
            </View>
          ) : picked ? (
            <Image source={{ uri: picked.uri }} style={styles.preview} contentFit="cover" />
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name="happy-outline" size={56} color={theme.semantic.primary} />
              <Spacer h={space.md} />
              <Body align="center" style={{ color: theme.semantic.textSoft }}>Tap to pick a photo</Body>
              <Caption align="center" style={{ marginTop: 4 }}>
                A clear, well-lit shot of their face works best.
              </Caption>
            </View>
          )}
          {picked ? (
            <View style={styles.changeBadge}>
              <Caption style={{ color: theme.colors.onPrimary, fontWeight: '700' }}>
                {autoConfirming ? 'Tap to pick another' : restored ? 'Tap to change' : 'Tap to replace'}
              </Caption>
            </View>
          ) : null}
        </Pressable>

        {autoSeeding ? (
          <Caption align="center" style={{ color: theme.semantic.textMuted }}>
            Large libraries can take a few minutes. You can switch to one clear photo at any time.
          </Caption>
        ) : automaticFallback ? (
          <Caption align="center" style={{ color: theme.semantic.textMuted }}>
            Automatic setup could not find one clear repeated face. Choose a photo to continue.
          </Caption>
        ) : null}

        {autoConfirming ? (
          <H gap="sm" align="center" justify="center">
            <Ionicons name="sparkles-outline" size={16} color={theme.semantic.textSoft} />
            <Caption style={{ color: theme.semantic.textSoft, fontWeight: '700' }}>
              Seeded {referenceCount} local references from the birthday onward
            </Caption>
          </H>
        ) : restored && !error ? (
          <H gap="sm" align="center" justify="center">
            <Ionicons name="bookmark" size={16} color={theme.semantic.textSoft} />
            <Caption style={{ color: theme.semantic.textSoft, fontWeight: '700' }}>
              {referenceCount > 1 ? `Using ${referenceCount} local references` : 'Using saved reference'} - tap to change
            </Caption>
          </H>
        ) : null}

        {busy ? (
          <Caption align="center">Reading the photo…</Caption>
        ) : embedding && isNative && !restored ? (
          <H gap="sm" align="center" justify="center">
            <Ionicons name="checkmark-circle" size={18} color={theme.semantic.secondary} />
            <Caption style={{ color: theme.semantic.secondary, fontWeight: '700' }}>
              Face found - ready to review
            </Caption>
          </H>
        ) : null}

        {error ? (
          <Caption style={{ color: theme.colors.danger, textAlign: 'center' }}>{error}</Caption>
        ) : null}

        <Spacer h={space.md} />

        {autoSeeding ? (
          <Button variant="ghost" onPress={chooseManualInstead}>
            Choose one photo instead
          </Button>
        ) : (
          <Button onPress={onContinue} loading={busy} disabled={!hasUsableReference || busy}>
            {autoConfirming
              ? 'Yes, start review scan'
              : restored ? 'Continue with this reference' : 'Start review scan'}
          </Button>
        )}

        {autoConfirming ? (
          <Button variant="quiet" onPress={pickDifferentFromAutoSeed}>
            Pick a different photo
          </Button>
        ) : restored ? (
          <Button variant="quiet" onPress={onClearReference}>
            Use a different photo
          </Button>
        ) : (
          <Button variant="quiet" onPress={onBack}>
            Back
          </Button>
        )}
      </V>
    </Screen>
  );
}

export function referenceStorageKey(args) {
  return makeReferenceStorageKey(args);
}

function heroCopy({ autoSeeding, autoConfirming, restored, babyName }) {
  if (autoSeeding) return `Setting up photo discovery.`;
  if (autoConfirming) return `Is this ${babyName || 'your baby'}?`;
  if (restored) return `Review photo discovery.`;
  return `Choose one photo to finish discovery.`;
}

function bodyCopy({ autoSeeding, autoConfirming, restored, babyName }) {
  const learningCopy = `Matching uses the full local reference set, not this photo alone.`;
  if (autoSeeding) {
    return `Step 1 of 2: starting from ${babyName || 'your baby'}'s birthday, we check a bounded spread of photos on this device for a face that repeats across time. You will confirm a possible match before review starts.`;
  }
  if (autoConfirming) {
    return `Step 2 of 2: confirm that this clear representative is ${babyName || 'your baby'}, then review the likely photos before anything reaches your family world. ${learningCopy}`;
  }
  if (restored) return `This is the saved representative for the local reference set. ${learningCopy} The original stays in Photos.`;
  return `When birthday-first discovery is unavailable or cannot find a likely match, one clear face photo helps this device review likely matches. Scanning stays on your phone; moments you save go to your private family archive.`;
}

const styles = StyleSheet.create({
  topRow: {
    paddingTop: space.sm,
  },
  frame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    ...shadow.whisper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressFrame: {
    aspectRatio: 1.3,
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    alignItems: 'center',
    paddingHorizontal: space.lg,
    width: '100%',
  },
  progressTrack: {
    width: '82%',
    height: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  progressPercent: {
    marginTop: space.sm,
    fontWeight: '700',
  },
  changeBadge: {
    position: 'absolute',
    bottom: space.md,
    right: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: glass.inkScrim,
    borderRadius: radius.pill,
  },
});
