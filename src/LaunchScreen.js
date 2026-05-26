import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { BrandMark, useTheme } from './ui';

export default function LaunchScreen({ onDone }) {
  const theme = useTheme();
  const [reduceMotion, setReduceMotion] = useState(false);

  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const markOpacity = useRef(new Animated.Value(1)).current;
  const markScale = useRef(new Animated.Value(0.88)).current;
  const glowScale = useRef(new Animated.Value(0.85)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(Boolean(enabled));
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    let doneTimer;
    let breathLoop;

    const finish = () => {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: reduceMotion ? 220 : 420,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onDone?.();
      });
    };

    if (reduceMotion) {
      Animated.parallel([
        Animated.timing(glowOpacity, {
          toValue: 0.18,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
      doneTimer = setTimeout(finish, 520);
      return () => clearTimeout(doneTimer);
    }

    Animated.sequence([
      Animated.parallel([
        Animated.spring(markScale, {
          toValue: 1,
          friction: 8,
          tension: 38,
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0.18,
          duration: 520,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(glowScale, {
          toValue: 1,
          friction: 8,
          tension: 34,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      breathLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(breath, {
            toValue: 1.035,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(breath, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      breathLoop.start();
      doneTimer = setTimeout(finish, 760);
    });

    return () => {
      clearTimeout(doneTimer);
      breathLoop?.stop?.();
    };
  }, [breath, glowOpacity, glowScale, markOpacity, markScale, onDone, overlayOpacity, reduceMotion]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.overlay, { opacity: overlayOpacity, backgroundColor: theme.semantic.bg }]}
    >
      <View
        style={styles.stage}
        onLayout={() => {
          SplashScreen.hideAsync().catch(() => {});
        }}
      >
        <Animated.View
          style={[
            styles.glow,
            {
              opacity: glowOpacity,
              backgroundColor: theme.semantic.primarySoft,
              transform: [{ scale: glowScale }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.markWrap,
            {
              opacity: markOpacity,
              transform: [{ scale: Animated.multiply(markScale, breath) }],
            },
          ]}
        >
          <BrandMark size={280} showWordmark />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    zIndex: 0,
  },
  markWrap: {
    zIndex: 1,
    alignItems: 'center',
  },
});
