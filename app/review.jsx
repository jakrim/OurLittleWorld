import React from 'react';

import ReviewMatchesScreen from '../src/ReviewMatchesScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function ReviewRoute() {
  return (
    <ProtectedRoute>
      <ReviewMatchesScreen />
    </ProtectedRoute>
  );
}
