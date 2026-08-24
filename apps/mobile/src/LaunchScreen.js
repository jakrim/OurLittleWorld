import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { Brand, useTheme } from './ui';
import useReducedMotion from './ui/useReducedMotion';

const LAUNCH_MARK_SIZE = 240;
const LAYER_COUNT = 5;

const LAYERS = {
  badge: require('../assets/brand/icon-composer-layers/02-cream-badge.png'),
  ring: require('../assets/brand/icon-composer-layers/03-terracotta-ring.png'),
  sprout: require('../assets/brand/icon-composer-layers/04-gold-sprout.png'),
  dots: require('../assets/brand/icon-composer-layers/05-flower-dots.png'),
  heart: require('../assets/brand/icon-composer-layers/06-heart.png'),
};

export default function LaunchScreen({ onDone }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [assetsReady, setAssetsReady] = useState(false);

  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const readyRef = useRef(false);
  const loadedLayersRef = useRef(new Set());
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const ringProgress = useRef(new Animated.Value(0)).current;
  const sproutProgress = useRef(new Animated.Value(0)).current;
  const heartProgress = useRef(new Animated.Value(0)).current;
  const dotsProgress = useRef(new Animated.Value(0)).current;
  const wordmarkProgress = useRef(new Animated.Value(0)).current;
  const markScale = useRef(new Animated.Value(1)).current;

  onDoneRef.current = onDone;

  const revealLaunchScreen = useCallback(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    setAssetsReady(true);
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const handleLayerReady = useCallback((name) => {
    loadedLayersRef.current.add(name);
    if (loadedLayersRef.current.size >= LAYER_COUNT) revealLaunchScreen();
  }, [revealLaunchScreen]);

  useEffect(() => {
    const fallback = setTimeout(revealLaunchScreen, 1200);
    return () => clearTimeout(fallback);
  }, [revealLaunchScreen]);

  useEffect(() => {
    if (!assetsReady) return undefined;

    let finishTimer;
    let fallbackTimer;
    const complete = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDoneRef.current?.();
    };
    const hardFallbackTimer = setTimeout(complete, reduceMotion ? 1500 : 3400);
    const finish = () => {
      const duration = reduceMotion ? 220 : 360;
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(complete);
      fallbackTimer = setTimeout(complete, duration + 180);
    };

    if (reduceMotion) {
      ringProgress.setValue(1);
      sproutProgress.setValue(1);
      heartProgress.setValue(1);
      dotsProgress.setValue(1);
      wordmarkProgress.setValue(1);
      finishTimer = setTimeout(finish, 640);
      return () => {
        clearTimeout(finishTimer);
        clearTimeout(fallbackTimer);
        clearTimeout(hardFallbackTimer);
      };
    }

    const bloom = Animated.sequence([
      Animated.parallel([
        Animated.sequence([
          Animated.delay(460),
          Animated.timing(ringProgress, {
            toValue: 1,
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(80),
          Animated.timing(sproutProgress, {
            toValue: 1,
            duration: 900,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
        ]),
        Animated.sequence([
          Animated.delay(40),
          Animated.spring(heartProgress, {
            toValue: 1,
            damping: 13,
            stiffness: 115,
            mass: 0.8,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(720),
          Animated.spring(dotsProgress, {
            toValue: 1,
            damping: 12,
            stiffness: 105,
            mass: 0.8,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(1020),
          Animated.timing(wordmarkProgress, {
            toValue: 1,
            duration: 380,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ], { stopTogether: false }),
      Animated.sequence([
        Animated.timing(markScale, {
          toValue: 1.007,
          duration: 170,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(markScale, {
          toValue: 1,
          damping: 15,
          stiffness: 150,
          mass: 0.7,
          useNativeDriver: true,
        }),
      ]),
    ]);

    bloom.start(({ finished }) => {
      if (finished) finishTimer = setTimeout(finish, 220);
    });

    return () => {
      bloom.stop();
      clearTimeout(finishTimer);
      clearTimeout(fallbackTimer);
      clearTimeout(hardFallbackTimer);
    };
  }, [
    assetsReady,
    dotsProgress,
    heartProgress,
    markScale,
    overlayOpacity,
    reduceMotion,
    ringProgress,
    sproutProgress,
    wordmarkProgress,
  ]);

  const imageStyle = { width: LAUNCH_MARK_SIZE, height: LAUNCH_MARK_SIZE };
  const sproutClipHeight = sproutProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [LAUNCH_MARK_SIZE * 0.23, LAUNCH_MARK_SIZE],
  });

  return (
    <Animated.View
      pointerEvents="none"
      testID="launch-bloom"
      style={[styles.overlay, { opacity: overlayOpacity, backgroundColor: theme.semantic.bg }]}
    >
      <View style={styles.stage}>
        <Animated.View
          accessible
          accessibilityLabel="Our Little World logo blooming"
          style={[
            styles.markWrap,
            { width: LAUNCH_MARK_SIZE, height: LAUNCH_MARK_SIZE, transform: [{ scale: markScale }] },
          ]}
        >
          <Image
            source={LAYERS.badge}
            style={[styles.layer, imageStyle]}
            resizeMode="contain"
            fadeDuration={0}
            accessible={false}
            testID="launch-layer-badge"
            onLoadEnd={() => handleLayerReady('badge')}
          />

          <Animated.Image
            source={LAYERS.ring}
            style={[
              styles.layer,
              imageStyle,
              {
                opacity: ringProgress,
                transform: [{ scale: ringProgress.interpolate({ inputRange: [0, 1], outputRange: [0.955, 1] }) }],
              },
            ]}
            resizeMode="contain"
            fadeDuration={0}
            accessible={false}
            testID="launch-layer-ring"
            onLoadEnd={() => handleLayerReady('ring')}
          />

          <Animated.View
            testID="launch-layer-sprout"
            style={[styles.sproutClip, { width: LAUNCH_MARK_SIZE, height: sproutClipHeight }]}
          >
            <Image
              source={LAYERS.sprout}
              style={[styles.sproutImage, imageStyle]}
              resizeMode="contain"
              fadeDuration={0}
              accessible={false}
              onLoadEnd={() => handleLayerReady('sprout')}
            />
          </Animated.View>

          <Animated.Image
            source={LAYERS.heart}
            style={[
              styles.layer,
              imageStyle,
              {
                opacity: heartProgress,
                transform: [{ translateY: heartProgress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
              },
            ]}
            resizeMode="contain"
            fadeDuration={0}
            accessible={false}
            testID="launch-layer-heart"
            onLoadEnd={() => handleLayerReady('heart')}
          />

          <Animated.Image
            source={LAYERS.dots}
            style={[
              styles.layer,
              imageStyle,
              {
                opacity: dotsProgress,
                transform: [{ scale: dotsProgress.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }],
              },
            ]}
            resizeMode="contain"
            fadeDuration={0}
            accessible={false}
            testID="launch-layer-dots"
            onLoadEnd={() => handleLayerReady('dots')}
          />

          <Animated.View
            testID="launch-wordmark"
            style={[
              styles.wordmark,
              {
                opacity: wordmarkProgress,
                transform: [{ translateY: wordmarkProgress.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
              },
            ]}
          >
            <Brand align="center" style={{ color: theme.semantic.primary }}>
              our little world
            </Brand>
          </Animated.View>
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
  markWrap: {
    zIndex: 1,
  },
  layer: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  sproutClip: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  sproutImage: {
    position: 'absolute',
    left: 0,
    bottom: 0,
  },
  wordmark: {
    position: 'absolute',
    top: LAUNCH_MARK_SIZE + 10,
    left: -40,
    width: LAUNCH_MARK_SIZE + 80,
  },
});
