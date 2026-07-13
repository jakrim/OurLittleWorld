import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { useAuth } from '../AuthContext';
import { useFamily } from '../FamilyContext';
import { hasUnreadNotifications } from '../notifications';
import AppHeader from './AppHeader';
import BottomSafeBar from './BottomSafeBar';
import BottomTabs from './BottomTabs';
import Screen from './Screen';
import { radius, shadow, space, useTheme } from './theme';

export default function AppShell({
  active,
  title,
  subtitle,
  children,
  scroll = true,
  contentStyle,
  right,
  onBack,
  showActivityButton = false,
  showsVerticalScrollIndicator = false,
  showJumpToTop = false,
  scrollToTopSignal = null,
}) {
  const router = useRouter();
  const theme = useTheme();
  const activityUnread = useActivityUnread(showActivityButton);
  const scrollRef = useRef(null);
  const [jumpTopVisible, setJumpTopVisible] = useState(false);

  useEffect(() => {
    if (scrollToTopSignal == null) return;
    const scheduleFrame = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (callback) => setTimeout(callback, 0);
    scheduleFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      setJumpTopVisible(false);
    });
  }, [scrollToTopSignal]);

  const handleScroll = useCallback((event) => {
    const y = event.nativeEvent.contentOffset.y;
    setJumpTopVisible((current) => {
      const next = y > 420;
      return current === next ? current : next;
    });
  }, []);

  const jumpToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    setJumpTopVisible(false);
  }, []);

  const content = scroll ? (
    <ScrollView
      ref={scrollRef}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      onScroll={showJumpToTop ? handleScroll : undefined}
      scrollEventThrottle={16}
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
          onBack={onBack}
          onSettings={() => router.push('/settings-menu')}
          onActivity={showActivityButton ? () => router.push('/activity') : null}
          activityUnread={activityUnread}
          right={right}
        />
        <View style={styles.body}>{content}</View>
        {scroll && showJumpToTop && jumpTopVisible ? (
          <Pressable
            onPress={jumpToTop}
            accessibilityRole="button"
            accessibilityLabel="Jump to top"
            style={[
              styles.jumpToTopButton,
              { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border },
            ]}
          >
            <Ionicons name="arrow-up" size={20} color={theme.semantic.primary} />
          </Pressable>
        ) : null}
        <BottomSafeBar style={styles.bottomSafeBar}>
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
    overflow: 'hidden',
  },
  bottomSafeBar: {
    paddingTop: space.md,
  },
  scrollContent: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.xxxl,
    gap: space.lg,
  },
  staticContent: {
    flex: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
  },
  jumpToTopButton: {
    position: 'absolute',
    right: space.xl,
    bottom: 116,
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.press,
  },
});
