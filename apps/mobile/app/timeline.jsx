import React from 'react';
import { Stack } from 'expo-router';

import TodayScreen from '../src/TodayScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function TimelineRoute() {
  return (
    <>
      <Stack.Screen options={{ animation: 'none' }} />
      <ProtectedRoute allowReadOnlyArchive>
        <TodayScreen />
      </ProtectedRoute>
    </>
  );
}
