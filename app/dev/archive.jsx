import React, { useMemo } from 'react';
import { Redirect, useRouter } from 'expo-router';

export default function DevArchiveRoute() {
  const router = useRouter();
  const navigation = useMemo(() => createLegacyNavigation(router), [router]);

  if (!__DEV__) return <Redirect href="/" />;

  const HomeScreen = require('../../screens/HomeScreen').default;
  return <HomeScreen navigation={navigation} />;
}

function createLegacyNavigation(router) {
  const routeMap = {
    OurLittleWorldWelcome: '/welcome',
    OurLittleWorldAuth: '/sign-in',
    OurLittleWorldOnboarding: '/onboarding',
    OurLittleWorldSetup: '/setup',
    OurLittleWorldFirstLook: '/first-look',
    OurLittleWorldTimeline: '/timeline',
    Card: '/dev/card',
    Memories: '/dev/memories',
  };

  const go = (method, name) => {
    const href = routeMap[name] || '/';
    router[method](href);
  };

  return {
    navigate: (name) => go('push', name),
    replace: (name) => go('replace', name),
    goBack: () => router.back(),
    canGoBack: () => router.canGoBack(),
  };
}
