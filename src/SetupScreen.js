import React, { useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';

import { Screen, Card, Button, Field, Brand, Hero, Title, Body, Caption, Eyebrow, V, H, Spacer, semantic, colors, space } from './ui';
import BirthDatePicker, { isValidBirthIso } from './ui/BirthDatePicker';
import { Family } from './families';
import { useFamily } from './FamilyContext';
import { useAuth } from './AuthContext';
import { ensureLibraryPermission } from './photos';
import { supabase } from './supabase';

/**
 * Three small steps, one card at a time:
 *   1. Baby's name
 *   2. Baby's birthday
 *   3. Photo library access
 *
 * Each one fills a card on the same screen so the user sees progress.
 */
export default function SetupScreen() {
  const router = useRouter();
  const { family, refresh } = useFamily();
  const { user } = useAuth();
  const isFirstSetup = !family?.babyName || !family?.babyBirthday;

  const [name, setName] = useState(family?.babyName || '');
  const [birthday, setBirthday] = useState(family?.babyBirthday || '');
  const [permission, setPermission] = useState({ granted: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(family?.babyName || '');
    setBirthday(family?.babyBirthday || '');
  }, [family?.babyName, family?.babyBirthday]);

  useEffect(() => {
    (async () => {
      const perm = await MediaLibrary.getPermissionsAsync();
      setPermission({ granted: perm.status === 'granted', accessPrivileges: perm.accessPrivileges });
    })();
  }, []);

  const onRequestPermission = async () => {
    const result = await ensureLibraryPermission();
    setPermission(result);
    if (!result.granted && result.canAskAgain === false) {
      Alert.alert(
        'Photo access blocked',
        'Open Settings → Our Little World → Photos and choose "All Photos" to keep going.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
    }
  };

  const validBirthday = isValidBirthIso(birthday);
  const canContinue = name.trim().length > 0 && validBirthday && permission.granted && family;

  const onContinue = async () => {
    if (!family) return;
    if (!isValidBirthIso(birthday)) {
      Alert.alert('Birth date required', "Choose your baby's birth date so we can scan the right photos and show their age.");
      return;
    }
    setSaving(true);
    try {
      await Family.update(family.id, { babyName: name.trim(), babyBirthday: birthday.trim() });
      await refresh();
      // First time through? Send to reference photo flow next.
      // Re-entering from Timeline? Just go back.
      if (isFirstSetup) {
        router.replace('/reference');
      } else {
        router.back();
      }
    } catch (err) {
      Alert.alert('Could not save', err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const onSignOut = async () => {
    Alert.alert(
      'Sign out?',
      "You can sign back in any time. Your moments stay safe in the cloud.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await supabase.auth.signOut();
            // AuthProvider re-renders → navigator goes back to Welcome/Auth
          },
        },
      ],
    );
  };

  return (
    <Screen variant="warm" scroll keyboard>
      <V gap="lg" style={{ paddingTop: space.lg, paddingBottom: space.xxl }}>
        <Brand>our little world</Brand>
        <Hero>Tell us about{'\n'}your little one.</Hero>
        <Body>
          Just three small things and we're in. Their name, their birth date
          (required), and access to your photos so we can find them in your library.
        </Body>

        <Spacer h={space.md} />

        <Card>
          <Eyebrow>Step 1</Eyebrow>
          <Spacer h={space.sm} />
          <Title>Their name</Title>
          <Spacer h={space.lg} />
          <Field
            value={name}
            onChangeText={setName}
            placeholder="e.g. Noa"
            autoCapitalize="words"
            returnKeyType="next"
            size="lg"
          />
        </Card>

        <Card>
          <Eyebrow>Step 2</Eyebrow>
          <Spacer h={space.sm} />
          <Title>The day they arrived</Title>
          <Spacer h={space.sm} />
          <Caption>Required — we only include photos taken on or after this day.</Caption>
          <Spacer h={space.lg} />
          <BirthDatePicker
            value={birthday}
            onChange={setBirthday}
            caption={null}
            error={
              birthday && !validBirthday
                ? 'Pick a real calendar date between 1970 and today.'
                : null
            }
          />
        </Card>

        <Card>
          <Eyebrow>Step 3</Eyebrow>
          <Spacer h={space.sm} />
          <Title>Photo library</Title>
          <Spacer h={space.sm} />
          <Body>
            {permission.granted
              ? 'Granted — we can scan every photo for moments with your baby.'
              : 'Allow full access so we can find every photo of your baby across your library.'}
          </Body>
          <Spacer h={space.lg} />
          {permission.granted ? (
            <H gap="sm" align="center">
              <Ionicons name="checkmark-circle" size={20} color={colors.sage} />
              <Caption style={{ color: colors.sage, fontWeight: '700' }}>
                {(permission.accessPrivileges || 'all').toUpperCase()} ACCESS
              </Caption>
            </H>
          ) : (
            <Button variant="ghost" onPress={onRequestPermission}>Grant access</Button>
          )}
        </Card>

        <Spacer h={space.md} />

        <Button onPress={onContinue} loading={saving} disabled={!canContinue}>
          {isFirstSetup ? 'Continue' : 'Save'}
        </Button>

        {!isFirstSetup ? (
          <>
            <Spacer h={space.lg} />
            <Card variant="muted">
              <Eyebrow>Account</Eyebrow>
              <Spacer h={space.md} />
              <Body>Signed in as {user?.email || '—'}</Body>
              <Spacer h={space.lg} />
              <Button variant="ghost" onPress={onSignOut}>Sign out</Button>
            </Card>
          </>
        ) : null}
      </V>
    </Screen>
  );
}
