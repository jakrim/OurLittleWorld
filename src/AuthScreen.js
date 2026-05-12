import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert, Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Screen, Button, Field, Brand, Hero, Body, Caption, V, Spacer, semantic, colors, space } from './ui';
import { supabase, hasSupabaseCreds } from './supabase';
import { useAuth } from './AuthContext';
import { detectInstalledMailApps, openInbox } from './mail';

/**
 * Email + 6-digit OTP. Two screens of one field each, soft transition
 * between them. Reads more like a love letter than a login form.
 */
export default function AuthScreen() {
  const router = useRouter();
  const { loading: authLoading } = useAuth();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [mailApp, setMailApp] = useState(null);

  useEffect(() => {
    if (step !== 'code') return;
    let active = true;
    detectInstalledMailApps().then((apps) => {
      if (active) setMailApp(apps[0] ?? null);
    });
    return () => { active = false; };
  }, [step]);

  const onOpenInbox = async () => {
    try { await openInbox(); }
    catch { Alert.alert('No mail app found', 'Open your email manually to grab the code.'); }
  };

  const DEV_OTP_EMAIL = 'jesse.krim@gmail.com';

  const sendCodeTo = async (address) => {
    setError(null);
    const trimmed = address.trim();
    if (!isEmail(trimmed)) return setError('Enter a valid email.');
    if (!hasSupabaseCreds) return setError('App is missing its config. Reinstall the latest build.');
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (err) return setError(err.message);
    setEmail(trimmed);
    setStep('code');
  };

  const sendCode = async () => sendCodeTo(email);

  const verifyCode = async () => {
    setError(null);
    const token = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(token)) return setError('Enter the 6 digits from your email.');
    setBusy(true);
    const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' });
    setBusy(false);
    if (err) return setError(err.message);
    // session set → AuthProvider re-renders the navigator
  };

  const resend = async () => {
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setBusy(false);
    if (err) Alert.alert('Could not resend', err.message);
    else Alert.alert('Sent', 'A fresh 6-digit code is on its way.');
  };

  return (
    <Screen variant="warm" scroll keyboard>
      <V gap="lg" style={styles.root}>
        {router.canGoBack() ? (
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.plum} />
          </Pressable>
        ) : null}

        <Brand>our little world</Brand>

        {step === 'email' ? (
          <>
            <Hero>What's your email?</Hero>
            <Body>
              We'll send a one-time code to sign you in. No password,
              no follow-up emails — just this.
            </Body>

            <Spacer h={space.lg} />

            <Field
              label="Email"
              size="lg"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              returnKeyType="send"
              onSubmitEditing={sendCode}
              error={error}
              autoFocus
            />

            <Spacer h={space.lg} />

            {__DEV__ ? (
              <>
                <Button
                  variant="secondary"
                  onPress={() => sendCodeTo(DEV_OTP_EMAIL)}
                  loading={busy}
                  disabled={authLoading}
                >
                  Send to jesse.krim@gmail.com
                </Button>
                <Spacer h={space.sm} />
              </>
            ) : null}

            <Button onPress={sendCode} loading={busy} disabled={authLoading || !email.trim()}>
              Send code
            </Button>
          </>
        ) : (
          <V gap="md" style={styles.codeColumn}>
            <Hero>Check your inbox.</Hero>
            <Body>
              We sent a 6-digit code to{' '}
              <Body style={{ color: colors.ink, fontWeight: '700' }}>{email}</Body>.
              It expires in about 10 minutes.
            </Body>

            {Platform.OS !== 'web' ? (
              <Button variant="ghost" onPress={onOpenInbox}>
                {mailApp ? `Open ${mailApp.label}` : 'Open mail app'}
              </Button>
            ) : null}

            <Button variant="quiet" onPress={resend} disabled={busy}>
              Resend code
            </Button>

            <Field
              label="Code"
              size="lg"
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              keyboardType="number-pad"
              autoFocus
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={verifyCode}
              align="center"
              letterSpacing={10}
              mono
              error={error}
            />

            <Button onPress={verifyCode} loading={busy} disabled={code.length !== 6}>
              Verify
            </Button>

            <Caption align="center">
              <Caption
                onPress={() => { setStep('email'); setCode(''); setError(null); }}
                style={{ color: semantic.primary, fontWeight: '600' }}
              >
                Use a different email
              </Caption>
            </Caption>
          </V>
        )}
      </V>
    </Screen>
  );
}

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

const styles = StyleSheet.create({
  root: {
    paddingTop: space.lg,
    paddingBottom: space.xxl,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
    marginLeft: -4,
  },
  codeColumn: {
    alignSelf: 'stretch',
  },
});
