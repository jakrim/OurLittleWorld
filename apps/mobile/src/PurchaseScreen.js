import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  finishTransaction,
  getAvailablePurchases as getStorePurchases,
  isEligibleForIntroOfferIOS,
  useIAP,
} from 'expo-iap';

import { useAuth } from './AuthContext';
import { useBilling } from './BillingContext';
import { useFamily } from './FamilyContext';
import { EXPORT_POLICY_COPY } from './exportPolicyCopy';
import { GIFT_REDEMPTION_COPY } from './giftOfferCopy';
import {
  FAMILY_PRODUCT_IDS,
  SUBSCRIPTION_GROUP_ID_IOS,
  SUBSCRIPTION_PRODUCT_IDS,
  SUPPORT_EMAIL,
  normalizeEntitlement,
  verifyStorePurchase,
} from './billing';
import {
  Body,
  Button,
  Caption,
  Eyebrow,
  Field,
  Screen,
  Title,
  radius,
  shadow,
  space,
  useTheme,
} from './ui';
import { trackAnalyticsEvent } from './analytics';
import { analyticsEnvironment, analyticsPlatform } from './analyticsProductContext';
import { readFirstValuePreview } from './firstValuePreviewStore';
import { redemptionAnalyticsProperties, redemptionStatus } from './redemptionModel';
import {
  OLW_OFFER_VERSION,
  OLW_PAYWALL_VERSION,
  buildFamilyPlans,
  computeAnnualSavings,
  storefrontBucket,
  subscriptionAnalyticsProperties,
} from './subscriptionOfferModel';

const FEATURES = [
  'Private family archive for one child',
  'One invited co-parent',
  'Photos, video, notes, voices, Firsts, and letters',
  '300 saved video minutes',
];

export default function PurchaseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const theme = useTheme();
  const { user } = useAuth();
  const { family } = useFamily();
  const { refresh, redeemCode } = useBilling();
  const [selectedDuration, setSelectedDuration] = useState('annual');
  const [busyProductId, setBusyProductId] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [status, setStatus] = useState('');
  const [productFetchCompleted, setProductFetchCompleted] = useState(false);
  const [iosTrialEligible, setIosTrialEligible] = useState(Platform.OS === 'ios' ? null : false);
  const [preview, setPreview] = useState(null);
  const verifyingRef = useRef(false);
  const redeemingRef = useRef(false);
  const plansRef = useRef([]);
  const viewedRef = useRef(false);
  const paywallSource = normalizePaywallSource(singleParam(params.source));
  const returnTo = normalizeReturnTo(
    singleParam(params.returnTo),
    preview?.localUri ? '/first-value-preview' : '/timeline',
  );
  const deepLinkCode = singleParam(params.code);

  useEffect(() => {
    if (deepLinkCode && !code) setCode(deepLinkCode.trim().slice(0, 80));
  }, [code, deepLinkCode]);

  useEffect(() => {
    let alive = true;
    if (!family?.id || !user?.id) return undefined;
    readFirstValuePreview({ familyId: family.id, userId: user.id })
      .then((value) => {
        if (alive) setPreview(value);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [family?.id, user?.id]);

  const completeVerifiedPurchase = useCallback(async ({ purchase, restored = false }) => {
    if (!family?.id) throw new Error('Create your family before verifying a purchase.');
    const plan = plansRef.current.find((item) => item.id === purchase.productId) || null;
    const rawEntitlement = await verifyStorePurchase({
      familyId: family.id,
      purchase,
      provider: Platform.OS === 'ios' ? 'apple' : 'google',
      productId: purchase.productId,
    });
    const providerEntitlement = normalizeEntitlement(rawEntitlement);
    if (!providerEntitlement.isActive) {
      throw new Error('The store receipt was not an active Family entitlement.');
    }
    await finishTransaction({ purchase, isConsumable: false });
    const refreshedEntitlement = await refresh();
    if (!refreshedEntitlement?.isActive) {
      throw new Error('The purchase was verified, but the active entitlement has not propagated yet.');
    }

    if (plan) {
      const funnel = {
        ...subscriptionAnalyticsProperties(plan, { verifiedEntitlementOutcome: 'granted' }),
        paywall_source: paywallSource,
        storefront_bucket: storefrontBucket(purchase.countryCodeIOS),
      };
      trackAnalyticsEvent(restored ? 'purchase_restored' : 'purchase_verified', {
        surface: 'purchase',
        ...funnel,
      }, purchaseAnalyticsContext(family, refreshedEntitlement.status));
      if (!restored && providerEntitlement.status === 'trialing') {
        trackAnalyticsEvent('trial_started', {
          surface: 'purchase',
          ...funnel,
        }, purchaseAnalyticsContext(family, 'trialing'));
      }
      trackAnalyticsEvent('purchase_completed', {
        surface: 'purchase',
        product_key: plan.duration === 'annual' ? 'family_year' : 'family_month',
        purchase_channel: 'in_app',
        plan_state_after: providerEntitlement.status === 'trialing' ? 'trialing' : 'active',
      }, purchaseAnalyticsContext(family, refreshedEntitlement.status));
    }
    return refreshedEntitlement;
  }, [family, paywallSource, refresh]);

  const onPurchaseSuccess = useCallback(async (purchase) => {
    if (!purchase || verifyingRef.current) return;
    verifyingRef.current = true;
    setBusyProductId(purchase.productId || null);
    setStatus('Verifying purchase with the store…');
    try {
      await completeVerifiedPurchase({ purchase });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStatus('Your Family plan is active.');
      router.replace(returnTo);
    } catch (error) {
      const plan = plansRef.current.find((item) => item.id === purchase.productId);
      if (plan) {
        trackAnalyticsEvent('purchase_failed', {
          surface: 'purchase',
          ...subscriptionAnalyticsProperties(plan, { verifiedEntitlementOutcome: 'denied' }),
          failure_stage: 'verification',
        }, purchaseAnalyticsContext(family));
      }
      Alert.alert(
        'Purchase needs verification',
        error?.message || 'The store purchase completed, but the server could not verify it yet. Use Restore Purchases after the issue is fixed.',
      );
      setStatus('Purchase was not unlocked yet.');
    } finally {
      verifyingRef.current = false;
      setBusyProductId(null);
    }
  }, [completeVerifiedPurchase, family, returnTo, router]);

  const onPurchaseError = useCallback((error) => {
    const message = String(error?.message || '');
    const codeValue = String(error?.code || '');
    setBusyProductId(null);
    if (/cancel/i.test(message) || /cancel/i.test(codeValue)) {
      setStatus('Purchase canceled. Your approved First Look is still here.');
      return;
    }
    const selected = plansRef.current.find((item) => item.duration === selectedDuration);
    if (selected) {
      trackAnalyticsEvent('purchase_failed', {
        surface: 'purchase',
        ...subscriptionAnalyticsProperties(selected, { verifiedEntitlementOutcome: 'not_checked' }),
        failure_stage: 'checkout',
      }, purchaseAnalyticsContext(family));
    }
    Alert.alert('Purchase could not start', message || 'Please try again.');
  }, [family, selectedDuration]);

  const { connected, subscriptions, fetchProducts, requestPurchase } = useIAP({
    onPurchaseSuccess,
    onPurchaseError,
    onError: (error) => setStatus(error?.message || 'The store is not available yet.'),
  });

  useEffect(() => {
    if (!connected) return;
    setProductFetchCompleted(false);
    fetchProducts({ skus: FAMILY_PRODUCT_IDS, type: 'subs' })
      .catch((error) => setStatus(error?.message || 'Family plans are not available yet.'))
      .finally(() => setProductFetchCompleted(true));
  }, [connected, fetchProducts]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !connected) return;
    isEligibleForIntroOfferIOS(SUBSCRIPTION_GROUP_ID_IOS)
      .then((eligible) => setIosTrialEligible(Boolean(eligible)))
      .catch(() => setIosTrialEligible(false));
  }, [connected]);

  const plans = useMemo(() => buildFamilyPlans(subscriptions, {
    platform: Platform.OS,
    iosTrialEligible: Boolean(iosTrialEligible),
  }), [iosTrialEligible, subscriptions]);
  plansRef.current = plans;
  const annual = plans.find((item) => item.duration === 'annual');
  const monthly = plans.find((item) => item.duration === 'monthly');
  const selectedPlan = plans.find((item) => item.duration === selectedDuration) || annual || monthly || null;
  const savings = computeAnnualSavings({ annual, monthly });
  const eligibilityLoaded = Platform.OS !== 'ios' || iosTrialEligible !== null;
  const productLoadSuccess = plans.length === 2 && eligibilityLoaded;

  useEffect(() => {
    if (!productFetchCompleted || !eligibilityLoaded || viewedRef.current) return;
    viewedRef.current = true;
    trackAnalyticsEvent('paywall_viewed', {
      surface: 'purchase',
      paywall_source: paywallSource,
      paywall_version: OLW_PAYWALL_VERSION,
      offer_version: OLW_OFFER_VERSION,
      product_load_success: productLoadSuccess,
    }, purchaseAnalyticsContext(family));
  }, [eligibilityLoaded, family, paywallSource, productFetchCompleted, productLoadSuccess]);

  const selectPlan = (plan) => {
    setSelectedDuration(plan.duration);
    trackAnalyticsEvent('plan_selected', {
      surface: 'purchase',
      ...subscriptionAnalyticsProperties(plan),
      paywall_source: paywallSource,
    }, purchaseAnalyticsContext(family));
  };

  const startPurchase = async () => {
    if (!family?.id || !user?.id || !selectedPlan || !productLoadSuccess) return;
    setBusyProductId(selectedPlan.id);
    setStatus('Opening store purchase…');
    const funnel = {
      ...subscriptionAnalyticsProperties(selectedPlan),
      paywall_source: paywallSource,
    };
    trackAnalyticsEvent('checkout_started', { surface: 'purchase', ...funnel }, purchaseAnalyticsContext(family));
    trackAnalyticsEvent('purchase_started', {
      surface: 'purchase',
      purchase_source: 'paywall',
      product_key: selectedPlan.duration === 'annual' ? 'family_year' : 'family_month',
      purchase_channel: 'in_app',
    }, purchaseAnalyticsContext(family));
    try {
      await requestPurchase({
        type: 'subs',
        request: {
          apple: { sku: selectedPlan.id, appAccountToken: user.id },
          google: {
            skus: [selectedPlan.id],
            obfuscatedAccountId: user.id,
            subscriptionOffers: selectedPlan.offerToken
              ? [{ sku: selectedPlan.id, offerToken: selectedPlan.offerToken }]
              : undefined,
          },
        },
      });
    } catch (error) {
      setBusyProductId(null);
      trackAnalyticsEvent('purchase_failed', {
        surface: 'purchase',
        ...funnel,
        failure_stage: 'checkout',
        verified_entitlement_outcome: 'not_checked',
      }, purchaseAnalyticsContext(family));
      Alert.alert('Purchase could not start', error?.message || String(error));
    }
  };

  const restorePurchases = async () => {
    if (!family?.id) return;
    setRestoring(true);
    setStatus('Checking store purchases…');
    try {
      const purchases = await getStorePurchases({
        alsoPublishToEventListenerIOS: false,
        onlyIncludeActiveItemsIOS: true,
      });
      const purchase = (purchases || [])
        .filter((item) => SUBSCRIPTION_PRODUCT_IDS.includes(item.productId))
        .sort((a, b) => Number(b.transactionDate || 0) - Number(a.transactionDate || 0))[0];
      if (!purchase) {
        setStatus('No active Our Little World subscription was found on this store account.');
        return;
      }
      await completeVerifiedPurchase({ purchase, restored: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStatus('Purchase restored.');
      router.replace(returnTo);
    } catch (error) {
      const plan = plansRef.current.find((item) => item.id === busyProductId) || selectedPlan;
      if (plan) {
        trackAnalyticsEvent('purchase_failed', {
          surface: 'purchase',
          ...subscriptionAnalyticsProperties(plan, { verifiedEntitlementOutcome: 'denied' }),
          failure_stage: 'restore',
        }, purchaseAnalyticsContext(family));
      }
      Alert.alert('Restore failed', error?.message || String(error));
      setStatus('Restore did not complete.');
    } finally {
      setRestoring(false);
    }
  };

  const dismiss = () => {
    trackAnalyticsEvent('paywall_dismissed', {
      surface: 'purchase',
      paywall_source: paywallSource,
      paywall_version: OLW_PAYWALL_VERSION,
      offer_version: OLW_OFFER_VERSION,
    }, purchaseAnalyticsContext(family));
    router.replace(returnTo);
  };

  const redeem = async () => {
    if (redeemingRef.current) return;
    const trimmed = code.trim();
    if (!trimmed) {
      setStatus(GIFT_REDEMPTION_COPY.emptyStatus);
      return;
    }
    redeemingRef.current = true;
    setRedeeming(true);
    setStatus('Redeeming code…');
    trackAnalyticsEvent('gift_started', {
      surface: 'purchase',
      gift_source: 'settings',
      gift_product_key: 'unknown',
    }, purchaseAnalyticsContext(family));
    try {
      const redeemed = await redeemCode(trimmed);
      const redemption = redemptionAnalyticsProperties(redeemed);
      trackAnalyticsEvent('gift_redeemed', { surface: 'purchase', ...redemption }, purchaseAnalyticsContext(family));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCode('');
      setStatus(redemptionStatus(redeemed, GIFT_REDEMPTION_COPY.successStatus));
      router.replace(returnTo);
    } catch (error) {
      Alert.alert('Code could not be redeemed', error?.message || String(error));
      setStatus('Code was not redeemed.');
    } finally {
      redeemingRef.current = false;
      setRedeeming(false);
    }
  };

  const disclosure = selectedPlan
    ? selectedPlan.duration === 'annual' && selectedPlan.trialEligible
      ? `14 days free, then ${selectedPlan.displayPrice} per year. Renews annually until canceled. Trial eligibility is determined by ${Platform.OS === 'ios' ? 'Apple' : 'Google'}.`
      : `${selectedPlan.displayPrice} per ${selectedPlan.duration === 'annual' ? 'year' : 'month'}, billed now. Renews until canceled. No introductory trial.`
    : 'Live store pricing is required before purchase.';

  return (
    <Screen scroll keyboard variant="dawn" contentStyle={styles.content}>
      <View style={styles.topRow}>
        <View style={[styles.mark, { backgroundColor: theme.semantic.primary }]}>
          <Ionicons name="lock-closed" size={20} color={theme.colors.onPrimary} />
        </View>
        <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Close Family offer" style={styles.closeButton}>
          <Ionicons name="close" size={24} color={theme.semantic.textSoft} />
        </Pressable>
      </View>

      {preview?.localUri ? (
        <View style={[styles.proofCard, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }]} testID="paywall-first-value-proof">
          <Image source={{ uri: preview.localUri }} style={styles.proofImage} contentFit="cover" />
          <View style={styles.proofCopy}>
            <Eyebrow>Your approved First Look</Eyebrow>
            <Body>This real choice stays private on this device until your Family plan is verified.</Body>
          </View>
        </View>
      ) : null}

      <View style={styles.header}>
        <Eyebrow>Family</Eyebrow>
        <Title style={styles.title}>Keep the moments your family chooses.</Title>
        <Body style={[styles.lead, { color: theme.semantic.textSoft }]}>
          Start with Family. Vault stays out of this first decision and can be considered later if your archive needs it.
        </Body>
      </View>

      {!productFetchCompleted || !eligibilityLoaded ? (
        <View style={[styles.loadingCard, { borderColor: theme.semantic.border }]}>
          <Caption>Loading localized Family plans from the store…</Caption>
        </View>
      ) : (
        <View style={styles.planList} testID="family-plan-options">
          {[annual, monthly].filter(Boolean).map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              active={selectedPlan?.id === plan.id}
              savings={plan.duration === 'annual' ? savings : null}
              onPress={() => selectPlan(plan)}
            />
          ))}
          {!productLoadSuccess ? (
            <Caption style={[styles.errorCopy, { color: theme.semantic.danger || theme.semantic.textSoft }]}>
              Both live Family prices must load before purchase. No fallback amount will be shown.
            </Caption>
          ) : null}
        </View>
      )}

      <Button
        onPress={startPurchase}
        loading={busyProductId === selectedPlan?.id}
        disabled={!productLoadSuccess || !selectedPlan || !!busyProductId || redeeming || restoring}
        testID="start-family-purchase"
      >
        {selectedPlan?.duration === 'annual' && selectedPlan.trialEligible ? 'Start 14-day free trial' : 'Continue with Family'}
      </Button>
      <Caption style={[styles.disclosure, { color: theme.semantic.textMuted }]} testID="renewal-disclosure">
        {disclosure}
      </Caption>

      <View style={styles.secondaryActions}>
        <Pressable onPress={restorePurchases} disabled={restoring} style={styles.textAction} testID="restore-purchases">
          <Caption style={{ color: theme.semantic.primary }}>{restoring ? 'Restoring…' : 'Restore purchases'}</Caption>
        </Pressable>
        <Pressable onPress={() => Linking.openURL('https://ourlittleworld.me/terms/')} style={styles.textAction}>
          <Caption style={{ color: theme.semantic.primary }}>Terms</Caption>
        </Pressable>
        <Pressable onPress={() => Linking.openURL('https://ourlittleworld.me/privacy/')} style={styles.textAction}>
          <Caption style={{ color: theme.semantic.primary }}>Privacy</Caption>
        </Pressable>
        <Pressable onPress={() => router.push('/settings-menu')} style={styles.textAction}>
          <Caption style={{ color: theme.semantic.primary }}>Account settings</Caption>
        </Pressable>
      </View>

      <View style={[styles.featurePanel, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }, shadow.whisper]}>
        {FEATURES.map((feature) => (
          <View key={feature} style={styles.feature}>
            <Ionicons name="checkmark-circle" size={17} color={theme.semantic.primary} />
            <Caption style={styles.featureText}>{feature}</Caption>
          </View>
        ))}
        <Pressable
          onPress={() => Alert.alert('Compare plans later', 'Family is the first offer. Vault remains available later for video-heavy archives and original backup; it is not part of this first purchase decision.')}
          style={styles.compareLink}
        >
          <Caption style={{ color: theme.semantic.primary }}>Compare Family and Vault</Caption>
        </Pressable>
      </View>

      <View style={[styles.trustPanel, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }, shadow.whisper]}>
        <Ionicons name="download-outline" size={19} color={theme.semantic.primary} />
        <View style={styles.trustCopyColumn}>
          <Caption style={styles.trustLabel}>Export and lapsed access</Caption>
          <Body>{EXPORT_POLICY_COPY.alwaysExportable} {EXPORT_POLICY_COPY.lapsedVault}</Body>
          <Caption style={{ color: theme.semantic.textMuted }}>
            {EXPORT_POLICY_COPY.exportScope} {EXPORT_POLICY_COPY.previewLimitations[0]} {EXPORT_POLICY_COPY.previewLimitations[1]}
          </Caption>
        </View>
      </View>

      <View style={[styles.redeemPanel, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }, shadow.whisper]}>
        <Eyebrow>Code</Eyebrow>
        <Title style={styles.redeemTitle}>{GIFT_REDEMPTION_COPY.title}</Title>
        <Field
          label={GIFT_REDEMPTION_COPY.fieldLabel}
          value={code}
          onChangeText={setCode}
          caption={GIFT_REDEMPTION_COPY.caption}
          autoCapitalize="characters"
          inputProps={{ autoCorrect: false, spellCheck: false, textContentType: 'oneTimeCode' }}
        />
        <Button variant="ghost" size="md" onPress={redeem} loading={redeeming} disabled={redeeming || !!busyProductId || restoring}>
          Redeem code
        </Button>
      </View>

      {status ? <Caption style={[styles.status, { color: theme.semantic.textMuted }]}>{status}</Caption> : null}
      <Pressable onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Our Little World billing help')}`)}>
        <Caption style={[styles.disclosure, { color: theme.semantic.textMuted }]}>Billing help and ownership changes: {SUPPORT_EMAIL}</Caption>
      </Pressable>
    </Screen>
  );
}

function PlanCard({ plan, active, savings, onPress }) {
  const theme = useTheme();
  const annual = plan.duration === 'annual';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={`${annual ? 'Annual' : 'Monthly'} Family plan, ${plan.displayPrice}`}
      accessibilityState={{ checked: active }}
      testID={`family-${plan.duration}-plan`}
      style={[
        styles.planOption,
        {
          backgroundColor: active ? theme.semantic.card : theme.semantic.cardAlt,
          borderColor: active ? theme.semantic.primary : theme.semantic.border,
        },
      ]}
    >
      <View style={styles.planCopy}>
        <View style={styles.planLabelRow}>
          <Body style={styles.planTitle}>{annual ? 'Annual Family' : 'Monthly Family'}</Body>
          {annual ? <Caption style={{ color: theme.semantic.primary }}>BEST VALUE</Caption> : null}
        </View>
        <Caption>
          {annual ? `${plan.monthlyEquivalent}/month · ${plan.displayPrice} billed yearly` : `${plan.displayPrice} billed monthly`}
        </Caption>
        {annual && savings ? <Caption>Save {savings}% compared with 12 monthly payments</Caption> : null}
        <Caption>{annual && plan.trialEligible ? '14-day introductory trial for eligible store accounts' : 'No introductory trial'}</Caption>
      </View>
      <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={22} color={active ? theme.semantic.primary : theme.semantic.textMuted} />
    </Pressable>
  );
}

function purchaseAnalyticsContext(family, planState = 'unknown') {
  return {
    family_id: family?.id || null,
    actor_role: family?.me?.role || 'creator',
    plan_state: ['trialing', 'active', 'gift', 'lapsed', 'past_due'].includes(planState) ? planState : 'unknown',
    platform: analyticsPlatform(Platform.OS),
    environment: analyticsEnvironment(),
  };
}

function singleParam(value) {
  const single = Array.isArray(value) ? value[0] : value;
  return typeof single === 'string' ? single : '';
}

function normalizePaywallSource(value) {
  return ['first_value_preview', 'settings', 'book_export', 'feature_gate', 'restore'].includes(value)
    ? value
    : 'unknown';
}

function normalizeReturnTo(value, fallback = '/timeline') {
  if (['/first-value-preview', '/timeline', '/library', '/settings-menu', '/add', '/letters'].includes(value)) {
    return value;
  }
  if (/^\/moment\/[A-Za-z0-9-]+$/.test(value)) return value;
  return fallback;
}

const styles = StyleSheet.create({
  content: { paddingTop: space.xl, paddingBottom: space.xxxl, gap: space.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mark: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  proofCard: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden', minHeight: 118 },
  proofImage: { width: 112, minHeight: 118 },
  proofCopy: { flex: 1, padding: space.md, justifyContent: 'center', gap: space.xs },
  header: { alignItems: 'flex-start', gap: space.sm },
  title: { fontSize: 36, lineHeight: 40, fontStyle: 'italic' },
  lead: { fontSize: 16, lineHeight: 24 },
  loadingCard: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg },
  planList: { gap: space.md },
  planOption: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  planCopy: { flex: 1, minWidth: 0, gap: space.xs },
  planLabelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  planTitle: { fontWeight: '700' },
  disclosure: { textAlign: 'center', lineHeight: 19 },
  errorCopy: { textAlign: 'center', lineHeight: 19 },
  secondaryActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.lg },
  textAction: { minHeight: 38, justifyContent: 'center' },
  featurePanel: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  feature: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  featureText: { flex: 1 },
  compareLink: { minHeight: 42, justifyContent: 'center', alignItems: 'center', marginTop: space.xs },
  trustPanel: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  trustCopyColumn: { flex: 1, minWidth: 0, gap: space.xs },
  trustLabel: { fontWeight: '800' },
  redeemPanel: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  redeemTitle: { fontSize: 22, lineHeight: 26 },
  status: { textAlign: 'center' },
});
