import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { getMediaDatabase } from './mediaDb';
import {
  NIGHTLY_QUEUE_IDENTITY_FLOOR,
  NIGHTLY_QUEUE_QUALITY_FLOOR,
} from './nightlyQueueModel';
import {
  buildPhysicalDiscoveryQaCandidates,
  emptyPhysicalDiscoveryQaCounts,
  physicalDiscoveryQaSummary,
  recordPhysicalDiscoveryQaClassification,
} from './physicalDiscoveryQaModel';
import { Body, Button, Caption, Eyebrow, Screen, Title, radius, space, useTheme } from './ui';

export default function PhysicalDiscoveryQaScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const theme = useTheme();
  const { family } = useFamily();
  const { user } = useAuth();
  const [candidates, setCandidates] = useState([]);
  const [position, setPosition] = useState(0);
  const [counts, setCounts] = useState(emptyPhysicalDiscoveryQaCounts);
  const topAnalyzedCohort = String(Array.isArray(params.cohort) ? params.cohort[0] : params.cohort || '') === 'top-analyzed';

  useFocusEffect(useCallback(() => {
    if (!family?.id || !user?.id) {
      setCandidates([]);
      return undefined;
    }
    const qualityClause = topAnalyzedCohort
      ? ''
      : 'and identity_score >= ? and capture_quality >= ?';
    const rows = getMediaDatabase().getAllSync(
      `select media_type, local_uri, preview_uri
       from discovery_candidates
       where family_id = ? and user_id = ? and availability = 'available'
         ${qualityClause}
         and (representative_asset_id is null or representative_asset_id = asset_id)
       order by identity_score desc, capture_quality desc, capture_time_ms desc
       limit 60`,
      topAnalyzedCohort
        ? [family.id, user.id]
        : [family.id, user.id, NIGHTLY_QUEUE_IDENTITY_FLOOR, NIGHTLY_QUEUE_QUALITY_FLOOR],
    );
    setCandidates(buildPhysicalDiscoveryQaCandidates(rows));
    setPosition(0);
    setCounts(emptyPhysicalDiscoveryQaCounts());
    return undefined;
  }, [family?.id, topAnalyzedCohort, user?.id]));

  const active = candidates[position] || null;
  const summary = useMemo(() => physicalDiscoveryQaSummary(counts), [counts]);
  const classify = (category) => {
    if (!active) return;
    setCounts((current) => recordPhysicalDiscoveryQaClassification(current, category));
    setPosition((current) => current + 1);
  };

  return (
    <Screen scroll={false} safe style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close physical discovery review">
            <Caption style={{ color: theme.semantic.primary, fontWeight: '800' }}>Close</Caption>
          </Pressable>
          <Pressable
            onPress={() => router.replace({ pathname: '/scan', params: { source: 'physical-qa' } })}
            accessibilityRole="button"
            accessibilityLabel="Run private discovery cancellation check"
          >
            <Caption style={{ color: theme.semantic.primary, fontWeight: '800' }}>Test scan</Caption>
          </Pressable>
        </View>
        <View style={styles.headerCopy}>
          <Eyebrow>{topAnalyzedCohort ? 'Top analyzed QA' : 'Default-lane QA'}</Eyebrow>
          <Caption>{Math.min(position + (active ? 1 : 0), candidates.length)} of {candidates.length}</Caption>
        </View>
      </View>

      {active ? (
        <>
          <View style={[styles.media, { backgroundColor: theme.semantic.cardAlt }]}>
            <Image
              source={{ uri: active.mediaUri }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              cachePolicy="memory"
              accessibilityLabel="Private discovery candidate"
            />
            {active.mediaType === 'video' ? (
              <View style={styles.videoBadge}><Caption style={styles.videoText}>Video preview</Caption></View>
            ) : null}
          </View>
          <View style={styles.actions}>
            <Button onPress={() => classify('useful')}>Useful child moment</Button>
            <View style={styles.secondaryRow}>
              <Button variant="quiet" fullWidth={false} onPress={() => classify('adultOnly')}>Adult only</Button>
              <Button variant="quiet" fullWidth={false} onPress={() => classify('duplicate')}>Duplicate</Button>
              <Button variant="quiet" fullWidth={false} onPress={() => classify('weak')}>Weak</Button>
            </View>
          </View>
        </>
      ) : (
        <View style={[styles.done, { backgroundColor: theme.semantic.cardAlt }]}>
          <Eyebrow>Aggregate only</Eyebrow>
          <Title>{summary.total ? `${summary.total} reviewed privately.` : 'No qualifying candidates yet.'}</Title>
          <Body>
            Useful {counts.useful} · adult only {counts.adultOnly} · duplicates {counts.duplicate} · weak {counts.weak}
          </Body>
          <Caption>No photo, identifier, path, face, or classification record leaves this screen.</Caption>
          <Button variant="quiet" onPress={() => router.back()}>Close review</Button>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  header: {
    minHeight: 64,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCopy: { alignItems: 'flex-end' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  media: { flex: 1, minHeight: 360, width: '100%', overflow: 'hidden' },
  videoBadge: {
    position: 'absolute',
    top: space.md,
    right: space.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(20,14,13,0.72)',
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  videoText: { color: '#fff', fontWeight: '800' },
  actions: { padding: space.lg, gap: space.sm },
  secondaryRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: space.xs },
  done: { margin: space.lg, borderRadius: radius.xl, padding: space.xl, gap: space.md },
});
