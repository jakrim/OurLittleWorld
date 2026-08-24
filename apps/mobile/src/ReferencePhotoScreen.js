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
import {
  AUTO_SEED_UI_WATCHDOG_MS,
  autoSeedProgressCopy,
} from './referenceAutoSeedModel';
import {
  clearReferenceAutoSeedAttempt,
  readReferenceAutoSeedAttempt,
  writeReferenceAutoSeedAttempt,
} from './referenceAutoSeedAttemptStore';
import { previewFromMatch } from './firstValuePreviewModel';
import {
  clearFirstValuePreview,
  readFirstValuePreview,
  writeFirstValuePreview,
} from './firstValuePreviewStore';

/**
 * Find or pick one clear starting photo. Face evidence and fallback
 * suggestions stay in local, family-and-user-scoped storage so each writer's
 * device can review its own library without exposing unsaved photos.
 *
 * Behaviour notes:
 *   - If a previous reference exists for this (family, user), we restore
 *     it on mount so the user can re-enter without re-picking.
 *   - First-value Back uses the stable setup route and resumes a completed
 *     local result. It never falls through the app gate and restarts scanning.
 */
export default function ReferencePhotoScreen() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams();
  const { family } = useFamily();
  const { user } = useAuth();
  const progressPreviewRequested = __DEV__ && params.progressPreview === '1';
  const firstValueRequested = params.source === 'first_value';
  const autoSeedRequested = params.autoSeed === '1' || params.autoSeed === 'resume' || progressPreviewRequested;
  const autoSeedStarted = useRef(false);
  const autoSeedSignal = useRef(null);

  const [picked, setPicked] = useState(null);   // { uri, width, height, assetId }
  const [embedding, setEmbedding] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [restored, setRestored] = useState(false);
  const [referenceCount, setReferenceCount] = useState(0);
  const [autoSeedState, setAutoSeedState] = useState({ status: autoSeedRequested ? 'idle' : 'manual' });
  const [autoSeedRun, setAutoSeedRun] = useState(0);
  const [restoreComplete, setRestoreComplete] = useState(false);

  // Restore a saved reference or a recent local-only fallback result before
  // deciding whether a new PhotoKit pass is necessary.
  useEffect(() => {
    if (!family?.id || !user?.id) return;
    let alive = true;
    (async () => {
      try {
        const [profile, attempt] = await Promise.all([
          readReferenceProfile({ familyId: family.id, userId: user.id }),
          autoSeedRequested
            ? readReferenceAutoSeedAttempt({
              familyId: family.id,
              userId: user.id,
              birthdayISO: family.babyBirthday,
            })
            : null,
        ]);
        if (!alive) return;
        const representative = representativeReference(profile);
        setReferenceCount(profile.references.length);
        if (representative?.uri) setPicked({ uri: representative.uri, assetId: representative.assetId });
        if (representative?.embedding?.length) setEmbedding(representative);
        if (representative?.uri || representative?.embedding) setRestored(true);
        if (autoSeedRequested && representative?.source === 'auto-seed' && !representative.parentConfirmed) {
          autoSeedStarted.current = true;
          setAutoSeedState({ status: 'ready' });
        } else if (autoSeedRequested && (representative?.uri || representative?.embedding)) {
          autoSeedStarted.current = true;
          setAutoSeedState({ status: 'manual', reason: 'saved-reference' });
        } else if (attempt) {
          autoSeedStarted.current = true;
          setAutoSeedState(attempt);
          const selected = attempt.suggestions?.find(
            (suggestion) => suggestion.assetId === attempt.selectedAssetId,
          );
          if (selected) {
            setPicked({
              uri: selected.localUri || selected.uri,
              width: selected.width,
              height: selected.height,
              assetId: selected.assetId,
              creationTime: selected.creationTime,
            });
            setEmbedding(selected);
          }
        }
      } catch {
        // A corrupt local attempt must not block the manual photo path.
      } finally {
        if (alive) setRestoreComplete(true);
      }
    })();
    return () => { alive = false; };
  }, [autoSeedRequested, family?.babyBirthday, family?.id, user?.id]);

  useEffect(() => {
    if (
      !restoreComplete
      || (!autoSeedRequested && autoSeedRun === 0)
      || !family?.id
      || !user?.id
    ) return;
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
    let watchdogFired = false;
    let watchdog = null;
    autoSeedSignal.current = signal;
    setAutoSeedState({
      status: 'running',
      progress: { phase: 'sampling', completed: 0, total: 0, facesFound: 0 },
    });
    (async () => {
      try {
        const result = await Promise.race([
          bootstrapBirthdayReference({
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
          }),
          new Promise((resolve) => {
            watchdog = setTimeout(() => {
              watchdogFired = true;
              signal.aborted = true;
              resolve({ status: 'fallback', reason: 'timeout' });
            }, AUTO_SEED_UI_WATCHDOG_MS);
          }),
        ]);
        if (watchdog) clearTimeout(watchdog);
        if (!alive || (signal.aborted && !watchdogFired)) return;
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
          const firstLookPreview = previewFromMatch(result.firstLookPreview);
          if (firstLookPreview) {
            await writeFirstValuePreview({
              familyId: family.id,
              userId: user.id,
              preview: firstLookPreview,
            });
          } else {
            await clearFirstValuePreview({ familyId: family.id, userId: user.id });
          }
          await clearReferenceAutoSeedAttempt({ familyId: family.id, userId: user.id });
          setAutoSeedState({
            status: 'ready',
            coverage: result.coverage,
            evidencePolicy: result.evidencePolicy,
          });
        } else if (result.suggestions?.length) {
          setPicked(null);
          setEmbedding(null);
          setRestored(false);
          const nextAttempt = {
            status: 'suggestions',
            reason: result.reason,
            suggestions: result.suggestions,
            evidencePolicy: result.evidencePolicy,
            selectedAssetId: null,
          };
          setAutoSeedState(nextAttempt);
          await writeReferenceAutoSeedAttempt({
            familyId: family.id,
            userId: user.id,
            birthdayISO: family.babyBirthday,
            attempt: nextAttempt,
          });
        } else {
          const nextAttempt = {
            status: 'manual',
            reason: result.reason,
            evidencePolicy: result.evidencePolicy,
          };
          setAutoSeedState(nextAttempt);
          await writeReferenceAutoSeedAttempt({
            familyId: family.id,
            userId: user.id,
            birthdayISO: family.babyBirthday,
            attempt: nextAttempt,
          });
        }
      } catch (err) {
        if (watchdog) clearTimeout(watchdog);
        console.warn('auto seed reference failed', err?.message);
        if (alive) {
          const nextAttempt = { status: 'manual', reason: 'error' };
          setAutoSeedState(nextAttempt);
          await writeReferenceAutoSeedAttempt({
            familyId: family.id,
            userId: user.id,
            birthdayISO: family.babyBirthday,
            attempt: nextAttempt,
          });
        }
      }
    })();
    return () => {
      alive = false;
      signal.aborted = true;
      if (watchdog) clearTimeout(watchdog);
      if (autoSeedSignal.current === signal) autoSeedSignal.current = null;
    };
  }, [autoSeedRequested, autoSeedRun, family?.babyBirthday, family?.id, progressPreviewRequested, restoreComplete, user?.id]);

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
    setAutoSeedState((current) => ({
      status: 'manual',
      reason: 'parent-picked',
      evidencePolicy: current.evidencePolicy,
      fallbackSuggestions: current.status === 'suggestions'
        ? current.suggestions
        : current.fallbackSuggestions,
      fallbackSelectedAssetId: current.status === 'suggestions'
        ? current.selectedAssetId
        : current.fallbackSelectedAssetId,
    }));

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
    await clearFirstValuePreview({ familyId: family.id, userId: user.id });
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
    const preserveSuggestions = autoSeedState.status === 'suggestions';
    if (!preserveSuggestions) {
      setAutoSeedState({ status: 'manual', reason: 'user-chose-manual' });
    }
    if (!preserveSuggestions && family?.id && user?.id) {
      await clearAutoSeedReferences({ familyId: family.id, userId: user.id });
      await clearFirstValuePreview({ familyId: family.id, userId: user.id });
      await writeReferenceAutoSeedAttempt({
        familyId: family.id,
        userId: user.id,
        birthdayISO: family.babyBirthday,
        attempt: { status: 'manual', reason: 'user-chose-manual' },
      });
    }
    await pick();
  };

  const returnToSuggestions = () => {
    const suggestions = autoSeedState.fallbackSuggestions || [];
    const selected = suggestions.find(
      (suggestion) => suggestion.assetId === autoSeedState.fallbackSelectedAssetId,
    );
    setPicked(selected ? {
      uri: selected.localUri || selected.uri,
      width: selected.width,
      height: selected.height,
      assetId: selected.assetId,
      creationTime: selected.creationTime,
    } : null);
    setEmbedding(selected || null);
    setError(null);
    setAutoSeedState({
      status: 'suggestions',
      reason: 'parent-returned',
      suggestions,
      evidencePolicy: autoSeedState.evidencePolicy,
      selectedAssetId: selected?.assetId || null,
    });
  };

  const selectSuggestedPhoto = (suggestion) => {
    const uri = suggestion?.localUri || suggestion?.uri || null;
    if (!uri || !suggestion?.embedding?.length) return;
    setPicked({
      uri,
      width: suggestion.width,
      height: suggestion.height,
      assetId: suggestion.assetId || null,
      creationTime: suggestion.creationTime,
    });
    setEmbedding(suggestion);
    setRestored(false);
    setError(null);
    setAutoSeedState((current) => ({
      ...current,
      selectedAssetId: suggestion.assetId,
    }));
    if (family?.id && user?.id) {
      void writeReferenceAutoSeedAttempt({
        familyId: family.id,
        userId: user.id,
        birthdayISO: family.babyBirthday,
        attempt: {
          ...autoSeedState,
          selectedAssetId: suggestion.assetId,
        },
      });
    }
  };

  const retryAutomaticDiscovery = async () => {
    if (!family?.id || !user?.id) return;
    if (autoSeedSignal.current) autoSeedSignal.current.aborted = true;
    await clearAutoSeedReferences({ familyId: family.id, userId: user.id });
    await clearReferenceAutoSeedAttempt({ familyId: family.id, userId: user.id });
    await clearFirstValuePreview({ familyId: family.id, userId: user.id });
    setPicked(null);
    setEmbedding(null);
    setRestored(false);
    setReferenceCount(0);
    setError(null);
    autoSeedStarted.current = false;
    setAutoSeedState({ status: 'idle' });
    setAutoSeedRun((current) => current + 1);
  };

  const onContinue = async () => {
    if (!family || !user) return;
    if (autoSeedState.status === 'ready') {
      await confirmRepresentativeReference({ familyId: family.id, userId: user.id });
      await clearReferenceAutoSeedAttempt({ familyId: family.id, userId: user.id });
      const preparedPreview = firstValueRequested
        ? await readFirstValuePreview({ familyId: family.id, userId: user.id })
        : null;
      Scan.reset();
      router.replace(
        preparedPreview
          ? '/first-value-preview'
          : firstValueRequested
            ? { pathname: '/scan', params: { source: 'first_value' } }
            : '/scan',
      );
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
    await clearReferenceAutoSeedAttempt({ familyId: family.id, userId: user.id });
    // Picking a new reference always means a fresh scan — clear stale matches.
    Scan.reset();
    router.push(firstValueRequested ? { pathname: '/scan', params: { source: 'first_value' } } : '/scan');
  };

  const onBack = async () => {
    if (autoSeedSignal.current) autoSeedSignal.current.aborted = true;
    if (autoSeeding && family?.id && user?.id) {
      await writeReferenceAutoSeedAttempt({
        familyId: family.id,
        userId: user.id,
        birthdayISO: family.babyBirthday,
        attempt: { status: 'manual', reason: 'cancelled' },
      });
    }
    if (firstValueRequested) {
      router.replace({
        pathname: '/setup',
        params: { source: 'first_value', resumeDiscovery: '1' },
      });
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/timeline');
  };

  const autoSeeding = autoSeedState.status === 'running' || autoSeedState.status === 'idle';
  const autoConfirming = autoSeedState.status === 'ready';
  const autoSuggesting = autoSeedState.status === 'suggestions';
  const hasUsableReference = autoConfirming || (!isNative ? !!picked : !!embedding?.embedding?.length);
  const progress = autoSeedState.progress || { phase: 'sampling', completed: 0, total: 0, facesFound: 0 };
  const progressCopy = autoSeedProgressCopy(progress);
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
            await clearFirstValuePreview({ familyId: family.id, userId: user.id });
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
        <Hero>
          {heroCopy({
            autoSeeding,
            autoConfirming,
            autoSuggesting,
            restored,
            babyName: family?.babyName,
          })}
        </Hero>
        <Body>
          {bodyCopy({
            autoSeeding,
            autoConfirming,
            autoSuggesting,
            restored,
            babyName: family?.babyName,
          })}
        </Body>

        <Spacer h={space.md} />

        {autoSuggesting ? (
          <View
            style={[
              styles.suggestionPanel,
              {
                backgroundColor: theme.semantic.cardAlt,
                borderColor: theme.semantic.border,
              },
            ]}
            testID="birthday-discovery-suggestions"
          >
            <View style={styles.suggestionGrid}>
              {(autoSeedState.suggestions || []).map((suggestion, index) => {
                const uri = suggestion.localUri || suggestion.uri;
                const selected = autoSeedState.selectedAssetId === suggestion.assetId;
                return (
                  <Pressable
                    key={suggestion.assetId || uri || index}
                    onPress={() => selectSuggestedPhoto(suggestion)}
                    accessibilityRole="button"
                    accessibilityLabel={`Possible photo ${index + 1}`}
                    accessibilityState={{ selected }}
                    style={[
                      styles.suggestionCard,
                      { borderColor: selected ? theme.semantic.primary : theme.semantic.border },
                      selected && styles.suggestionCardSelected,
                    ]}
                  >
                    <Image source={{ uri }} style={styles.suggestionImage} contentFit="cover" />
                    {selected ? (
                      <View style={[styles.suggestionCheck, { backgroundColor: theme.semantic.primary }]}>
                        <Ionicons name="checkmark" size={16} color={theme.colors.onPrimary} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <Caption align="center" style={{ color: theme.semantic.textMuted }}>
              These are possibilities, not confirmed matches. You decide which photo is {family?.babyName || 'your baby'}.
            </Caption>
          </View>
        ) : (
          <Pressable
            onPress={autoConfirming ? pickDifferentFromAutoSeed : pick}
            disabled={autoSeeding || busy}
            accessibilityRole="button"
            accessibilityLabel={autoConfirming ? 'Pick a different reference photo' : 'Pick reference photo'}
            style={[
              styles.frame,
              picked && !autoSeeding && styles.selectedFrame,
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
                <Caption align="center" style={{ marginTop: 4 }}>
                  {progressCopy.detail}
                </Caption>
                <Caption align="center" style={[styles.privateCaption, { color: theme.semantic.textMuted }]}>
                  Photos stay on this iPhone.
                </Caption>
              </View>
            ) : picked ? (
              <Image source={{ uri: picked.uri }} style={styles.preview} contentFit="cover" />
            ) : (
              <View style={styles.placeholder}>
                <Ionicons name="happy-outline" size={56} color={theme.semantic.primary} />
                <Spacer h={space.md} />
                <Body align="center" style={{ color: theme.semantic.textSoft }}>Choose from Photos</Body>
                <Caption align="center" style={{ marginTop: 4 }}>
                  A clear, well-lit photo of their face works best.
                </Caption>
              </View>
            )}
            {picked && !autoSeeding ? (
              <View style={styles.changeBadge}>
                <Caption style={{ color: theme.colors.onPrimary, fontWeight: '700' }}>
                  {autoConfirming ? 'Tap to pick another' : restored ? 'Tap to change' : 'Tap to replace'}
                </Caption>
              </View>
            ) : null}
          </Pressable>
        )}

        {automaticFallback && !hasUsableReference ? (
          <Caption align="center" style={{ color: theme.semantic.textMuted }}>
            We could not choose confidently. Nothing was used as {family?.babyName || 'your baby'}'s starting photo.
          </Caption>
        ) : null}

        {autoConfirming ? (
          <H gap="sm" align="center" justify="center">
            <Ionicons name="sparkles-outline" size={16} color={theme.semantic.textSoft} />
            <Caption style={{ color: theme.semantic.textSoft, fontWeight: '700' }}>
              Suggested from your own photo library
            </Caption>
          </H>
        ) : restored && !error && !autoSeeding ? (
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

        {autoSeeding ? null : autoSuggesting ? (
          <>
            <Button onPress={onContinue} disabled={!hasUsableReference}>
              {hasUsableReference ? `Yes, this is ${family?.babyName || 'my baby'}` : 'Choose a photo above'}
            </Button>
            <Button variant="ghost" onPress={chooseManualInstead}>
              Choose another from Photos
            </Button>
            <Button variant="quiet" onPress={retryAutomaticDiscovery}>
              Try automatic search again
            </Button>
          </>
        ) : (
          <>
            <Button onPress={onContinue} loading={busy} disabled={!hasUsableReference || busy}>
              {autoConfirming
                ? `Yes, this is ${family?.babyName || 'my baby'}`
                : restored ? 'Continue with this photo' : 'Start finding memories'}
            </Button>
            {isNative && !hasUsableReference ? (
              <Button variant="quiet" onPress={retryAutomaticDiscovery}>
                Try automatic search again
              </Button>
            ) : null}
            {autoSeedState.fallbackSuggestions?.length ? (
              <Button variant="quiet" onPress={returnToSuggestions}>
                Return to suggested photos
              </Button>
            ) : null}
          </>
        )}

        {autoSeeding ? (
          <Button variant="quiet" onPress={onBack}>
            Back
          </Button>
        ) : autoConfirming ? (
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

function heroCopy({ autoSeeding, autoConfirming, autoSuggesting, restored, babyName }) {
  if (autoSeeding) return `Finding ${babyName || 'your baby'}.`;
  if (autoConfirming) return `Is this ${babyName || 'your baby'}?`;
  if (autoSuggesting) return `We found a few possibilities.`;
  if (restored) return `Your starting photo.`;
  return `Choose one clear photo.`;
}

function bodyCopy({
  autoSeeding,
  autoConfirming,
  autoSuggesting,
  restored,
  babyName,
}) {
  const name = babyName || 'your baby';
  if (autoSeeding) {
    return `We’ll suggest one clear photo for you to confirm.`;
  }
  if (autoConfirming) {
    return `We think this may be ${name}, but you are the authority. Confirm it to start finding likely memories; nothing is shared until you keep it.`;
  }
  if (autoSuggesting) {
    return `We found clear faces but could not safely decide which one is ${name}. Choose a real photo below, or open Photos to pick another.`;
  }
  if (restored) {
    return `This is the photo this device uses to find likely memories of ${name}. The original stays in Photos, and you approve every memory.`;
  }
  return `Pick a clear, well-lit photo of ${name}'s face. It stays on this device and helps find likely memories for you to approve.`;
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
    aspectRatio: 1.45,
  },
  selectedFrame: {
    aspectRatio: 1.3,
  },
  suggestionPanel: {
    width: '100%',
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: space.md,
    gap: space.md,
    ...shadow.whisper,
  },
  suggestionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    justifyContent: 'center',
  },
  suggestionCard: {
    width: '31%',
    aspectRatio: 0.82,
    borderRadius: radius.lg,
    borderWidth: 2,
    overflow: 'hidden',
  },
  suggestionCardSelected: {
    borderWidth: 4,
  },
  suggestionImage: {
    width: '100%',
    height: '100%',
  },
  suggestionCheck: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
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
  privateCaption: {
    marginTop: space.md,
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
