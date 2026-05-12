import React from 'react';
import { Redirect } from 'expo-router';

export default function DevMemoriesRoute() {
  if (!__DEV__) return <Redirect href="/" />;

  const MemoriesScreen = require('../../screens/MemoriesScreen').default;
  return <MemoriesScreen />;
}
