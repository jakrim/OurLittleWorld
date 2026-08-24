import React, { useState } from 'react';
import { Image } from 'expo-image';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  Body,
  Button,
  Caption,
  Eyebrow,
  Field,
  Hero,
  Screen,
  Spacer,
  radius,
  shadow,
  space,
  useTheme,
} from './ui';

const DEMO_NOTE = 'One spoon. Three taps. That laugh.';
const DEMO_IMAGE = require('../assets/creative/flagship-demo-baby.png');

export default function FlagshipCaptureScreen() {
  const theme = useTheme();
  const [note, setNote] = useState(DEMO_NOTE);
  const [kept, setKept] = useState(false);

  if (kept) {
    return (
      <Screen scroll variant="warm" contentStyle={styles.keptScreen}>
        <FixtureBadge theme={theme} />
        <View style={styles.worldHeader}>
          <Eyebrow>Our World</Eyebrow>
          <Hero>Now the photo has the part only you knew.</Hero>
          <Body style={{ color: theme.semantic.textSoft }}>
            Saved to this local synthetic demo world.
          </Body>
        </View>

        <View
          style={[
            styles.keptCard,
            {
              backgroundColor: theme.semantic.card,
              borderColor: theme.semantic.border,
            },
            shadow.press,
          ]}
          testID="flagship-kept-card"
        >
          <View style={styles.imageWrap}>
            <Image source={DEMO_IMAGE} style={StyleSheet.absoluteFill} contentFit="cover" />
            <View style={[styles.keptBadge, { backgroundColor: theme.semantic.secondary }]}>
              <Ionicons name="checkmark" size={15} color={theme.colors.onPrimary} />
              <Caption style={[styles.keptBadgeText, { color: theme.colors.onPrimary }]}>Kept</Caption>
            </View>
          </View>
          <Eyebrow style={styles.cardEyebrow}>Tonight</Eyebrow>
          <Hero style={styles.note}>{note || DEMO_NOTE}</Hero>
          <Caption>Added by a parent · synthetic demo</Caption>
        </View>

        <View style={[styles.privateNote, { backgroundColor: theme.colors.primarySoft }]}>
          <Ionicons name="lock-closed-outline" size={19} color={theme.semantic.primary} />
          <View style={styles.privateCopy}>
            <Body style={styles.privateTitle}>Private family space</Body>
            <Caption>No public feed. Parents choose what gets kept.</Caption>
          </View>
        </View>

        <Button
          variant="quiet"
          onPress={() => {
            setNote(DEMO_NOTE);
            setKept(false);
          }}
          testID="flagship-reset"
        >
          Reset demo
        </Button>
      </Screen>
    );
  }

  return (
    <Screen bare variant="warm" edges={{ top: true, bottom: true }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <View style={styles.header}>
          <View style={[styles.iconButton, { borderColor: theme.semantic.border }]}>
            <Ionicons name="close" size={22} color={theme.semantic.text} />
          </View>
          <Caption>1 of 1</Caption>
          <View style={[styles.iconButton, { borderColor: theme.semantic.border }]}>
            <Ionicons name="grid-outline" size={20} color={theme.semantic.text} />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.review}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <FixtureBadge theme={theme} />
          <View
            style={[
              styles.media,
              { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border },
            ]}
            testID="flagship-demo-media"
          >
            <Image source={DEMO_IMAGE} style={StyleSheet.absoluteFill} contentFit="cover" />
          </View>

          <Eyebrow>A moment worth a look</Eyebrow>
          <Hero style={styles.reviewTitle}>Tonight found one photo. You decide what it means.</Hero>
          <Caption>Synthetic demo photo · stays local until Keep</Caption>
          <Spacer h={space.lg} />

          <Field
            label="Add your words (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="What do you want to remember?"
            caption="Synthetic fixture note entered by a parent for this capture."
            inputProps={{
              maxLength: 280,
              returnKeyType: 'done',
              blurOnSubmit: true,
              onSubmitEditing: Keyboard.dismiss,
            }}
            testID="flagship-note"
          />

          <View style={styles.voiceRow}>
            <Ionicons name="mic-outline" size={20} color={theme.semantic.primary} />
            <Caption>Add a voice note instead</Caption>
          </View>

          <View style={styles.actions}>
            <Button fullWidth={false} style={styles.action} variant="ghost" testID="flagship-skip">
              Skip
            </Button>
            <Button
              fullWidth={false}
              style={styles.action}
              onPress={() => setKept(true)}
              testID="flagship-keep"
            >
              Keep
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function FixtureBadge({ theme }) {
  return (
    <View style={[styles.fixtureBadge, { backgroundColor: theme.colors.primarySoft }]}>
      <View style={[styles.fixtureDot, { backgroundColor: theme.semantic.primary }]} />
      <Caption style={styles.fixtureText}>Local synthetic demo · no family data</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  review: { paddingBottom: 46, paddingHorizontal: space.xl },
  fixtureBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    flexDirection: 'row',
    marginBottom: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  fixtureDot: { borderRadius: 4, height: 7, marginRight: space.sm, width: 7 },
  fixtureText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.25 },
  media: {
    aspectRatio: 0.82,
    borderRadius: radius.xl,
    borderWidth: 1,
    marginBottom: space.xl,
    maxHeight: 560,
    overflow: 'hidden',
    width: '100%',
  },
  reviewTitle: { fontSize: 34, lineHeight: 38, marginBottom: space.sm },
  voiceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.lg,
  },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  action: { flex: 1 },
  keptScreen: { paddingBottom: 50, paddingTop: space.md },
  worldHeader: { gap: space.sm, marginBottom: space.xl },
  keptCard: { borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden', padding: space.md },
  imageWrap: { aspectRatio: 0.92, borderRadius: radius.lg, overflow: 'hidden' },
  keptBadge: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    position: 'absolute',
    right: space.md,
    top: space.md,
  },
  keptBadgeText: { fontWeight: '800' },
  cardEyebrow: { marginTop: space.lg },
  note: { fontSize: 29, lineHeight: 34, marginBottom: space.sm },
  privateNote: {
    alignItems: 'center',
    borderRadius: radius.lg,
    flexDirection: 'row',
    marginVertical: space.xl,
    padding: space.lg,
  },
  privateCopy: { flex: 1, marginLeft: space.md },
  privateTitle: { fontWeight: '700', marginBottom: space.xs },
});
