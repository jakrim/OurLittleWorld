import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';

import { radius, shadow, space, useTheme } from './theme';

const TABS = [
  { key: 'today', label: 'Today', icon: 'home-outline', route: '/timeline' },
  { key: 'firsts', label: 'Firsts', icon: 'flag-outline', route: '/firsts' },
  { key: 'add', label: 'Add', icon: 'add', route: null },
  { key: 'letters', label: 'Letters', icon: 'mail-outline', route: '/letters' },
  { key: 'library', label: 'Library', icon: 'book-outline', route: '/library' },
];

export default function BottomTabs({ active, onAddPress }) {
  const router = useRouter();
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.root, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }]}>
        {TABS.map((tab) => {
          const selected = tab.key === active;
          const add = tab.key === 'add';
          return (
            <Pressable
              key={tab.key}
              onPress={() => {
                if (selected && !add) return;
                Haptics.selectionAsync();
                if (add) onAddPress?.();
                else router.replace(tab.route);
              }}
              android_ripple={{ color: theme.colors.primarySoft, borderless: false, radius: 34 }}
              style={({ pressed }) => [
                styles.item,
                pressed && styles.itemPressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={tab.label}
            >
              {selected && !add ? <View style={[styles.rule, { backgroundColor: theme.semantic.primary }]} /> : null}
              <View style={[
                add ? styles.addButton : styles.iconWrap,
                add && { backgroundColor: theme.semantic.primary, shadowColor: theme.semantic.primary },
              ]}>
                <Ionicons
                  name={tab.icon}
                  size={add ? 25 : 20}
                  color={add ? theme.colors.onPrimary : selected ? theme.semantic.text : theme.semantic.textMuted}
                />
              </View>
              <Text style={[
                styles.label,
                { color: add ? theme.semantic.primary : selected ? theme.semantic.text : theme.semantic.textMuted },
              ]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const MemoizedBottomTabs = memo(BottomTabs);

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space.lg,
    paddingBottom: 0,
  },
  root: {
    minHeight: 70,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    ...shadow.soft,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 62,
    borderRadius: 18,
  },
  itemPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
  rule: {
    position: 'absolute',
    top: 5,
    width: 18,
    height: 2,
    borderRadius: radius.pill,
  },
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 5,
    marginTop: -14,
  },
  label: {
    marginTop: 2,
    fontFamily: 'Manrope-SemiBold',
    fontSize: 10,
    fontWeight: '600',
  },
});
