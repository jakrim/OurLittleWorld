import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';

import FallingRosePetals from '../../components/FallingRosePetals';
import { palette } from '../../constants/theme';
import { useAuth } from '../AuthContext';
import { useFamily } from '../FamilyContext';
import { firstLookStorageKey, shouldShowFirstLook } from '../reveal';

export function CenteredSpinner() {
  return (
    <View style={{ flex: 1, backgroundColor: palette.plum }}>
      <FallingRosePetals introDense={false} quietCount={9} />
      <View style={styles.spinnerCenter}>
        <ActivityIndicator color={palette.cream} size="large" />
      </View>
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
  spinnerCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
});
