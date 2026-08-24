import React from 'react';

import RealAutoSaveWriteSmokeScreen from '../src/RealAutoSaveWriteSmokeScreen';

export default function RealAutoSaveWriteSmokeRoute() {
  if (!__DEV__) return null;
  return <RealAutoSaveWriteSmokeScreen />;
}
