import React from 'react';

import FirstComposeSheetScreen from '../src/FirstComposeSheetScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function FirstComposeRoute() {
  return (
    <ProtectedRoute>
      <FirstComposeSheetScreen />
    </ProtectedRoute>
  );
}
