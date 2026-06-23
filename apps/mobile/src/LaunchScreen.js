import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { BrandMark, useTheme } from './ui';

export default function LaunchScreen({ onDone }) {
  const theme = useTheme();
  const [reduceMotion, setReduceMotion] = useState(false);

  const doneRef = useRef(false);
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
    let fallbackTimer;
    const complete = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone?.();
    };
    const hardFallbackTimer = setTimeout(complete, reduceMotion ? 1400 : 2600);
    const finish = () => {
      const duration = reduceMotion ? 220 : 420;
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(complete);
      fallbackTimer = setTimeout(complete, duration + 180);
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
      return () => {
        clearTimeout(doneTimer);
        clearTimeout(fallbackTimer);
        clearTimeout(hardFallbackTimer);
      };
    }

    Animated.sequence([
      Animated.parallel([
        Animated.timing(markScale, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0.18,
          duration: 520,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glowScale, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      Animated.timing(breath, {
        toValue: 1.018,
        duration: 500,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start();
      doneTimer = setTimeout(finish, 760);
    });

    return () => {
      clearTimeout(doneTimer);
      clearTimeout(fallbackTimer);
      clearTimeout(hardFallbackTimer);
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
          <BrandMark size={280} showWordmark fillFrame />
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
