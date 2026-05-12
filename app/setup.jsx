import React from 'react';

import SetupScreen from '../src/SetupScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function SetupRoute() {
  return (
    <ProtectedRoute allowIncompleteSetup allowFirstLook>
      <SetupScreen />
    </ProtectedRoute>
  );
}
