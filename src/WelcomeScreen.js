import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { Screen, Button, Brand, Display, Body, Caption, V, Spacer, semantic, colors, space } from './ui';

/**
 * The first thing a new visitor sees. A single, slowly-paced moment:
 * a heart appears, three lines of poetry fade in one after another,
 * then the CTA. No tabs, no skip button. The point is to set the
 * emotional register before any UI work begins.
 *
 * After "begin", we move to the email screen. Signed-out users always
 * start here so the emotional intro remains the first app moment.
 */
export default function WelcomeScreen() {
  const router = useRouter();

  const heartO = useRef(new Animated.Value(0)).current;
  const heartS = useRef(new Animated.Value(0.6)).current;
  const heartPulse = useRef(new Animated.Value(1)).current;
  const lineEyebrow = useRef(new Animated.Value(0)).current;
  const lineHero = useRef(new Animated.Value(0)).current;
  const lineBody = useRef(new Animated.Value(0)).current;
  const lineCta  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fadeIn = (val, delay, duration = 700) =>
      Animated.timing(val, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });

    Animated.parallel([
      Animated.timing(heartO, { toValue: 1, duration: 800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(heartS, { toValue: 1, friction: 6, tension: 40, useNativeDriver: true }),
      fadeIn(lineEyebrow, 600),
      fadeIn(lineHero, 1100, 1100),
      fadeIn(lineBody, 2100),
      fadeIn(lineCta, 2800),
    ]).start();

    // Gentle infinite pulse on the heart
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(heartPulse, { toValue: 1.06, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(heartPulse, { toValue: 1.0,  duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    const startPulse = setTimeout(() => pulse.start(), 1500);

    return () => {
      clearTimeout(startPulse);
      pulse.stop();
    };
  }, []);

  const onBegin = () => {
    router.replace('/sign-in');
  };

  return (
    <Screen variant="dawn" edges={{ top: true, bottom: true }}>
      <View style={styles.root}>
        <Animated.View
          style={[
            styles.heartWrap,
            {
              opacity: heartO,
              transform: [{ scale: Animated.multiply(heartS, heartPulse) }],
            },
          ]}
        >
          <View style={styles.heartHalo} />
          <Ionicons name="heart" size={88} color={colors.rose} />
        </Animated.View>

        <Spacer h={space.xxxl} />

        <Animated.View style={{ opacity: lineEyebrow }}>
          <Brand align="center">our little world</Brand>
        </Animated.View>

        <Spacer h={space.lg} />

        <Animated.View style={{ opacity: lineHero }}>
          <Display align="center" style={styles.headline}>
            For the moments{'\n'}you'll wish you{'\n'}remembered.
          </Display>
        </Animated.View>

        <Spacer h={space.xl} />

        <Animated.View style={{ opacity: lineBody, paddingHorizontal: space.lg }}>
          <Body align="center" style={styles.body}>
            A private space for two — to hold every smile,
            every cry, every tiny ordinary day of the little
            person you're raising together.
          </Body>
        </Animated.View>

        <View style={{ flex: 1 }} />

        <Animated.View style={{ opacity: lineCta, width: '100%' }}>
          <Button onPress={onBegin}>Begin</Button>
          <Spacer h={space.md} />
          <Caption align="center">No likes. No feed. No algorithm.</Caption>
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: space.xxxl,
    paddingBottom: space.xl,
    alignItems: 'center',
  },
  heartWrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartHalo: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.coralSoft,
    opacity: 0.55,
  },
  headline: {
    color: colors.ink,
    fontSize: 38,
    lineHeight: 44,
  },
  body: {
    color: colors.plum,
    maxWidth: 320,
  },
});
