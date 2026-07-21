import React from 'react';

import LetterDetailSheetScreen from '../src/LetterDetailSheetScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function LetterDetailRoute() {
  return (
    <ProtectedRoute allowReadOnlyArchive>
      <LetterDetailSheetScreen />
    </ProtectedRoute>
  );
}
