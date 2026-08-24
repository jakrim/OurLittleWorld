import React from 'react';

import DeleteAccountScreen from '../src/DeleteAccountScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function DeleteAccountRoute() {
  return (
    <ProtectedRoute
      allowMissingFamily
      allowIncompleteSetup
      allowFirstLook
      allowFirstValue
      allowMissingSubscription
      allowReadOnlyArchive
    >
      <DeleteAccountScreen />
    </ProtectedRoute>
  );
}
