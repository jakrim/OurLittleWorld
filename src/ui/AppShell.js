import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import AppHeader from './AppHeader';
import BottomSafeBar from './BottomSafeBar';
import BottomTabs from './BottomTabs';
import Screen from './Screen';
import { space } from './theme';

export default function AppShell({ active, title, subtitle, children, scroll = true, contentStyle }) {
  const router = useRouter();

  const content = scroll ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
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
        />
        <View style={styles.body}>{content}</View>
        <BottomSafeBar>
          <BottomTabs active={active} onAddPress={() => router.push('/add')} />
        </BottomSafeBar>
      </KeyboardAvoidingView>
    </Screen>
  );
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
