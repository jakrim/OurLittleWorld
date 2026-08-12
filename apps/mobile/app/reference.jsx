import React from 'react';

import ReferencePhotoScreen from '../src/ReferencePhotoScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function ReferenceRoute() {
  return (
    <ProtectedRoute allowFirstValue allowMissingSubscription>
      <ReferencePhotoScreen />
    </ProtectedRoute>
  );
}
