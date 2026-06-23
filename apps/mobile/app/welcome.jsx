import React from 'react';
import { Stack } from 'expo-router';

import WelcomeScreen from '../src/WelcomeScreen';
import { AuthRoute } from '../src/navigation/RouteGuards';

export default function WelcomeRoute() {
  return (
    <>
      <Stack.Screen options={{ animation: 'fade' }} />
      <AuthRoute>
        <WelcomeScreen />
      </AuthRoute>
    </>
  );
}
