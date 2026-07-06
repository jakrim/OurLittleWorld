import React from 'react';

import MomentDetailScreen from '../../src/MomentDetailScreen';
import { ProtectedRoute } from '../../src/navigation/RouteGuards';

export default function MomentDetailRoute() {
  return (
    <ProtectedRoute>
      <MomentDetailScreen />
    </ProtectedRoute>
  );
}
