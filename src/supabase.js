import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Surface a loud, dev-only warning so we never silently fail to sync.
  console.warn(
    '[Our Little World] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY.\n' +
      'Add them to .env and restart Metro (`npm start --clear`).',
  );
}

const secureStorage = {
  async getItem(key) {
    const secureValue = await SecureStore.getItemAsync(key);
    if (secureValue != null) return secureValue;

    // Migrate any existing Supabase session from the old AsyncStorage backend.
    const legacyValue = await AsyncStorage.getItem(key);
    if (legacyValue != null) {
      await SecureStore.setItemAsync(key, legacyValue);
      await AsyncStorage.removeItem(key);
    }
    return legacyValue;
  },
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL ?? 'http://invalid', SUPABASE_ANON_KEY ?? 'invalid', {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

export const hasSupabaseCreds = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
