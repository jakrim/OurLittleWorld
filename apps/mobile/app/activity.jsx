import React from 'react';

import ActivitySheetScreen from '../src/ActivitySheetScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function ActivityRoute() {
  return (
    <ProtectedRoute allowReadOnlyArchive>
      <ActivitySheetScreen />
    </ProtectedRoute>
  );
}
