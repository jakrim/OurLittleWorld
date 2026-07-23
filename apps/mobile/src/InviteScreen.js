import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, Share, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { Screen, Card, Button, BrandedBackHeader, Hero, Title, Subtitle, Body, Caption, Eyebrow, V, H, Spacer, semantic, colors, glass, space, radius } from './ui';
import { Family, Invites } from './families';
import { useFamily } from './FamilyContext';
import { useAuth } from './AuthContext';

/**
 * Generates a single-use invite code (8 chars, 7-day expiry). The deep
 * link `ourlittleworld://invite/CODE` opens the partner's app and pre-
 * fills the code on the FamilyOnboardingScreen.
 */
export default function InviteScreen() {
  const router = useRouter();
  const { family } = useFamily();
  const { user } = useAuth();
  const familyId = family?.id;
  const [code, setCode] = useState(null);
  const [expires, setExpires] = useState(null);
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState([]);
  const [inviteRole, setInviteRole] = useState('partner');
  const [codeRole, setCodeRole] = useState(null);
  const [memberBusy, setMemberBusy] = useState(null);
  const writerCount = members.filter((member) => isWriterRole(member.role)).length;
  const canInvitePartner = writerCount < 2;

  useEffect(() => {
    if (!familyId) return;
    Family.members(familyId).then(setMembers).catch(() => {});
  }, [familyId]);

  useEffect(() => {
    if (!canInvitePartner && inviteRole === 'partner') {
      setInviteRole('circle');
    }
  }, [canInvitePartner, inviteRole]);

  const generate = async () => {
    if (!familyId) return;
    if (inviteRole === 'partner' && !canInvitePartner) {
      Alert.alert('Two co-parents already', 'Make someone view-only before adding another co-parent.');
      return;
    }
    setBusy(true);
    try {
      const inv = await Invites.create(familyId, { role: inviteRole });
      setCode(inv.code);
      setExpires(inv.expiresAt);
      setCodeRole(inviteRole);
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
    Alert.alert('Copied', 'Send it to the person you want to invite.');
  };

  const share = async () => {
    if (!code) return;
    const roleLine = codeRole === 'circle'
      ? 'They can view saved moments, but not add or edit anything.'
      : 'They can add moments with you as a co-parent.';
    await Share.share({
      message:
        `I made us a private space for ${family?.babyName || 'our baby'}. Tap to join, or paste the code:\n\n` +
        `${inviteLink}\n\nCode: ${code}\n${roleLine}\n(expires ${formatExpiry(expires)})`,
    });
  };

  const reloadMembers = async () => {
    if (!familyId) return;
    const rows = await Family.members(familyId);
    setMembers(rows);
  };

  const updateRole = async (member, role) => {
    if (!familyId || !member?.userId) return;
    setMemberBusy(member.userId);
    try {
      await Family.updateMemberRole(familyId, member.userId, role);
      await reloadMembers();
    } catch (err) {
      Alert.alert('Could not update role', err?.message || String(err));
    } finally {
      setMemberBusy(null);
    }
  };

  const removeCircle = async (member) => {
    if (!familyId || !member?.userId) return;
    setMemberBusy(member.userId);
    try {
      await Family.removeCircleMember(familyId, member.userId);
      await reloadMembers();
    } catch (err) {
      Alert.alert('Could not remove member', err?.message || String(err));
    } finally {
      setMemberBusy(null);
    }
  };

  return (
    <Screen variant="warm" scroll>
      <V gap="lg" style={{ paddingTop: space.lg, paddingBottom: space.xxl }}>
        <InviteHeader onBack={() => router.back()} />
        <Hero>Invite your family circle.</Hero>
        <Body>
          Invite a co-parent who can add moments, or a view-only family circle
          member who can quietly follow along.
        </Body>

        <Spacer h={space.md} />

        <Card padding="xl">
          <Eyebrow>Invite type</Eyebrow>
          <Spacer h={space.sm} />
          <H gap="sm" align="stretch">
            <RoleOption
              active={inviteRole === 'partner'}
              icon="create-outline"
              label="Co-parent"
              detail={canInvitePartner ? 'Can add and edit' : 'Two co-parents already'}
              disabled={!canInvitePartner}
              onPress={() => setInviteRole('partner')}
            />
            <RoleOption
              active={inviteRole === 'circle'}
              icon="eye-outline"
              label="View-only"
              detail="Can only read"
              onPress={() => setInviteRole('circle')}
            />
          </H>
          <Spacer h={space.lg} />
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
          <Eyebrow>Family circle</Eyebrow>
          <Spacer h={space.md} />
          {members.length === 0 ? (
            <Body>Just you, for now.</Body>
          ) : (
            members.map((m, i) => (
              <View key={m.userId}>
                <View style={styles.memberRow}>
                  <View style={styles.memberText}>
                    <Subtitle>{m.displayName || 'Unnamed'}</Subtitle>
                    <Caption>{m.relationshipLabel || roleLabel(m.role)}</Caption>
                  </View>
                  <View style={styles.memberActions}>
                    <View style={[styles.rolePill, m.role === 'circle' ? styles.circlePill : styles.writerPill]}>
                      <Caption style={styles.rolePillText}>{roleLabel(m.role)}</Caption>
                    </View>
                    {m.userId !== user?.id && m.role !== 'creator' ? (
                      <H gap="xs" justify="flex-end">
                        <Pressable
                          disabled={memberBusy === m.userId || (m.role === 'circle' && writerCount >= 2)}
                          onPress={() => updateRole(m, m.role === 'circle' ? 'partner' : 'circle')}
                          style={[
                            styles.inlineAction,
                            (memberBusy === m.userId || (m.role === 'circle' && writerCount >= 2)) ? styles.inlineActionDisabled : null,
                          ]}
                        >
                          <Caption>{m.role === 'circle' ? 'Make co-parent' : 'View-only'}</Caption>
                        </Pressable>
                        {m.role === 'circle' ? (
                          <Pressable
                            disabled={memberBusy === m.userId}
                            onPress={() => removeCircle(m)}
                            style={styles.inlineAction}
                          >
                            <Caption>Remove</Caption>
                          </Pressable>
                        ) : null}
                      </H>
                    ) : null}
                  </View>
                </View>
                {i < members.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            ))
          )}
          {writerCount >= 2 ? (
            <>
              <Spacer h={space.sm} />
              <Caption>Only two co-parents can add or edit. Everyone else stays view-only.</Caption>
            </>
          ) : null}
        </Card>
      </V>
    </Screen>
  );
}

function InviteHeader({ onBack }) {
  return <BrandedBackHeader onBack={onBack} style={styles.inviteTopRow} />;
}

function RoleOption({ active, icon, label, detail, disabled, onPress }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.roleOption,
        active ? styles.roleOptionActive : null,
        disabled ? styles.roleOptionDisabled : null,
      ]}
    >
      <Ionicons name={icon} size={18} color={active ? colors.cream : colors.plum} />
      <Subtitle style={[styles.roleOptionTitle, active ? styles.roleOptionTitleActive : null]}>{label}</Subtitle>
      <Caption style={active ? styles.roleOptionDetailActive : null}>{detail}</Caption>
    </Pressable>
  );
}

function roleLabel(role) {
  if (role === 'creator') return 'Creator';
  if (role === 'circle') return 'View-only';
  return 'Co-parent';
}

function isWriterRole(role) {
  return role === 'creator' || role === 'partner';
}

function formatExpiry(iso) {
  if (!iso) return 'soon';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  inviteTopRow: {
    marginBottom: space.md,
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
    backgroundColor: glass.inkDivider,
    marginVertical: space.xs,
  },
  roleOption: {
    flex: 1,
    minHeight: 96,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: semantic.border,
    padding: space.md,
    justifyContent: 'center',
  },
  roleOptionActive: {
    backgroundColor: colors.plum,
    borderColor: colors.plum,
  },
  roleOptionDisabled: {
    opacity: 0.55,
  },
  roleOptionTitle: {
    marginTop: space.xs,
  },
  roleOptionTitleActive: {
    color: colors.cream,
  },
  roleOptionDetailActive: {
    color: glass.inverseTextMuted,
  },
  memberRow: {
    minHeight: 74,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  memberText: {
    flex: 1,
    minWidth: 0,
  },
  memberActions: {
    alignItems: 'flex-end',
    gap: space.xs,
  },
  rolePill: {
    minHeight: 26,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    justifyContent: 'center',
  },
  writerPill: {
    backgroundColor: glass.writerPill,
  },
  circlePill: {
    backgroundColor: glass.circlePill,
  },
  rolePillText: {
    fontSize: 10,
    letterSpacing: 0,
    textTransform: 'none',
  },
  inlineAction: {
    minHeight: 28,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    justifyContent: 'center',
    backgroundColor: glass.inkDivider,
  },
  inlineActionDisabled: {
    opacity: 0.45,
  },
});
