import React from 'react';
import { Stack } from 'expo-router';

import FlagshipCaptureScreen from '../src/FlagshipCaptureScreen';

export default function FlagshipCaptureRoute() {
  if (!__DEV__) return null;

  return (
    <>
      <Stack.Screen options={{ animation: 'none', gestureEnabled: false }} />
      <FlagshipCaptureScreen />
    </>
  );
}
