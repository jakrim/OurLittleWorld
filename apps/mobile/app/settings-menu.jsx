import React from 'react';

import { ProtectedRoute } from '../src/navigation/RouteGuards';
import SettingsMenuSheetScreen from '../src/SettingsMenuSheetScreen';

export default function SettingsMenuRoute() {
  return (
    <ProtectedRoute>
      <SettingsMenuSheetScreen />
    </ProtectedRoute>
  );
}
