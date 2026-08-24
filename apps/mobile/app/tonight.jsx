import React from 'react';
import { Stack } from 'expo-router';

import TonightScreen from '../src/TonightScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function TonightRoute() {
  return (
    <>
      <Stack.Screen options={{ animation: 'fade', gestureEnabled: false }} />
      <ProtectedRoute allowMissingSubscription>
        <TonightScreen />
      </ProtectedRoute>
    </>
  );
}
