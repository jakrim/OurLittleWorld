import React from 'react';
import { Stack } from 'expo-router';

import FirstsScreen from '../src/FirstsScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function FirstsRoute() {
  return (
    <>
      <Stack.Screen options={{ animation: 'none' }} />
      <ProtectedRoute allowReadOnlyArchive>
        <FirstsScreen />
      </ProtectedRoute>
    </>
  );
}
