import React from 'react';

import DigestDetailSheetScreen from '../src/DigestDetailSheetScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function DigestRoute() {
  return (
    <ProtectedRoute allowReadOnlyArchive>
      <DigestDetailSheetScreen />
    </ProtectedRoute>
  );
}
