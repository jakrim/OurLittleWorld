import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRootNavigationState, useRouter } from 'expo-router';

import { useAuth } from '../AuthContext';
import { useBilling } from '../BillingContext';
import { hasReadOnlyArchiveAccess } from '../entitlementAccessModel';
import { useFamily } from '../FamilyContext';
import { firstLookStorageKey, shouldShowFirstLook } from '../reveal';
import { isApprovedFirstValuePreview } from '../firstValuePreviewModel';
import { readFirstValuePreview } from '../firstValuePreviewStore';
import { isSyntheticManualQaRoute } from '../manualQaRuntime';
import { BrandMark, useTheme } from '../ui';
import useReducedMotion from '../ui/useReducedMotion';
import FamilyOnboardingScreen from '../FamilyOnboardingScreen';
import FirstLookRevealScreen from '../FirstLookRevealScreen';
import PurchaseScreen from '../PurchaseScreen';
import SetupScreen from '../SetupScreen';
import WelcomeScreen from '../WelcomeScreen';

export function CenteredSpinner() {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reducedMotion) {
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.05,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  return (
    <View style={[styles.loadingScreen, { backgroundColor: theme.semantic.bg }]}>
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <BrandMark size={92} />
      </Animated.View>
    </View>
  );
}

export function AppGate() {
  const gate = useAppGate();
  if (gate.loading) return <CenteredSpinner />;
  if (gate.reason === 'signed-out') return <WelcomeScreen />;
  if (gate.reason === 'needs-family') return <FamilyOnboardingScreen />;
  if (gate.reason === 'needs-setup') return <SetupScreen />;
  if (gate.reason === 'needs-first-look') return <FirstLookRevealScreen />;
  if (gate.reason === 'needs-first-value') return <RouteRedirect href={gate.href} />;
  if (gate.reason === 'needs-subscription') return <PurchaseScreen />;
  return <RouteRedirect href={gate.href || '/timeline'} />;
}

export function AuthRoute({ children }) {
  const { session, loading } = useAuth();
  if (loading) return <CenteredSpinner />;
  if (session) return <RouteRedirect href="/" />;
  return children;
}

export function ProtectedRoute({
  children,
  allowMissingFamily = false,
  allowIncompleteSetup = false,
  allowFirstLook = false,
  allowFirstValue = false,
  allowMissingSubscription = false,
  allowReadOnlyArchive = false,
}) {
  const params = useLocalSearchParams();
  const gate = useAppGate();

  // An explicitly flagged local build may render synthetic, read-only fixtures
  // without creating a fake account. Production builds cannot enter this lane.
  if (isSyntheticManualQaRoute(params.qa)) return children;

  if (gate.loading) return <CenteredSpinner />;
  if (gate.reason === 'signed-out') return <RouteRedirect href="/welcome" />;
  if (!allowMissingFamily && gate.reason === 'needs-family') return <RouteRedirect href="/onboarding" />;
  if (!allowIncompleteSetup && gate.reason === 'needs-setup') return <RouteRedirect href="/setup" />;
  if (!allowFirstLook && gate.reason === 'needs-first-look') return <RouteRedirect href="/first-look" />;
  if (!allowFirstValue && gate.reason === 'needs-first-value') return <RouteRedirect href={gate.href} />;
  if (!allowMissingSubscription && gate.reason === 'needs-subscription') return <RouteRedirect href="/purchase" />;
  if (!allowReadOnlyArchive && gate.reason === 'read-only-archive') return <RouteRedirect href="/library" />;

  return children;
}

function RouteRedirect({ href }) {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();

  useEffect(() => {
    if (!rootNavigationState?.key) return;
    const timeout = setTimeout(() => {
      router.replace(href);
    }, 0);
    return () => clearTimeout(timeout);
  }, [href, rootNavigationState?.key, router]);

  return <CenteredSpinner />;
}

export function useAppGate() {
  const { session, user, loading: authLoading } = useAuth();
  const { family, loading: familyLoading } = useFamily();
  const { entitlement, loading: billingLoading } = useBilling();
  const [firstLookSeen, setFirstLookSeen] = useState(true);
  const [firstValuePreview, setFirstValuePreview] = useState({ loading: false, value: null });

  useEffect(() => {
    let alive = true;

    if (!session || !family || !user || !shouldShowFirstLook({ family, user })) {
      setFirstLookSeen(true);
      return () => {
        alive = false;
      };
    }

    setFirstLookSeen(null);
    AsyncStorage.getItem(firstLookStorageKey({ familyId: family.id, userId: user.id }))
      .then((value) => {
        if (alive) setFirstLookSeen(value === '1');
      })
      .catch(() => {
        if (alive) setFirstLookSeen(true);
      });

    return () => {
      alive = false;
    };
  }, [session, family, user]);

  useEffect(() => {
    let alive = true;
    const shouldLoad = Boolean(
      session
      && family?.id
      && user?.id
      && family.createdBy === user.id
      && !hasReadOnlyArchiveAccess(entitlement),
    );
    if (!shouldLoad) {
      setFirstValuePreview({ loading: false, value: null });
      return () => {
        alive = false;
      };
    }
    setFirstValuePreview({ loading: true, value: null });
    readFirstValuePreview({ familyId: family.id, userId: user.id })
      .then((value) => {
        if (alive) setFirstValuePreview({ loading: false, value });
      })
      .catch(() => {
        if (alive) setFirstValuePreview({ loading: false, value: null });
      });
    return () => {
      alive = false;
    };
  }, [entitlement, family, session, user]);

  const setupComplete = Boolean(family?.babyName && family?.babyBirthday);
  const waitingForBilling = Boolean(
    session
    && family
    && setupComplete
    && firstLookSeen
    && billingLoading,
  );

  if (authLoading || (session && familyLoading) || firstLookSeen === null || waitingForBilling || firstValuePreview.loading) {
    return { loading: true };
  }

  if (!session) {
    return { loading: false, reason: 'signed-out', href: '/welcome' };
  }
  if (!family) {
    return { loading: false, reason: 'needs-family', href: '/onboarding' };
  }
  if (!family.babyName || !family.babyBirthday) {
    return { loading: false, reason: 'needs-setup', href: '/setup' };
  }
  if (shouldShowFirstLook({ family, user }) && !firstLookSeen) {
    return { loading: false, reason: 'needs-first-look', href: '/first-look' };
  }
  if (
    !hasReadOnlyArchiveAccess(entitlement)
    && family.createdBy === user.id
    && !isApprovedFirstValuePreview(firstValuePreview.value)
  ) {
    return {
      loading: false,
      reason: 'needs-first-value',
      href: { pathname: '/reference', params: { source: 'first_value', autoSeed: '1' } },
    };
  }
  if (!hasReadOnlyArchiveAccess(entitlement)) {
    return { loading: false, reason: 'needs-subscription', href: '/purchase' };
  }
  if (!entitlement?.isActive) {
    return { loading: false, reason: 'read-only-archive', href: '/library' };
  }
  return { loading: false, reason: 'ready', href: '/timeline' };
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
