import React from 'react';
import { Stack } from 'expo-router';

import DailyAlbumDayScreen from '../../src/DailyAlbumDayScreen';
import { ProtectedRoute } from '../../src/navigation/RouteGuards';

export default function DailyAlbumDayRoute() {
  return (
    <>
      <Stack.Screen options={{ animation: 'slide_from_right' }} />
      <ProtectedRoute allowReadOnlyArchive>
        <DailyAlbumDayScreen />
      </ProtectedRoute>
    </>
  );
}
