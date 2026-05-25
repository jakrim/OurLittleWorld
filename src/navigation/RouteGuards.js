import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';

import { useAuth } from '../AuthContext';
import { useFamily } from '../FamilyContext';
import { firstLookStorageKey, shouldShowFirstLook } from '../reveal';
import { BrandMark, useTheme } from '../ui';

export function CenteredSpinner() {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
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
  }, [pulse]);

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
  return <Redirect href={gate.href} />;
}

export function AuthRoute({ children }) {
  const { session, loading } = useAuth();
  if (loading) return <CenteredSpinner />;
  if (session) return <Redirect href="/" />;
  return children;
}

export function ProtectedRoute({
  children,
  allowMissingFamily = false,
  allowIncompleteSetup = false,
  allowFirstLook = false,
}) {
  const gate = useAppGate();

  if (gate.loading) return <CenteredSpinner />;
  if (gate.reason === 'signed-out') return <Redirect href="/welcome" />;
  if (!allowMissingFamily && gate.reason === 'needs-family') return <Redirect href="/onboarding" />;
  if (!allowIncompleteSetup && gate.reason === 'needs-setup') return <Redirect href="/setup" />;
  if (!allowFirstLook && gate.reason === 'needs-first-look') return <Redirect href="/first-look" />;

  return children;
}

export function useAppGate() {
  const { session, user, loading: authLoading } = useAuth();
  const { family, loading: familyLoading } = useFamily();
  const [firstLookSeen, setFirstLookSeen] = useState(true);

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
  }, [session?.user?.id, family?.id, family?.babyName, family?.babyBirthday, family?.createdBy, user?.id]);

  if (authLoading || (session && familyLoading) || firstLookSeen === null) {
    return { loading: true };
  }

  if (!session) return { loading: false, reason: 'signed-out', href: '/welcome' };
  if (!family) return { loading: false, reason: 'needs-family', href: '/onboarding' };
  if (!family.babyName || !family.babyBirthday) {
    return { loading: false, reason: 'needs-setup', href: '/setup' };
  }
  if (shouldShowFirstLook({ family, user }) && !firstLookSeen) {
    return { loading: false, reason: 'needs-first-look', href: '/first-look' };
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
