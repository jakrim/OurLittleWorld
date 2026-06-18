import React from 'react';

import LetterComposeSheetScreen from '../src/LetterComposeSheetScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function LetterComposeRoute() {
  return (
    <ProtectedRoute>
      <LetterComposeSheetScreen />
    </ProtectedRoute>
  );
}
