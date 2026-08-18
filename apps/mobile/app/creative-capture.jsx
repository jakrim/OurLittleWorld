import React from 'react';

import CreativeCaptureScreen from '../src/CreativeCaptureScreen';

export default function CreativeCaptureRoute() {
  if (!__DEV__) return null;
  return <CreativeCaptureScreen />;
}
