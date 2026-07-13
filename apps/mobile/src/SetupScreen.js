import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from "expo-router/react-navigation";
import { ensureLibraryPermission, getLibraryPermissionStatus } from './photos';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  Screen,
  Card,
  Button,
  Field,
  Brand,
  Hero,
  Title,
  Body,
  Caption,
  Eyebrow,
  V,
  Spacer,
  glass,
  useTheme,
  space,
  radius,
  shadow,
} from './ui';
import BirthDatePicker, { isValidBirthIso } from './ui/BirthDatePicker';
import { Family, RELATIONSHIP_PRESETS } from './families';
import { useFamily } from './FamilyContext';
import { useAuth } from './AuthContext';
import { supabase } from './supabase';
import RelationshipRolePicker from './RelationshipRolePicker';
import { isNative } from './faceMatcher';
import { trackAnalyticsEvent } from './analytics';
import { analyticsEnvironment, analyticsPlatform, childAgeBand } from './analyticsProductContext';

/**
 * Dual-purpose screen at `/setup`:
 *   - First run: guided onboarding (name, birthday, photo access).
 *   - Returning: premium settings (profile, photo access status, account).
 */
export default function SetupScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { family, refresh } = useFamily();
  const { user } = useAuth();
  const isFirstSetup = !family?.babyName || !family?.babyBirthday;
  const onboardingTracked = useRef(false);
  const childName = family?.babyName || 'your little one';

  const [name, setName] = useState(family?.babyName || '');
  const [birthday, setBirthday] = useState(family?.babyBirthday || '');
  const [relationshipPreset, setRelationshipPreset] = useState('partner');
  const [customRelationshipLabel, setCustomRelationshipLabel] = useState('');
  const [permission, setPermission] = useState({ granted: false, accessPrivileges: null, canAskAgain: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(family?.babyName || '');
    setBirthday(family?.babyBirthday || '');
    const relationship = presetForRelationship(family?.me?.relationshipLabel);
    setRelationshipPreset(relationship.preset);
    setCustomRelationshipLabel(relationship.custom);
  }, [family?.babyName, family?.babyBirthday, family?.me?.relationshipLabel]);

  useEffect(() => {
    if (!isFirstSetup || onboardingTracked.current) return;
    onboardingTracked.current = true;
    trackAnalyticsEvent('onboarding_started', {
      surface: 'setup',
      entry_type: 'fresh_install',
    }, analyticsContext(family, Platform.OS));
  }, [family, isFirstSetup]);

  const refreshPermission = useCallback(async () => {
    const { granted, accessPrivileges, canAskAgain } = await getLibraryPermissionStatus();
    setPermission({
      granted,
      accessPrivileges,
      canAskAgain,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshPermission();
    }, [refreshPermission]),
  );

  const onRequestPermission = async () => {
    const result = await ensureLibraryPermission();
    setPermission({
      granted: result.granted,
      accessPrivileges: result.accessPrivileges,
      canAskAgain: result.canAskAgain !== false,
    });
    if (result.granted) {
      trackAnalyticsEvent('photo_permission_granted', {
        surface: 'setup',
        permission_scope: result.accessPrivileges === 'limited' ? 'limited' : 'full',
      }, analyticsContext(family, Platform.OS));
    }
    if (!result.granted && result.canAskAgain === false) {
      Alert.alert(
        'Photo access blocked',
        'Open Settings → Our Little World → Photos and choose "All Photos".',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
    }
  };

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/timeline');
  };

  const validBirthday = isValidBirthIso(birthday);
  const relationshipReady = relationshipPreset !== 'custom' || customRelationshipLabel.trim();
  const profileReady = name.trim().length > 0 && validBirthday && !!family;
  const canContinue = isFirstSetup
    ? profileReady
    : profileReady && relationshipReady;

  const onContinue = async () => {
    if (!family) return;
    if (!isValidBirthIso(birthday)) {
      Alert.alert('Birth date required', "Choose your baby's birth date so we can scan the right photos and show their age.");
      return;
    }
    setSaving(true);
    try {
      await Family.update(family.id, { babyName: name.trim(), babyBirthday: birthday.trim() });
      await Family.updateMyMembership(family.id, {
        relationshipLabel: relationshipValue(relationshipPreset, customRelationshipLabel),
      });
      await refresh();
      if (isFirstSetup) {
        trackAnalyticsEvent('child_profile_created', {
          surface: 'setup',
          child_age_band: childAgeBand(birthday.trim()),
          has_birthday: true,
        }, analyticsContext(family, Platform.OS));
        router.replace(
          isNative && permission.granted
            ? { pathname: '/reference', params: { autoSeed: '1' } }
            : '/reference',
        );
      } else {
        onBack();
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
          },
        },
      ],
    );
  };

  return (
    <Screen variant="warm" scroll keyboard>
      <V gap="lg" style={{ paddingTop: space.lg, paddingBottom: space.xxl }}>
	        {isFirstSetup ? (
	          <IntroHeader
	            hero={'Start the private\nbaby book.'}
	            body={
	              'Add their name and birth date. If you allow photo access, we start '
	              + 'from that day to look for likely moments; you approve what belongs, '
	              + 'and the private book grows.'
	            }
	          />
        ) : (
          <IntroHeader
            hero={'Tell us about\nyour little one.'}
            body={`Manage ${childName}'s name, birthday, photo access, and account.`}
            topLeft={{
              icon: 'chevron-back',
              onPress: onBack,
              accessibilityLabel: 'Go back',
            }}
          />
        )}

        {isFirstSetup ? (
          <>
            <ProfileCard
              eyebrow="Step 1"
              title="Their name"
              name={name}
              onChangeName={setName}
            />
            <BirthdayCard
              eyebrow="Step 2"
              title="The day they arrived"
              caption="Required — we only include photos taken on or after this day."
              birthday={birthday}
              onChangeBirthday={setBirthday}
              validBirthday={validBirthday}
            />
            <PhotoAccessCard
              eyebrow="Step 3"
              title="Photo library"
              permission={permission}
              theme={theme}
              onRequestPermission={onRequestPermission}
              onboarding
            />
          </>
        ) : (
          <>
            <ProfileCard
              eyebrow="Profile"
              title="Name"
              name={name}
              onChangeName={setName}
            />
            <BirthdayCard
              eyebrow="Birthday"
              title="Birth date"
              caption="Used for ages on photos and which library shots we include."
              birthday={birthday}
              onChangeBirthday={setBirthday}
              validBirthday={validBirthday}
            />
            <PhotoAccessCard
              eyebrow="Photo access"
              title="Photo library"
              permission={permission}
              theme={theme}
              onRequestPermission={onRequestPermission}
            />
            <RelationshipCard
              eyebrow="Relationship"
              title="Your role"
              preset={relationshipPreset}
              onChangePreset={setRelationshipPreset}
              customValue={customRelationshipLabel}
              onChangeCustomValue={setCustomRelationshipLabel}
            />
            <RitualSettingsCard
              onInvite={() => router.push('/invite')}
              onLetters={() => router.push('/letters')}
              onLibrary={() => router.push('/library')}
            />
          </>
        )}

        <Spacer h={space.sm} />

        <Button onPress={onContinue} loading={saving} disabled={!canContinue}>
          {isFirstSetup ? 'Continue' : 'Save changes'}
        </Button>

        {!isFirstSetup ? (
          <Card variant="muted">
            <Eyebrow>Account</Eyebrow>
            <Spacer h={space.md} />
            <Body>Signed in as {user?.email || '—'}</Body>
            <Spacer h={space.lg} />
            <Button variant="ghost" onPress={onSignOut}>Sign out</Button>
          </Card>
        ) : null}
      </V>
    </Screen>
  );
}

function analyticsContext(family, platform) {
  return {
    family_id: family?.id || null,
    actor_role: family?.me?.role || 'creator',
    plan_state: 'unknown',
    platform: analyticsPlatform(platform),
    environment: analyticsEnvironment(),
  };
}

function RelationshipCard({ eyebrow, title, preset, onChangePreset, customValue, onChangeCustomValue }) {
  return (
    <Card>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Spacer h={space.sm} />
      <Title>{title}</Title>
      <Spacer h={space.sm} />
      <RelationshipRolePicker
        preset={preset}
        onChangePreset={onChangePreset}
        customValue={customValue}
        onChangeCustomValue={onChangeCustomValue}
        label={null}
        caption="Used to sign letters, prompts, and family memories without assuming a parent title."
      />
    </Card>
  );
}

function RitualSettingsCard({ onInvite, onLetters, onLibrary }) {
  const theme = useTheme();
  return (
    <Card variant="muted">
      <Eyebrow>Rituals</Eyebrow>
      <Spacer h={space.sm} />
      <Title>What this home remembers.</Title>
      <Spacer h={space.md} />
      <SettingsRow
        icon="chatbubble-ellipses-outline"
        title="Daily memory prompt"
        detail="One question a day, answered when the house is quiet."
        theme={theme}
      />
      <SettingsRow
        icon="calendar-outline"
        title="Weekly digest"
        detail="Sunday summaries from photos, notes, firsts, and letters."
        theme={theme}
      />
      <SettingsRow
        icon="mail-outline"
        title="Time capsules"
        detail="Letters saved with the baby book."
        theme={theme}
        onPress={onLetters}
      />
      <SettingsRow
        icon="book-outline"
        title="Family archive"
        detail="Photos, places, and saved milestones live in Library."
        theme={theme}
        onPress={onLibrary}
      />
      <SettingsRow
        icon="person-add-outline"
        title="Invite family"
        detail="Bring a co-parent into this private world."
        theme={theme}
        onPress={onInvite}
      />
    </Card>
  );
}

function SettingsRow({ icon, title, detail, theme, onPress }) {
  const content = (
    <>
      <View style={[styles.settingsRowIcon, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }]}>
        <Ionicons name={icon} size={17} color={theme.semantic.primary} />
      </View>
      <View style={styles.settingsRowText}>
        <Body style={styles.settingsRowTitle}>{title}</Body>
        <Caption>{detail}</Caption>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={theme.semantic.textMuted} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.settingsRow}>{content}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.settingsRow, pressed && { opacity: 0.7 }]}>
      {content}
    </Pressable>
  );
}

function presetForRelationship(value) {
  if (!value) return { preset: 'partner', custom: '' };
  const normalized = String(value).trim().toLowerCase();
  const preset = RELATIONSHIP_PRESETS.find((item) => item.value === normalized && item.value !== 'custom');
  return preset ? { preset: preset.value, custom: '' } : { preset: 'custom', custom: String(value).trim() };
}

function relationshipValue(preset, customValue) {
  return preset === 'custom' ? customValue : preset;
}

/**
 * Onboarding-style screen intro: brand row, optional leading chip, hero + body.
 */
function IntroHeader({ hero, body, topLeft }) {
  const theme = useTheme();

  return (
    <>
      <View style={styles.introTopRow}>
        {topLeft ? (
          <Pressable
            onPress={topLeft.onPress}
            style={[
              styles.introIconBtn,
              styles.introIconBtnLeading,
              {
                backgroundColor: theme.semantic.card,
                borderColor: theme.semantic.border,
              },
            ]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={topLeft.accessibilityLabel}
          >
            <Ionicons
              name={topLeft.icon}
              size={topLeft.iconSize ?? 20}
              color={theme.semantic.textSoft}
            />
          </Pressable>
        ) : null}
        <Brand style={[styles.introBrand, topLeft && styles.introBrandWithLeading]}>our little world</Brand>
      </View>
      <Hero>{hero}</Hero>
      <Body>{body}</Body>
      <Spacer h={space.md} />
    </>
  );
}

function ProfileCard({ eyebrow, title, name, onChangeName }) {
  return (
    <Card>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Spacer h={space.sm} />
      <Title>{title}</Title>
      <Spacer h={space.lg} />
      <Field
        value={name}
        onChangeText={onChangeName}
        placeholder="e.g. Noa"
        caption="Used across prompts, firsts, letters, and photo ages."
        autoCapitalize="words"
        returnKeyType="next"
        size="lg"
      />
    </Card>
  );
}

function BirthdayCard({ eyebrow, title, caption, birthday, onChangeBirthday, validBirthday }) {
  return (
    <Card>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Spacer h={space.sm} />
      <Title>{title}</Title>
      <Spacer h={space.sm} />
      <Caption>{caption}</Caption>
      <Spacer h={space.lg} />
      <BirthDatePicker
        value={birthday}
        onChange={onChangeBirthday}
        caption="This powers age labels, first suggestions, monthiversaries, and photo discovery."
        error={
          birthday && !validBirthday
            ? 'Pick a real calendar date between 1970 and today.'
            : null
        }
      />
    </Card>
  );
}

function PhotoAccessCard({
  eyebrow,
  title,
  permission,
  theme,
  onRequestPermission,
  onboarding = false,
}) {
  const granted = permission.granted;
  const privilegeLabel = (permission.accessPrivileges || 'all').toUpperCase();

  return (
    <Card>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Spacer h={space.sm} />
      <Title>{title}</Title>
	      <Spacer h={space.sm} />
	      <Body>
	        {granted
	          ? onboarding
	            ? 'Granted — automatic discovery can look for likely moments when you choose to scan.'
	            : 'Full access — automatic discovery can keep finding likely moments in your library.'
	          : onboarding
	            ? 'You can skip this now. Manual photo and video adds use the system picker without granting full-library access.'
	            : 'Photo access is only needed for automatic library scans; manual adds still work without it.'}
	      </Body>
      <Spacer h={space.lg} />
      {granted ? (
        <View style={[styles.accessStatus, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
          <Ionicons name="checkmark-circle" size={20} color={theme.semantic.accent} />
          <Caption style={{ color: theme.semantic.accent, fontWeight: '700', marginLeft: space.sm }}>
            {privilegeLabel} ACCESS
          </Caption>
        </View>
	      ) : (
	        <V gap="sm">
	          <Button variant="ghost" onPress={onRequestPermission}>
	            Enable automatic discovery
	          </Button>
          {!permission.canAskAgain ? (
            <Button variant="quiet" onPress={() => Linking.openSettings()}>
              Open iOS Settings
            </Button>
          ) : null}
        </V>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  introTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  introBrand: {
    flex: 1,
  },
  introBrandWithLeading: {
    textAlign: 'right',
  },
  introIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.whisper,
  },
  introIconBtnLeading: {
    marginRight: space.md,
  },
  accessStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: glass.inkHairline,
  },
  settingsRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  settingsRowText: {
    flex: 1,
  },
  settingsRowTitle: {
    fontSize: 14,
    lineHeight: 19,
  },
});
