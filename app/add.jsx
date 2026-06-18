import React from 'react';

import AddSheetScreen from '../src/AddSheetScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function AddRoute() {
  return (
    <ProtectedRoute>
      <AddSheetScreen />
    </ProtectedRoute>
  );
}
