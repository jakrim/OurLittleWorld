import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  AppShell,
  Body,
  Button,
  Caption,
  Card,
  Eyebrow,
  PhotoPlaceholder,
  SegmentedControl,
  Title,
  radius,
  space,
  useTheme,
} from './ui';
import { useFamily } from './FamilyContext';
import { useAuth } from './AuthContext';
import { ageAt, ensureLibraryPermission, fetchPhotosPage, formatAge } from './photos';
import { Tags } from './storage';
import { deleteForTag, listSharedTagged } from './photoSync';
import PhotoActionSheet from './PhotoActionSheet';
import { buildPlaceClusters } from './visionSceneLabeler';

export default function LibraryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { family } = useFamily();
  const { user } = useAuth();
  const [segment, setSegment] = useState('photos');
  const [shared, setShared] = useState([]);
  const [local, setLocal] = useState([]);
  const [tags, setTags] = useState({});
  const [cursor, setCursor] = useState(undefined);
  const [hasNext, setHasNext] = useState(true);
  const [loading, setLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [actionPhoto, setActionPhoto] = useState(null);

  const loadShared = useCallback(async () => {
    if (!family?.id) return;
    const [sharedRows, tagRows] = await Promise.all([
      listSharedTagged(family.id, { limit: 240 }).catch(() => []),
      Tags.all(family.id).catch(() => ({})),
    ]);
    setShared(sharedRows);
    setTags(tagRows);
  }, [family?.id]);

  const loadLocalInitial = useCallback(async () => {
    if (!family?.id) return;
    setLoading(true);
    try {
      const perm = await ensureLibraryPermission();
      if (!perm.granted) {
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);
      const page = await fetchPhotosPage({});
      setLocal(page.assets);
      setCursor(page.endCursor);
      setHasNext(page.hasNextPage);
    } catch (err) {
      Alert.alert('Could not load library', err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [family?.id]);

  useFocusEffect(useCallback(() => { loadShared(); }, [loadShared]));

  useEffect(() => {
    if (segment === 'photos' && local.length === 0) loadLocalInitial();
  }, [loadLocalInitial, local.length, segment]);

  const loadMore = async () => {
    if (loading || !hasNext) return;
    setLoading(true);
    try {
      const page = await fetchPhotosPage({ after: cursor });
      setLocal((prev) => [...prev, ...page.assets]);
      setCursor(page.endCursor);
      setHasNext(page.hasNextPage);
    } finally {
      setLoading(false);
    }
  };

  const openLocal = (photo) => {
    const params = { assetId: photo.id, uri: photo.uri };
    if (photo.creationTime != null) params.creationTime = String(photo.creationTime);
    router.push({ pathname: '/photo/[assetId]', params });
  };

  const places = useMemo(
    () => buildPlaceClusters({ shared, metadataByKey: {}, memoriesByKey: {} }),
    [shared],
  );

  const openShared = (photo) => {
    const params = { assetId: photo.asset_id };
    if (photo.asset_owner_user_id) params.ownerUserId = photo.asset_owner_user_id;
    const previewUri = photo.thumbUrl || photo.fullUrl;
    if (previewUri) params.uri = previewUri;
    if (photo.creation_time) params.creationTime = String(new Date(photo.creation_time).getTime());
    router.push({ pathname: '/photo/[assetId]', params });
  };

  const removeShared = async () => {
    if (!family?.id || !actionPhoto) return;
    const photo = actionPhoto;
    setActionPhoto(null);
    try {
      await deleteForTag({
        familyId: family.id,
        assetOwnerUserId: photo.asset_owner_user_id,
        assetId: photo.asset_id,
      });
      loadShared();
    } catch (err) {
      Alert.alert('Could not remove', err?.message || String(err));
    }
  };

  const photoSheetActions = actionPhoto ? [
    {
      icon: 'open-outline',
      label: 'Open moment',
      onPress: () => {
        const photo = actionPhoto;
        setActionPhoto(null);
        openShared(photo);
      },
    },
    {
      icon: 'trash-outline',
      label: 'Remove from timeline',
      destructive: true,
      onPress: removeShared,
    },
  ] : [];

  return (
    <AppShell active="library" title="a quieter archive." subtitle={`${shared.length} saved moments`}>
      <SegmentedControl
        value={segment}
        onChange={setSegment}
        options={[
          { value: 'photos', label: 'Photos' },
          { value: 'places', label: 'Places' },
          { value: 'search', label: 'Search' },
        ]}
      />

      {segment === 'photos' ? (
        <>
          {permissionDenied ? (
            <Card>
              <Eyebrow>Photo library</Eyebrow>
              <Title style={styles.cardTitle}>Access is needed to browse.</Title>
              <Body>Allow photo access to tag local moments for the family archive.</Body>
              <Button style={styles.cardButton} onPress={loadLocalInitial}>Grant access</Button>
            </Card>
          ) : null}
          <View style={styles.grid}>
            {local.map((photo) => {
              const tagged = !!(user?.id && tags[Tags.key(photo.id, user.id)]);
              const age = family?.babyBirthday ? formatAge(ageAt(family.babyBirthday, photo.creationTime)) : '';
              return (
                <Pressable
                  key={photo.id}
                  style={[styles.tile, { backgroundColor: theme.semantic.cardAlt }]}
                  onPress={() => openLocal(photo)}
                >
                  <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  {tagged ? (
                    <View style={[styles.tagBadge, { backgroundColor: theme.semantic.primary }]}>
                      <Ionicons name="heart" size={12} color={theme.colors.onPrimary} />
                    </View>
                  ) : null}
                  {age ? <Caption style={[styles.ageLabel, { color: theme.colors.onPrimary }]}>{age}</Caption> : null}
                </Pressable>
              );
            })}
          </View>
          {loading ? <ActivityIndicator color={theme.semantic.primary} /> : null}
          {hasNext && local.length ? (
            <Button variant="ghost" onPress={loadMore} loading={loading}>Load more</Button>
          ) : null}
          {!loading && !local.length && !permissionDenied ? (
            <Card variant="ghost">
              <Body>No local photos found.</Body>
            </Card>
          ) : null}
        </>
      ) : segment === 'places' ? (
        <View style={styles.placeList}>
          {places.length ? places.map((place) => (
            <Card key={place.id} padding="md" style={styles.placeRow}>
              <View style={styles.placeText}>
                <Eyebrow>{place.label}</Eyebrow>
                <Title style={styles.placeTitle}>{place.photos.length} saved moments</Title>
                <Caption>{place.topScenes.slice(0, 3).join(' · ') || 'Family outing'}</Caption>
              </View>
              <View style={styles.placeThumbRow}>
                {place.photos.slice(0, 3).map((photo) => (
                  <Pressable
                    key={`${photo.asset_owner_user_id}:${photo.asset_id}`}
                    onPress={() => openShared(photo)}
                    onLongPress={() => setActionPhoto(photo)}
                    delayLongPress={220}
                    style={styles.placeThumb}
                  >
                    {photo.thumbUrl || photo.fullUrl ? (
                      <Image source={{ uri: photo.thumbUrl || photo.fullUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <PhotoPlaceholder style={StyleSheet.absoluteFill} />
                    )}
                  </Pressable>
                ))}
              </View>
            </Card>
          )) : (
            <Card>
              <Eyebrow>Places</Eyebrow>
              <Title style={styles.cardTitle}>No mapped moments yet.</Title>
              <Body>Photos with location metadata will collect here as the archive grows.</Body>
            </Card>
          )}
        </View>
      ) : (
        <Card>
          <Eyebrow>Search</Eyebrow>
          <Title style={styles.cardTitle}>Search-ready, not noisy.</Title>
          <Body>Date, place, person, and ritual filters belong here. The structure is in place; full search can land after the ritual tables are live.</Body>
        </Card>
      )}
      <PhotoActionSheet
        photo={actionPhoto}
        visible={!!actionPhoto}
        onClose={() => setActionPhoto(null)}
        actions={photoSheetActions}
        subtitle={actionPhoto ? 'What should happen with this saved moment?' : undefined}
      />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  tile: {
    width: '32%',
    aspectRatio: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  tagBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ageLabel: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 5,
    fontSize: 10,
  },
  cardTitle: {
    fontSize: 23,
    lineHeight: 29,
    marginVertical: space.sm,
  },
  cardButton: {
    marginTop: space.lg,
  },
  placeList: {
    gap: space.sm,
  },
  placeRow: {
    borderRadius: 14,
  },
  placeThumbRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.md,
  },
  placeThumb: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  placeText: {
    flex: 1,
  },
  placeTitle: {
    fontSize: 19,
    lineHeight: 23,
    marginTop: 2,
  },
});
