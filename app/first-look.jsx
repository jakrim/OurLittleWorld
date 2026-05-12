import React from 'react';

import FirstLookRevealScreen from '../src/FirstLookRevealScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function FirstLookRoute() {
  return (
    <ProtectedRoute allowFirstLook>
      <FirstLookRevealScreen />
    </ProtectedRoute>
  );
}
