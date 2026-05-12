import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  ScrollView,
  Pressable,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import FallingRosePetals from '../components/FallingRosePetals';

const palette = {
  plum950: '#241820',
  plum900: '#2d1f29',
  plum800: '#3a2835',
  plum700: '#4a3544',
  plum600: '#5d4555',
  mauve: '#7a6170',
  cream: '#fff5ee',
  paper: '#fffaf5',
  rose: '#c76e7e',
  roseSoft: '#efc6ce',
  gold: '#e6c27f',
};

export default function VirtualCard() {
  const navigation = useNavigation();
  const reveal = useSharedValue(0);
  const seal = useSharedValue(0);

  useEffect(() => {
    reveal.value = withTiming(1, {
      duration: 900,
      easing: Easing.bezier(0.2, 0.85, 0.15, 1),
    });
    seal.value = withDelay(
      520,
      withSequence(
        withSpring(1.16, { damping: 9, stiffness: 120 }),
        withSpring(1, { damping: 12, stiffness: 120 })
      )
    );
  }, [reveal, seal]);

  const letterStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      { translateY: 42 * (1 - reveal.value) },
      { scale: 0.94 + reveal.value * 0.06 },
    ],
  }));

  const headerStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: 20 * (1 - reveal.value) }],
  }));

  const sealStyle = useAnimatedStyle(() => ({
    opacity: seal.value,
    transform: [{ scale: seal.value }],
  }));

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <ImageBackground
        style={StyleSheet.absoluteFill}
        source={require('../assets/BackgroundImage.jpg')}
        resizeMode="cover"
      />
      <LinearGradient
        colors={[
          'rgba(36, 24, 32, 0.92)',
          'rgba(93, 69, 85, 0.66)',
          'rgba(36, 24, 32, 0.94)',
        ]}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
      />
      <FallingRosePetals introDense={false} quietCount={11} />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            style={styles.back}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.backText}>← Back</Text>
          </Pressable>

          <Animated.View style={[styles.header, headerStyle]}>
            <Text style={styles.kicker}>First Mother’s Day</Text>
            <Text style={styles.title}>For Lauren</Text>
            <Text style={styles.subtitle}>from Jesse, with Reuben Isaac in our little world</Text>
          </Animated.View>

          <Animated.View style={[styles.letterWrap, letterStyle]}>
            <View style={styles.paperShadowOne} />
            <View style={styles.paperShadowTwo} />
            <LinearGradient
              colors={[palette.paper, '#f8e8e8']}
              style={styles.letter}
            >
              <View style={styles.letterTopRow}>
                <Text style={styles.letterTiny}>Mother’s Day 2026</Text>
                <Text style={styles.letterTiny}>♥</Text>
              </View>

              <Text style={styles.dear}>Dear Lauren,</Text>
              <Text style={styles.body}>
                Happy Mother’s Day today, my love.
              </Text>
              <Text style={styles.body}>
                From March 12, 2016 to two wedding days to the morning Reuben Isaac made us three, every chapter of our story has been leading to this first Mother’s Day.
              </Text>
              <Text style={styles.body}>
                Watching you become his mom has been the most beautiful thing I have ever witnessed. There is a softness in the way you hold him, a strength in the way you show up for him, and a love in your eyes that has changed the whole shape of our life.
              </Text>
              <Text style={styles.body}>
                Today is for celebrating you: the woman I love, the mother Reuben Isaac adores, and the heart of our little world.
              </Text>
              <Text style={styles.closing}>I love you endlessly,</Text>
              <Text style={styles.signature}>Jesse</Text>

              <Animated.View style={[styles.seal, sealStyle]}>
                <Text style={styles.sealHeart}>♥</Text>
              </Animated.View>
            </LinearGradient>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.plum950,
  },
  safeArea: {
    flex: 1,
    zIndex: 2,
  },
  scroll: {
    paddingHorizontal: 18,
    paddingBottom: 44,
  },
  back: {
    alignSelf: 'flex-start',
    marginTop: 10,
    marginBottom: 18,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 245, 238, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 245, 238, 0.22)',
  },
  backText: {
    fontSize: 15,
    color: palette.cream,
    fontWeight: '700',
  },
  header: {
    marginBottom: 24,
    paddingHorizontal: 6,
  },
  kicker: {
    color: palette.gold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    fontWeight: '800',
    marginBottom: 10,
  },
  title: {
    color: palette.cream,
    fontFamily: 'Reckless',
    fontSize: 50,
    lineHeight: 55,
    letterSpacing: -1,
  },
  subtitle: {
    marginTop: 12,
    maxWidth: 310,
    color: 'rgba(255, 245, 238, 0.78)',
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500',
  },
  letterWrap: {
    minHeight: 640,
    justifyContent: 'center',
  },
  paperShadowOne: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 28,
    bottom: 26,
    borderRadius: 38,
    backgroundColor: 'rgba(199, 110, 126, 0.56)',
    transform: [{ rotate: '-4deg' }],
  },
  paperShadowTwo: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 32,
    bottom: 22,
    borderRadius: 38,
    backgroundColor: 'rgba(93, 69, 85, 0.72)',
    transform: [{ rotate: '3deg' }],
  },
  letter: {
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 30,
    borderRadius: 38,
    borderWidth: 1,
    borderColor: 'rgba(255, 245, 238, 0.68)',
    shadowColor: '#120a10',
    shadowOpacity: 0.34,
    shadowOffset: { width: 0, height: 24 },
    shadowRadius: 34,
    elevation: 12,
  },
  letterTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  letterTiny: {
    color: palette.rose,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    fontWeight: '800',
  },
  dear: {
    color: palette.plum800,
    fontFamily: 'Reckless',
    fontSize: 30,
    lineHeight: 38,
    marginBottom: 12,
  },
  body: {
    color: palette.plum700,
    fontSize: 16,
    lineHeight: 25,
    fontWeight: '500',
    marginBottom: 15,
  },
  closing: {
    marginTop: 4,
    color: palette.plum800,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '700',
  },
  signature: {
    marginTop: 2,
    color: palette.rose,
    fontFamily: 'porcelain',
    fontSize: 38,
    lineHeight: 44,
  },
  seal: {
    position: 'absolute',
    right: 24,
    bottom: 28,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.plum700,
    borderWidth: 1,
    borderColor: 'rgba(230, 194, 127, 0.64)',
  },
  sealHeart: {
    color: palette.roseSoft,
    fontSize: 31,
    lineHeight: 36,
  },
});
