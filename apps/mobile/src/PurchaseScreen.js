import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import {
  finishTransaction,
  getAvailablePurchases as getStorePurchases,
  useIAP,
} from 'expo-iap';

import { useAuth } from './AuthContext';
import { useBilling } from './BillingContext';
import { useFamily } from './FamilyContext';
import {
  FAMILY_MONTHLY_PRODUCT_ID,
  FAMILY_YEARLY_PRODUCT_ID,
  SUBSCRIPTION_PRODUCT_IDS,
  SUPPORT_EMAIL,
  VAULT_MONTHLY_PRODUCT_ID,
  VAULT_YEARLY_PRODUCT_ID,
  verifyStorePurchase,
} from './billing';
import {
  Body,
  Button,
  Caption,
  Eyebrow,
  Field,
  Screen,
  SegmentedControl,
  Title,
  radius,
  shadow,
  space,
  useTheme,
} from './ui';

const TIERS = [
  {
    key: 'family',
    name: 'Family',
    badge: 'Best for most families',
    tagline: 'Private baby book for the moments you choose to keep.',
    cta: 'Start Family',
    products: {
      yearly: { id: FAMILY_YEARLY_PRODUCT_ID, displayPrice: '$69.99/year' },
      monthly: { id: FAMILY_MONTHLY_PRODUCT_ID, displayPrice: '$7.99/month' },
    },
    features: [
      '300 saved video minutes',
      'App-quality photos and videos',
      'One child and one invited co-parent',
      'No original backup',
    ],
  },
  {
    key: 'vault',
    name: 'Vault',
    badge: 'For video-heavy families',
    tagline: 'For families with lots of video and original keepsakes.',
    cta: 'Start Vault',
    products: {
      yearly: { id: VAULT_YEARLY_PRODUCT_ID, displayPrice: '$149.99/year' },
      monthly: { id: VAULT_MONTHLY_PRODUCT_ID, displayPrice: '$14.99/month' },
    },
    features: [
      '1,000 saved video minutes',
      'Longer videos',
      'Original backup for selected media',
      '100 GB family archive',
    ],
  },
];

const CADENCE_OPTIONS = [
  { value: 'yearly', label: 'Yearly' },
  { value: 'monthly', label: 'Monthly' },
];

export default function PurchaseScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { family } = useFamily();
  const { refresh, redeemCode } = useBilling();
  const [cadence, setCadence] = useState('yearly');
  const [selectedTierKey, setSelectedTierKey] = useState('family');
  const [busyProductId, setBusyProductId] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [status, setStatus] = useState('');
  const verifyingRef = useRef(false);

  const onPurchaseSuccess = useCallback(async (purchase) => {
    if (!family?.id || verifyingRef.current) return;
    verifyingRef.current = true;
    setBusyProductId(purchase.productId || null);
    setStatus('Verifying purchase...');
    try {
      await verifyStorePurchase({
        familyId: family.id,
        purchase,
        provider: Platform.OS === 'ios' ? 'apple' : 'google',
        productId: purchase.productId,
      });
      await finishTransaction({ purchase, isConsumable: false });
      await refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStatus('Your family plan is active.');
    } catch (err) {
      Alert.alert(
        'Purchase needs verification',
        err?.message || 'The store purchase completed, but the server could not verify it yet. Use Restore Purchases after the issue is fixed.',
      );
      setStatus('Purchase was not unlocked yet.');
    } finally {
      verifyingRef.current = false;
      setBusyProductId(null);
    }
  }, [family?.id, refresh]);

  const onPurchaseError = useCallback((error) => {
    const message = String(error?.message || '');
    const codeValue = String(error?.code || '');
    setBusyProductId(null);
    if (/cancel/i.test(message) || /cancel/i.test(codeValue)) {
      setStatus('Purchase canceled.');
      return;
    }
    Alert.alert('Purchase could not start', message || 'Please try again.');
  }, []);

  const {
    connected,
    subscriptions,
    fetchProducts,
    requestPurchase,
  } = useIAP({
    onPurchaseSuccess,
    onPurchaseError,
    onError: (error) => setStatus(error?.message || 'The store is not available yet.'),
  });

  useEffect(() => {
    if (!connected) return;
    fetchProducts({ skus: SUBSCRIPTION_PRODUCT_IDS, type: 'subs' }).catch((err) => {
      setStatus(err?.message || 'Products are not available yet.');
    });
  }, [connected, fetchProducts]);

  // Merge store products into the tier cards; fall back to plan pricing copy
  // when the store hasn't answered yet.
  const tiers = useMemo(() => {
    const byId = new Map((subscriptions || []).map((item) => [item.id, item]));
    return TIERS.map((tier) => {
      const base = tier.products[cadence];
      const native = byId.get(base.id);
      return {
        ...tier,
        productId: base.id,
        displayPrice: native?.displayPrice ? `${native.displayPrice}/${cadence === 'yearly' ? 'year' : 'month'}` : base.displayPrice,
        native,
      };
    });
  }, [subscriptions, cadence]);

  const selectedProduct = tiers.find((tier) => tier.key === selectedTierKey) || tiers[0];

  const startPurchase = async () => {
    if (!family?.id || !user?.id || !selectedProduct) return;
    setBusyProductId(selectedProduct.productId);
    setStatus('Opening store purchase...');
    try {
      const offerToken = firstGoogleOfferToken(selectedProduct.native);
      await requestPurchase({
        type: 'subs',
        request: {
          apple: {
            sku: selectedProduct.productId,
            appAccountToken: user.id,
          },
          google: {
            skus: [selectedProduct.productId],
            obfuscatedAccountId: user.id,
            subscriptionOffers: offerToken
              ? [{ sku: selectedProduct.productId, offerToken }]
              : undefined,
          },
        },
      });
    } catch (err) {
      setBusyProductId(null);
      Alert.alert('Purchase could not start', err?.message || String(err));
    }
  };

  const restorePurchases = async () => {
    if (!family?.id) return;
    setRestoring(true);
    setStatus('Checking store purchases...');
    try {
      const purchases = await getStorePurchases({
        alsoPublishToEventListenerIOS: false,
        onlyIncludeActiveItemsIOS: true,
      });
      const purchase = (purchases || [])
        .filter((item) => SUBSCRIPTION_PRODUCT_IDS.includes(item.productId))
        .sort((a, b) => Number(b.transactionDate || 0) - Number(a.transactionDate || 0))[0];
      if (!purchase) {
        setStatus('No active family subscription was found on this store account.');
        return;
      }
      await verifyStorePurchase({
        familyId: family.id,
        purchase,
        provider: Platform.OS === 'ios' ? 'apple' : 'google',
        productId: purchase.productId,
      });
      await finishTransaction({ purchase, isConsumable: false });
      await refresh();
      setStatus('Purchase restored.');
    } catch (err) {
      Alert.alert('Restore failed', err?.message || String(err));
      setStatus('Restore did not complete.');
    } finally {
      setRestoring(false);
    }
  };

  const redeem = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setStatus('Enter the gift or partner code.');
      return;
    }
    setRedeeming(true);
    setStatus('Redeeming code...');
    try {
      await redeemCode(trimmed);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCode('');
      setStatus('Code redeemed. Your family plan is active.');
    } catch (err) {
      Alert.alert('Code could not be redeemed', err?.message || String(err));
      setStatus('Code was not redeemed.');
    } finally {
      setRedeeming(false);
    }
  };

  const contactSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Our Little World billing help')}`);
  };

  const openPolicy = (path) => {
    Linking.openURL(`https://ourlittleworld.me/${path}/`);
  };

  return (
    <Screen scroll variant="dawn" contentStyle={styles.content}>
      <View style={styles.header}>
        <View style={[styles.mark, { backgroundColor: theme.semantic.primary }]}>
          <Ionicons name="lock-closed" size={22} color={theme.colors.onPrimary} />
        </View>
        <Eyebrow>Private family archive</Eyebrow>
        <Title style={styles.title}>Choose the family archive that fits this season.</Title>
        <Body style={[styles.lead, { color: theme.semantic.textSoft }]}>
          Every plan keeps your private baby book for one child and one invited co-parent. Family saves beautiful app-quality memories. Vault adds longer videos and original backup.
        </Body>
      </View>

      <SegmentedControl
        value={cadence}
        options={CADENCE_OPTIONS}
        onChange={setCadence}
      />

      <View style={styles.planList}>
        {tiers.map((tier) => (
          <TierCard
            key={tier.key}
            tier={tier}
            active={selectedTierKey === tier.key}
            onPress={() => setSelectedTierKey(tier.key)}
          />
        ))}
      </View>

      <View style={styles.legalNotice}>
        <Caption style={[styles.terms, { color: theme.semantic.textMuted }]}>
          By continuing, you agree to the subscription terms. No free trial. Native billing is managed by Apple App Store or Google Play.
        </Caption>
        <View style={styles.legalLinks}>
          <Pressable accessibilityRole="link" onPress={() => openPolicy('terms')} style={styles.legalLink}>
            <Caption style={{ color: theme.semantic.primary }}>Terms</Caption>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => openPolicy('privacy')} style={styles.legalLink}>
            <Caption style={{ color: theme.semantic.primary }}>Privacy</Caption>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => openPolicy('refunds')} style={styles.legalLink}>
            <Caption style={{ color: theme.semantic.primary }}>Refunds</Caption>
          </Pressable>
        </View>
      </View>

      <Button
        onPress={startPurchase}
        loading={busyProductId === selectedProduct?.productId}
        disabled={!selectedProduct || !!busyProductId || redeeming || restoring}
      >
        {selectedProduct.cta} — {selectedProduct.displayPrice}
      </Button>

      <View style={styles.secondaryActions}>
        <Pressable onPress={restorePurchases} disabled={restoring} style={styles.textAction}>
          <Caption style={{ color: theme.semantic.primary }}>{restoring ? 'Restoring...' : 'Restore purchases'}</Caption>
        </Pressable>
        <Pressable onPress={contactSupport} style={styles.textAction}>
          <Caption style={{ color: theme.semantic.textMuted }}>Contact support</Caption>
        </Pressable>
      </View>

      <View style={[styles.redeemPanel, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }, shadow.whisper]}>
        <View style={styles.redeemHeader}>
          <View>
            <Eyebrow>Code</Eyebrow>
            <Title style={styles.redeemTitle}>Redeem website gift or partner access</Title>
          </View>
          <Ionicons name="ticket-outline" size={22} color={theme.semantic.primary} />
        </View>
        <Field
          label="Gift or partner code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          inputProps={{ autoCorrect: false, spellCheck: false, textContentType: 'oneTimeCode' }}
        />
        <Button
          variant="ghost"
          size="md"
          onPress={redeem}
          loading={redeeming}
          disabled={!!busyProductId || restoring}
        >
          Redeem code
        </Button>
      </View>

      {status ? <Caption style={[styles.status, { color: theme.semantic.textMuted }]}>{status}</Caption> : null}
      <Caption style={[styles.terms, { color: theme.semantic.textMuted }]}>
        Billing owner changes are handled by support.
      </Caption>
    </Screen>
  );
}

function TierCard({ tier, active, onPress }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={`${tier.name} plan, ${tier.displayPrice}`}
      accessibilityState={{ checked: active }}
      style={[
        styles.planOption,
        {
          backgroundColor: active ? theme.semantic.card : theme.semantic.cardAlt,
          borderColor: active ? theme.semantic.primary : theme.semantic.border,
        },
      ]}
    >
      <View style={styles.tierHeader}>
        <View style={styles.planCopy}>
          <Body style={styles.planTitle}>{tier.name}</Body>
          <Caption>{tier.tagline}</Caption>
        </View>
        <View style={styles.planPrice}>
          <Caption style={{ color: active ? theme.semantic.primary : theme.semantic.textMuted }}>{tier.badge}</Caption>
          <Body style={styles.planAmount}>{tier.displayPrice}</Body>
        </View>
      </View>
      <View style={styles.tierFeatures}>
        {tier.features.map((feature) => (
          <View key={feature} style={styles.feature}>
            <Ionicons
              name={feature.startsWith('No ') ? 'remove-circle-outline' : 'checkmark-circle'}
              size={15}
              color={feature.startsWith('No ') ? theme.semantic.textMuted : theme.semantic.primary}
            />
            <Caption style={styles.featureText}>{feature}</Caption>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

function firstGoogleOfferToken(product) {
  const legacyOffer = product?.subscriptionOfferDetailsAndroid?.[0]?.offerToken;
  if (legacyOffer) return legacyOffer;
  return product?.subscriptionOffers?.find((offer) => offer.offerToken || offer.offerTokenAndroid)?.offerToken
    || product?.subscriptionOffers?.find((offer) => offer.offerToken || offer.offerTokenAndroid)?.offerTokenAndroid;
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.xxl,
    paddingBottom: space.xxxl,
    gap: space.lg,
  },
  header: {
    alignItems: 'flex-start',
    gap: space.sm,
  },
  mark: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  title: {
    fontSize: 38,
    lineHeight: 41,
    fontStyle: 'italic',
  },
  lead: {
    fontSize: 16,
    lineHeight: 24,
  },
  planList: {
    gap: space.md,
  },
  planOption: {
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
  },
  tierFeatures: {
    gap: space.xs,
  },
  planCopy: {
    flex: 1,
    minWidth: 0,
  },
  planTitle: {
    fontWeight: '700',
  },
  planPrice: {
    alignItems: 'flex-end',
    gap: space.xs,
  },
  planAmount: {
    fontWeight: '800',
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  featureText: {
    flex: 1,
  },
  legalNotice: {
    gap: space.xs,
  },
  legalLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.md,
  },
  legalLink: {
    minHeight: 32,
    justifyContent: 'center',
  },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.lg,
  },
  textAction: {
    minHeight: 38,
    justifyContent: 'center',
  },
  redeemPanel: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  redeemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
  },
  redeemTitle: {
    fontSize: 22,
    lineHeight: 26,
  },
  status: {
    textAlign: 'center',
  },
  terms: {
    textAlign: 'center',
    lineHeight: 19,
  },
});
