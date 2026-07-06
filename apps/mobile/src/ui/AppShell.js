import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';

import { useAuth } from '../AuthContext';
import { useFamily } from '../FamilyContext';
import { hasUnreadNotifications } from '../notifications';
import AppHeader from './AppHeader';
import BottomSafeBar from './BottomSafeBar';
import BottomTabs from './BottomTabs';
import Screen from './Screen';
import { space } from './theme';

export default function AppShell({
  active,
  title,
  subtitle,
  children,
  scroll = true,
  contentStyle,
  right,
  showActivityButton = false,
}) {
  const router = useRouter();
  const activityUnread = useActivityUnread(showActivityButton);

  const content = scroll ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      bounces={false}
      alwaysBounceVertical={false}
      overScrollMode="never"
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[styles.scrollContent, contentStyle]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.staticContent, contentStyle]}>{children}</View>
  );

  return (
    <Screen bare edges={{ top: true, bottom: false }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <AppHeader
          title={title}
          subtitle={subtitle}
          onSettings={() => router.push('/settings-menu')}
          onActivity={showActivityButton ? () => router.push('/activity') : null}
          activityUnread={activityUnread}
          right={right}
        />
        <View style={styles.body}>{content}</View>
        <BottomSafeBar>
          <BottomTabs active={active} onAddPress={() => router.push('/add')} />
        </BottomSafeBar>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function useActivityUnread(enabled) {
  const { user } = useAuth();
  const { family } = useFamily();
  const [unread, setUnread] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (!enabled || !user?.id) {
        setUnread(false);
        return () => {
          alive = false;
        };
      }
      hasUnreadNotifications({ familyId: family?.id, userId: user.id })
        .then((nextUnread) => {
          if (alive) setUnread(nextUnread);
        })
        .catch(() => {
          if (alive) setUnread(false);
        });
      return () => {
        alive = false;
      };
    }, [enabled, family?.id, user?.id]),
  );

  return unread;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  staticContent: {
    flex: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
  },
});
