import React, { useEffect, useRef, useState } from 'react';
import { View, Animated, Easing, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';

import { Screen, Button, Brand, BrandMark, Display, Body, BodyTight, Caption, Eyebrow, Spacer, colors, space, radius, shadow } from './ui';
import useReducedMotion from './ui/useReducedMotion';

const SLIDES = [
  {
    key: 'baby-book',
    art: 'book',
    eyebrow: 'Digital baby book',
    title: "Your baby's story, kept\nfrom the very beginning.",
    body: 'Capture the first days, the tiny routines, and the details that blur together when the days run full.',
  },
  {
    key: 'details',
    art: 'details',
    eyebrow: 'Every little detail',
    title: 'First smiles, sleepy\nnotes, ordinary magic.',
    body: 'Photos and video, milestones, funny habits, late-night thoughts \u2014 the small moments you\u2019ll want to replay.',
  },
  {
    key: 'growth',
    art: 'growth',
    eyebrow: 'Grows with them',
    title: 'A keepsake that\ngrows as they do.',
    body: "From newborn days to first steps and far beyond, build a shared record of who they're becoming.",
  },
  {
    key: 'private',
    art: 'private',
    eyebrow: 'Just for two',
    title: 'Made for the two of\nyou, not the internet.',
    body: 'Invite your partner, keep it all in one quiet place, and leave the feeds and likes outside.',
  },
];

/**
 * The first thing a new visitor sees. A swipeable intro that frames the
 * app as a private baby book before moving into email sign-in.
 *
 * After "begin", we move to the email screen. Signed-out users always
 * start here so the emotional intro remains the first app moment.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const scrollRef = useRef(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const brandO = useRef(new Animated.Value(0)).current;
  const slidesO = useRef(new Animated.Value(0)).current;
  const artCycle = useRef(new Animated.Value(0)).current;
  const dotsO = useRef(new Animated.Value(0)).current;
  const ctaO = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      brandO.setValue(1);
      slidesO.setValue(1);
      dotsO.setValue(1);
      ctaO.setValue(1);
      artCycle.setValue(0);
      return undefined;
    }

    const fadeIn = (val, delay, duration = 700) =>
      Animated.timing(val, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });

    Animated.parallel([
      fadeIn(brandO, 250),
      Animated.timing(slidesO, { toValue: 1, duration: 900, delay: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      fadeIn(dotsO, 1300),
      fadeIn(ctaO, 1700),
    ]).start();

    const artLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(artCycle, {
          toValue: 1,
          duration: 5200,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(artCycle, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    const startArtLoop = setTimeout(() => artLoop.start(), 900);

    return () => {
      clearTimeout(startArtLoop);
      artLoop.stop();
    };
  }, [artCycle, brandO, ctaO, dotsO, reducedMotion, slidesO]);

  const pageWidth = viewportWidth || 1;
  const isCompact = viewportHeight > 0 && viewportHeight < 790;
  const logoSize = isCompact ? 72 : 86;
  const artGap = isCompact ? space.xl : space.xxl;
  const eyebrowGap = isCompact ? space.sm : space.md;
  const bodyGap = isCompact ? space.md : space.lg;

  const onBegin = () => {
    router.push('/sign-in');
  };

  const onMomentumScrollEnd = (event) => {
    if (!viewportWidth) return;
    const x = event.nativeEvent.contentOffset.x;
    setActiveSlide(Math.round(x / viewportWidth));
  };

  const goToSlide = (index) => {
    setActiveSlide(index);
    scrollRef.current?.scrollTo({ x: index * pageWidth, animated: true });
  };

  return (
    <Screen variant="dawn" edges={{ top: true, bottom: true }}>
      <View
        style={styles.root}
        onLayout={(event) => {
          setViewportWidth(event.nativeEvent.layout.width);
          setViewportHeight(event.nativeEvent.layout.height);
        }}
      >
        <Animated.View
          style={[styles.brandWrap, { opacity: brandO }]}
        >
          <BrandMark size={logoSize} fillFrame />
          <Spacer h={2} />
          <Brand align="center">our little world</Brand>
        </Animated.View>

        <Spacer h={isCompact ? space.sm : space.lg} />

        <Animated.View
          style={[
            styles.carouselBlock,
            {
              opacity: slidesO,
            },
          ]}
        >
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumScrollEnd}
            style={styles.carousel}
            contentContainerStyle={styles.carouselContent}
          >
            {SLIDES.map((slide) => (
              <View key={slide.key} style={[styles.slide, isCompact && styles.slideCompact, { width: pageWidth }]}>
                <SlideArt type={slide.art} compact={isCompact} progress={artCycle} />

                <Spacer h={artGap} />

                <Eyebrow align="center" style={styles.slideEyebrow}>
                  {slide.eyebrow}
                </Eyebrow>

                <Spacer h={eyebrowGap} />

                <Display align="center" style={[styles.headline, isCompact && styles.headlineCompact]}>
                  {slide.title}
                </Display>

                <Spacer h={bodyGap} />

                <Body align="center" style={[styles.body, isCompact && styles.bodyCompact]}>
                  {slide.body}
                </Body>
              </View>
            ))}
          </ScrollView>
        </Animated.View>

        <Animated.View style={[styles.dots, { opacity: dotsO }]}>
          {SLIDES.map((slide, index) => (
            <Pressable
              key={slide.key}
              onPress={() => goToSlide(index)}
              accessibilityRole="button"
              accessibilityLabel={`Show slide ${index + 1}`}
              style={[
                styles.dot,
                activeSlide === index ? styles.dotActive : null,
              ]}
            />
          ))}
        </Animated.View>

        <Animated.View style={{ opacity: ctaO, width: '100%' }}>
          <Button onPress={onBegin}>Start your baby book</Button>
          <Spacer h={space.md} />
          <Caption align="center">Private for your family. No feed. No algorithm.</Caption>
        </Animated.View>
      </View>
    </Screen>
  );
}

function SlideArt({ type, compact, progress }) {
  if (type === 'details') return <DetailsArt compact={compact} progress={progress} />;
  if (type === 'growth') return <GrowthArt compact={compact} progress={progress} />;
  if (type === 'private') return <PrivateArt compact={compact} progress={progress} />;
  return <BabyBookArt compact={compact} progress={progress} />;
}

function BabyBookArt({ compact, progress }) {
  const journeyShift = progress.interpolate({
    inputRange: [0, 0.32, 0.4, 0.66, 0.74, 1],
    outputRange: [0, 0, -58, -58, -116, -116],
  });

  return (
    <View style={[styles.artScene, compact && styles.artSceneCompact]}>
      <View style={styles.bookGlow} />
      <View style={styles.backPage} />
      <View style={styles.bookCard}>
        <View style={styles.bookSpine} />
        <StreamIn progress={progress} index={0} style={styles.bookHeader}>
          <View style={styles.bookHeaderCopy}>
            <View style={styles.bookJourneyWindow}>
              <Animated.View style={{ transform: [{ translateY: journeyShift }] }}>
                <BabyBookStage eyebrow="Baby book" title="Earliest days, held together" />
                <BabyBookStage eyebrow="10 months" title="Crawls, claps, tiny routines" />
                <BabyBookStage eyebrow="2 years" title="Words, wobble-runs, big feelings" />
              </Animated.View>
            </View>
          </View>
        </StreamIn>
        <StreamIn progress={progress} index={1} style={styles.memoryRows}>
          <MemoryRow icon="camera" label="Photos from day one" />
        </StreamIn>
        <StreamIn progress={progress} index={2} style={styles.memoryRowsTight}>
          <MemoryRow icon="sparkles" label="Firsts, notes, growth" />
        </StreamIn>
        <StreamIn progress={progress} index={3} style={styles.bookChipRow}>
          <ArtChip icon="heart" label="private" />
          <ArtChip icon="lock-closed" label="kept safe" />
        </StreamIn>
      </View>
    </View>
  );
}

function DetailsArt({ compact, progress }) {
  const detailShift = progress.interpolate({
    inputRange: [0, 0.3, 0.36, 0.64, 0.7, 1],
    outputRange: [0, 0, -104, -104, -208, -208],
  });

  return (
    <View style={[styles.artScene, compact && styles.artSceneCompact]}>
      <View style={[styles.artGlow, styles.detailsGlow]} />
      <View style={styles.photoCard}>
        <View style={styles.photoSky} />
        <View style={styles.photoHill} />
        <View style={styles.photoSun} />
      </View>
      <View style={styles.noteCard}>
        <Animated.View style={[styles.detailsTicker, { transform: [{ translateY: detailShift }] }]}>
          <DetailMoment time="2:14 AM" first="tiny laugh" second="milk drunk" />
          <DetailMoment time="6:40 AM" first="first smile" second="morning stretch" />
          <DetailMoment time="7:18 PM" first="story time" second="sleepy grin" />
        </Animated.View>
      </View>
    </View>
  );
}

function GrowthArt({ compact, progress }) {
  const recordShift = progress.interpolate({
    inputRange: [0, 0.3, 0.36, 0.64, 0.7, 1],
    outputRange: [0, 0, -112, -112, -224, -224],
  });

  return (
    <View style={[styles.artScene, compact && styles.artSceneCompact]}>
      <View style={[styles.artGlow, styles.growthGlow]} />
      <View style={styles.leafBadge}>
        <Ionicons name="leaf" size={32} color={colors.sage} />
      </View>
      <View style={styles.growthCard}>
        <View style={styles.ruler}>
          {[0, 1, 2, 3, 4].map((tick) => (
            <View
              key={tick}
              style={[
                styles.rulerTick,
                tick % 2 === 0 ? styles.rulerTickLong : null,
              ]}
            />
          ))}
        </View>
        <View style={styles.growthCopy}>
          <View style={styles.growthWindow}>
            <Animated.View style={{ transform: [{ translateY: recordShift }] }}>
              <GrowthRecord eyebrow="Week by week" title="First smiles" chip="sleepy grin" />
              <GrowthRecord eyebrow="Month by month" title="New routines" chip="first steps" />
              <GrowthRecord eyebrow="Year by year" title="Little rituals" chip="favorite songs" />
            </Animated.View>
          </View>
        </View>
      </View>
    </View>
  );
}

function PrivateArt({ compact, progress }) {
  const openOpacity = progress.interpolate({
    inputRange: [0, 0.34, 0.48, 1],
    outputRange: [1, 1, 0, 0],
  });
  const closedOpacity = progress.interpolate({
    inputRange: [0, 0.36, 0.5, 1],
    outputRange: [0, 0, 1, 1],
  });
  const lockDrop = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [-5, 0, 0],
  });

  return (
    <View style={[styles.artScene, compact && styles.artSceneCompact]}>
      <View style={[styles.artGlow, styles.privateGlow]} />
      <View style={styles.privateCard}>
        <View style={styles.lockBadge}>
          <Animated.View style={[styles.lockLayer, { opacity: openOpacity }]}>
            <Ionicons name="lock-open" size={28} color={colors.ink} />
          </Animated.View>
          <Animated.View style={[styles.lockLayer, { opacity: closedOpacity, transform: [{ translateY: lockDrop }] }]}>
            <Ionicons name="lock-closed" size={28} color={colors.ink} />
          </Animated.View>
        </View>
        <StreamIn progress={progress} index={1} style={styles.familyRow}>
          <View style={[styles.avatar, styles.avatarOne]} />
          <View style={[styles.avatar, styles.avatarTwo]} />
        </StreamIn>
        <StreamIn progress={progress} index={2}>
          <BodyTight align="center" style={styles.privateTitle}>Only your family</BodyTight>
          <Caption align="center" style={styles.privateCaption}>no public feed</Caption>
        </StreamIn>
        <StreamIn progress={progress} index={3} style={styles.privateChip}>
          <ArtChip icon="people" label="shared with care" />
        </StreamIn>
      </View>
    </View>
  );
}

function StreamIn({ progress, index, children, style }) {
  const start = 0.08 + index * 0.08;
  const opacity = progress.interpolate({
    inputRange: [0, start, start + 0.1, 1],
    outputRange: [0, 0, 1, 1],
  });
  const translateY = progress.interpolate({
    inputRange: [0, start, start + 0.1, 1],
    outputRange: [8, 8, 0, 0],
  });

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

function DetailMoment({ time, first, second }) {
  return (
    <View style={styles.detailMoment}>
      <View style={styles.noteTop}>
        <Ionicons name="camera" size={22} color={colors.rose} />
        <BodyTight style={styles.noteTitle}>{time}</BodyTight>
      </View>
      <View style={styles.noteChipRow}>
        <ArtChip icon="sparkles" label={first} />
        <ArtChip icon="heart" label={second} />
      </View>
    </View>
  );
}

function GrowthRecord({ eyebrow, title, chip }) {
  return (
    <View style={styles.growthRecord}>
      <Eyebrow style={styles.bookEyebrow}>{eyebrow}</Eyebrow>
      <BodyTight style={styles.bookTitle}>{title}</BodyTight>
      <View style={styles.noteChipRow}>
        <ArtChip icon="leaf" label={chip} />
      </View>
    </View>
  );
}

function BabyBookStage({ eyebrow, title }) {
  return (
    <View style={styles.bookJourneyStage}>
      <Eyebrow style={styles.bookEyebrow}>{eyebrow}</Eyebrow>
      <BodyTight style={styles.bookTitle}>{title}</BodyTight>
    </View>
  );
}

function MemoryRow({ icon, label }) {
  return (
    <View style={styles.memoryRow}>
      <View style={styles.memoryIcon}>
        <Ionicons name={icon} size={12} color={colors.rose} />
      </View>
      <Caption style={styles.memoryText}>{label}</Caption>
    </View>
  );
}

function ArtChip({ icon, label }) {
  return (
    <View style={styles.artChip}>
      <Ionicons name={icon} size={12} color={colors.coral} />
      <Caption style={styles.artChipText}>{label}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: space.lg,
    paddingBottom: space.xl,
    alignItems: 'center',
  },
  brandWrap: {
    alignItems: 'center',
    paddingTop: space.md,
  },
  carouselBlock: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
  },
  carousel: {
    flex: 1,
    width: '100%',
  },
  carouselContent: {
    alignItems: 'stretch',
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
    paddingTop: space.xs,
    paddingBottom: space.lg,
  },
  slideCompact: {
    paddingTop: space.xs,
    paddingBottom: space.lg,
  },
  artScene: {
    width: 270,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artSceneCompact: {
    width: 248,
    height: 178,
  },
  bookGlow: {
    position: 'absolute',
    width: 240,
    height: 172,
    borderRadius: 90,
    backgroundColor: colors.coralSoft,
    opacity: 0.28,
    transform: [{ rotate: '-8deg' }],
  },
  artGlow: {
    position: 'absolute',
    width: 238,
    height: 172,
    borderRadius: 90,
    opacity: 0.28,
  },
  detailsGlow: {
    backgroundColor: colors.roseSoft,
    transform: [{ rotate: '8deg' }],
  },
  growthGlow: {
    backgroundColor: colors.goldSoft,
    transform: [{ rotate: '-7deg' }],
  },
  privateGlow: {
    backgroundColor: colors.coralSoft,
    transform: [{ rotate: '4deg' }],
  },
  backPage: {
    position: 'absolute',
    width: 188,
    height: 152,
    borderRadius: radius.xl,
    backgroundColor: '#FBE4D8',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.58)',
    transform: [{ rotate: '-8deg' }, { translateX: -15 }, { translateY: 8 }],
    ...shadow.whisper,
  },
  bookCard: {
    width: 224,
    minHeight: 166,
    borderRadius: radius.xl,
    paddingVertical: space.lg,
    paddingLeft: space.xxl,
    paddingRight: space.lg,
    backgroundColor: 'rgba(255, 250, 246, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.76)',
    ...shadow.soft,
  },
  bookSpine: {
    position: 'absolute',
    left: 18,
    top: 18,
    bottom: 18,
    width: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.coralSoft,
  },
  bookHeader: {
    alignItems: 'flex-start',
  },
  bookHeaderCopy: {
    maxWidth: 154,
  },
  bookJourneyWindow: {
    height: 58,
    overflow: 'hidden',
  },
  bookJourneyStage: {
    height: 58,
    justifyContent: 'center',
  },
  bookEyebrow: {
    color: colors.coral,
    letterSpacing: 1.1,
  },
  bookTitle: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 20,
  },
  memoryRows: {
    rowGap: space.sm,
    marginTop: space.md,
  },
  memoryRowsTight: {
    marginTop: space.sm,
  },
  memoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: space.sm,
  },
  memoryIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF2EB',
  },
  memoryText: {
    color: colors.plum,
    fontWeight: '600',
  },
  bookChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.lg,
  },
  noteChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.md,
  },
  artChip: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: space.xs,
    paddingVertical: 5,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: '#FFF2EB',
  },
  artChipText: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.plum,
    fontWeight: '600',
  },
  photoCard: {
    position: 'absolute',
    left: 24,
    top: 32,
    width: 126,
    height: 138,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#FFF9F3',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    transform: [{ rotate: '-8deg' }],
    ...shadow.whisper,
  },
  photoSky: {
    height: 78,
    backgroundColor: '#F7D2C7',
  },
  photoHill: {
    position: 'absolute',
    left: -14,
    right: -8,
    bottom: -18,
    height: 70,
    borderTopLeftRadius: 90,
    borderTopRightRadius: 90,
    backgroundColor: colors.goldSoft,
  },
  photoSun: {
    position: 'absolute',
    right: 18,
    top: 18,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.gold,
    opacity: 0.78,
  },
  noteCard: {
    position: 'absolute',
    right: 16,
    top: 48,
    width: 168,
    height: 138,
    borderRadius: radius.xl,
    padding: space.lg,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 250, 246, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    ...shadow.soft,
  },
  detailsTicker: {
    height: 312,
  },
  detailMoment: {
    height: 104,
  },
  noteTop: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: space.sm,
  },
  noteTitle: {
    color: colors.ink,
    fontWeight: '700',
  },
  growthCard: {
    width: 204,
    minHeight: 164,
    borderRadius: radius.xl,
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 250, 246, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    ...shadow.soft,
  },
  ruler: {
    width: 36,
    paddingVertical: space.lg,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    backgroundColor: '#FBE4D8',
  },
  rulerTick: {
    width: 12,
    height: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.coral,
    marginRight: space.sm,
  },
  rulerTickLong: {
    width: 20,
  },
  growthCopy: {
    flex: 1,
    padding: space.lg,
    justifyContent: 'center',
  },
  growthWindow: {
    height: 112,
    overflow: 'hidden',
  },
  growthRecord: {
    height: 112,
    justifyContent: 'center',
  },
  leafBadge: {
    position: 'absolute',
    right: 34,
    top: 18,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2E8D0',
    transform: [{ rotate: '9deg' }],
    ...shadow.whisper,
  },
  privateCard: {
    width: 188,
    minHeight: 176,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    backgroundColor: 'rgba(255, 250, 246, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    ...shadow.soft,
  },
  lockBadge: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.goldSoft,
    marginBottom: space.md,
  },
  lockLayer: {
    position: 'absolute',
  },
  familyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FFF9F3',
  },
  avatarOne: {
    backgroundColor: colors.rose,
    marginRight: -6,
  },
  avatarTwo: {
    backgroundColor: colors.coral,
  },
  privateTitle: {
    color: colors.ink,
    fontWeight: '700',
  },
  privateCaption: {
    color: colors.plum,
    marginTop: space.xxs,
  },
  privateChip: {
    marginTop: space.md,
  },
  slideEyebrow: {
    color: colors.coral,
  },
  headline: {
    color: colors.ink,
    fontSize: 34,
    lineHeight: 39,
  },
  headlineCompact: {
    fontSize: 31,
    lineHeight: 36,
  },
  body: {
    color: colors.plum,
    maxWidth: 335,
    fontSize: 15,
    lineHeight: 21,
  },
  bodyCompact: {
    maxWidth: 330,
    fontSize: 14,
    lineHeight: 20,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: space.sm,
    marginBottom: space.xl,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(92, 66, 80, 0.22)',
  },
  dotActive: {
    width: 24,
    backgroundColor: colors.coral,
  },
});
