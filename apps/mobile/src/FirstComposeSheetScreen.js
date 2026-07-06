import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import BirthDatePicker from './ui/BirthDatePicker';
import { Body, Button, Caption, Field, PhotoPlaceholder, Screen, Title, radius, space, useTheme } from './ui';
import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { defaultFirstHappenedDate } from './firstComposeSeedModel.js';
import { notifyPartnerFirstSaved } from './notificationEvents';
import { listSharedTagged } from './photoSync';
import { FIRST_GOAL_DEFINITIONS, Firsts } from './rituals';

export default function FirstComposeSheetScreen() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const seedTitle = Array.isArray(params.title) ? params.title[0] : params.title;
  const seedTargetAge = Array.isArray(params.targetAge) ? params.targetAge[0] : params.targetAge;
  const seedMomentId = Array.isArray(params.momentId) ? params.momentId[0] : params.momentId;
  const seedGoalKey = Array.isArray(params.goalKey) ? params.goalKey[0] : params.goalKey;
  const seedGoal = FIRST_GOAL_DEFINITIONS.find((goal) => goal.key === seedGoalKey) || null;
  const { family } = useFamily();
  const { user } = useAuth();
  const [existing, setExisting] = useState(null);
  const [title, setTitle] = useState('');
  const [targetAgeLabel, setTargetAgeLabel] = useState(seedTargetAge || '');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [sharedPhotos, setSharedPhotos] = useState([]);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [saving, setSaving] = useState(false);

  const close = useCallback(() => {
    if (router.canGoBack?.()) router.back();
    else router.replace('/firsts');
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (family?.id) {
        listSharedTagged(family.id, { limit: 60 })
          .then((photos) => {
            if (alive) setSharedPhotos(photos || []);
          })
          .catch(() => {});
      }
      if (family?.id && id) {
        Firsts.get(family.id, id).then((match) => {
          if (!alive) return;
          setExisting(match);
          setTitle(match?.title || '');
          setTargetAgeLabel(match?.target_age_label || seedTargetAge || '');
          setDate(match?.happened_at ? match.happened_at.slice(0, 10) : '');
          setNote(match?.note || '');
          setSelectedPhoto(match?.asset_owner_user_id && match?.asset_id
            ? { asset_owner_user_id: match.asset_owner_user_id, asset_id: match.asset_id }
            : null);
        });
      } else {
        setExisting(null);
        setTitle(seedTitle || '');
        setTargetAgeLabel(seedTargetAge || '');
        setDate(defaultFirstHappenedDate({
          babyBirthday: family?.babyBirthday,
          goal: seedGoal,
        }));
        setNote('');
        setSelectedPhoto(null);
      }
      return () => {
        alive = false;
      };
    }, [family?.babyBirthday, family?.id, id, seedGoal, seedTargetAge, seedTitle]),
  );

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const happenedAt = date ? `${date}T12:00:00.000Z` : null;
      const assetOwnerUserId = selectedPhoto?.asset_owner_user_id || null;
      const assetId = selectedPhoto?.asset_id || null;
      const momentId = existing?.moment_id || seedMomentId || selectedPhoto?.moment_id || null;
      const goalKey = existing?.goal_key || seedGoalKey || null;
      let savedFirst = null;
      const shouldNotifyPartner = !existing || existing.done === false;
      if (existing) {
        savedFirst = await Firsts.update(existing.id, { title: title.trim(), note: note.trim() || null, happenedAt, assetOwnerUserId, assetId, targetAgeLabel: targetAgeLabel.trim() || null, momentId, goalKey, done: true });
      } else {
        savedFirst = await Firsts.create({ familyId: family?.id, title, note, happenedAt, assetOwnerUserId, assetId, targetAgeLabel: targetAgeLabel.trim() || null, momentId, goalKey, done: true });
      }
      if (shouldNotifyPartner) {
        notifyPartnerFirstSaved({
          familyId: family?.id,
          actorUserId: user?.id,
          firstId: savedFirst?.id,
          title: savedFirst?.title || title.trim(),
        }).catch((err) => console.warn('notify partner first saved', err?.message));
      }
      close();
    } catch (err) {
      Alert.alert('Could not save', err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!existing) return;
    if (existing.created_by_user_id !== user?.id) {
      Alert.alert('Cannot delete', 'Only the parent who added this first can delete it.');
      return;
    }
    Alert.alert('Delete first?', 'The milestone text will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await Firsts.delete(existing.id);
          close();
        },
      },
    ]);
  };

  return (
    <Screen bare>
      <View style={[styles.root, { backgroundColor: theme.semantic.card }]}>
        <Title>{existing ? 'edit this first' : 'add a first'}</Title>
        {seedTitle && !existing ? (
          <View style={[styles.templateCard, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
            <Caption>Suggested first</Caption>
            <Title style={styles.templateTitle}>{seedTitle}</Title>
            <Body style={styles.templateBody}>
              Add the date, a few words, and an optional saved photo when this one happens.
            </Body>
          </View>
        ) : null}
        <Field value={title} onChangeText={setTitle} placeholder='e.g. First word: "dada"' autoCapitalize="sentences" />
        <Field
          value={targetAgeLabel}
          onChangeText={setTargetAgeLabel}
          placeholder="Target age or window, optional"
          autoCapitalize="sentences"
        />
        <BirthDatePicker
          value={date}
          onChange={setDate}
          caption="Roughly when it happened is fine."
          placeholder="When did it happen?"
          accessibilityLabel="First happened date"
        />
        <Field as="textarea" value={note} onChangeText={setNote} placeholder="What happened around it?" />
        <View>
          <Caption>Attach a saved photo, optional</Caption>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoRow}
          >
            <Pressable
              onPress={() => setSelectedPhoto(null)}
              style={[
                styles.photoChoice,
                !selectedPhoto && { borderColor: theme.semantic.primary },
              ]}
            >
              <PhotoPlaceholder style={StyleSheet.absoluteFill} icon="flag-outline" />
              {!selectedPhoto ? <SelectedCheck /> : null}
            </Pressable>
            {sharedPhotos.map((photo) => {
              const key = `${photo.asset_owner_user_id}:${photo.asset_id}`;
              const selected = selectedPhoto
                && selectedPhoto.asset_owner_user_id === photo.asset_owner_user_id
                && selectedPhoto.asset_id === photo.asset_id;
              return (
                <Pressable
                  key={key}
                  onPress={() => setSelectedPhoto(photo)}
                  style={[styles.photoChoice, selected && { borderColor: theme.semantic.primary }]}
                >
                  {photo.thumbUrl || photo.fullUrl ? (
                    <Image
                      source={{ uri: photo.thumbUrl || photo.fullUrl }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <PhotoPlaceholder style={StyleSheet.absoluteFill} />
                  )}
                  {selected ? <SelectedCheck /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        <View style={styles.composerRow}>
          {existing ? <Button variant="quiet" size="md" fullWidth={false} onPress={remove}>Delete</Button> : <View />}
          <View style={styles.composerActions}>
            <Button variant="ghost" size="md" fullWidth={false} onPress={close}>Cancel</Button>
            <Button size="md" fullWidth={false} onPress={save} loading={saving} disabled={!title.trim()}>Save</Button>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: space.lg,
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    paddingBottom: space.xxl,
  },
  photoRow: {
    gap: space.sm,
    paddingTop: space.sm,
  },
  templateCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
    gap: 4,
  },
  templateTitle: {
    fontSize: 21,
    lineHeight: 26,
  },
  templateBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  photoChoice: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCheck: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  composerActions: {
    flexDirection: 'row',
    gap: space.sm,
  },
});

function SelectedCheck() {
  const theme = useTheme();
  return (
    <View style={[styles.selectedCheck, { backgroundColor: theme.semantic.primary }]}>
      <Ionicons name="checkmark" size={14} color={theme.colors.onPrimary} />
    </View>
  );
}
