import React from 'react';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';

import AuthScreen from '../src/AuthScreen';
import { AuthRoute } from '../src/navigation/RouteGuards';
import { useAuth } from '../src/AuthContext';

export default function SignInRoute() {
  const { session, loading } = useAuth();
  const { inviteCode } = useLocalSearchParams();

  if (!loading && session && inviteCode) {
    return <Redirect href={`/invite/${inviteCode}`} />;
  }

  return (
    <>
      <Stack.Screen options={{ animation: 'fade' }} />
      <AuthRoute>
        <AuthScreen />
      </AuthRoute>
    </>
  );
}
