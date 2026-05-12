import React from 'react';

import InviteScreen from '../src/InviteScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function InviteRoute() {
  return (
    <ProtectedRoute>
      <InviteScreen />
    </ProtectedRoute>
  );
}
