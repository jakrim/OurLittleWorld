import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import * as Linking from 'expo-linking';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { Screen, Card, Button, Field, Brand, Hero, Title, Body, Caption, V, H, Spacer, semantic, colors, space } from './ui';
import { Family, Invites } from './families';
import { useFamily } from './FamilyContext';

/**
 * Two paths:
 *   1. Start a new family (you become the creator)
 *   2. Join your partner — paste 8-char code, or pre-filled from a deep link
 *      ourlittleworld://invite/CODE
 */
export default function FamilyOnboardingScreen({ route }) {
  const { refresh } = useFamily();
  const [mode, setMode] = useState('chooser');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // If we arrived via a deep link with an invite code, jump straight to join.
  useEffect(() => {
    const initialCode = route?.params?.code || extractInviteCodeFromUrl(route?.params?.url);
    if (initialCode) {
      setCode(initialCode.toUpperCase());
      setMode('join');
    } else {
      // Also check the most recent universal link in case we cold-booted from one
      Linking.getInitialURL().then((url) => {
        const c = extractInviteCodeFromUrl(url);
        if (c) {
          setCode(c.toUpperCase());
          setMode('join');
        }
      });
    }
  }, [route?.params?.code, route?.params?.url]);

  const onCreate = async () => {
    setError(null);
    setBusy(true);
    try {
      await Family.create({ name: 'Our Little World', displayName: name?.trim() || null });
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not create family');
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async () => {
    setError(null);
    const trimmed = code.replace(/\s/g, '').toUpperCase();
    if (trimmed.length < 6) return setError('That code looks too short.');
    setBusy(true);
    try {
      await Invites.redeem(trimmed, name?.trim() || null);
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not redeem code');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen variant="warm" scroll keyboard>
      <V gap="lg" style={{ paddingTop: space.lg, paddingBottom: space.xxl }}>
        <Brand>our little world</Brand>

        {mode === 'chooser' ? (
          <Chooser onCreate={() => setMode('create')} onJoin={() => setMode('join')} />
        ) : null}

        {mode === 'create' ? (
          <CreateFlow
            name={name}
            setName={setName}
            error={error}
            busy={busy}
            onSubmit={onCreate}
            onBack={() => { setMode('chooser'); setError(null); }}
          />
        ) : null}

        {mode === 'join' ? (
          <JoinFlow
            code={code}
            setCode={setCode}
            name={name}
            setName={setName}
            error={error}
            busy={busy}
            onSubmit={onJoin}
            onBack={() => { setMode('chooser'); setError(null); }}
          />
        ) : null}
      </V>
    </Screen>
  );
}

function Chooser({ onCreate, onJoin }) {
  return (
    <>
      <Hero>Welcome.</Hero>
      <Body>
        Our Little World is private to you and one other person.
        Either start a new space, or join the one your partner already created.
      </Body>

      <Spacer h={space.md} />

      <Card>
        <Title>Start a new space</Title>
        <Spacer h={space.sm} />
        <Body>
          You become the keeper. Add your baby's name and birthday,
          then send your partner an invite.
        </Body>
        <Spacer h={space.lg} />
        <Button onPress={onCreate}>Start one</Button>
      </Card>

      <Card variant="muted">
        <Title>Join your partner</Title>
        <Spacer h={space.sm} />
        <Body>
          Paste the 8-character code your partner sent you.
        </Body>
        <Spacer h={space.lg} />
        <Button variant="ghost" onPress={onJoin}>I have a code</Button>
      </Card>
    </>
  );
}

function CreateFlow({ name, setName, error, busy, onSubmit, onBack }) {
  return (
    <>
      <BackInline onPress={onBack} />
      <Hero>What should we call you?</Hero>
      <Body>
        This is how your partner will see your memories signed —
        Mama, Papa, Dad, whatever feels right.
      </Body>

      <Spacer h={space.lg} />

      <Field
        label="Your name in the family"
        size="lg"
        value={name}
        onChangeText={setName}
        placeholder="Papa"
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        error={error}
        autoFocus
      />

      <Spacer h={space.lg} />

      <Button onPress={onSubmit} loading={busy} disabled={!name.trim()}>
        Create family
      </Button>
    </>
  );
}

function JoinFlow({ code, setCode, name, setName, error, busy, onSubmit, onBack }) {
  return (
    <>
      <BackInline onPress={onBack} />
      <Hero>You're invited.</Hero>
      <Body>
        Enter the code your partner shared so we can drop you into
        your shared timeline.
      </Body>

      <Spacer h={space.lg} />

      <Field
        label="Invite code"
        size="lg"
        value={code}
        onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
        placeholder="A1B2C3D4"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        align="center"
        letterSpacing={6}
        mono
        autoFocus
      />

      <Spacer h={space.md} />

      <Field
        label="Your name in the family"
        size="lg"
        value={name}
        onChangeText={setName}
        placeholder="Mama"
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        error={error}
      />

      <Spacer h={space.lg} />

      <Button onPress={onSubmit} loading={busy} disabled={code.length < 6}>
        Join family
      </Button>
    </>
  );
}

function BackInline({ onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.back}>
      <Ionicons name="chevron-back" size={18} color={colors.plum} />
      <Caption style={{ marginLeft: 4 }}>Back</Caption>
    </Pressable>
  );
}

function extractInviteCodeFromUrl(url) {
  if (!url) return null;
  // Accept ourlittleworld://invite/CODE  or  ourlittleworld://invite?code=CODE
  const match = String(url).match(/invite[/?]([A-Za-z0-9]{4,16})/) || String(url).match(/code=([A-Za-z0-9]{4,16})/);
  return match ? match[1] : null;
}

const styles = StyleSheet.create({
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: space.xs,
  },
});
