import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

import FamilyOnboardingScreen from '../../src/FamilyOnboardingScreen';
import { CenteredSpinner } from '../../src/navigation/RouteGuards';
import { useAuth } from '../../src/AuthContext';
import { useFamily } from '../../src/FamilyContext';

export default function InviteCodeRoute() {
  const { code } = useLocalSearchParams();
  const { session, loading: authLoading } = useAuth();
  const { family, loading: familyLoading } = useFamily();

  if (authLoading || (session && familyLoading)) return <CenteredSpinner />;
  if (!session) return <Redirect href={{ pathname: '/sign-in', params: { inviteCode: code } }} />;
  if (family) return <Redirect href="/" />;

  return <FamilyOnboardingScreen route={{ params: { code } }} />;
}
