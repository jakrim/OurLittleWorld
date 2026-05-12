import React from 'react';
import { Redirect } from 'expo-router';

import FamilyOnboardingScreen from '../src/FamilyOnboardingScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';
import { useFamily } from '../src/FamilyContext';

export default function OnboardingRoute() {
  const { family } = useFamily();

  if (family) return <Redirect href="/" />;

  return (
    <ProtectedRoute allowMissingFamily allowIncompleteSetup allowFirstLook>
      <FamilyOnboardingScreen />
    </ProtectedRoute>
  );
}
