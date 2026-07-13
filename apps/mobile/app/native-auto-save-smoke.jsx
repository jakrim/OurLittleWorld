import React from 'react';

import NativeAutoSaveSmokeScreen from '../src/NativeAutoSaveSmokeScreen';

export default function NativeAutoSaveSmokeRoute() {
  if (!__DEV__) return null;
  return <NativeAutoSaveSmokeScreen />;
}
