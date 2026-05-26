import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, Share, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { Screen, Card, Button, Brand, Hero, Title, Subtitle, Body, Caption, Eyebrow, V, H, Spacer, semantic, colors, space, radius } from './ui';
import { Family, Invites } from './families';
import { useFamily } from './FamilyContext';

/**
 * Generates a single-use invite code (8 chars, 7-day expiry). The deep
 * link `ourlittleworld://invite/CODE` opens the partner's app and pre-
 * fills the code on the FamilyOnboardingScreen.
 */
export default function InviteScreen() {
  const router = useRouter();
  const { family } = useFamily();
  const [code, setCode] = useState(null);
  const [expires, setExpires] = useState(null);
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState([]);

  useEffect(() => {
    if (!family) return;
    Family.members(family.id).then(setMembers).catch(() => {});
  }, [family?.id]);

  const generate = async () => {
    if (!family) return;
    setBusy(true);
    try {
      const inv = await Invites.create(family.id);
      setCode(inv.code);
      setExpires(inv.expiresAt);
    } catch (err) {
      Alert.alert('Could not create invite', err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const inviteLink = code ? `ourlittleworld://invite/${code}` : null;

  const copy = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    Alert.alert('Copied', 'Send it to your partner.');
  };

  const share = async () => {
    if (!code) return;
    await Share.share({
      message:
        `I made us a private space for ${family?.babyName || 'our baby'}. Tap to join, or paste the code:\n\n` +
        `${inviteLink}\n\nCode: ${code}\n(expires ${formatExpiry(expires)})`,
    });
  };

  return (
    <Screen variant="warm" scroll>
      <V gap="lg" style={{ paddingTop: space.lg, paddingBottom: space.xxl }}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={20} color={colors.plum} />
          <Caption style={{ marginLeft: 4 }}>Back</Caption>
        </Pressable>

        <Brand>{family?.name || 'Our Little World'}</Brand>
        <Hero>Invite your partner.</Hero>
        <Body>
          They sign in with their own email and join {family?.babyName || 'baby'}'s
          timeline. The two of you see the same moments from then on.
        </Body>

        <Spacer h={space.md} />

        <Card padding="xl">
          {code ? (
            <>
              <Eyebrow>Their code</Eyebrow>
              <Spacer h={space.md} />
              <View style={styles.codeBox}>
                {code.split('').map((ch, i) => (
                  <View key={i} style={styles.codeCell}>
                    <Title>{ch}</Title>
                  </View>
                ))}
              </View>
              <Spacer h={space.sm} />
              <Caption align="center">Expires {formatExpiry(expires)}</Caption>

              <Spacer h={space.lg} />

              <H gap="sm" align="stretch">
                <View style={{ flex: 1 }}><Button onPress={share}>Share</Button></View>
                <View style={{ flex: 1 }}><Button variant="ghost" onPress={copy}>Copy</Button></View>
              </H>
              <Spacer h={space.sm} />
              <Button variant="quiet" onPress={generate} loading={busy}>New code</Button>
            </>
          ) : (
            <>
              <Title>Generate an invite</Title>
              <Spacer h={space.sm} />
              <Body>Single-use code, 8 characters, expires in 7 days.</Body>
              <Spacer h={space.lg} />
              <Button onPress={generate} loading={busy}>Generate code</Button>
            </>
          )}
        </Card>

        <Card variant="muted">
          <Eyebrow>Family</Eyebrow>
          <Spacer h={space.md} />
          {members.length === 0 ? (
            <Body>Just you, for now.</Body>
          ) : (
            members.map((m, i) => (
              <View key={m.userId}>
                <H justify="space-between" align="center" style={{ paddingVertical: space.sm }}>
                  <Subtitle>{m.displayName || 'Unnamed'}</Subtitle>
                  <Caption style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}>
                    {m.role}
                  </Caption>
                </H>
                {i < members.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            ))
          )}
        </Card>
      </V>
    </Screen>
  );
}

function formatExpiry(iso) {
  if (!iso) return 'soon';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  codeBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  codeCell: {
    flex: 1,
    height: 56,
    marginHorizontal: 3,
    borderRadius: radius.md,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: semantic.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(45,31,38,0.06)',
    marginVertical: space.xs,
  },
});
