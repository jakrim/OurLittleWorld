import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { LogBox } from 'react-native';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Newsreader_400Regular,
  Newsreader_500Medium_Italic,
} from '@expo-google-fonts/newsreader';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import { Caveat_400Regular } from '@expo-google-fonts/caveat';

import { AuthProvider } from '../src/AuthContext';
import { FamilyProvider } from '../src/FamilyContext';
import LaunchScreen from '../src/LaunchScreen';
import { ThemeProvider } from '../src/ui';

LogBox.ignoreAllLogs();
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [launchVisible, setLaunchVisible] = useState(true);
  const [fontsLoaded, fontError] = useFonts({
    Newsreader: Newsreader_400Regular,
    'Newsreader-Italic': Newsreader_500Medium_Italic,
    Manrope: Manrope_500Medium,
    'Manrope-Regular': Manrope_400Regular,
    'Manrope-SemiBold': Manrope_600SemiBold,
    'Manrope-Bold': Manrope_700Bold,
    Caveat: Caveat_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <FamilyProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  gestureEnabled: true,
                  animation: 'fade_from_bottom',
                }}
              />
              {launchVisible ? (
                <LaunchScreen onDone={() => setLaunchVisible(false)} />
              ) : null}
            </FamilyProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
