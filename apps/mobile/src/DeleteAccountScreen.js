import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  ACCOUNT_DELETION_COPY,
  canSubmitAccountDeletion,
  createDeletionRequestId,
  deletionImpactLines,
  normalizeDeletionPreview,
} from './accountDeletionModel';
import {
  deleteAccount,
  getAccountDeletionPreview,
  sendAccountDeletionCode,
} from './accountDeletion';
import { clearDeletedAccountLocalData } from './accountDeletionLocal';
import { useAuth } from './AuthContext';
import { useBilling } from './BillingContext';
import {
  createBillingPortal,
  openManageSubscription,
} from './billing';
import { useFamily } from './FamilyContext';
import { supabase } from './supabase';
import {
  Body,
  Button,
  Caption,
  Card,
  Eyebrow,
  Field,
  GlassButton,
  Screen,
  Spacer,
  Title,
  radius,
  space,
  useTheme,
} from './ui';

const EMPTY_PREVIEW = normalizeDeletionPreview();

export default function DeleteAccountScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuth();
  const { family } = useFamily();
  const { entitlement } = useBilling();
  const requestIdRef = useRef(createDeletionRequestId());
  const [preview, setPreview] = useState(EMPTY_PREVIEW);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewReady, setPreviewReady] = useState(false);
  const [step, setStep] = useState('review');
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const loadPreview = useCallback(() => {
    let alive = true;
    setPreviewLoading(true);
    setPreviewReady(false);
    setNotice('');
    getAccountDeletionPreview()
      .then((value) => {
        if (alive) {
          setPreview(value);
          setPreviewReady(true);
        }
      })
      .catch(() => {
        if (alive) setNotice('Deletion details could not load yet. You can retry before anything is removed.');
      })
      .finally(() => {
        if (alive) setPreviewLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const cancel = loadPreview();
    return cancel;
  }, [loadPreview]);

  const openExport = () => {
    if (!family?.id) {
      Alert.alert('No family archive yet', 'This account does not have a family archive to export.');
      return;
    }
    router.push({ pathname: '/library', params: { segment: 'export' } });
  };

  const manageSubscription = async () => {
    try {
      if (entitlement?.source === 'stripe' && family?.id) {
        const url = await createBillingPortal({ familyId: family.id });
        if (url) {
          await Linking.openURL(url);
          return;
        }
      }
      await openManageSubscription({ source: entitlement?.source, platform: Platform.OS });
    } catch {
      Alert.alert('Could not open subscription settings', 'Open your device subscription settings and cancel there if needed.');
    }
  };

  const sendCode = async () => {
    if (!user?.email || busy) return;
    setBusy(true);
    setNotice('');
    try {
      await sendAccountDeletionCode(user.email);
      setStep('confirm');
      setNotice(`A fresh 6-digit code was sent to ${user.email}.`);
    } catch (error) {
      setNotice(error?.message || 'Could not send a deletion code.');
    } finally {
      setBusy(false);
    }
  };

  const submitDeletion = async () => {
    if (!canSubmitAccountDeletion({ otp, confirmation, busy }) || !user?.email) return;
    setBusy(true);
    setNotice('Removing this account and its private state…');
    try {
      await deleteAccount({
        requestId: requestIdRef.current,
        email: user.email,
        otp,
        confirmation,
      });
      const local = await clearDeletedAccountLocalData({
        familyId: family?.id,
        userId: user.id,
      });
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      router.replace('/welcome');
      Alert.alert(
        'Account deleted',
        local.cleared
          ? 'Your Our Little World account was deleted. Photos and videos in your device library were not changed.'
          : 'Your account was deleted. Reinstall the app before another sign-in to clear the remaining local cache on this device.',
      );
    } catch (error) {
      setNotice(error?.message || 'Account deletion did not finish. Send a fresh code and try again.');
      setOtp('');
    } finally {
      setBusy(false);
    }
  };

  const impactLines = deletionImpactLines(preview);
  const canDelete = canSubmitAccountDeletion({ otp, confirmation, busy });

  return (
    <Screen scroll keyboard variant="warm" contentStyle={styles.content}>
      <View style={styles.header}>
        <GlassButton
          icon="chevron-back"
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <View style={styles.headerCopy}>
          <Eyebrow>Account privacy</Eyebrow>
          <Title>{ACCOUNT_DELETION_COPY.title}</Title>
        </View>
      </View>

      {step === 'review' ? (
        <>
          <Card>
            <View style={styles.cardHeading}>
              <View style={[styles.iconWrap, { backgroundColor: theme.colors.primarySoft }]}>
                <Ionicons name="download-outline" size={20} color={theme.semantic.primary} />
              </View>
              <View style={styles.cardHeadingCopy}>
                <Title style={styles.cardTitle}>{ACCOUNT_DELETION_COPY.exportFirst}</Title>
                <Caption>Save a local copy of your parent-approved archive before continuing.</Caption>
              </View>
            </View>
            <Spacer h={space.md} />
            <Button variant="ghost" onPress={openExport}>Open archive export</Button>
          </Card>

          <Card variant="muted">
            <Eyebrow>What happens</Eyebrow>
            <Spacer h={space.md} />
            {previewLoading ? <Body>Checking your family role…</Body> : impactLines.map((line) => (
              <ImpactRow key={line} text={line} color={theme.semantic.text} />
            ))}
            <Spacer h={space.md} />
            <Body>{ACCOUNT_DELETION_COPY.cameraRoll}</Body>
            <Spacer h={space.sm} />
            <Body>{ACCOUNT_DELETION_COPY.sharedHistory}</Body>
            <Spacer h={space.sm} />
            <Caption>{ACCOUNT_DELETION_COPY.legalRetention}</Caption>
          </Card>

          {(preview.storeSubscriptionActionRequired || ['apple', 'google'].includes(entitlement?.source)) ? (
            <Card>
              <Eyebrow>Store subscription</Eyebrow>
              <Spacer h={space.sm} />
              <Body>{ACCOUNT_DELETION_COPY.storeSubscription}</Body>
              <Spacer h={space.md} />
              <Button variant="ghost" onPress={manageSubscription}>Manage store subscription</Button>
            </Card>
          ) : null}

          {(preview.stripeCancellationRequired || entitlement?.source === 'stripe') ? (
            <Card>
              <Eyebrow>Website subscription</Eyebrow>
              <Spacer h={space.sm} />
              <Body>{ACCOUNT_DELETION_COPY.stripeSubscription}</Body>
            </Card>
          ) : null}

          {!previewReady && !previewLoading ? (
            <Button variant="ghost" onPress={loadPreview}>Retry deletion details</Button>
          ) : null}

          <Button onPress={sendCode} loading={busy} disabled={busy || !user?.email || !previewReady}>
            Send deletion code
          </Button>
        </>
      ) : (
        <>
          <Card>
            <Eyebrow>Final confirmation</Eyebrow>
            <Spacer h={space.sm} />
            <Title style={styles.cardTitle}>Permanently delete this account</Title>
            <Spacer h={space.sm} />
            <Body>{ACCOUNT_DELETION_COPY.finalWarning}</Body>
            <Spacer h={space.lg} />
            <Field
              label="6-digit email code"
              value={otp}
              onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputProps={{
                keyboardType: 'number-pad',
                textContentType: 'oneTimeCode',
                autoComplete: 'one-time-code',
              }}
            />
            <Spacer h={space.md} />
            <Field
              label="Type DELETE"
              value={confirmation}
              onChangeText={setConfirmation}
              placeholder="DELETE"
              autoCapitalize="characters"
              inputProps={{ autoCorrect: false, spellCheck: false }}
            />
          </Card>

          <Pressable onPress={sendCode} disabled={busy} accessibilityRole="button">
            <Caption style={{ color: theme.semantic.primary }}>
              Send a fresh code
            </Caption>
          </Pressable>

          <Button
            variant="danger"
            onPress={submitDeletion}
            loading={busy}
            disabled={!canDelete}
            testID="confirm-account-deletion"
          >
            Permanently delete account
          </Button>
        </>
      )}

      {notice ? (
        <View style={[styles.notice, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
          <Caption>{notice}</Caption>
        </View>
      ) : null}
    </Screen>
  );
}

function ImpactRow({ text, color }) {
  return (
    <View style={styles.impactRow}>
      <Ionicons name="remove-circle-outline" size={18} color={color} />
      <Body style={styles.impactText}>{text}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.lg,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  cardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  cardHeadingCopy: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 22,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  impactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginBottom: space.sm,
  },
  impactText: {
    flex: 1,
  },
  notice: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
