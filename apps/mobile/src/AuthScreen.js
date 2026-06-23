import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { Screen, Brand, Hero, Body, Caption, Eyebrow, GlassButton, radius, space, useTheme } from './ui';
import { supabase, hasSupabaseCreds } from './supabase';
import { useAuth } from './AuthContext';

const DEV_LOGIN_EMAIL = 'jesse.krim@gmail.com';
const INVALID_CODE_MESSAGE = 'That code is invalid. Try again.';
const VERIFY_CODE_ERROR_MESSAGE = 'Could not verify that code. Try again.';

/**
 * Email + 6-digit OTP. Two screens of one field each, soft transition
 * between them. Reads more like a love letter than a login form.
 */
export default function AuthScreen() {
  const router = useRouter();
  const theme = useTheme();
  const authColors = useMemo(() => getAuthColors(theme), [theme]);
  const { loading: authLoading } = useAuth();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sentAt, setSentAt] = useState(null);
  const [devLoginMode, setDevLoginMode] = useState(false);
  const [now, setNow] = useState(Date.now());
  const autoVerifyKeyRef = useRef(null);

  useEffect(() => {
    if (step !== 'code' || !sentAt) return undefined;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [sentAt, step]);

  const goBack = () => {
    if (step === 'code') {
      setStep('email');
      setCode('');
      setError(null);
      setDevLoginMode(false);
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/welcome');
  };

  const sendCodeTo = async (address) => {
    setError(null);
    setDevLoginMode(false);
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
    setSentAt(Date.now());
    setStep('code');
  };

  const sendCode = async () => sendCodeTo(email);

  const startDevLogin = () => {
    setError(null);
    setBusy(false);
    setEmail(DEV_LOGIN_EMAIL);
    setCode('');
    setSentAt(null);
    setDevLoginMode(true);
    setStep('code');
  };

  const verifyDevLogin = useCallback(async (devCode) => {
    setBusy(true);
    const { data, error: fnError } = await supabase.functions.invoke('dev-login', {
      body: { email: DEV_LOGIN_EMAIL, code: devCode },
    });

    if (fnError) {
      setBusy(false);
      return setError(await getFunctionErrorMessage(fnError));
    }

    const generatedTokenHash = data?.tokenHash;
    if (!generatedTokenHash) {
      setBusy(false);
      return setError(VERIFY_CODE_ERROR_MESSAGE);
    }

    const { error: verifyErr } = await supabase.auth.verifyOtp({
      token_hash: generatedTokenHash,
      type: 'magiclink',
    });
    setBusy(false);
    if (verifyErr) return setError(getVerifyErrorMessage(verifyErr));
    return null;
  }, []);

  const verifyCode = useCallback(async (tokenOverride) => {
    setError(null);
    const token = String(tokenOverride || code).replace(/\s/g, '');
    if (!/^\d{6}$/.test(token)) return setError('Enter the 6 digits from your email.');

    if (__DEV__ && devLoginMode) {
      return verifyDevLogin(token);
    }

    setBusy(true);
    const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' });
    setBusy(false);
    if (err) return setError(getVerifyErrorMessage(err));
    // session set → AuthProvider re-renders the navigator
  }, [code, devLoginMode, email, verifyDevLogin]);

  const resend = async () => {
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setBusy(false);
    if (err) Alert.alert('Could not resend', err.message);
    else {
      setDevLoginMode(false);
      setSentAt(Date.now());
      Alert.alert('Sent', 'A fresh 6-digit code is on its way.');
    }
  };

  const expiresIn = formatRemaining(sentAt ? Math.max(0, 600 - Math.floor((now - sentAt) / 1000)) : 600);
  const canSend = email.trim().length > 0 && !busy && !authLoading;
  const canVerify = code.length === 6 && !busy;
  const verifying = step === 'code' && busy;

  useEffect(() => {
    const token = code.replace(/\D/g, '');

    if (token.length < 6) {
      autoVerifyKeyRef.current = null;
    }

    if (step !== 'code' || busy || token.length !== 6) return undefined;

    const key = `${devLoginMode ? 'dev' : 'email'}:${email.trim().toLowerCase()}:${token}`;
    if (autoVerifyKeyRef.current === key) return undefined;

    const timeout = setTimeout(() => {
      autoVerifyKeyRef.current = key;
      verifyCode(token);
    }, 160);

    return () => clearTimeout(timeout);
  }, [busy, code, devLoginMode, email, step, verifyCode]);

  return (
    <Screen variant="plain" scroll keyboard contentStyle={styles.screenContent}>
      <View style={styles.root}>
        <View style={styles.header}>
          <GlassButton
            icon="chevron-back"
            onPress={goBack}
            accessibilityLabel="Go back"
            style={styles.backBtn}
          />

          <View style={styles.brandLockup} pointerEvents="none">
            <Image
              source={require('../assets/brand/logo-mark-circle.png')}
              style={styles.brandMark}
              resizeMode="contain"
            />
            <Brand style={[styles.brandText, { color: authColors.ink }]}>
              our little world
            </Brand>
          </View>
        </View>

        {step === 'email' ? (
          <View style={styles.stage}>
            <View style={styles.copyBlock}>
              <Eyebrow style={[styles.stepLabel, { color: authColors.muted }]}>
                Step 1 of 2 · Sign in
              </Eyebrow>
              <Hero style={[styles.headline, { color: authColors.ink }]}>
                What's your email?
              </Hero>
              <Body style={[styles.lede, { color: authColors.body }]}>
                We'll send a 6-digit code. No password.
              </Body>
            </View>

            <EmailInput
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                if (error) setError(null);
              }}
              placeholder="you@example.com"
              onSubmitEditing={sendCode}
              error={error}
              colors={authColors}
            />

            <View style={styles.footer}>
              <AuthButton onPress={sendCode} loading={busy} disabled={!canSend} colors={authColors}>
                Send code
              </AuthButton>

              {__DEV__ ? (
                <FooterLink
                  onPress={startDevLogin}
                  disabled={busy || authLoading}
                  colors={authColors}
                >
                  Use dev code
                </FooterLink>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.stage}>
            <View style={styles.copyBlock}>
              <Eyebrow style={[styles.stepLabel, { color: authColors.muted }]}>
                Step 2 of 2 · Verify
              </Eyebrow>
              <Hero style={[styles.headline, { color: authColors.ink }]}>
                Check your inbox.
              </Hero>
              <Body style={[styles.lede, { color: authColors.body }]}>
                {devLoginMode ? 'Enter your configured dev code for ' : 'A 6-digit code is on its way to '}
                <Body style={[styles.ledeStrong, { color: authColors.ink }]}>{email}</Body>.
              </Body>
            </View>

            <View style={styles.codeBlock}>
              <CodeInput
                value={code}
                onChangeText={(value) => {
                  setCode(value.replace(/\D/g, '').slice(0, 6));
                  if (error) setError(null);
                }}
                onSubmitEditing={() => verifyCode()}
                error={error}
                colors={authColors}
                theme={theme}
                loading={verifying}
              />

              {verifying ? (
                <View
                  style={styles.verifyingRow}
                  accessibilityRole="status"
                  accessibilityLiveRegion="polite"
                >
                  <ActivityIndicator size="small" color={authColors.primary} />
                  <Caption style={[styles.verifyingText, { color: authColors.body }]}>
                    Verifying code...
                  </Caption>
                </View>
              ) : null}

              {devLoginMode ? null : (
                <View style={styles.expiryRow}>
                  <Ionicons name="time-outline" size={16} color={authColors.muted} />
                  <Caption style={[styles.expiryText, { color: authColors.muted }]}>
                    Expires in {expiresIn}
                  </Caption>
                </View>
              )}

              {error ? (
                <Caption style={[styles.errorText, { color: authColors.danger }]}>
                  {error}
                </Caption>
              ) : null}
            </View>

            <View style={styles.footer}>
              <AuthButton
                onPress={() => verifyCode()}
                loading={busy}
                loadingLabel="Verifying"
                disabled={!canVerify}
                colors={authColors}
              >
                Verify code
              </AuthButton>

              <View style={styles.footerLinks}>
                {devLoginMode ? null : (
                  <>
                    <FooterLink onPress={resend} disabled={busy} colors={authColors} emphasis>
                      Resend code
                    </FooterLink>
                    <Text style={[styles.footerDot, { color: authColors.muted }]}>·</Text>
                  </>
                )}
                <FooterLink
                  onPress={() => {
                    setStep('email');
                    setCode('');
                    setError(null);
                    setDevLoginMode(false);
                  }}
                  disabled={busy}
                  colors={authColors}
                >
                  Use a different email
                </FooterLink>
              </View>
            </View>
          </View>
        )}
      </View>
    </Screen>
  );
}

function EmailInput({
  value,
  onChangeText,
  placeholder,
  onSubmitEditing,
  error,
  colors,
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldBlock}>
      <Text style={[styles.fieldLabel, { color: focused ? colors.primary : colors.muted }]}>
        Email
      </Text>
      <View
        style={[
          styles.emailBox,
          {
            backgroundColor: colors.inputBg,
            borderColor: error ? colors.danger : focused ? colors.primary : colors.border,
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          returnKeyType="send"
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.emailInput, { color: colors.ink }]}
          selectionColor={colors.primary}
          autoFocus
        />
      </View>
      {error ? (
        <Caption style={[styles.errorText, { color: colors.danger }]}>
          {error}
        </Caption>
      ) : null}
    </View>
  );
}

function CodeInput({ value, onChangeText, onSubmitEditing, error, colors, theme, loading }) {
  const inputRef = useRef(null);
  const activeIndex = Math.min(value.length, 5);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!loading) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 620,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 620,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [loading, pulse]);

  const loadingStyle = loading
    ? {
        opacity: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.62],
        }),
        transform: [
          {
            scale: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.97],
            }),
          },
        ],
      }
    : null;

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={styles.codeTapTarget}
      accessibilityRole="button"
      accessibilityLabel="Enter verification code"
      accessibilityState={{ busy: loading }}
    >
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        returnKeyType="done"
        onSubmitEditing={onSubmitEditing}
        style={styles.hiddenCodeInput}
        selectionColor={colors.primary}
        caretHidden
        autoFocus
        editable={!loading}
      />
      <View style={styles.codeCells}>
        {Array.from({ length: 6 }).map((_, index) => {
          const focused = value.length < 6 ? index === activeIndex : index === 5;
          return (
            <Animated.View
              key={index}
              style={[
                styles.codeCell,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: loading
                    ? colors.primary
                    : error
                    ? colors.danger
                    : focused
                      ? colors.primary
                      : colors.border,
                },
                focused || loading ? styles.codeCellFocused : null,
                loadingStyle,
              ]}
            >
              <Text
                style={[
                  styles.codeDigit,
                  { color: colors.ink, fontFamily: theme.fonts.display },
                ]}
              >
                {value[index] ?? ''}
              </Text>
            </Animated.View>
          );
        })}
      </View>
    </Pressable>
  );
}

function AuthButton({ children, onPress, loading, loadingLabel = 'Working', disabled, colors }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [
        styles.authButton,
        {
          backgroundColor: loading || !disabled ? colors.primary : colors.disabledButton,
          transform: [{ scale: pressed && !disabled && !loading ? 0.985 : 1 }],
        },
      ]}
    >
      {loading ? (
        <View style={styles.authButtonContent}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.authButtonText}>{loadingLabel}</Text>
        </View>
      ) : (
        <Text style={styles.authButtonText}>{children}</Text>
      )}
    </Pressable>
  );
}

function FooterLink({ children, onPress, disabled, colors, emphasis = false }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      hitSlop={8}
      style={disabled ? styles.disabledLink : null}
    >
      <Text
        style={[
          styles.footerLink,
          { color: emphasis ? colors.primary : colors.body },
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

async function getFunctionErrorMessage(error) {
  try {
    const body = await error?.context?.json?.();
    const message = body?.error || body?.message;
    if (message === 'Invalid dev code.') return INVALID_CODE_MESSAGE;
    if (body?.code === 'NOT_FOUND' || message) return VERIFY_CODE_ERROR_MESSAGE;
  } catch {}
  return VERIFY_CODE_ERROR_MESSAGE;
}

function getVerifyErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  if (
    error?.status === 400 ||
    message.includes('invalid') ||
    message.includes('expired') ||
    message.includes('token') ||
    message.includes('otp') ||
    message.includes('code')
  ) {
    return INVALID_CODE_MESSAGE;
  }

  return VERIFY_CODE_ERROR_MESSAGE;
}

function getAuthColors(theme) {
  if (theme.isDark) {
    return {
      ink: theme.semantic.text,
      body: theme.semantic.textSoft,
      muted: theme.semantic.textMuted,
      primary: theme.semantic.primary,
      border: theme.semantic.border,
      inputBg: 'rgba(255, 255, 255, 0.06)',
      placeholder: theme.semantic.textWhisper,
      disabledButton: 'rgba(255, 255, 255, 0.22)',
      danger: theme.colors.danger,
    };
  }

  return {
    ink: '#34251F',
    body: '#6A5B51',
    muted: '#A0938A',
    primary: '#D36A4A',
    border: '#E9DED1',
    inputBg: 'rgba(255, 255, 255, 0.72)',
    placeholder: '#B5AAA1',
    disabledButton: '#9D948E',
    danger: theme.colors.danger,
  };
}

function formatRemaining(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

const styles = StyleSheet.create({
  screenContent: {
    paddingHorizontal: 34,
  },
  root: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingTop: space.lg,
    paddingBottom: space.xl,
  },
  header: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xl,
  },
  backBtn: {
    position: 'absolute',
    left: 0,
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  brandMark: {
    width: 26,
    height: 26,
  },
  brandText: {
    fontSize: 20,
    letterSpacing: 0,
  },
  stage: {
    flex: 1,
  },
  copyBlock: {
    gap: space.sm,
  },
  stepLabel: {
    letterSpacing: 2.4,
  },
  headline: {
    fontSize: 43,
    lineHeight: 48,
    letterSpacing: 0,
  },
  lede: {
    marginTop: space.sm,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: 0,
  },
  ledeStrong: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: 0,
  },
  fieldBlock: {
    marginTop: space.xxl,
  },
  fieldLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: space.sm,
  },
  emailBox: {
    minHeight: 68,
    borderRadius: 22,
    borderWidth: 1.5,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
  },
  emailInput: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '500',
    letterSpacing: 0,
    paddingVertical: 0,
  },
  codeBlock: {
    marginTop: 46,
  },
  codeTapTarget: {
    width: '100%',
  },
  hiddenCodeInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  codeCells: {
    flexDirection: 'row',
    gap: 10,
  },
  codeCell: {
    flex: 1,
    maxWidth: 60,
    aspectRatio: 1,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeCellFocused: {
    borderWidth: 2,
  },
  codeDigit: {
    fontSize: 39,
    lineHeight: 44,
    width: '100%',
    textAlign: 'center',
    includeFontPadding: false,
    letterSpacing: 0,
    transform: [{ translateY: 2 }],
  },
  verifyingRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
  },
  verifyingText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.lg,
  },
  expiryText: {
    fontSize: 15,
    lineHeight: 20,
  },
  errorText: {
    marginTop: space.sm,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: space.xxl,
    gap: space.lg,
  },
  authButton: {
    minHeight: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  authButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  authButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: 0,
  },
  footerLinks: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    columnGap: space.lg,
    rowGap: space.sm,
  },
  footerDot: {
    fontSize: 20,
    lineHeight: 24,
  },
  footerLink: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: 0,
  },
  disabledLink: {
    opacity: 0.45,
  },
});
