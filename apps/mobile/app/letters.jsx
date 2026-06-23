import React from 'react';
import { Stack } from 'expo-router';

import LettersScreen from '../src/LettersScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function LettersRoute() {
  return (
    <>
      <Stack.Screen options={{ animation: 'none' }} />
      <ProtectedRoute>
        <LettersScreen />
      </ProtectedRoute>
    </>
  );
}
