import React, { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const NOTE = 'First puddle jump. One boot made it home.';

export default function CreativeCaptureScreen() {
  const [stage, setStage] = useState('first');
  const [note, setNote] = useState('');
  const [typing, setTyping] = useState(false);

  function addFixtureLine() {
    if (typing || note === NOTE) return;
    setTyping(true);
    setNote('');
    let index = 0;
    const timer = setInterval(() => {
      index += 1;
      setNote(NOTE.slice(0, index));
      if (index >= NOTE.length) {
        clearInterval(timer);
        setTyping(false);
      }
    }, 28);
  }

  if (stage === 'kept') {
    return (
      <SafeAreaView style={styles.safe} testID="creative-capture-payoff">
        <StatusBar barStyle="dark-content" />
        <View style={styles.screen}>
          <FixtureLabel />
          <View style={styles.worldHeader}>
            <Text style={styles.eyebrow}>OUR WORLD</Text>
            <Text style={styles.hero}>You chose what stays.</Text>
            <Text style={styles.subhead}>Saved to your family world</Text>
          </View>

          <View style={styles.memoryCard}>
            <View style={styles.savedBadge}>
              <Text style={styles.savedBadgeText}>KEPT</Text>
            </View>
            <ObjectFixture kind="boot" compact />
            <Text style={styles.memoryNote}>{note || NOTE}</Text>
            <Text style={styles.meta}>A parent added this line · Tonight</Text>
          </View>

          <View style={styles.payoffBar}>
            <Text style={styles.payoffCopy}>The app can suggest.</Text>
            <Text style={styles.payoffStrong}>Only a parent decides.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const second = stage === 'second';
  return (
    <SafeAreaView style={styles.safe} testID="creative-capture-review">
      <StatusBar barStyle="dark-content" />
      <View style={styles.screen}>
        <FixtureLabel />
        <View style={styles.topRow}>
          <View>
            <Text style={styles.eyebrow}>TONIGHT</Text>
            <Text style={styles.title}>{second ? 'This one means something.' : 'Not every suggestion belongs.'}</Text>
          </View>
          <Text style={styles.progress}>{second ? '2 / 2' : '1 / 2'}</Text>
        </View>

        <View style={styles.reviewCard}>
          <ObjectFixture kind={second ? 'boot' : 'vase'} />
          <View style={styles.reasonPill}>
            <Text style={styles.reasonText}>Suggested from your private review</Text>
          </View>
          <Text style={styles.prompt}>{second ? 'What makes this yours?' : 'Only you know if this matters.'}</Text>
          {second ? (
            <Pressable
              accessibilityLabel="Add the story only you know"
              onPress={addFixtureLine}
              style={({ pressed }) => [styles.input, pressed && styles.pressed]}
              testID="creative-capture-add-line"
            >
              <Text style={[styles.inputText, !note && styles.inputPlaceholder]}>
                {note || 'Tap to add the story only you know…'}
              </Text>
              <Text style={styles.inputAction}>{typing ? 'ADDING YOUR LINE…' : note ? 'PARENT-ADDED LINE' : 'ADD A LINE'}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setStage('second')}
            style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}
            testID="creative-capture-skip"
          >
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!second || !note.trim() || typing}
            onPress={() => setStage('kept')}
            style={({ pressed }) => [styles.keepButton, (!second || !note.trim() || typing) && styles.disabled, pressed && styles.pressed]}
            testID="creative-capture-keep"
          >
            <Text style={styles.keepText}>Keep</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function FixtureLabel() {
  return (
    <View style={styles.fixtureLabel}>
      <View style={styles.fixtureDot} />
      <Text style={styles.fixtureText}>LOCAL SYNTHETIC FIXTURE · NO FAMILY DATA</Text>
    </View>
  );
}

function ObjectFixture({ kind, compact = false }) {
  return (
    <View style={[styles.artboard, compact && styles.artboardCompact]} accessibilityLabel={kind === 'boot' ? 'Illustrated yellow rain boot' : 'Illustrated striped vase'}>
      <View style={styles.sun} />
      <View style={styles.ground} />
      {kind === 'boot' ? <Boot /> : <Vase />}
      <View style={styles.fixtureSeal}>
        <Text style={styles.fixtureSealText}>OBJECT-ONLY FIXTURE</Text>
      </View>
    </View>
  );
}

function Boot() {
  return (
    <View style={styles.bootWrap}>
      <View style={styles.bootShaft}>
        <View style={styles.bootStripe} />
      </View>
      <View style={styles.bootFoot} />
      <View style={styles.puddle} />
      <View style={[styles.drop, styles.dropOne]} />
      <View style={[styles.drop, styles.dropTwo]} />
    </View>
  );
}

function Vase() {
  return (
    <View style={styles.vaseWrap}>
      <View style={styles.stem} />
      <View style={[styles.leaf, styles.leafLeft]} />
      <View style={[styles.leaf, styles.leafRight]} />
      <View style={styles.flower} />
      <View style={styles.vase}>
        <View style={styles.vaseStripe} />
        <View style={[styles.vaseStripe, styles.vaseStripeTwo]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF8F2' },
  screen: { flex: 1, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 20 },
  fixtureLabel: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#F8E9DE', borderRadius: 999, flexDirection: 'row', gap: 7, marginBottom: 18, paddingHorizontal: 12, paddingVertical: 7 },
  fixtureDot: { backgroundColor: '#CB6F4E', borderRadius: 4, height: 7, width: 7 },
  fixtureText: { color: '#755F56', fontFamily: 'Manrope-Bold', fontSize: 9, letterSpacing: 0.7 },
  topRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  eyebrow: { color: '#C96948', fontFamily: 'Manrope-Bold', fontSize: 12, letterSpacing: 2.1, marginBottom: 5 },
  title: { color: '#2E2724', fontFamily: 'Newsreader', fontSize: 31, lineHeight: 34, maxWidth: 300 },
  progress: { color: '#8C756A', fontFamily: 'Manrope-Bold', fontSize: 13, paddingTop: 5 },
  reviewCard: { backgroundColor: '#FFFFFF', borderColor: '#F0DED3', borderRadius: 30, borderWidth: 1, flex: 1, padding: 14, shadowColor: '#7D4E3A', shadowOffset: { height: 8, width: 0 }, shadowOpacity: 0.1, shadowRadius: 20 },
  artboard: { backgroundColor: '#DDEBE6', borderRadius: 22, flex: 1, minHeight: 300, overflow: 'hidden', position: 'relative' },
  artboardCompact: { height: 280, minHeight: 280 },
  sun: { backgroundColor: '#F8D886', borderRadius: 35, height: 70, opacity: 0.8, position: 'absolute', right: 28, top: 30, width: 70 },
  ground: { backgroundColor: '#BFD1BE', bottom: 0, height: '34%', left: 0, position: 'absolute', right: 0 },
  fixtureSeal: { backgroundColor: 'rgba(255,255,255,0.86)', borderRadius: 999, bottom: 13, left: 13, paddingHorizontal: 10, paddingVertical: 6, position: 'absolute' },
  fixtureSealText: { color: '#65534C', fontFamily: 'Manrope-Bold', fontSize: 8, letterSpacing: 0.8 },
  bootWrap: { bottom: '15%', height: 205, left: '26%', position: 'absolute', width: 190 },
  bootShaft: { backgroundColor: '#E9B94B', borderRadius: 28, height: 145, left: 25, overflow: 'hidden', position: 'absolute', top: 0, width: 88 },
  bootStripe: { backgroundColor: '#F7E2A1', height: 18, left: 0, position: 'absolute', right: 0, top: 26 },
  bootFoot: { backgroundColor: '#E9B94B', borderBottomLeftRadius: 26, borderBottomRightRadius: 54, height: 70, left: 25, position: 'absolute', top: 116, width: 150 },
  puddle: { backgroundColor: '#6FA6AF', borderRadius: 70, bottom: 0, height: 34, left: 0, opacity: 0.78, position: 'absolute', width: 190 },
  drop: { backgroundColor: '#6FA6AF', borderRadius: 9, height: 18, position: 'absolute', width: 12 },
  dropOne: { right: 20, top: 85, transform: [{ rotate: '22deg' }] },
  dropTwo: { right: 2, top: 112, transform: [{ rotate: '-18deg' }] },
  vaseWrap: { bottom: '17%', height: 240, left: '26%', position: 'absolute', width: 170 },
  stem: { backgroundColor: '#66866D', height: 130, left: 83, position: 'absolute', top: 18, width: 6 },
  leaf: { backgroundColor: '#789A79', borderBottomLeftRadius: 22, borderTopRightRadius: 22, height: 42, position: 'absolute', top: 76, width: 26 },
  leafLeft: { left: 60, transform: [{ rotate: '-35deg' }] },
  leafRight: { left: 91, top: 56, transform: [{ rotate: '35deg' }] },
  flower: { backgroundColor: '#D77876', borderRadius: 38, height: 76, left: 48, position: 'absolute', top: 0, width: 76 },
  vase: { backgroundColor: '#F6E6D4', borderBottomLeftRadius: 46, borderBottomRightRadius: 46, borderTopLeftRadius: 18, borderTopRightRadius: 18, bottom: 0, height: 125, left: 33, overflow: 'hidden', position: 'absolute', width: 110 },
  vaseStripe: { backgroundColor: '#D8856C', height: 18, left: 0, position: 'absolute', right: 0, top: 32 },
  vaseStripeTwo: { backgroundColor: '#A5BAA5', top: 72 },
  reasonPill: { alignSelf: 'flex-start', backgroundColor: '#F9EDE5', borderRadius: 999, marginTop: 12, paddingHorizontal: 12, paddingVertical: 7 },
  reasonText: { color: '#765C52', fontFamily: 'Manrope-SemiBold', fontSize: 11 },
  prompt: { color: '#3B302C', fontFamily: 'Newsreader', fontSize: 23, lineHeight: 27, marginTop: 12 },
  input: { backgroundColor: '#FFF8F3', borderColor: '#E8D2C5', borderRadius: 16, borderWidth: 1, marginTop: 10, minHeight: 78, padding: 13 },
  inputText: { color: '#2E2724', fontFamily: 'Manrope-SemiBold', fontSize: 14, lineHeight: 20, minHeight: 40 },
  inputPlaceholder: { color: '#947D73' },
  inputAction: { color: '#C96948', fontFamily: 'Manrope-Bold', fontSize: 9, letterSpacing: 0.9, marginTop: 7 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  skipButton: { alignItems: 'center', backgroundColor: '#F5E9E1', borderRadius: 18, flex: 0.78, paddingVertical: 18 },
  skipText: { color: '#6F584F', fontFamily: 'Manrope-Bold', fontSize: 16 },
  keepButton: { alignItems: 'center', backgroundColor: '#CB6F4E', borderRadius: 18, flex: 1.22, paddingVertical: 18 },
  keepText: { color: '#FFFFFF', fontFamily: 'Manrope-Bold', fontSize: 16 },
  disabled: { opacity: 0.35 },
  pressed: { transform: [{ scale: 0.98 }] },
  worldHeader: { marginBottom: 18 },
  hero: { color: '#2E2724', fontFamily: 'Newsreader', fontSize: 38, lineHeight: 41 },
  subhead: { color: '#7A645A', fontFamily: 'Manrope-SemiBold', fontSize: 14, marginTop: 7 },
  memoryCard: { backgroundColor: '#FFFFFF', borderColor: '#EFD9CC', borderRadius: 28, borderWidth: 1, padding: 14, position: 'relative', shadowColor: '#7D4E3A', shadowOffset: { height: 8, width: 0 }, shadowOpacity: 0.11, shadowRadius: 22 },
  savedBadge: { backgroundColor: '#69856F', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, position: 'absolute', right: 26, top: 26, zIndex: 3 },
  savedBadgeText: { color: '#FFFFFF', fontFamily: 'Manrope-Bold', fontSize: 10, letterSpacing: 1.1 },
  memoryNote: { color: '#332A27', fontFamily: 'Newsreader', fontSize: 24, lineHeight: 29, marginTop: 16 },
  meta: { color: '#927B70', fontFamily: 'Manrope-SemiBold', fontSize: 11, marginTop: 9 },
  payoffBar: { backgroundColor: '#F4E6DE', borderRadius: 20, marginTop: 18, padding: 17 },
  payoffCopy: { color: '#715B52', fontFamily: 'Manrope-SemiBold', fontSize: 14 },
  payoffStrong: { color: '#BF6142', fontFamily: 'Manrope-Bold', fontSize: 17, marginTop: 2 },
});
