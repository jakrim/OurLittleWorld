import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router/react-navigation';
import { useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { groupNotificationRows, notificationCategoryMeta } from './notificationCenterModel.js';
import { listNotifications, markNotificationsRead } from './notifications';
import {
  AnimatedPressable,
  Body,
  Caption,
  EntranceView,
  Screen,
  Title,
  radius,
  shadow,
  space,
  useTheme,
} from './ui';

export default function ActivitySheetScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { family } = useFamily();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextRows = await listNotifications({ familyId: family?.id, userId: user?.id });
      setRows(nextRows);
      await markNotificationsRead({ familyId: family?.id, userId: user?.id });
    } catch (err) {
      Alert.alert('Could not load activity', err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [family?.id, user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const sections = useMemo(() => groupNotificationRows(rows), [rows]);

  const openRow = (row) => {
    if (!row?.route) return;
    router.push(row.route);
  };

  return (
    <Screen bare>
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={styles.content}
        style={[styles.root, { backgroundColor: theme.semantic.card }]}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close activity"
            style={[styles.backButton, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}
          >
            <Ionicons name="chevron-back" size={18} color={theme.semantic.textSoft} />
          </Pressable>
          <Title style={styles.title}>Activity</Title>
          <View style={styles.topSpacer} />
        </View>

        {!loading && !sections.length ? (
          <Caption numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.empty}>
            Quiet for now. We'll let you know when something's worth it.
          </Caption>
        ) : null}

        {sections.map((section, sectionIndex) => (
          <View key={section.key} style={styles.section}>
            <Caption style={styles.sectionTitle}>{section.title}</Caption>
            <View style={styles.rowList}>
              {section.rows.map((row, rowIndex) => (
                <EntranceView key={row.id} index={sectionIndex * 5 + rowIndex}>
                  <ActivityRow row={row} onPress={() => openRow(row)} />
                </EntranceView>
              ))}
            </View>
          </View>
        ))}

        <Pressable
          onPress={() => router.push({ pathname: '/settings-menu', params: { section: 'notifications' } })}
          accessibilityRole="button"
          accessibilityLabel="Notification settings"
          style={[styles.footerRow, { borderColor: theme.semantic.border }]}
        >
          <View style={[styles.iconCircle, { backgroundColor: theme.semantic.cardAlt }]}>
            <Ionicons name="settings-outline" size={18} color={theme.semantic.textSoft} />
          </View>
          <Body style={styles.footerText}>Notification settings</Body>
          <Ionicons name="chevron-forward" size={18} color={theme.semantic.textMuted} />
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function ActivityRow({ row, onPress }) {
  const theme = useTheme();
  const meta = notificationCategoryMeta(row.category);
  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={row.title}
      pressedScale={0.985}
    >
      <View style={[styles.activityRow, { borderColor: theme.semantic.border }]}>
        <View style={[styles.iconCircle, { backgroundColor: theme.colors.primarySoft }]}>
          <Ionicons name={meta.icon} size={18} color={theme.semantic.primary} />
        </View>
        <View style={styles.rowText}>
          <View style={styles.rowTitleLine}>
            <Body numberOfLines={1} style={styles.rowTitle}>{row.title}</Body>
            {row.relativeTime ? <Caption style={styles.timestamp}>{row.relativeTime}</Caption> : null}
          </View>
          {row.body ? <Caption numberOfLines={1}>{row.body}</Caption> : null}
        </View>
        {row.thumbnailUrl ? (
          <Image source={{ uri: row.thumbnailUrl }} style={styles.thumbnail} contentFit="cover" />
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  topBar: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.whisper,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 28,
  },
  topSpacer: {
    width: 44,
  },
  empty: {
    textAlign: 'center',
    marginTop: space.xl,
  },
  section: {
    gap: space.sm,
  },
  sectionTitle: {
    textTransform: 'none',
  },
  rowList: {
    gap: space.xs,
  },
  activityRow: {
    minHeight: 68,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  rowTitle: {
    flex: 1,
  },
  timestamp: {
    flexShrink: 0,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: 6,
    overflow: 'hidden',
  },
  footerRow: {
    minHeight: 62,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  footerText: {
    flex: 1,
  },
});
