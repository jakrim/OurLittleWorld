import React from 'react';
import { Stack } from 'expo-router';

import BrandSheetScreen from '../src/BrandSheetScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function BrandRoute() {
  return (
    <>
      <Stack.Screen options={{ animation: 'slide_from_bottom' }} />
      <ProtectedRoute>
        <BrandSheetScreen />
      </ProtectedRoute>
    </>
  );
}
