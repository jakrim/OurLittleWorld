import React from 'react';

import TimelineScreen from '../src/TimelineScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function TimelineRoute() {
  return (
    <ProtectedRoute>
      <TimelineScreen />
    </ProtectedRoute>
  );
}
