import React, { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { useAuth } from './AuthContext';
import { useBilling } from './BillingContext';
import { useFamily } from './FamilyContext';
import { analyticsEnvironment, analyticsPlatform } from './analyticsProductContext';
import { trackAnalyticsEvent } from './analytics';
import {
  approveFirstValuePreview,
  isApprovedFirstValuePreview,
  keepFirstValuePreview,
  previewAnalyticsProperties,
} from './firstValuePreviewModel';
import { readFirstValuePreview, writeFirstValuePreview } from './firstValuePreviewStore';
import { isMediaPolicyError } from './mediaPolicy';
import { Tags } from './storage';
import { Body, Button, Caption, Eyebrow, Hero, Screen, Spacer, radius, space, useTheme } from './ui';

const PAYWALL_VERSION = 'olw-first-look-v1';
const OFFER_VERSION = 'olw-family-2026-07';

export default function FirstValuePreviewScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuth();
  const { family } = useFamily();
  const { entitlement, loading: billingLoading } = useBilling();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!family?.id || !user?.id) return undefined;
    readFirstValuePreview({ familyId: family.id, userId: user.id })
      .then((value) => {
        if (!alive) return;
        setPreview(value);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [family?.id, user?.id]);

  const approve = async () => {
    if (!preview || !family?.id || !user?.id) return;
    setBusy(true);
    try {
      const approved = approveFirstValuePreview(preview);
      await writeFirstValuePreview({ familyId: family.id, userId: user.id, preview: approved });
      setPreview(approved);
      const analytics = previewAnalyticsProperties(approved);
      trackAnalyticsEvent('first_value_completed', {
        surface: 'first_value_preview',
        paywall_source: 'first_value_preview',
        paywall_version: PAYWALL_VERSION,
        offer_version: OFFER_VERSION,
        ...analytics,
      }, analyticsContext(family));
      trackAnalyticsEvent('paywall_eligible', {
        surface: 'first_value_preview',
        paywall_source: 'first_value_preview',
        paywall_version: PAYWALL_VERSION,
        offer_version: OFFER_VERSION,
        ...analytics,
      }, analyticsContext(family));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({
        pathname: '/purchase',
        params: { source: 'first_value_preview', returnTo: '/first-value-preview' },
      });
    } catch (error) {
      Alert.alert('Could not save your choice', error?.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const keep = async () => {
    if (!preview || !entitlement?.isActive || !family?.id || !user?.id) return;
    setBusy(true);
    try {
      const match = {
        assetId: preview.assetId,
        localUri: preview.localUri,
        mediaType: preview.mediaType,
        creationTime: preview.creationTime,
        frameTimeMs: preview.frameTimeMs,
      };
      try {
        await Tags.setBaby({
          familyId: family.id,
          assetId: preview.assetId,
          isBaby: true,
          match,
          videoPosterOnly: false,
          source: 'first-value-preview',
        });
      } catch (error) {
        if (preview.mediaType !== 'video' || !isMediaPolicyError(error)) throw error;
        await Tags.setBaby({
          familyId: family.id,
          assetId: preview.assetId,
          isBaby: true,
          match,
          videoPosterOnly: true,
          source: 'first-value-preview',
        });
      }
      const kept = keepFirstValuePreview(preview);
      await writeFirstValuePreview({ familyId: family.id, userId: user.id, preview: kept });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/timeline');
    } catch (error) {
      Alert.alert('Could not keep this moment yet', error?.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const continueToPaywall = () => {
    router.push({
      pathname: '/purchase',
      params: { source: 'first_value_preview', returnTo: '/first-value-preview' },
    });
  };

  if (loading || billingLoading) {
    return <Screen variant="dawn"><View style={styles.center}><Caption>Preparing your private First Look…</Caption></View></Screen>;
  }

  if (!preview) {
    return (
      <Screen variant="dawn">
        <View style={styles.center}>
          <Eyebrow align="center">Private First Look</Eyebrow>
          <Spacer h={space.md} />
          <Hero align="center" style={styles.emptyHero}>We need one authentic candidate first.</Hero>
          <Spacer h={space.md} />
          <Body align="center">Nothing is shared until you approve it.</Body>
          <Spacer h={space.xl} />
          <Button onPress={() => router.replace({ pathname: '/reference', params: { source: 'first_value' } })}>
            Try private discovery again
          </Button>
        </View>
      </Screen>
    );
  }

  const approved = isApprovedFirstValuePreview(preview);
  const active = entitlement?.isActive === true;

  return (
    <Screen scroll variant="dawn" contentStyle={styles.content}>
      <Eyebrow>Private First Look</Eyebrow>
      <Hero style={styles.hero} testID="first-value-proof-title">
        {approved ? 'You chose a real moment.' : 'Does this belong in your family world?'}
      </Hero>
      <Body style={{ color: theme.semantic.textSoft }}>
        {approved
          ? 'Your choice stays on this device until an active parent keeps it in the shared family archive.'
          : 'This candidate came from your photo library. Approving it does not upload or share it.'}
      </Body>
      <View style={[styles.photoFrame, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }]} testID="first-value-proof-card">
        <Image source={{ uri: preview.localUri }} style={styles.photo} contentFit="cover" transition={150} />
      </View>
      {active ? (
        <Button onPress={keep} loading={busy} disabled={busy} testID="keep-first-value">
          Keep in Our World
        </Button>
      ) : approved ? (
        <Button onPress={continueToPaywall} disabled={busy} testID="continue-family-offer">
          Continue with Family
        </Button>
      ) : (
        <Button onPress={approve} loading={busy} disabled={busy} testID="approve-first-value">
          Yes, this belongs
        </Button>
      )}
      <Button
        variant="quiet"
        onPress={() => router.replace({ pathname: '/reference', params: { source: 'first_value' } })}
        disabled={busy}
      >
        Try a different reference
      </Button>
      <Caption style={{ color: theme.semantic.textMuted }}>
        Parent approval is always required. We never fabricate a memory from an example image.
      </Caption>
    </Screen>
  );
}

function analyticsContext(family) {
  return {
    family_id: family?.id || null,
    actor_role: family?.me?.role || 'creator',
    plan_state: 'none',
    platform: analyticsPlatform(Platform.OS),
    environment: analyticsEnvironment(),
  };
}

const styles = StyleSheet.create({
  content: { paddingTop: space.xxl, paddingBottom: space.xxxl, gap: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  emptyHero: { fontSize: 30, lineHeight: 36 },
  hero: { fontSize: 36, lineHeight: 42 },
  photoFrame: { borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden', aspectRatio: 0.86 },
  photo: { width: '100%', height: '100%' },
});
