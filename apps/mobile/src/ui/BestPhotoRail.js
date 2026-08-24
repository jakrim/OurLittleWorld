import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { Body, Caption, PhotoPlaceholder, radius, space, useTheme } from './index';
import { candidateId } from '../bestPhotoCandidateModel.js';

export default function BestPhotoRail({
  photos = [],
  loading = false,
  selectedIds = new Set(),
  onToggle,
  onOpenPicker,
  title = 'Best recent photos',
  caption,
  pickerLabel = 'Choose another photo',
}) {
  const theme = useTheme();
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Body style={styles.title}>{title}</Body>
          {caption ? <Caption>{caption}</Caption> : null}
        </View>
        {loading ? <ActivityIndicator color={theme.semantic.primary} /> : null}
      </View>

      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {photos.map((photo) => {
            const id = candidateId(photo);
            const active = selected.has(id);
            return (
              <Pressable
                key={id}
                onPress={() => onToggle?.(photo)}
                accessibilityRole="button"
                accessibilityLabel={active ? 'Remove suggested photo' : 'Add suggested photo'}
                style={[styles.photo, { borderColor: active ? theme.semantic.primary : theme.semantic.border }]}
              >
                {photo.uri || photo.localUri ? (
                  <Image
                    source={{ uri: photo.localUri || photo.uri }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : <PhotoPlaceholder style={StyleSheet.absoluteFill} />}
                {active ? (
                  <View style={[styles.check, { backgroundColor: theme.semantic.primary }]}>
                    <Ionicons name="checkmark" size={13} color={theme.colors.onPrimary} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <Pressable
        onPress={onOpenPicker}
        accessibilityRole="button"
        accessibilityLabel={pickerLabel}
        style={[styles.picker, { borderColor: theme.semantic.border }]}
      >
        <Ionicons name="images-outline" size={17} color={theme.semantic.primary} />
        <Body style={styles.pickerLabel}>{pickerLabel}</Body>
        <Ionicons name="chevron-forward" size={16} color={theme.semantic.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  heading: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headingCopy: { flex: 1 },
  title: { fontWeight: '800' },
  row: { gap: space.sm, paddingRight: space.sm },
  photo: {
    width: 94,
    height: 112,
    borderRadius: radius.md,
    borderWidth: 2,
    overflow: 'hidden',
  },
  check: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  picker: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  pickerLabel: { flex: 1, fontWeight: '700' },
});
