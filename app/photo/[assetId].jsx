import React from 'react';

import PhotoDetailScreen from '../../src/PhotoDetailScreen';
import { ProtectedRoute } from '../../src/navigation/RouteGuards';

export default function PhotoRoute() {
  return (
    <ProtectedRoute>
      <PhotoDetailScreen />
    </ProtectedRoute>
  );
}
