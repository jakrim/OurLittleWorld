import React from 'react';
import { Stack } from 'expo-router';

import LibraryScreen from '../src/LibraryScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function LibraryRoute() {
  return (
    <>
      <Stack.Screen options={{ animation: 'none' }} />
      <ProtectedRoute>
        <LibraryScreen />
      </ProtectedRoute>
    </>
  );
}
