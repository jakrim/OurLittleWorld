import React from 'react';
import { Redirect } from 'expo-router';

export default function DevCardRoute() {
  if (!__DEV__) return <Redirect href="/" />;

  const VirtualCard = require('../../screens/VirtualCard').default;
  return <VirtualCard />;
}
