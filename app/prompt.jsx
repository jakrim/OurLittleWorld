import React from 'react';

import PromptSheetScreen from '../src/PromptSheetScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function PromptRoute() {
  return (
    <ProtectedRoute>
      <PromptSheetScreen />
    </ProtectedRoute>
  );
}
