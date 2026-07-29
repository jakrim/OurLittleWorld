import React, { useState } from 'react';
import { ActivityIndicator, Modal, View } from 'react-native';
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

import '../src/backgroundAutoIngestTask';
import { AuthProvider } from '../src/AuthContext';
import { BillingProvider } from '../src/BillingContext';
import { FamilyProvider } from '../src/FamilyContext';
import LaunchScreen from '../src/LaunchScreen';
import { initializePosthogAnalytics } from '../src/posthogAnalyticsTransport';
import {
  nativeAddSheetOptions,
  nativeComposeSheetOptions,
  nativeDetailSheetOptions,
  nativePromptSheetOptions,
} from '../src/NativeSheet';
import { ThemeProvider } from '../src/ui';
import useForegroundAutoIngest from '../src/useForegroundAutoIngest';
import usePushNotifications from '../src/usePushNotifications';
import { initializePosthogAnalytics } from '../src/posthogAnalyticsTransport';

export const unstable_settings = {
  initialRouteName: 'index',
};

SplashScreen.preventAutoHideAsync();

export function SuspenseFallback() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}

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

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <FamilyProvider>
              <BillingProvider>
                <AnalyticsBootstrap />
                <ForegroundAutoIngest />
                <PushNotifications />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    gestureEnabled: true,
                    animation: launchVisible ? 'none' : 'fade_from_bottom',
                  }}
                >
                  <Stack.Screen name="add" options={nativeAddSheetOptions} />
                  <Stack.Screen name="prompt" options={nativePromptSheetOptions} />
                  <Stack.Screen name="first-compose" options={nativeComposeSheetOptions} />
                  <Stack.Screen name="letter-compose" options={nativeComposeSheetOptions} />
                  <Stack.Screen name="letter-detail" options={nativeDetailSheetOptions} />
                  <Stack.Screen name="digest" options={nativeDetailSheetOptions} />
                  <Stack.Screen name="activity" options={nativeDetailSheetOptions} />
                  <Stack.Screen
                    name="delete-account"
                    options={{
                      headerShown: false,
                      presentation: 'card',
                      animation: 'slide_from_right',
                      gestureEnabled: false,
                    }}
                  />
                  <Stack.Screen
                    name="settings-menu"
                    options={{
                      headerShown: false,
                      presentation: 'card',
                      animation: 'slide_from_right',
                      gestureEnabled: true,
                    }}
                  />
                </Stack>
                <Modal
                  visible={launchVisible}
                  transparent
                  animationType="none"
                  statusBarTranslucent
                >
                  <LaunchScreen onDone={() => setLaunchVisible(false)} />
                </Modal>
              </BillingProvider>
            </FamilyProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AnalyticsBootstrap() {
  React.useEffect(() => {
    initializePosthogAnalytics().catch((error) => {
      console.warn('[analytics] initialization failed', error?.message || error);
    });
  }, []);
  return null;
}

function ForegroundAutoIngest() {
  useForegroundAutoIngest();
  return null;
}

function PushNotifications() {
  usePushNotifications();
  return null;
}
