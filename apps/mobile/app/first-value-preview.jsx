import React from 'react';

import FirstValuePreviewScreen from '../src/FirstValuePreviewScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function FirstValuePreviewRoute() {
  return (
    <ProtectedRoute allowFirstValue allowMissingSubscription>
      <FirstValuePreviewScreen />
    </ProtectedRoute>
  );
}
