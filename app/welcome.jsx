import React from 'react';

import WelcomeScreen from '../src/WelcomeScreen';
import { AuthRoute } from '../src/navigation/RouteGuards';

export default function WelcomeRoute() {
  return (
    <AuthRoute>
      <WelcomeScreen />
    </AuthRoute>
  );
}
