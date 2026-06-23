import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Image, ScrollView } from 'react-native';
import * as Linking from 'expo-linking';

import { Card, Button, Field, Brand, Hero, Title, Body, V, Spacer, GlassButton, space } from './ui';
import { Family, Invites } from './families';
import { useFamily } from './FamilyContext';
import RelationshipRolePicker from './RelationshipRolePicker';

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
  const [relationshipPreset, setRelationshipPreset] = useState('partner');
  const [customRelationshipLabel, setCustomRelationshipLabel] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const goBackToChooser = () => {
    setMode('chooser');
    setError(null);
  };

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
      await Family.create({
        name: 'Our Little World',
        displayName: name?.trim() || null,
        relationshipLabel: relationshipValue(relationshipPreset, customRelationshipLabel),
      });
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
      await Invites.redeem(trimmed, name?.trim() || null, relationshipValue(relationshipPreset, customRelationshipLabel));
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not redeem code');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <V gap="lg" style={styles.content}>
        <OnboardingHeader showBack={mode !== 'chooser'} onBack={goBackToChooser} />

        {mode === 'chooser' ? (
          <Chooser onCreate={() => setMode('create')} onJoin={() => setMode('join')} />
        ) : null}

        {mode === 'create' ? (
          <CreateFlow
            name={name}
            setName={setName}
            relationshipPreset={relationshipPreset}
            setRelationshipPreset={setRelationshipPreset}
            customRelationshipLabel={customRelationshipLabel}
            setCustomRelationshipLabel={setCustomRelationshipLabel}
            error={error}
            busy={busy}
            onSubmit={onCreate}
          />
        ) : null}

        {mode === 'join' ? (
          <JoinFlow
            code={code}
            setCode={setCode}
            name={name}
            setName={setName}
            relationshipPreset={relationshipPreset}
            setRelationshipPreset={setRelationshipPreset}
            customRelationshipLabel={customRelationshipLabel}
            setCustomRelationshipLabel={setCustomRelationshipLabel}
            error={error}
            busy={busy}
            onSubmit={onJoin}
          />
        ) : null}
        </V>
      </ScrollView>
    </View>
  );
}

function OnboardingHeader({ showBack, onBack }) {
  return (
    <View style={styles.header}>
      {showBack ? (
        <GlassButton
          icon="chevron-back"
          onPress={onBack}
          accessibilityLabel="Go back"
          style={styles.backBtn}
        />
      ) : null}

      <View style={styles.brandLockup} pointerEvents="none">
        <Image
          source={require('../assets/brand/logo-mark-circle.png')}
          style={styles.brandMark}
          resizeMode="contain"
        />
        <Brand style={styles.brandText}>our little world</Brand>
      </View>
    </View>
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

function CreateFlow({
  name,
  setName,
  relationshipPreset,
  setRelationshipPreset,
  customRelationshipLabel,
  setCustomRelationshipLabel,
  error,
  busy,
  onSubmit,
}) {
  const relationshipReady = relationshipPreset !== 'custom' || customRelationshipLabel.trim();
  return (
    <>
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

      <Spacer h={space.md} />

      <RelationshipRolePicker
        preset={relationshipPreset}
        onChangePreset={setRelationshipPreset}
        customValue={customRelationshipLabel}
        onChangeCustomValue={setCustomRelationshipLabel}
        customFieldSize="lg"
      />

      <Spacer h={space.lg} />

      <Button onPress={onSubmit} loading={busy} disabled={!name.trim() || !relationshipReady}>
        Create family
      </Button>
    </>
  );
}

function JoinFlow({
  code,
  setCode,
  name,
  setName,
  relationshipPreset,
  setRelationshipPreset,
  customRelationshipLabel,
  setCustomRelationshipLabel,
  error,
  busy,
  onSubmit,
}) {
  const relationshipReady = relationshipPreset !== 'custom' || customRelationshipLabel.trim();
  return (
    <>
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

      <Spacer h={space.md} />

      <RelationshipRolePicker
        preset={relationshipPreset}
        onChangePreset={setRelationshipPreset}
        customValue={customRelationshipLabel}
        onChangeCustomValue={setCustomRelationshipLabel}
        customFieldSize="lg"
      />

      <Spacer h={space.lg} />

      <Button onPress={onSubmit} loading={busy} disabled={code.length < 6 || !relationshipReady}>
        Join family
      </Button>
    </>
  );
}

function relationshipValue(preset, customValue) {
  return preset === 'custom' ? customValue : preset;
}

function extractInviteCodeFromUrl(url) {
  if (!url) return null;
  // Accept ourlittleworld://invite/CODE  or  ourlittleworld://invite?code=CODE
  const match = String(url).match(/invite[/?]([A-Za-z0-9]{4,16})/) || String(url).match(/code=([A-Za-z0-9]{4,16})/);
  return match ? match[1] : null;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FAF4EE',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: space.xl,
    paddingTop: 76,
    paddingBottom: space.xxl,
  },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  header: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
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
});
