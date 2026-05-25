import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ScrollView,
  Pressable,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import {
  Screen,
  Card,
  Button,
  Brand,
  BrandMark,
  Hero,
  Title,
  Body,
  Caption,
  Eyebrow,
  Spacer,
  useTheme,
  palettes,
  PALETTE_NAMES,
  semantic,
  colors,
  space,
  radius,
  shadow,
} from './ui';
import { listSharedTagged, deleteForTag } from './photoSync';
import PhotoActionSheet from './PhotoActionSheet';
import { Tags, Memories } from './storage';
import { useFamily } from './FamilyContext';
import { useAuth } from './AuthContext';
import { ageAt, fetchPhotosPage, formatAge, ensureLibraryPermission } from './photos';
import { referenceStorageKey } from './ReferencePhotoScreen';
import {
  findTodayInLife,
  buildMonthiversaries,
  pickPhotoForMode,
} from './reveal';
import { shareMemoryMoment } from './shareMoment';
import * as Scan from './scanController';
import { Family } from './families';
import {
  buildPlaceClusters,
  formatLocationLabel,
  inferPhotoSceneLabels,
} from './visionSceneLabeler';
import { ensureMetadataFor, loadCache } from './photoMetadata';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;

/**
 * Three views in one screen, controlled by the segment.
 *
 *   "Timeline" — shared moments, monthiversaries, "for you" rail, month
 *                groups with hero + grid.
 *   "Places"   — geotagged moments, clustered, with scene chips.
 *   "Browse"   — this device's photo library for manual tagging.
 */
export default function TimelineScreen() {
  const router = useRouter();
  const { family } = useFamily();
  const { user } = useAuth();

  const [tab, setTab] = useState('timeline');
  const [menuOpen, setMenuOpen] = useState(false);

  // Shared timeline (cloud)
  const [shared, setShared] = useState([]);
  const [sharedLoading, setSharedLoading] = useState(false);

  // Local browse
  const [photos, setPhotos] = useState([]);
  const [endCursor, setEndCursor] = useState(undefined);
  const [hasNext, setHasNext] = useState(true);
  const [browsing, setBrowsing] = useState(false);
  const [tags, setTags] = useState({});

  // Side caches
  const [referenceUri, setReferenceUri] = useState(null);
  const [memberNames, setMemberNames] = useState({});
  const [metadataByKey, setMetadataByKey] = useState({});
  const [memoriesByKey, setMemoriesByKey] = useState({});

  // Places UI state
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);
  const [activePlaceScene, setActivePlaceScene] = useState('all');

  // Long-press action sheet
  const [actionPhoto, setActionPhoto] = useState(null);
  const [removingPhoto, setRemovingPhoto] = useState(false);

  // ─── Loaders ───────────────────────────────────────────────────────────────

  const loadShared = useCallback(async () => {
    if (!family) return;
    setSharedLoading(true);
    try {
      const list = await listSharedTagged(family.id, { limit: 500 });
      // Defensive dedupe by (owner:asset).
      const seen = new Set();
      const deduped = [];
      for (const p of list) {
        const k = `${p.asset_owner_user_id}:${p.asset_id}`;
        if (seen.has(k)) continue;
        seen.add(k);
        deduped.push(p);
      }
      setShared(deduped);
    } finally {
      setSharedLoading(false);
    }
  }, [family]);

  const loadLocalInitial = useCallback(async () => {
    if (!family) return;
    const perm = await ensureLibraryPermission();
    if (!perm.granted) return;
    setBrowsing(true);
    try {
      const initial = await fetchPhotosPage({});
      setPhotos(initial.assets);
      setEndCursor(initial.endCursor);
      setHasNext(initial.hasNextPage);
      setTags(await Tags.all(family.id));
    } finally {
      setBrowsing(false);
    }
  }, [family]);

  // Boot the metadata cache from disk as soon as we know the family.
  useEffect(() => {
    if (!family?.id) return;
    let alive = true;
    loadCache(family.id).then((snap) => {
      if (alive) setMetadataByKey(snap);
    });
    return () => {
      alive = false;
    };
  }, [family?.id]);

  useFocusEffect(
    useCallback(() => {
      loadShared();
      if (family) Tags.all(family.id).then(setTags).catch(() => {});
      if (family) {
        Family.members(family.id)
          .then((rows) =>
            setMemberNames(
              Object.fromEntries(
                rows.map((row) => [row.userId, row.displayName || 'Family']),
              ),
            ),
          )
          .catch(() => {});
      }
      if (family && user) {
        AsyncStorage.getItem(referenceStorageKey({ familyId: family.id, userId: user.id }))
          .then((raw) => {
            try {
              const parsed = raw ? JSON.parse(raw) : null;
              if (parsed?.uri) setReferenceUri(parsed.uri);
            } catch {}
          })
          .catch(() => {});
      }
    }, [loadShared, family, user]),
  );

  useEffect(() => {
    if (tab === 'browse' && photos.length === 0) loadLocalInitial();
  }, [tab, photos.length, loadLocalInitial]);

  // Load family-wide memories whenever shared list refreshes.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!family?.id) return;
      const familyMemories = await Memories.forFamily(family.id).catch(() => []);
      if (!alive) return;
      const byPhoto = {};
      for (const memory of familyMemories || []) {
        const key = `${memory.asset_owner_user_id}:${memory.asset_id}`;
        if (!byPhoto[key]) byPhoto[key] = [];
        byPhoto[key].push(memory);
      }
      setMemoriesByKey(byPhoto);
    })();
    return () => {
      alive = false;
    };
  }, [family?.id, shared.length]);

  // Backfill local photo metadata in the background.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!family?.id || !user?.id || !shared.length) return;
      const snap = await ensureMetadataFor({
        familyId: family.id,
        photos: shared,
        ownerUserId: user.id,
      });
      if (alive) setMetadataByKey(snap);
    })();
    return () => {
      alive = false;
    };
  }, [family?.id, user?.id, shared]);

  // ─── Derived ───────────────────────────────────────────────────────────────

  const sections = useMemo(
    () => groupByMonth(shared, family?.babyBirthday),
    [shared, family?.babyBirthday],
  );

  const todayMoments = useMemo(
    () => findTodayInLife(shared, family?.babyBirthday),
    [shared, family?.babyBirthday],
  );

  const monthiversaries = useMemo(
    () => buildMonthiversaries(shared, family?.babyBirthday).filter((m) => m.hero),
    [shared, family?.babyBirthday],
  );

  const places = useMemo(
    () => buildPlaceClusters({ shared, metadataByKey, memoriesByKey }),
    [shared, metadataByKey, memoriesByKey],
  );

  // Auto-select first place when places list changes.
  useEffect(() => {
    if (!places.length) {
      setSelectedPlaceId(null);
      return;
    }
    if (!selectedPlaceId || !places.some((p) => p.id === selectedPlaceId)) {
      setSelectedPlaceId(places[0].id);
      setActivePlaceScene('all');
    }
  }, [places, selectedPlaceId]);

  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) || null,
    [places, selectedPlaceId],
  );

  const placePhotos = useMemo(() => {
    if (!selectedPlace) return [];
    return (selectedPlace.photos || []).filter((photo) => {
      if (activePlaceScene === 'all') return true;
      const key = `${photo.asset_owner_user_id}:${photo.asset_id}`;
      const labels = inferPhotoSceneLabels({
        creationTime: photo.creation_time,
        memoryNotes: (memoriesByKey[key] || []).map((m) => m.note),
      });
      if (selectedPlace.topScenes[0] === 'At home') labels.push('At home');
      return labels.includes(activePlaceScene);
    });
  }, [activePlaceScene, memoriesByKey, selectedPlace]);

  // Pre-pick a representative photo per "for you" mode so the card auto-fills.
  const forYou = useMemo(() => {
    const opts = { babyBirthday: family?.babyBirthday, metadataByKey, memoriesByKey };
    return [
      { mode: 'today', label: 'On this day', icon: 'time-outline', photo: pickPhotoForMode('today', shared, opts) },
      { mode: 'monthiversary', label: monthiversaries.length ? `${monthiversaries[monthiversaries.length - 1].monthIndex} months` : 'Monthiversary', icon: 'calendar-outline', photo: pickPhotoForMode('monthiversary', shared, opts) },
      { mode: 'place', label: 'Random place', icon: 'location-outline', photo: pickPhotoForMode('place', shared, opts) },
      { mode: 'random', label: 'Surprise me', icon: 'shuffle-outline', photo: pickPhotoForMode('random', shared, opts) },
    ];
  }, [family?.babyBirthday, memoriesByKey, metadataByKey, monthiversaries, shared]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  const onShareMoment = useCallback(async (photo) => {
    const sourceUri = photo?.fullUrl || photo?.thumbUrl;
    if (!sourceUri) return;
    const photoKey = `${photo.asset_owner_user_id}:${photo.asset_id}`;
    const age = family?.babyBirthday && photo?.creation_time
      ? ageAt(family.babyBirthday, new Date(photo.creation_time).getTime())
      : null;
    const dateLabel = photo?.creation_time
      ? new Date(photo.creation_time).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : '';
    try {
      const memories = memoriesByKey[photoKey] || [];
      const leadMemory = [...memories].sort(
        (a, b) => +new Date(b.updated_at || b.created_at) - +new Date(a.updated_at || a.created_at),
      )[0];
      const placeLabel = formatLocationLabel(metadataByKey[photoKey]?.location || photo.location);
      await shareMemoryMoment({
        sourceUri,
        babyName: family?.babyName || 'Our little one',
        ageLabel: age ? formatAge(age) : '',
        dateLabel,
        memoryNote: leadMemory?.note || '',
        memoryAuthor: leadMemory?.author_user_id ? (memberNames[leadMemory.author_user_id] || 'Family') : '',
        placeLabel: placeLabel === 'Unknown place' ? '' : placeLabel,
      });
    } catch (err) {
      Alert.alert('Could not share', err?.message || String(err));
    }
  }, [family?.babyBirthday, family?.babyName, memberNames, memoriesByKey, metadataByKey]);

  const onOpenPhoto = useCallback((photo) => {
    if (!photo) return;
    if (photo.asset_owner_user_id === user?.id) {
      const params = { assetId: photo.asset_id };
      const previewUri = photo.thumbUrl || photo.fullUrl;
      if (previewUri) params.uri = previewUri;
      if (photo.creation_time) {
        params.creationTime = String(new Date(photo.creation_time).getTime());
      }
      router.push({ pathname: '/photo/[assetId]', params });
    }
  }, [router, user?.id]);

  const onLongPressPhoto = useCallback((photo) => {
    if (!photo) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionPhoto(photo);
  }, []);

  const onForYouTap = useCallback((entry) => {
    if (entry?.photo) onOpenPhoto(entry.photo);
  }, [onOpenPhoto]);

  const onForYouLongPress = useCallback((entry) => {
    if (entry?.photo) onLongPressPhoto(entry.photo);
  }, [onLongPressPhoto]);

  const onRemovePhoto = useCallback((photo) => {
    if (!family?.id || !photo) return;
    if (photo.asset_owner_user_id !== user?.id) {
      Alert.alert('Cannot remove', 'Only the person who saved this photo can remove it.');
      return;
    }
    Alert.alert(
      'Remove from timeline?',
      `This removes the photo from ${family?.babyName || 'your baby'}'s shared world. The original stays in your Photos library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setActionPhoto(null);
            setRemovingPhoto(true);
            try {
              await deleteForTag({
                familyId: family.id,
                assetOwnerUserId: photo.asset_owner_user_id,
                assetId: photo.asset_id,
              });
              // Optimistic local removal so the user sees instant feedback.
              setShared((prev) => prev.filter(
                (p) => !(p.asset_id === photo.asset_id && p.asset_owner_user_id === photo.asset_owner_user_id),
              ));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              loadShared();
            } catch (err) {
              Alert.alert('Could not remove', err?.message || String(err));
            } finally {
              setRemovingPhoto(false);
            }
          },
        },
      ],
    );
  }, [family?.id, family?.babyName, loadShared, user?.id]);

  const photoSheetActions = useMemo(() => {
    if (!actionPhoto) return [];
    const isMine = actionPhoto.asset_owner_user_id === user?.id;
    const out = [
      {
        icon: 'share-social-outline',
        label: 'Share moment',
        onPress: () => {
          setActionPhoto(null);
          onShareMoment(actionPhoto);
        },
      },
    ];
    if (isMine) {
      out.push({
        icon: 'image-outline',
        label: 'Open photo',
        onPress: () => {
          const photo = actionPhoto;
          setActionPhoto(null);
          onOpenPhoto(photo);
        },
      });
      out.push({
        icon: 'trash-outline',
        label: removingPhoto ? 'Removing…' : 'Remove from timeline',
        destructive: true,
        disabled: removingPhoto,
        onPress: () => onRemovePhoto(actionPhoto),
      });
    }
    return out;
  }, [actionPhoto, onOpenPhoto, onRemovePhoto, onShareMoment, removingPhoto, user?.id]);

  const photoSheetSubtitle = useMemo(() => {
    if (!actionPhoto) return null;
    const ageObj = family?.babyBirthday && actionPhoto.creation_time
      ? ageAt(family.babyBirthday, new Date(actionPhoto.creation_time).getTime())
      : null;
    const dateLabel = actionPhoto.creation_time
      ? new Date(actionPhoto.creation_time).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
      : '';
    if (ageObj && dateLabel) return `${formatAge(ageObj)} · ${dateLabel}`;
    return dateLabel || (ageObj ? formatAge(ageObj) : '');
  }, [actionPhoto, family?.babyBirthday]);

  const onMenuAction = (action) => {
    setMenuOpen(false);
    switch (action) {
      case 'invite': router.push('/invite'); break;
      case 'settings': router.push('/setup'); break;
      case 'reference': router.push('/reference'); break;
      default: break;
    }
  };

  const empty = !sharedLoading && tab === 'timeline' && shared.length === 0;
  const babyName = family?.babyName || 'them';

  // Debounced timeline reload as auto-saves stream in. We don't refetch on
  // every single saved photo (that would cost N round-trips); instead we
  // reload at most every 4 seconds while saves are landing.
  const reloadTimer = useRef(null);
  const onAutoSavedTick = useCallback(() => {
    if (reloadTimer.current) return;
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      loadShared();
    }, 4000);
  }, [loadShared]);
  useEffect(() => () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Screen bare>
      <Header
        familyName={family?.babyName}
        referenceUri={referenceUri}
        onMenu={() => setMenuOpen(true)}
        onScan={() => router.push('/reference')}
      />

      <ScanBanner
        onPress={() => router.push('/review')}
        onAutoSavedTick={onAutoSavedTick}
      />

      <Segment value={tab} onChange={setTab} />

      {tab === 'timeline' ? (
        empty ? (
          <EmptyTimeline
            babyName={babyName}
            onScan={() => router.push('/reference')}
            onBrowse={() => setTab('browse')}
          />
        ) : (
          <FlatList
            key="timeline"
            data={sections}
            keyExtractor={(s) => s.key}
            renderItem={({ item: section }) => (
              <MonthSection
                section={section}
                onPress={onOpenPhoto}
                onLongPress={onLongPressPhoto}
                youUserId={user?.id}
              />
            )}
            ItemSeparatorComponent={MonthSectionSeparator}
            ListHeaderComponent={(
              <TimelineHeader
                forYou={forYou}
                onForYouTap={onForYouTap}
                onForYouLongPress={onForYouLongPress}
                monthiversaries={monthiversaries}
                onMonthiversaryTap={onOpenPhoto}
                onMonthiversaryLongPress={onLongPressPhoto}
                today={todayMoments}
                babyName={babyName}
                babyBirthday={family?.babyBirthday}
              />
            )}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={sharedLoading}
                onRefresh={loadShared}
                tintColor={colors.coral}
              />
            }
          />
        )
      ) : tab === 'places' ? (
        <PlacesMapPanel
          places={places}
          selectedPlaceId={selectedPlaceId}
          onSelectPlace={setSelectedPlaceId}
          selectedPlace={selectedPlace}
          activeScene={activePlaceScene}
          onSceneChange={setActivePlaceScene}
          photos={placePhotos}
          onOpenPhoto={onOpenPhoto}
          onLongPressPhoto={onLongPressPhoto}
          babyName={family?.babyName || 'Reuben'}
        />
      ) : (
        <FlatList
          key="browse"
          data={photos}
          numColumns={3}
          keyExtractor={(p) => p.id}
          columnWrapperStyle={styles.browseRow}
          ItemSeparatorComponent={BrowseSeparator}
          contentContainerStyle={styles.browseContent}
          onEndReachedThreshold={0.6}
          onEndReached={async () => {
            if (browsing || !hasNext) return;
            setBrowsing(true);
            try {
              const next = await fetchPhotosPage({ after: endCursor });
              setPhotos((p) => [...p, ...next.assets]);
              setEndCursor(next.endCursor);
              setHasNext(next.hasNextPage);
            } finally {
              setBrowsing(false);
            }
          }}
          renderItem={({ item }) => {
            const ageObj = family?.babyBirthday
              ? ageAt(family.babyBirthday, item.creationTime)
              : null;
            const tagged = !!(user?.id && tags[Tags.key(item.id, user.id)]);
            return (
              <BrowseTile
                uri={item.uri}
                age={ageObj ? formatAge(ageObj) : null}
                tagged={tagged}
                onPress={() => {
                  const params = { assetId: item.id, uri: item.uri };
                  if (item.creationTime != null) {
                    params.creationTime = String(item.creationTime);
                  }
                  router.push({ pathname: '/photo/[assetId]', params });
                }}
              />
            );
          }}
          ListEmptyComponent={
            <View style={styles.browseEmpty}>
              {browsing ? <ActivityIndicator color={colors.coral} /> : <Caption>No photos found.</Caption>}
            </View>
          }
          ListFooterComponent={
            browsing && photos.length > 0
              ? <ActivityIndicator color={colors.coral} style={{ margin: space.xl }} />
              : null
          }
        />
      )}

      <HamburgerMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onAction={onMenuAction}
        babyName={family?.babyName}
      />

      <PhotoActionSheet
        photo={actionPhoto}
        visible={!!actionPhoto}
        onClose={() => setActionPhoto(null)}
        actions={photoSheetActions}
        subtitle={photoSheetSubtitle}
      />
    </Screen>
  );
}

// ─── Header (only Scan + hamburger on home) ──────────────────────────────────

function Header({ familyName, referenceUri, onMenu, onScan }) {
  const worldTitle = familyName ? `${familyName}'s world` : 'Your timeline';
  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        {referenceUri ? (
          <View style={styles.avatar}>
            <Image source={{ uri: referenceUri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
          </View>
        ) : (
          <View style={styles.headerBrandMark}>
            <BrandMark size={66} />
          </View>
        )}
        <View style={styles.titleWrap}>
          <Brand>our little world</Brand>
          <Spacer h={2} />
          <Hero
            style={styles.headerTitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {worldTitle}
          </Hero>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={onScan} style={styles.headerIconBtn}>
            <Ionicons name="sparkles" size={18} color={colors.coral} />
          </Pressable>
          <Spacer w={6} />
          <Pressable onPress={onMenu} style={styles.headerIconBtn}>
            <Ionicons name="menu" size={20} color={colors.plum} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Hamburger menu ──────────────────────────────────────────────────────────

const THEME_MODE_OPTIONS = [
  { value: 'system', label: 'Auto', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

function HamburgerMenu({ visible, onClose, onAction, babyName }) {
  const theme = useTheme();

  const setMode = (mode) => {
    Haptics.selectionAsync();
    theme.setMode(mode);
  };

  const setPalette = (paletteName) => {
    Haptics.selectionAsync();
    theme.setPaletteName(paletteName);
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable
        style={[styles.menuBackdrop, { backgroundColor: theme.colors.scrim }]}
        onPress={onClose}
      >
        <View style={styles.menuSheetWrap}>
          <Pressable
            style={[
              styles.menuSheet,
              {
                backgroundColor: theme.semantic.card,
                borderColor: theme.semantic.border,
              },
            ]}
            onPress={() => {}}
          >
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              <Eyebrow>Menu</Eyebrow>
              <Spacer h={space.md} />

              <View style={[styles.themePanel, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
                <View style={styles.themePanelHeader}>
                  <View>
                    <Eyebrow>Theme</Eyebrow>
                    <Caption style={styles.themeCaption}>
                      {theme.paletteLabel} · {theme.mode === 'system' ? `Auto (${theme.scheme})` : theme.mode}
                    </Caption>
                  </View>
                  <View style={[styles.themePreview, { backgroundColor: theme.colors.bg, borderColor: theme.colors.border }]}>
                    <View style={[styles.themePreviewDot, { backgroundColor: theme.colors.primary }]} />
                    <View style={[styles.themePreviewDot, { backgroundColor: theme.colors.accent }]} />
                  </View>
                </View>

                <View style={styles.themeModeRow}>
                  {THEME_MODE_OPTIONS.map((option) => {
                    const active = theme.mode === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => setMode(option.value)}
                        style={[
                          styles.themeModeButton,
                          {
                            backgroundColor: active ? theme.semantic.primary : theme.semantic.card,
                            borderColor: active ? theme.semantic.primary : theme.semantic.border,
                          },
                        ]}
                      >
                        <Ionicons
                          name={option.icon}
                          size={14}
                          color={active ? theme.colors.onPrimary : theme.semantic.textSoft}
                        />
                        <Caption
                          style={[
                            styles.themeModeText,
                            { color: active ? theme.colors.onPrimary : theme.semantic.textSoft },
                          ]}
                        >
                          {option.label}
                        </Caption>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.paletteQuickRow}>
                  {PALETTE_NAMES.map((name) => {
                    const meta = palettes[name];
                    const slots = meta[theme.scheme];
                    const active = theme.paletteName === name;
                    return (
                      <Pressable
                        key={name}
                        onPress={() => setPalette(name)}
                        accessibilityRole="button"
                        accessibilityLabel={`Use ${meta.label} palette`}
                        style={[
                          styles.paletteQuickButton,
                          {
                            backgroundColor: slots.bg,
                            borderColor: active ? slots.primary : theme.semantic.border,
                            borderWidth: active ? 2 : 1,
                          },
                        ]}
                      >
                        <View style={styles.paletteQuickSwatches}>
                          <View style={[styles.paletteQuickSwatch, { backgroundColor: slots.primary }]} />
                          <View style={[styles.paletteQuickSwatch, { backgroundColor: slots.accent }]} />
                        </View>
                        {active ? (
                          <Ionicons name="checkmark" size={13} color={slots.ink} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Spacer h={space.lg} />
              <Eyebrow>Actions</Eyebrow>
              <Spacer h={space.sm} />
              <MenuItem
                icon="sparkles"
                tint={theme.semantic.primary}
                label="Find more photos"
                onPress={() => onAction('reference')}
              />
              <MenuItem
                icon="person-add-outline"
                label="Invite family"
                onPress={() => onAction('invite')}
              />
              <MenuItem
                icon="settings-outline"
                label="Settings"
                onPress={() => onAction('settings')}
              />
              <Spacer h={space.md} />
              <Button variant="quiet" onPress={onClose}>Close</Button>
            </ScrollView>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function MenuItem({ icon, label, onPress, tint }) {
  const theme = useTheme();
  const iconColor = tint || theme.semantic.textSoft;
  return (
    <Pressable onPress={onPress} style={styles.menuItem}>
      <View style={[styles.menuItemIcon, { backgroundColor: theme.semantic.cardAlt }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Body style={{ flex: 1, color: theme.semantic.text }}>{label}</Body>
      <Ionicons name="chevron-forward" size={16} color={theme.semantic.textMuted} />
    </Pressable>
  );
}

// ─── Timeline header (For You + Monthiversaries + Today) ─────────────────────

function TimelineHeader({
  forYou,
  onForYouTap,
  onForYouLongPress,
  monthiversaries,
  onMonthiversaryTap,
  onMonthiversaryLongPress,
  today,
  babyName,
  babyBirthday,
}) {
  return (
    <View>
      <ForYouRail entries={forYou} onTap={onForYouTap} onLongPress={onForYouLongPress} />
      {monthiversaries.length > 0 ? (
        <MonthiversaryStrip
          milestones={monthiversaries}
          babyName={babyName}
          onTap={onMonthiversaryTap}
          onLongPress={onMonthiversaryLongPress}
        />
      ) : null}
      {today.length > 0 ? (
        <TodayInLifeCard moments={today} babyName={babyName} babyBirthday={babyBirthday} />
      ) : null}
    </View>
  );
}

// ─── For You rail ────────────────────────────────────────────────────────────

function ForYouRail({ entries, onTap, onLongPress }) {
  const populated = entries.filter((entry) => !!entry.photo);
  if (!populated.length) return null;
  return (
    <View style={styles.railWrap}>
      <View style={styles.railHeader}>
        <Eyebrow>For you</Eyebrow>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railRow}
        decelerationRate="fast"
        snapToInterval={144}
        snapToAlignment="start"
      >
        {populated.map((entry) => (
          <ForYouCard
            key={entry.mode}
            entry={entry}
            onPress={() => onTap(entry)}
            onLongPress={() => onLongPress(entry)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function ForYouCard({ entry, onPress, onLongPress }) {
  return (
    <Pressable
      style={styles.forYouCard}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={220}
    >
      <Image
        source={{ uri: entry.photo.thumbUrl || entry.photo.fullUrl }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={140}
        cachePolicy="memory-disk"
      />
      <View style={styles.forYouOverlay} />
      <View style={styles.forYouLabel}>
        <View style={styles.forYouIcon}>
          <Ionicons name={entry.icon} size={12} color="#FFFFFF" />
        </View>
        <Caption style={styles.forYouLabelText}>{entry.label}</Caption>
      </View>
    </Pressable>
  );
}

// ─── Monthiversary strip ─────────────────────────────────────────────────────

function MonthiversaryStrip({ milestones, babyName, onTap, onLongPress }) {
  return (
    <View style={styles.railWrap}>
      <View style={styles.railHeader}>
        <Eyebrow>{babyName}'s monthiversaries</Eyebrow>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.mvRow}
        snapToInterval={86}
        snapToAlignment="start"
      >
        {milestones.map((m) => (
          <Pressable
            key={m.key}
            style={styles.mvCard}
            onPress={() => onTap(m.hero)}
            onLongPress={() => onLongPress(m.hero)}
            delayLongPress={220}
          >
            <Image
              source={{ uri: m.hero.thumbUrl || m.hero.fullUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={140}
              cachePolicy="memory-disk"
            />
            <View style={styles.mvOverlay} />
            <View style={styles.mvBadge}>
              <Caption style={styles.mvBadgeText}>{m.ageLabel}</Caption>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Today in life card ──────────────────────────────────────────────────────

function TodayInLifeCard({ moments, babyName, babyBirthday }) {
  const preview = moments.slice(0, 4);
  const day = moments[0]?.creation_time
    ? new Date(moments[0].creation_time).getDate()
    : new Date().getDate();
  const leadAge = babyBirthday && moments[0]?.creation_time
    ? ageAt(babyBirthday, new Date(moments[0].creation_time).getTime())
    : null;

  return (
    <Card style={styles.todayCard}>
      <View style={styles.todayCopy}>
        <Eyebrow>Today in {babyName}'s life</Eyebrow>
        <Spacer h={4} />
        <Title style={{ fontSize: 23 }}>
          The {ordinal(day)}, across the months.
        </Title>
        <Spacer h={space.xs} />
        <Caption>
          {moments.length} moment{moments.length === 1 ? '' : 's'} from this calendar day
          {leadAge ? ` · newest was ${formatAge(leadAge)}` : ''}
        </Caption>
      </View>
      <View style={styles.todayStrip}>
        {preview.map((photo, index) => (
          <View
            key={`${photo.asset_owner_user_id}:${photo.asset_id}`}
            style={[styles.todayThumb, index === 0 && styles.todayThumbLead]}
          >
            {photo.thumbUrl || photo.fullUrl ? (
              <Image
                source={{ uri: photo.thumbUrl || photo.fullUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={140}
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.tilePlaceholder]} />
            )}
          </View>
        ))}
      </View>
    </Card>
  );
}

function ordinal(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}

// ─── Scan banner (background scan progress) ──────────────────────────────────

function ScanBanner({ onPress, onAutoSavedTick }) {
  const scan = Scan.useScanState();
  const borderline = scan.matches.reduce(
    (n, m) => n + ((!m.saved && (m.score ?? 0) < 0.78) ? 1 : 0),
    0,
  );
  const queued = scan.autoSaveQueueLength || 0;

  // Refresh the parent timeline a couple of times per second worth of
  // saved work so freshly-uploaded photos appear without a manual pull.
  const lastTickRef = useRef(0);
  useEffect(() => {
    if (!onAutoSavedTick) return;
    if (scan.autoSavedCount === lastTickRef.current) return;
    lastTickRef.current = scan.autoSavedCount;
    onAutoSavedTick(scan.autoSavedCount);
  }, [onAutoSavedTick, scan.autoSavedCount]);

  if (scan.phase === 'idle') return null;
  // Hide once everything is processed and there's nothing left to review.
  if ((scan.phase === 'done' || scan.phase === 'aborted') && queued === 0 && borderline === 0) return null;

  const scanning = scan.phase === 'scanning';
  const pct = scan.total ? Math.min(100, Math.round((scan.seen / scan.total) * 100)) : null;

  let title;
  if (scanning) {
    if (queued > 0) {
      title = `Auto-saving ${queued.toLocaleString()}`;
    } else {
      title = `Scanning${pct != null ? ` · ${pct}%` : ''}`;
    }
  } else if (queued > 0) {
    title = `Auto-saving ${queued.toLocaleString()}`;
  } else {
    title = `${borderline.toLocaleString()} borderline waiting`;
  }

  const subtitle = scan.autoSavedCount > 0
    ? `${scan.autoSavedCount.toLocaleString()} saved · tap to review borderline`
    : 'Tap to review';

  return (
    <Pressable onPress={onPress} style={scanBannerStyles.wrap}>
      <View style={scanBannerStyles.dot} />
      <View style={{ flex: 1, marginLeft: space.md }}>
        <Caption style={{ color: colors.plum, fontWeight: '600' }}>{title}</Caption>
        <Caption style={{ color: colors.muted }}>{subtitle}</Caption>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.plum} />
    </Pressable>
  );
}

const scanBannerStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: space.lg,
    marginBottom: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semantic.border,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.coral,
  },
});

// ─── Segment ─────────────────────────────────────────────────────────────────

function Segment({ value, onChange }) {
  return (
    <View style={styles.segment}>
      <SegmentTab label="Timeline" active={value === 'timeline'} onPress={() => onChange('timeline')} />
      <SegmentTab label="Places" active={value === 'places'} onPress={() => onChange('places')} />
      <SegmentTab label="Browse" active={value === 'browse'} onPress={() => onChange('browse')} />
    </View>
  );
}

function SegmentTab({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.segmentTab, active && styles.segmentTabActive]}>
      <Eyebrow style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Eyebrow>
    </Pressable>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyTimeline({ babyName, onScan, onBrowse }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <BrandMark size={92} />
      </View>
      <Spacer h={space.lg} />
      <Hero align="center" style={{ fontSize: 28 }}>No moments yet.</Hero>
      <Spacer h={space.sm} />
      <Body align="center" style={{ paddingHorizontal: space.xl }}>
        Let us find every photo of {babyName} in your library — privately,
        on your device.
      </Body>
      <Spacer h={space.xl} />
      <View style={{ width: '100%', paddingHorizontal: space.xl }}>
        <Button onPress={onScan}>Find every photo</Button>
        <Spacer h={space.sm} />
        <Button variant="quiet" onPress={onBrowse}>Browse my library instead</Button>
      </View>
    </View>
  );
}

// ─── Month section (hardened, edge-to-edge) ──────────────────────────────────

const MINI_PREVIEW_LIMIT = 11;
const MINI_TILE_SIZE = SCREEN_W / 3;

function MonthSectionSeparator() {
  return <View style={{ height: space.xl }} />;
}

const MonthSection = React.memo(function MonthSection({ section, onPress, onLongPress, youUserId }) {
  const [expanded, setExpanded] = useState(false);
  if (!section?.items?.length) return null;
  const [hero, ...rest] = section.items;
  const showAll = expanded || rest.length <= MINI_PREVIEW_LIMIT;
  const visible = showAll ? rest : rest.slice(0, MINI_PREVIEW_LIMIT);
  const hidden = rest.length - visible.length;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Eyebrow>{section.monthLabel}</Eyebrow>
        <Spacer h={4} />
        {section.ageLabel ? <Title>{section.ageLabel}</Title> : null}
        <Caption>
          {section.items.length} moment{section.items.length === 1 ? '' : 's'}
        </Caption>
      </View>

      {hero ? (
        <HeroTile
          photo={hero}
          onPress={() => onPress(hero)}
          onLongPress={() => onLongPress(hero)}
          youUserId={youUserId}
        />
      ) : null}

      {visible.length > 0 ? (
        <View style={styles.miniGrid}>
          {visible.map((p) => (
            <MiniTile
              key={`${p.asset_owner_user_id}:${p.asset_id}`}
              photo={p}
              onPress={() => onPress(p)}
              onLongPress={() => onLongPress(p)}
              youUserId={youUserId}
            />
          ))}
          {hidden > 0 ? (
            <Pressable
              onPress={() => setExpanded(true)}
              style={[styles.miniTile, styles.miniMore]}
            >
              <Ionicons name="add" size={22} color={colors.coral} />
              <Caption style={styles.miniMoreText}>{hidden} more</Caption>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

function HeroTile({ photo, onPress, onLongPress, youUserId }) {
  const isMine = photo.asset_owner_user_id === youUserId;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={220} style={styles.hero}>
      {photo.thumbUrl || photo.fullUrl ? (
        <Image
          source={{ uri: photo.thumbUrl || photo.fullUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.tilePlaceholder]} />
      )}
      {!isMine ? (
        <View style={styles.heroBadgeRow}>
          <View style={styles.partnerBadge}>
            <Caption style={{ color: '#FFFFFF', fontWeight: '700' }}>FROM YOUR PARTNER</Caption>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

function MiniTile({ photo, onPress, onLongPress, youUserId }) {
  const isMine = photo.asset_owner_user_id === youUserId;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={220} style={styles.miniTile}>
      {photo.thumbUrl || photo.fullUrl ? (
        <Image
          source={{ uri: photo.thumbUrl || photo.fullUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.tilePlaceholder]} />
      )}
      {!isMine ? (
        <View style={styles.miniPartnerDot}>
          <View style={styles.miniPartnerDotInner} />
        </View>
      ) : null}
    </Pressable>
  );
}

// ─── Browse tile ─────────────────────────────────────────────────────────────

function BrowseTile({ uri, age, tagged, onPress }) {
  return (
    <Pressable style={styles.browseTile} onPress={onPress}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} cachePolicy="memory-disk" />
      {age ? (
        <View style={styles.browseAge}>
          <Caption style={{ color: '#FFFFFF', fontSize: 10, lineHeight: 12, fontWeight: '700' }}>{age}</Caption>
        </View>
      ) : null}
      {tagged ? (
        <View style={styles.browseTagged}>
          <Ionicons name="heart" size={12} color="#FFFFFF" />
        </View>
      ) : null}
    </Pressable>
  );
}

function BrowseSeparator() {
  return null;
}

// ─── Places panel ────────────────────────────────────────────────────────────

function PlacesMapPanel({
  places,
  selectedPlaceId,
  onSelectPlace,
  selectedPlace,
  activeScene,
  onSceneChange,
  photos,
  onOpenPhoto,
  onLongPressPhoto,
  babyName,
}) {
  if (!places.length) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons name="map-outline" size={48} color={colors.coral} />
        </View>
        <Spacer h={space.lg} />
        <Hero align="center" style={{ fontSize: 26 }}>No geotagged moments yet.</Hero>
        <Spacer h={space.sm} />
        <Body align="center">
          As you save photos with location data, {babyName}'s places map appears here.
        </Body>
      </View>
    );
  }

  const points = places.map((place) => ({
    ...place,
    lat: Number(place.location?.latitude),
    lon: Number(place.location?.longitude),
  }));
  const minLat = Math.min(...points.map((p) => p.lat));
  const maxLat = Math.max(...points.map((p) => p.lat));
  const minLon = Math.min(...points.map((p) => p.lon));
  const maxLon = Math.max(...points.map((p) => p.lon));

  const normalize = (value, min, max) => {
    if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || min === max) return 0.5;
    return (value - min) / (max - min);
  };

  return (
    <FlatList
      key="places"
      data={photos}
      keyExtractor={(p) => `${p.asset_owner_user_id}:${p.asset_id}`}
      numColumns={3}
      columnWrapperStyle={{ paddingHorizontal: space.xl, gap: 6 }}
      ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
      contentContainerStyle={{ paddingBottom: space.xxxl, paddingTop: space.sm }}
      ListHeaderComponent={(
        <View style={{ paddingHorizontal: space.xl }}>
          <Card style={styles.mapCard}>
            <Eyebrow>{babyName}'s places</Eyebrow>
            <Spacer h={space.sm} />
            <View style={styles.mapBoard}>
              {points.map((point) => {
                const x = normalize(point.lon, minLon, maxLon);
                const y = normalize(point.lat, minLat, maxLat);
                const selected = point.id === selectedPlaceId;
                return (
                  <Pressable
                    key={point.id}
                    onPress={() => onSelectPlace(point.id)}
                    style={[
                      styles.mapDot,
                      {
                        left: `${6 + x * 88}%`,
                        top: `${8 + (1 - y) * 82}%`,
                        backgroundColor: selected ? colors.coral : colors.plum,
                        width: selected ? 16 : 12,
                        height: selected ? 16 : 12,
                        borderRadius: selected ? 8 : 6,
                      },
                    ]}
                  />
                );
              })}
            </View>
            <Spacer h={space.sm} />
            <Caption>{places.length} place{places.length === 1 ? '' : 's'} · tap a point to explore</Caption>
          </Card>

          {selectedPlace ? (
            <Card style={styles.placeSummary}>
              <Title style={{ fontSize: 21 }}>{selectedPlace.label}</Title>
              <Spacer h={4} />
              <Caption>
                {selectedPlace.photos.length} moment{selectedPlace.photos.length === 1 ? '' : 's'} here
              </Caption>
              <Spacer h={space.sm} />
              <View style={styles.sceneRow}>
                <SceneChip
                  label="All"
                  active={activeScene === 'all'}
                  onPress={() => onSceneChange('all')}
                />
                {selectedPlace.topScenes.map((scene) => (
                  <SceneChip
                    key={scene}
                    label={scene}
                    active={activeScene === scene}
                    onPress={() => onSceneChange(scene)}
                  />
                ))}
              </View>
            </Card>
          ) : null}
        </View>
      )}
      renderItem={({ item }) => (
        <Pressable
          style={styles.placeTile}
          onPress={() => onOpenPhoto(item)}
          onLongPress={() => onLongPressPhoto(item)}
          delayLongPress={220}
        >
          <Image
            source={{ uri: item.thumbUrl || item.fullUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={120}
            cachePolicy="memory-disk"
          />
        </Pressable>
      )}
    />
  );
}

function SceneChip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.sceneChip, active && styles.sceneChipActive]}>
      <Caption style={[styles.sceneChipText, active && styles.sceneChipTextActive]}>{label}</Caption>
    </Pressable>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupByMonth(items, babyBirthday) {
  if (!items?.length) return [];
  const sorted = [...items]
    .filter((it) => !!it.creation_time)
    .sort(
      (a, b) =>
        (b.creation_time ? +new Date(b.creation_time) : 0) -
        (a.creation_time ? +new Date(a.creation_time) : 0),
    );
  if (!sorted.length) return [];
  const buckets = new Map();
  for (const it of sorted) {
    const dt = new Date(it.creation_time);
    if (Number.isNaN(dt.getTime())) continue;
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    if (!buckets.has(key)) {
      const monthLabel = dt
        .toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        .toLowerCase();
      let ageLabel = '';
      if (babyBirthday) {
        const ageObj = ageAt(babyBirthday, dt.getTime());
        ageLabel = ageObj
          ? formatAge(ageObj).replace(/^./, (c) => c.toUpperCase())
          : '';
      }
      buckets.set(key, { key, monthLabel, ageLabel, items: [] });
    }
    buckets.get(key).items.push(it);
  }
  return Array.from(buckets.values()).filter((b) => b.items.length);
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header
  header: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleWrap: {
    flex: 1,
    marginLeft: space.md,
    marginRight: space.sm,
  },
  headerTitle: {
    fontSize: 32,
    lineHeight: 36,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: semantic.card,
    borderWidth: 1,
    borderColor: semantic.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.whisper,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: semantic.cardAlt,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    ...shadow.whisper,
  },
  headerBrandMark: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Segment
  segment: {
    flexDirection: 'row',
    paddingHorizontal: space.xl,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  segmentTab: {
    flex: 1,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentTabActive: {
    backgroundColor: semantic.card,
    borderColor: semantic.border,
    ...shadow.whisper,
  },
  segmentText: {
    color: semantic.textMuted,
    fontSize: 11,
  },
  segmentTextActive: {
    color: colors.ink,
  },

  // Menu
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(45,31,38,0.45)',
    justifyContent: 'flex-end',
  },
  menuSheetWrap: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
  },
  menuSheet: {
    backgroundColor: semantic.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    maxHeight: SCREEN_H * 0.84,
    padding: space.xl,
    ...shadow.soft,
  },
  themePanel: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
  },
  themePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  themeCaption: {
    marginTop: 2,
    textTransform: 'capitalize',
    letterSpacing: 0,
  },
  themePreview: {
    width: 48,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    padding: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  themePreviewDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  themeModeRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  themeModeButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  themeModeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'none',
    letterSpacing: 0,
  },
  paletteQuickRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  paletteQuickButton: {
    flex: 1,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paletteQuickSwatches: {
    flexDirection: 'row',
    gap: 3,
  },
  paletteQuickSwatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    gap: space.md,
  },
  menuItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: semantic.border,
    marginVertical: space.sm,
  },

  // Timeline (edge-to-edge — sections own their own padding)
  listContent: {
    paddingTop: 0,
    paddingBottom: space.xxxl,
  },

  // Horizontal rails (edge-to-edge with internal start/end padding)
  railWrap: {
    marginBottom: space.xl,
  },
  railHeader: {
    paddingHorizontal: space.xl,
    paddingBottom: space.sm,
  },
  railRow: {
    paddingHorizontal: space.xl,
    gap: space.md,
  },

  // For You cards
  forYouCard: {
    width: 132,
    height: 168,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: semantic.cardAlt,
    ...shadow.whisper,
  },
  forYouOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,12,16,0.22)',
  },
  forYouLabel: {
    position: 'absolute',
    left: space.sm,
    bottom: space.sm,
    right: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  forYouIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(232,145,119,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  forYouLabelText: {
    color: '#FFFFFF',
    fontWeight: '700',
    textTransform: 'none',
    letterSpacing: 0,
    fontSize: 11,
    flex: 1,
  },

  // Monthiversaries
  mvRow: {
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  mvCard: {
    width: 78,
    height: 104,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: semantic.cardAlt,
  },
  mvOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,12,16,0.22)',
  },
  mvBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    right: 6,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(45,31,38,0.7)',
    alignItems: 'center',
  },
  mvBadgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 10,
    textTransform: 'none',
    letterSpacing: 0,
  },

  // Today card (still padded — it's a card)
  todayCard: {
    marginHorizontal: space.xl,
    marginBottom: space.xl,
    overflow: 'hidden',
  },
  todayCopy: {
    paddingBottom: space.lg,
  },
  todayStrip: {
    flexDirection: 'row',
    gap: 6,
    height: 112,
  },
  todayThumb: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: semantic.cardAlt,
  },
  todayThumbLead: {
    flex: 1.35,
  },

  // Month section (edge-to-edge media, padded text)
  section: {
    width: '100%',
  },
  sectionHeader: {
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
  },
  hero: {
    width: SCREEN_W,
    aspectRatio: 4 / 5,
    backgroundColor: semantic.cardAlt,
    overflow: 'hidden',
  },
  heroBadgeRow: {
    position: 'absolute',
    top: space.md,
    left: space.md,
    flexDirection: 'row',
  },
  partnerBadge: {
    backgroundColor: 'rgba(45,31,38,0.7)',
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },

  // Edge-to-edge mini grid (Photos.app style — touching tiles)
  miniGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: SCREEN_W,
    marginTop: 1,
  },
  miniTile: {
    width: MINI_TILE_SIZE,
    height: MINI_TILE_SIZE,
    backgroundColor: semantic.cardAlt,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: semantic.bg,
  },
  miniMore: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.coralSoft,
  },
  miniMoreText: {
    color: colors.coral,
    fontWeight: '700',
    textTransform: 'none',
    letterSpacing: 0,
    marginTop: 2,
    fontSize: 11,
  },
  tilePlaceholder: {
    backgroundColor: semantic.cardAlt,
  },
  miniPartnerDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniPartnerDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.coral,
  },

  // Empty state
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Browse (edge-to-edge tiling like Photos.app)
  browseRow: {},
  browseContent: {
    paddingBottom: space.xxl,
  },
  browseEmpty: {
    padding: space.xxl,
    alignItems: 'center',
  },
  browseTile: {
    width: MINI_TILE_SIZE,
    height: MINI_TILE_SIZE,
    backgroundColor: semantic.cardAlt,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: semantic.bg,
  },
  browseAge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(45,31,38,0.6)',
  },
  browseTagged: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Places
  mapCard: {
    marginBottom: space.md,
  },
  mapBoard: {
    height: 190,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: '#F0E7DC',
    position: 'relative',
    overflow: 'hidden',
  },
  mapDot: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    ...shadow.whisper,
  },
  placeSummary: {
    marginBottom: space.md,
  },
  sceneRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  sceneChip: {
    paddingVertical: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.cardAlt,
  },
  sceneChipActive: {
    backgroundColor: colors.coral,
    borderColor: colors.coral,
  },
  sceneChipText: {
    textTransform: 'none',
    letterSpacing: 0,
    color: colors.plum,
  },
  sceneChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  placeTile: {
    width: (SCREEN_W - space.xl * 2 - 12) / 3,
    aspectRatio: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: semantic.cardAlt,
  },
});
