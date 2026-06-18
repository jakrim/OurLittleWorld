import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
  Title,
  radius,
  space,
  useTheme,
} from './ui';
import { useFamily } from './FamilyContext';
import { ageAt, formatAge } from './photos';
import { listSharedTagged } from './photoSync';
import { Firsts } from './rituals';

export default function FirstsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { family } = useFamily();
  const [rows, setRows] = useState([]);
  const [photosByKey, setPhotosByKey] = useState({});

  const load = useCallback(async () => {
    if (!family?.id) return;
    const [firstRows, sharedRows] = await Promise.all([
      Firsts.list(family.id),
      listSharedTagged(family.id, { limit: 240 }).catch(() => []),
    ]);
    setRows(firstRows);
    setPhotosByKey(Object.fromEntries(
      sharedRows.map((photo) => [`${photo.asset_owner_user_id}:${photo.asset_id}`, photo]),
    ));
  }, [family?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const subtitle = rows.length === 1 ? '1 first saved' : `${rows.length} firsts saved`;

  return (
    <AppShell active="firsts" title="firsts so far." subtitle={subtitle}>
      <Card>
        <Eyebrow>{rows.length || '0'} firsts so far</Eyebrow>
        <Title style={styles.heroTitle}>The little doors they walk through this year.</Title>
        <Body>Tap any one to add the story, or save a new first when it happens.</Body>
        <Button
          size="md"
          fullWidth={false}
          style={styles.heroButton}
          onPress={() => router.push('/first-compose')}
          icon={<Ionicons name="add" size={16} color={theme.colors.onPrimary} />}
        >
          Add a first
        </Button>
      </Card>

      {rows.length ? rows.map((first) => {
        const photo = first.asset_owner_user_id && first.asset_id
          ? photosByKey[`${first.asset_owner_user_id}:${first.asset_id}`]
          : null;
        return (
        <Pressable
          key={first.id}
          onPress={() => router.push({ pathname: '/first-compose', params: { id: first.id } })}
        >
          <Card padding="md" style={styles.firstCard}>
            {photo?.thumbUrl || photo?.fullUrl ? (
              <Image
                source={{ uri: photo.thumbUrl || photo.fullUrl }}
                style={styles.thumb}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <PhotoPlaceholder style={styles.thumb} icon="flag-outline" />
            )}
            <View style={styles.firstBody}>
              <View style={styles.firstMeta}>
                <AgePill first={first} birthday={family?.babyBirthday} />
                <Caption>{formatDate(first.happened_at || first.created_at)}</Caption>
              </View>
              <Body style={styles.firstTitle}>{first.title}</Body>
              {first.note ? <Caption numberOfLines={2}>{first.note}</Caption> : null}
            </View>
            <Ionicons name="checkmark-circle" size={20} color={theme.semantic.secondary} />
          </Card>
        </Pressable>
        );
      }) : (
        <Card variant="ghost">
          <Eyebrow>Ideas</Eyebrow>
          <Body>First laugh, first solid food, first stand, first trip, first tiny joke.</Body>
        </Card>
      )}
    </AppShell>
  );
}

function AgePill({ first, birthday }) {
  const theme = useTheme();
  const age = useMemo(() => {
    if (!birthday || !first.happened_at) return null;
    return formatAge(ageAt(birthday, new Date(first.happened_at).getTime()));
  }, [birthday, first.happened_at]);
  if (!age) return null;
  return (
    <View style={[styles.agePill, { backgroundColor: theme.colors.primarySoft }]}>
      <Caption style={{ color: theme.semantic.primary, fontWeight: '700' }}>{age}</Caption>
    </View>
  );
}

function formatDate(value) {
  if (!value) return 'someday';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  heroTitle: {
    fontSize: 24,
    lineHeight: 30,
    marginVertical: space.sm,
  },
  heroButton: {
    marginTop: space.lg,
  },
  firstCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    marginRight: space.md,
  },
  firstBody: {
    flex: 1,
  },
  firstMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  firstTitle: {
    color: undefined,
    fontSize: 15,
    lineHeight: 20,
  },
  agePill: {
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
});
