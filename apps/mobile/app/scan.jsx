import React from 'react';

import ScanProgressScreen from '../src/ScanProgressScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function ScanRoute() {
  return (
    <ProtectedRoute allowFirstValue allowMissingSubscription>
      <ScanProgressScreen />
    </ProtectedRoute>
  );
}
