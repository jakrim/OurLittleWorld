import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { Screen, Button, Brand, Display, Body, Caption, Eyebrow, Spacer, colors, glass, space, radius } from './ui';
import { useFamily } from './FamilyContext';
import { useAuth } from './AuthContext';
import { Family } from './families';
import { listSharedTagged } from './photoSync';
import { buildMonthlyHeroes, firstLookStorageKey, pickRevealHeroes } from './reveal';

const PHOTO_INTERVAL_MS = 2400;

export default function FirstLookRevealScreen() {
  const router = useRouter();
  const { family } = useFamily();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState([]);
  const [momentCount, setMomentCount] = useState(0);
  const [creatorName, setCreatorName] = useState('Jesse');
  const [stage, setStage] = useState('intro');
  const [index, setIndex] = useState(0);

  const fade = useRef(new Animated.Value(1)).current;
  const copyOpacity = useRef(new Animated.Value(0)).current;
  const ctaOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!family?.id) return;
      setLoading(true);
      try {
        const [shared, members] = await Promise.all([
          listSharedTagged(family.id, { limit: 2000, variant: 'all' }),
          Family.members(family.id).catch(() => []),
        ]);
        if (!alive) return;
        const months = buildMonthlyHeroes(shared, family.babyBirthday);
        const revealPhotos = pickRevealHeroes(months).map((month) => ({
          key: month.key,
          label: month.monthLabel,
          age: month.ageLabel,
          uri: month.hero?.fullUrl || month.hero?.thumbUrl,
        })).filter((photo) => photo.uri);
        const creator = members.find((member) => member.userId === family.createdBy);
        setCreatorName(creator?.displayName || 'Jesse');
        setMomentCount(shared.length);
        setPhotos(revealPhotos);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [family?.id, family?.babyBirthday, family?.createdBy]);

  useEffect(() => {
    Animated.timing(copyOpacity, {
      toValue: 1,
      duration: 900,
      delay: 350,
      useNativeDriver: true,
    }).start();
  }, [copyOpacity]);

  useEffect(() => {
    if (loading) return undefined;

    const timers = [
      setTimeout(() => setStage('photos'), 3200),
      setTimeout(() => setStage('finale'), photos.length ? 3200 + Math.min(photos.length, 10) * PHOTO_INTERVAL_MS : 5800),
      setTimeout(() => {
        Animated.timing(ctaOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }).start();
      }, photos.length ? 5200 + Math.min(photos.length, 10) * PHOTO_INTERVAL_MS : 7000),
    ];

    return () => timers.forEach(clearTimeout);
  }, [ctaOpacity, loading, photos.length]);

  useEffect(() => {
    if (loading || photos.length <= 1) return undefined;

    const interval = setInterval(() => {
      Animated.timing(fade, {
        toValue: 0,
        duration: 360,
        useNativeDriver: true,
      }).start(() => {
        setIndex((current) => (current + 1) % photos.length);
        Animated.timing(fade, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }).start();
      });
    }, PHOTO_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fade, loading, photos.length]);

  const activePhoto = photos[index];
  const headline = useMemo(() => {
    const name = family?.babyName || 'your little one';
    if (!momentCount && stage === 'finale') {
      return 'The first moments are almost ready.';
    }
    if (stage === 'finale') {
      return `${momentCount.toLocaleString()} moments.`;
    }
    if (stage === 'photos' && activePhoto) {
      return activePhoto.age ? `${name} at ${activePhoto.age}` : activePhoto.label;
    }
    return `${name}'s first months, in one place.`;
  }, [activePhoto, family?.babyName, momentCount, stage]);

  const subcopy = useMemo(() => {
    if (!momentCount && stage === 'finale') return `${creatorName} is gathering this little world for you.`;
    if (stage === 'finale') return `Saved by ${creatorName}, for the two of you.`;
    if (stage === 'photos' && activePhoto) return activePhoto.label;
    return 'A tiny world of ordinary days, sleepy smiles, and the moments that nearly slipped by.';
  }, [activePhoto, creatorName, momentCount, stage]);

  const onFinish = async () => {
    if (family?.id && user?.id) {
      await AsyncStorage.setItem(firstLookStorageKey({ familyId: family.id, userId: user.id }), '1');
    }
    router.replace('/timeline');
  };

  return (
    <Screen variant="dark" bare>
      <View style={styles.root}>
        {activePhoto ? (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
            <Image source={{ uri: activePhoto.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
          </Animated.View>
        ) : null}
        <View style={styles.scrim} />

        <View style={styles.top}>
          <Brand style={styles.brand}>our little world</Brand>
          <Pressable onPress={onFinish} hitSlop={12} style={styles.skip}>
            <Caption style={styles.skipText}>Skip</Caption>
          </Pressable>
        </View>

        <View style={styles.center}>
          {loading ? (
            <>
              <ActivityIndicator color={colors.onPrimary} />
              <Spacer h={space.md} />
              <Caption style={styles.whiteMuted}>Gathering the first moments…</Caption>
            </>
          ) : (
            <Animated.View style={{ opacity: copyOpacity }}>
              <Eyebrow align="center" style={styles.eyebrow}>
                A Mother's Day gift
              </Eyebrow>
              <Spacer h={space.md} />
              <Display align="center" style={styles.headline}>
                {headline}
              </Display>
              <Spacer h={space.lg} />
              <Body align="center" style={styles.body}>
                {subcopy}
              </Body>
            </Animated.View>
          )}
        </View>

        <Animated.View style={[styles.bottom, { opacity: ctaOpacity }]}>
          <View style={styles.photoDots}>
            {photos.slice(0, 10).map((photo, i) => (
              <View key={photo.key} style={[styles.dot, i === index % Math.min(photos.length, 10) && styles.dotActive]} />
            ))}
          </View>
          <Button onPress={onFinish}>Open the timeline</Button>
          <Spacer h={space.md} />
          <View style={styles.lockup}>
            <Ionicons name="lock-closed" size={13} color={glass.inverseTextSoft} />
            <Caption style={styles.whiteMuted}>Private to your family</Caption>
          </View>
        </Animated.View>
      </View>
    </Screen>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: glass.photoBackdrop,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: glass.firstLookScrim,
  },
  top: {
    position: 'absolute',
    top: 64,
    left: space.xl,
    right: space.xl,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    color: colors.onPrimary,
    fontSize: 25,
  },
  skip: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: glass.inverseChip,
  },
  skipText: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  eyebrow: {
    color: glass.inverseTextSoft,
  },
  headline: {
    color: colors.onPrimary,
    fontSize: width < 380 ? 40 : 46,
    lineHeight: width < 380 ? 46 : 52,
  },
  body: {
    color: glass.inverseTextBody,
    maxWidth: 330,
    alignSelf: 'center',
  },
  bottom: {
    position: 'absolute',
    left: space.xl,
    right: space.xl,
    bottom: 42,
    zIndex: 2,
  },
  photoDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: space.lg,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: glass.inverseDot,
  },
  dotActive: {
    backgroundColor: colors.coral,
  },
  lockup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  whiteMuted: {
    color: glass.inverseTextSoft,
  },
});
