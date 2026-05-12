import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ImageBackground,
  View,
  StyleSheet,
  Text,
  ScrollView,
  Pressable,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import AsyncStorage from '@react-native-async-storage/async-storage';

import FallingRosePetals from '../components/FallingRosePetals';
import { firstLookStorageKey, shouldShowFirstLook, useAuth, useFamily } from '../src';

globalThis.__OLW_LEGACY_ARCHIVE_UNLOCKED__ = false;

const palette = {
  plum900: '#2d1f29',
  plum800: '#3a2835',
  plum700: '#4a3544',
  plum600: '#5d4555',
  mauve: '#7a6170',
  cream: '#fff5ee',
  creamGlass: 'rgba(255, 245, 238, 0.92)',
  rose: '#c76e7e',
  roseSoft: '#efc6ce',
  gold: '#e6c27f',
};

const loveTimeline = [
  { date: 'March 12, 2016', title: 'We met in Israel' },
  { date: 'February 5, 2020', title: 'We got married' },
  { date: 'September 4, 2022', title: 'We celebrated all over again' },
  { date: 'July 23, 2025', title: 'Reuben Isaac made us a family' },
];

const HomeScreen = (props) => {
  const { width } = useWindowDimensions();
  const { session, user } = useAuth();
  const { family } = useFamily();
  const [openingCard, setOpeningCard] = useState(false);
  const cardOpen = useSharedValue(0);
  const cardOpenTimer = useRef(null);

  useEffect(() => () => {
    if (cardOpenTimer.current) clearTimeout(cardOpenTimer.current);
  }, []);

  const goToOurLittleWorld = useCallback(async (method = 'navigate') => {
    const action = props.navigation[method] || props.navigation.navigate;
    // Brand-new visitors who never saw the welcome go through it once.
    if (!session) {
      action('OurLittleWorldWelcome');
      return;
    }
    if (!family) {
      action('OurLittleWorldOnboarding');
      return;
    }
    if (!family.babyName || !family.babyBirthday) {
      action('OurLittleWorldSetup');
      return;
    }
    if (user && shouldShowFirstLook({ family, user })) {
      const seen = await AsyncStorage.getItem(firstLookStorageKey({ familyId: family.id, userId: user.id }));
      if (seen !== '1') {
        action('OurLittleWorldFirstLook');
        return;
      }
    }
    // Default destination: the timeline. From there users can navigate
    // into Reference / Scan / Invite / Photo as needed.
    action('OurLittleWorldTimeline');
  }, [family, props.navigation, session, user]);

  useEffect(() => {
    if (globalThis.__OLW_LEGACY_ARCHIVE_UNLOCKED__) return;
    goToOurLittleWorld('replace');
  }, [goToOurLittleWorld]);

  const handleOpenCard = useCallback(() => {
    if (openingCard) return;

    setOpeningCard(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    cardOpen.value = 0;
    cardOpen.value = withTiming(1, {
      duration: 920,
      easing: Easing.bezier(0.2, 0.85, 0.15, 1),
    });

    if (cardOpenTimer.current) clearTimeout(cardOpenTimer.current);
    cardOpenTimer.current = setTimeout(() => {
      props.navigation.navigate('Card');
      setOpeningCard(false);
      cardOpen.value = 0;
    }, 760);
  }, [cardOpen, openingCard, props.navigation]);

  const noteOpenStyle = useAnimatedStyle(() => ({
    opacity: 1 - cardOpen.value * 0.16,
    transform: [
      { translateY: -cardOpen.value * 34 },
      { scale: 1 + cardOpen.value * 0.16 },
      { rotate: `${cardOpen.value * -2}deg` },
    ],
  }));

  const noteBackOneOpenStyle = useAnimatedStyle(() => ({
    opacity: 1 - cardOpen.value * 0.18,
    transform: [
      { rotate: `${-9 - cardOpen.value * 10}deg` },
      { translateX: -26 - cardOpen.value * 28 },
      { translateY: cardOpen.value * 16 },
      { scale: 1 + cardOpen.value * 0.08 },
    ],
  }));

  const noteBackTwoOpenStyle = useAnimatedStyle(() => ({
    opacity: 1 - cardOpen.value * 0.18,
    transform: [
      { rotate: `${8 + cardOpen.value * 11}deg` },
      { translateX: 30 + cardOpen.value * 26 },
      { translateY: cardOpen.value * 18 },
      { scale: 1 + cardOpen.value * 0.08 },
    ],
  }));

  const bloomStyle = useAnimatedStyle(() => ({
    opacity: cardOpen.value,
    transform: [{ scale: 0.86 + cardOpen.value * 0.22 }],
  }));

  if (!globalThis.__OLW_LEGACY_ARCHIVE_UNLOCKED__) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        <FallingRosePetals introDense={false} quietCount={9} />
      </View>
    );
  }

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
          'rgba(45, 31, 41, 0.86)',
          'rgba(74, 53, 68, 0.68)',
          'rgba(45, 31, 41, 0.84)',
        ]}
        locations={[0, 0.52, 1]}
        style={StyleSheet.absoluteFill}
      />
      <FallingRosePetals introDense />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <Text style={styles.topBarText}>OUR LITTLE WORLD</Text>
            <Text style={styles.topBarDot}>✦</Text>
            <Text style={styles.topBarText}>FOR LAUREN</Text>
          </View>

          <View style={styles.hero}>
            <View style={styles.heroGlow} />
            <Text style={styles.eyebrow}>A Mother’s Day letter</Text>
            <Text style={styles.heroTitle}>Happy Mother’s Day, Lauren.</Text>
            <Text style={styles.heroSubtitle}>
              From the day I met you to the day we became Reuben Isaac’s parents, every chapter has led us here.
            </Text>
            <View style={styles.timeline}>
              {loveTimeline.map((item, index) => (
                <View key={item.date} style={styles.timelineItem}>
                  <View style={styles.timelineMarkerWrap}>
                    <View style={styles.timelineDot} />
                    {index < loveTimeline.length - 1 ? (
                      <View style={styles.timelineLine} />
                    ) : null}
                  </View>
                  <View style={styles.timelineCopy}>
                    <Text style={styles.timelineDate}>{item.date}</Text>
                    <Text style={styles.timelineTitle}>{item.title}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.flagRow}>
              <Text style={styles.flagText}>🇺🇸</Text>
              <View style={styles.flagLine} />
              <Text style={styles.flagText}>🇨🇦</Text>
              <View style={styles.flagLine} />
              <Text style={styles.flagText}>🇮🇱</Text>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.noteWrap,
              { minHeight: width * 0.94 },
              pressed && styles.pressed,
            ]}
            onPress={handleOpenCard}
          >
            <Animated.View style={[styles.noteBackOne, noteBackOneOpenStyle]} />
            <Animated.View style={[styles.noteBackTwo, noteBackTwoOpenStyle]} />
            <Animated.View style={[styles.noteAnimated, noteOpenStyle]}>
              <LinearGradient
                colors={[palette.cream, '#f8e8e8']}
                style={styles.noteCard}
              >
                <Text style={styles.noteDate}>Mother’s Day 2026</Text>
                <Text style={styles.noteTitle}>
                  Today is your first Mother’s Day.
                </Text>
                <Text style={styles.noteBody}>
                  From March 12, 2016 to Reuben Isaac, every chapter has been leading us here.
                </Text>
                <View style={styles.noteMilestones}>
                  <Text style={styles.noteMilestone}>Met</Text>
                  <View style={styles.noteMilestoneLine} />
                  <Text style={styles.noteMilestone}>Married</Text>
                  <View style={styles.noteMilestoneLine} />
                  <Text style={styles.noteMilestone}>Parents</Text>
                </View>
                <View style={styles.heartSeal}>
                  <Text style={styles.heartSealText}>♥</Text>
                </View>
                <Text style={styles.noteSignature}>J</Text>
              </LinearGradient>
            </Animated.View>
          </Pressable>

          <View style={styles.actionsPanel}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryAction,
                pressed && styles.pressed,
              ]}
              onPress={goToOurLittleWorld}
            >
              <LinearGradient
                colors={[palette.plum600, palette.plum800]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.primaryGradient}
              >
                <Text style={styles.primarySparkle}>✦</Text>
                <View style={styles.primaryTextWrap}>
                  <Text style={styles.primaryActionText}>Our Little World</Text>
                  <Text style={styles.primaryActionCaption}>
                    a timeline of our little one
                  </Text>
                </View>
                <Text style={styles.primarySparkle}>✦</Text>
              </LinearGradient>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryAction,
                pressed && styles.pressed,
              ]}
              onPress={() => {
                props.navigation.navigate('Memories');
              }}
            >
              <View>
                <Text style={styles.actionKicker}>Photo archive</Text>
                <Text style={styles.secondaryActionText}>Memories</Text>
              </View>
              <Text style={styles.actionArrow}>→</Text>
            </Pressable>
          </View>

          <View style={styles.messagePanel}>
            <Text style={styles.messageLabel}>A little wish</Text>
            <Text style={styles.messageAccent}>יום האם שמח מתוקה שלי</Text>
            <View style={styles.divider} />
            <Text style={styles.signature}>אני אוהב אותך</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
      {openingCard ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.openingBloom, bloomStyle]}
        >
          <LinearGradient
            colors={['rgba(45, 31, 41, 0.2)', 'rgba(45, 31, 41, 0.96)']}
            style={styles.openingBloomGradient}
          >
            <Text style={styles.openingBloomText}>For your first Mother’s Day</Text>
            <Text style={styles.openingBloomHeart}>♥</Text>
          </LinearGradient>
        </Animated.View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.plum900,
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
    zIndex: 2,
  },
  scrollContent: {
    paddingTop: 12,
    paddingBottom: 36,
    paddingHorizontal: 18,
  },
  topBar: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 245, 238, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 245, 238, 0.2)',
  },
  topBarText: {
    color: palette.cream,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.7,
    fontWeight: '800',
  },
  topBarDot: {
    color: palette.gold,
    fontSize: 12,
  },
  hero: {
    overflow: 'hidden',
    minHeight: 405,
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingVertical: 26,
    borderRadius: 38,
    backgroundColor: 'rgba(45, 31, 41, 0.76)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 245, 238, 0.22)',
    shadowColor: '#120a10',
    shadowOpacity: 0.34,
    shadowOffset: { width: 0, height: 18 },
    shadowRadius: 34,
    elevation: 10,
  },
  heroGlow: {
    position: 'absolute',
    right: -70,
    top: -75,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: 'rgba(199, 110, 126, 0.34)',
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: palette.gold,
    fontWeight: '700',
    marginBottom: 10,
  },
  heroTitle: {
    color: palette.cream,
    fontFamily: 'Reckless',
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -1.1,
  },
  heroSubtitle: {
    marginTop: 14,
    color: 'rgba(255, 245, 238, 0.82)',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
  timeline: {
    marginTop: 22,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 245, 238, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 245, 238, 0.14)',
  },
  timelineItem: {
    flexDirection: 'row',
    minHeight: 54,
  },
  timelineMarkerWrap: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
    backgroundColor: palette.gold,
    borderWidth: 2,
    borderColor: 'rgba(255, 245, 238, 0.58)',
  },
  timelineLine: {
    flex: 1,
    width: 1,
    marginTop: 4,
    backgroundColor: 'rgba(230, 194, 127, 0.32)',
  },
  timelineCopy: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 13,
  },
  timelineDate: {
    color: palette.gold,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  timelineTitle: {
    marginTop: 2,
    color: palette.cream,
    fontFamily: 'Reckless',
    fontSize: 18,
    lineHeight: 23,
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 20,
  },
  flagText: {
    fontSize: 26,
  },
  flagLine: {
    width: 42,
    height: 1,
    backgroundColor: 'rgba(230, 194, 127, 0.64)',
  },
  noteWrap: {
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteBackOne: {
    position: 'absolute',
    width: '68%',
    height: '72%',
    borderRadius: 34,
    backgroundColor: 'rgba(199, 110, 126, 0.68)',
    transform: [{ rotate: '-9deg' }, { translateX: -26 }],
  },
  noteBackTwo: {
    position: 'absolute',
    width: '64%',
    height: '69%',
    borderRadius: 32,
    backgroundColor: 'rgba(93, 69, 85, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 245, 238, 0.18)',
    transform: [{ rotate: '8deg' }, { translateX: 30 }],
  },
  noteAnimated: {
    width: '78%',
  },
  noteCard: {
    width: '100%',
    minHeight: 345,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    paddingTop: 30,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(255, 245, 238, 0.72)',
    shadowColor: '#120a10',
    shadowOpacity: 0.32,
    shadowOffset: { width: 0, height: 22 },
    shadowRadius: 34,
    elevation: 12,
  },
  noteKicker: {
    color: palette.rose,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    fontWeight: '800',
    textAlign: 'center',
  },
  noteDate: {
    marginTop: 18,
    color: palette.gold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '800',
    textAlign: 'center',
  },
  noteTitle: {
    marginTop: 14,
    color: palette.plum800,
    fontFamily: 'Reckless',
    fontSize: 29,
    lineHeight: 34,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  noteBody: {
    marginTop: 14,
    color: palette.mauve,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
  },
  noteMilestones: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  noteMilestone: {
    color: palette.plum600,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '900',
  },
  noteMilestoneLine: {
    width: 22,
    height: 1,
    marginHorizontal: 8,
    backgroundColor: 'rgba(199, 110, 126, 0.4)',
  },
  heartSeal: {
    alignSelf: 'center',
    marginTop: 24,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.plum700,
    borderWidth: 1,
    borderColor: 'rgba(230, 194, 127, 0.62)',
  },
  heartSealText: {
    color: palette.roseSoft,
    fontSize: 27,
    lineHeight: 32,
  },
  noteSignature: {
    position: 'absolute',
    right: 24,
    bottom: 18,
    color: 'rgba(93, 69, 85, 0.3)',
    fontFamily: 'porcelain',
    fontSize: 30,
  },
  actionsPanel: {
    gap: 12,
    marginTop: 2,
  },
  secondaryAction: {
    minHeight: 92,
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingVertical: 16,
    backgroundColor: 'rgba(255, 245, 238, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 245, 238, 0.58)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionKicker: {
    color: palette.rose,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  secondaryActionText: {
    marginTop: 2,
    color: palette.plum700,
    fontFamily: 'Reckless',
    fontSize: 32,
    lineHeight: 38,
  },
  actionArrow: {
    color: palette.plum600,
    fontSize: 28,
    lineHeight: 32,
  },
  primaryAction: {
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#120a10',
    shadowOpacity: 0.28,
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 24,
    elevation: 8,
  },
  primaryGradient: {
    minHeight: 112,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  primarySparkle: {
    color: palette.gold,
    fontSize: 24,
    opacity: 0.92,
  },
  primaryTextWrap: {
    alignItems: 'center',
  },
  primaryActionText: {
    color: palette.cream,
    fontFamily: 'Reckless',
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: 0.2,
  },
  primaryActionCaption: {
    marginTop: 5,
    color: palette.roseSoft,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: 'porcelain',
    fontSize: 23,
  },
  messagePanel: {
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 245, 238, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 245, 238, 0.56)',
  },
  messageLabel: {
    color: palette.rose,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    fontWeight: '800',
    marginBottom: 10,
  },
  messageAccent: {
    color: '#2e5aac',
    textAlign: 'center',
    writingDirection: 'rtl',
    fontSize: 30,
    lineHeight: 40,
    fontWeight: '600',
  },
  messageText: {
    color: '#2e5aac',
    textAlign: 'center',
    writingDirection: 'rtl',
    fontSize: 28,
    lineHeight: 38,
  },
  divider: {
    height: 1,
    marginVertical: 16,
    backgroundColor: 'rgba(93, 69, 85, 0.18)',
  },
  signature: {
    color: palette.plum600,
    fontFamily: 'porcelain',
    fontSize: 26,
    lineHeight: 32,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  openingBloom: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 6,
  },
  openingBloomGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openingBloomText: {
    color: palette.cream,
    fontFamily: 'Reckless',
    fontSize: 31,
    lineHeight: 38,
    textAlign: 'center',
    paddingHorizontal: 34,
  },
  openingBloomHeart: {
    marginTop: 14,
    color: palette.roseSoft,
    fontSize: 34,
  },
});

export default HomeScreen;
