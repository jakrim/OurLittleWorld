import React from 'react';
import { Stack } from 'expo-router';

import DailyAlbumScreen from '../src/DailyAlbumScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function DailyAlbumRoute() {
  return (
    <>
      <Stack.Screen options={{ animation: 'slide_from_right' }} />
      <ProtectedRoute>
        <DailyAlbumScreen />
      </ProtectedRoute>
    </>
  );
}
