import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Modal,
} from 'react-native';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import Field from './Field';
import { colors, semantic, space, radius, type as t, useTheme } from './theme';

const MIN_BIRTH = new Date(1970, 0, 1, 12, 0, 0, 0);

/** YYYY-MM-DD from a local calendar Date (no UTC shift). */
export function isoDateFromLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD as a local calendar date at noon. */
export function localDateFromIso(iso) {
  if (!iso || typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, mo, day] = iso.split('-').map(Number);
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  const dt = new Date(y, mo - 1, day, 12, 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== day) return null;
  return dt;
}

function startOfTodayNoon() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function clampToBirthBounds(d) {
  let t = d.getTime();
  if (t < MIN_BIRTH.getTime()) return new Date(MIN_BIRTH);
  const maxNoon = startOfTodayNoon();
  if (t > maxNoon.getTime()) return maxNoon;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

function defaultSuggestionDate() {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return clampToBirthBounds(d);
}

/** Non-empty ISO birth date between Jan 1970 and today (local). */
export function isValidBirthIso(iso) {
  if (!iso || typeof iso !== 'string' || !iso.trim()) return false;
  const d = localDateFromIso(iso.trim());
  if (!d) return false;
  if (d.getTime() < MIN_BIRTH.getTime()) return false;
  if (d.getTime() > startOfTodayNoon().getTime()) return false;
  return true;
}

/**
 * Native calendar / spinner date picker; stores YYYY-MM-DD.
 * Web falls back to typed entry with the same validation at the screen level.
 */
export default function BirthDatePicker({ value, onChange, error, caption }) {
  const theme = useTheme();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [showAndroid, setShowAndroid] = useState(false);
  const [iosDraft, setIosDraft] = useState(() => localDateFromIso(value) || defaultSuggestionDate());

  const maxDate = useMemo(() => endOfToday(), []);

  const displayLabel = useMemo(() => {
    const d = localDateFromIso(value);
    if (!d) return null;
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [value]);

  const open = useCallback(() => {
    const base = localDateFromIso(value) || defaultSuggestionDate();
    setIosDraft(clampToBirthBounds(base));
    if (Platform.OS === 'android') setShowAndroid(true);
    else if (Platform.OS === 'ios') setShowIOSModal(true);
  }, [value]);

  const onIOSPickerChange = useCallback((_, selected) => {
    if (selected) setIosDraft(clampToBirthBounds(selected));
  }, []);

  const commitIOS = useCallback(() => {
    onChange(isoDateFromLocalDate(iosDraft));
    setShowIOSModal(false);
  }, [iosDraft, onChange]);

  const cancelIOS = useCallback(() => {
    setShowIOSModal(false);
  }, []);

  const onAndroidChange = useCallback(
    (event, selected) => {
      setShowAndroid(false);
      if (event?.type === 'dismissed') return;
      if (selected) {
        onChange(isoDateFromLocalDate(clampToBirthBounds(selected)));
      }
    },
    [onChange],
  );

  if (Platform.OS === 'web') {
    return (
      <Field
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        keyboardType="numeric"
        autoCorrect={false}
        maxLength={10}
        size="lg"
        caption={
          caption === null
            ? undefined
            : (caption ?? 'We use this for photo ages and which pictures to scan.')
        }
        error={error}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={open}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border },
          pressed && {
            backgroundColor: theme.isDark ? theme.semantic.cardAlt : theme.colors.bgAlt,
            borderColor: theme.semantic.primary,
          },
          error ? { borderColor: theme.colors.danger } : null,
          !value ? styles.rowMuted : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Baby birth date"
        accessibilityHint="Opens the date picker"
      >
        <Text
          style={[
            styles.valueText,
            { color: theme.semantic.text },
            !value && { color: theme.semantic.textWhisper },
          ]}
          numberOfLines={2}
        >
          {displayLabel || 'Choose birth date'}
        </Text>
        <Ionicons name="calendar-outline" size={22} color={theme.semantic.primary} />
      </Pressable>
      {error ? (
        <Text style={[styles.error, { color: theme.colors.danger }]}>{error}</Text>
      ) : caption === null ? null : (
        <Text style={[styles.caption, { color: theme.semantic.textMuted }]}>
          {caption ?? 'We use this for photo ages and which pictures to scan.'}
        </Text>
      )}

      {Platform.OS === 'android' && showAndroid ? (
        <DateTimePicker
          value={iosDraft}
          mode="date"
          display="default"
          minimumDate={MIN_BIRTH}
          maximumDate={maxDate}
          onChange={onAndroidChange}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={showIOSModal} transparent animationType="slide" onRequestClose={cancelIOS}>
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={cancelIOS} accessibilityLabel="Dismiss" />
            <View style={[styles.modalSheet, { backgroundColor: theme.semantic.card }]}>
              <View style={styles.modalHeader}>
                <Pressable onPress={cancelIOS} hitSlop={12} accessibilityRole="button">
                  <Text style={[styles.modalBtn, { color: theme.semantic.primary }]}>Cancel</Text>
                </Pressable>
                <Text style={[styles.modalTitle, { color: theme.semantic.textMuted }]}>Birth date</Text>
                <Pressable onPress={commitIOS} hitSlop={12} accessibilityRole="button">
                  <Text style={[styles.modalBtn, styles.modalBtnStrong, { color: theme.semantic.primary }]}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={iosDraft}
                mode="date"
                display="spinner"
                themeVariant={theme.isDark ? 'dark' : 'light'}
                minimumDate={MIN_BIRTH}
                maximumDate={maxDate}
                onChange={onIOSPickerChange}
                style={styles.iosPicker}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: semantic.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: semantic.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.xl,
    minHeight: 56,
  },
  rowPressed: {
    backgroundColor: '#FFFDFB',
    borderColor: semantic.primary,
  },
  rowMuted: {
    borderStyle: 'dashed',
  },
  rowError: {
    borderColor: colors.danger,
  },
  valueText: {
    flex: 1,
    marginRight: space.md,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    color: semantic.text,
  },
  placeholderText: {
    color: semantic.textWhisper,
    fontWeight: '500',
  },
  caption: {
    ...t.caption,
    marginTop: space.sm,
    paddingHorizontal: space.xs,
  },
  error: {
    ...t.caption,
    color: colors.danger,
    fontWeight: '600',
    marginTop: space.sm,
    paddingHorizontal: space.xs,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.scrim,
  },
  modalSheet: {
    backgroundColor: semantic.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: 28,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semantic.border,
  },
  modalTitle: {
    ...t.subtitle,
    fontSize: 16,
    color: semantic.textMuted,
  },
  modalBtn: {
    fontSize: 17,
    color: semantic.primary,
    paddingVertical: space.sm,
  },
  modalBtnStrong: {
    fontWeight: '700',
  },
  iosPicker: {
    height: 216,
    width: '100%',
  },
});
