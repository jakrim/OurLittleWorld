import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  Body,
  Caption,
  Card,
  Eyebrow,
  PhotoPlaceholder,
  Screen,
  Title,
  radius,
  space,
  useTheme,
} from './ui';
import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { countLabel } from './plural';
import { useRitualHomeData } from './useRitualHomeData';

export default function DigestDetailSheetScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { family } = useFamily();
  const { user } = useAuth();
  const { digest } = useRitualHomeData({
    familyId: family?.id,
    userId: user?.id,
    babyBirthday: family?.babyBirthday,
    babyName: family?.babyName,
  });

  const openMoment = (momentId) => {
    if (!momentId) return;
    router.push({ pathname: '/moment/[momentId]', params: { momentId } });
  };

  return (
    <Screen bare>
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        style={[styles.root, { backgroundColor: theme.semantic.card }]}
        contentContainerStyle={styles.content}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close digest"
            style={[styles.backButton, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}
          >
            <Ionicons name="chevron-back" size={18} color={theme.semantic.textSoft} />
          </Pressable>
          <Title style={styles.topTitle}>Weekly digest</Title>
          <View style={styles.topSpacer} />
        </View>

        <Card variant="muted">
          <Eyebrow>{formatWeek(digest.weekStart, digest.weekEnd)}</Eyebrow>
          <Title style={styles.heroTitle}>{digest.headline}</Title>
          <Body>{digestSummary(digest, family?.babyName)}</Body>
        </Card>

        <View style={styles.metricGrid}>
          <DigestMetric label={countLabel(digest.momentCount ?? digest.photoCount, 'moment')} value={digest.momentCount ?? digest.photoCount} />
          <DigestMetric label={countLabel(digest.milestoneCount ?? digest.firstsCount, 'milestone')} value={digest.milestoneCount ?? digest.firstsCount} />
          <DigestMetric label="voice" value={digest.voiceNoteCount || 0} />
          <DigestMetric label={countLabel(digest.letterCount, 'letter')} value={digest.letterCount} />
        </View>

        <Card>
          <View style={styles.sectionHeader}>
            <View>
              <Eyebrow>Representative moments</Eyebrow>
              <Title style={styles.sectionTitle}>A small read-only recap.</Title>
            </View>
            <Ionicons name="book-outline" size={20} color={theme.semantic.primary} />
          </View>
          {digest.representativeMedia?.length ? (
            <View style={styles.mediaGrid}>
              {digest.representativeMedia.slice(0, 8).map((media, index) => (
                <Pressable
                  key={media.mediaId || `${media.momentId}:${index}`}
                  onPress={() => openMoment(media.momentId)}
                  disabled={!media.momentId}
                  accessibilityRole="button"
                  accessibilityLabel={`Open representative moment ${index + 1}`}
                  accessibilityState={{ disabled: !media.momentId }}
                  style={[styles.mediaTile, { backgroundColor: theme.semantic.cardAlt }]}
                >
                  {media.thumbUrl || media.fullUrl ? (
                    <Image
                      source={{ uri: media.thumbUrl || media.fullUrl }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <PhotoPlaceholder style={StyleSheet.absoluteFill} />
                  )}
                  {media.mediaType === 'video' ? (
                    <View style={[styles.mediaBadge, { backgroundColor: theme.semantic.primary }]}>
                      <Ionicons name="play" size={11} color={theme.colors.onPrimary} />
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={[styles.emptyPanel, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
              <Ionicons name="albums-outline" size={22} color={theme.semantic.primary} />
              <Body style={styles.emptyCopy}>No representative media landed in this week yet.</Body>
            </View>
          )}
        </Card>

        <Card variant="ghost">
          <Eyebrow>Read-only</Eyebrow>
          <Body>
            This digest is assembled from saved moments, firsts, voice notes, and sealed letters. Edit the original Moment or ritual item to change what appears here.
          </Body>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function DigestMetric({ label, value }) {
  return (
    <Card padding="md" style={styles.metricCard}>
      <Title style={styles.metricValue}>{Number(value || 0)}</Title>
      <Caption style={styles.metricLabel}>{label}</Caption>
    </Card>
  );
}

function digestSummary(digest, babyName) {
  const name = babyName || 'your little one';
  const moments = Number(digest.momentCount ?? digest.photoCount ?? 0);
  const milestones = Number(digest.milestoneCount ?? digest.firstsCount ?? 0);
  const voice = Number(digest.voiceNoteCount || 0);
  const letters = Number(digest.letterCount || 0);
  const parts = [];
  if (moments) parts.push(`${moments} saved ${moments === 1 ? 'moment' : 'moments'}`);
  if (milestones) parts.push(`${milestones} ${milestones === 1 ? 'first' : 'firsts'}`);
  if (voice) parts.push(`${voice} voice ${voice === 1 ? 'note' : 'notes'}`);
  if (letters) parts.push(`${letters} sealed ${letters === 1 ? 'letter' : 'letters'}`);
  if (!parts.length) return `A quiet week for ${name}, still kept in one place.`;
  return `For ${name}, this week gathered ${joinParts(parts)}.`;
}

function joinParts(parts) {
  if (parts.length <= 1) return parts[0] || '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

function formatWeek(start, end) {
  if (!start || !end) return 'This week';
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  return `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  topBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 25,
    lineHeight: 30,
    fontStyle: 'italic',
  },
  topSpacer: {
    width: 44,
    height: 44,
  },
  heroTitle: {
    fontSize: 27,
    lineHeight: 33,
    marginVertical: space.sm,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  metricCard: {
    width: '48%',
    flexGrow: 1,
    minWidth: 130,
  },
  metricValue: {
    fontSize: 24,
    lineHeight: 29,
  },
  metricLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
  },
  sectionTitle: {
    fontSize: 21,
    lineHeight: 26,
    marginTop: 2,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.lg,
  },
  mediaTile: {
    width: '48%',
    aspectRatio: 0.86,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  mediaBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPanel: {
    marginTop: space.lg,
    minHeight: 120,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
    gap: space.sm,
  },
  emptyCopy: {
    textAlign: 'center',
  },
});
