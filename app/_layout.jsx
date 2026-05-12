import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { LogBox, Pressable, StyleSheet, Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '../src/AuthContext';
import { FamilyProvider } from '../src/FamilyContext';
import { palette } from '../constants/theme';

LogBox.ignoreAllLogs();
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    balqis: require('../assets/fonts/Balqis.ttf'),
    'dm-sans-boldItalic': require('../assets/fonts/DMSans-BoldItalic.ttf'),
    porcelain: require('../assets/fonts/Porcelain.ttf'),
    Reckless: require('../assets/fonts/Reckless.otf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <FamilyProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                gestureEnabled: true,
                animation: 'fade_from_bottom',
              }}
            />
            <DevLegacyArchiveButton />
          </FamilyProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function DevLegacyArchiveButton() {
  const router = useRouter();

  if (!__DEV__) return null;

  return (
    <Pressable
      style={styles.devArchiveButton}
      onPress={() => router.push('/dev/archive')}
      accessibilityRole="button"
      accessibilityLabel="Open Lauren archive"
    >
      <Text style={styles.devArchiveButtonText}>Lauren Archive</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  devArchiveButton: {
    position: 'absolute',
    right: 16,
    bottom: 28,
    zIndex: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(45, 31, 41, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 245, 238, 0.28)',
  },
  devArchiveButtonText: {
    color: palette.cream,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
});
