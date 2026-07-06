import React, { useMemo, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, Pressable, Dimensions, Alert, FlatList } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';

import { Screen, Button, Hero, Body, Caption, Eyebrow, Spacer, semantic, colors, glass, space, radius } from './ui';
import { Tags } from './storage';
import { useFamily } from './FamilyContext';
import { useAuth } from './AuthContext';
import { embedFace, isNative } from './faceMatcher';
import { addTrustedReferenceImage } from './recognitionReferences';
import { recordCalibrationReview } from './recognitionTrust';
import * as Scan from './scanController';

/**
 * Live review grid.
 *
 *  • Subscribes to scan controller — tiles stream in as the native scan
 *    finds them. Counts come pre-aggregated so we never iterate the
 *    matches array on every render.
 *  • Edge-to-edge photo tiles, density adjustable from 1 → 5 columns
 *    via a pinch gesture (Photos.app style).
 *  • Floating date header that updates with the visible row.
 *  • Filter chips use parent-facing labels while internal thresholds stay
 *    score-based.
 *  • Sticky save bar at the bottom — works at any time, even mid-scan.
 */
export default function ReviewMatchesScreen() {
  const router = useRouter();
  const { family } = useFamily();
  const { user } = useAuth();
  const scan = Scan.useScanState();

  const [filter, setFilter] = useState('all');     // 'all' | 'high' | 'borderline'
  const [columns, setColumns] = useState(3);       // 1 .. 5
  const [topDate, setTopDate] = useState(null);    // creationTime ms of first visible
  const [savingCount, setSavingCount] = useState(0);
  const [savingTotal, setSavingTotal] = useState(0);
  const [savingErrors, setSavingErrors] = useState(0);

  const matches = scan.matches;

  // Filtered list. For 'all' we just hide saved ones; for the others
  // we filter once per (matches reference || filter) change.
  const visibleMatches = useMemo(() => {
    const seen = new Set();
    const out = [];
    const min = filter === 'high' ? 0.75 : 0;
    const max = filter === 'high' ? 1.01 : 0.75;
    for (const match of matches) {
      if (!match || match.saved) continue;
      if (seen.has(match.assetId)) continue;
      if (filter !== 'all') {
        const score = match.score ?? 0;
        if (score < min || score >= max) continue;
      }
      seen.add(match.assetId);
      out.push(match);
    }
    return out;
  }, [matches, filter]);

  const counts = {
    all: scan.matches.length - scan.savedCount,
    high: scan.highCount,
    borderline: scan.borderlineCount,
  };

  const toggle = useCallback((assetId, accepted) => {
    Haptics.selectionAsync();
    Scan.setAccepted(assetId, !accepted);
  }, []);

  const acceptVisible = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const ids = new Set(visibleMatches.map((m) => m.assetId));
    Scan.setAcceptedBulk((m) => ids.has(m.assetId), true);
  };

  const rejectVisible = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const ids = new Set(visibleMatches.map((m) => m.assetId));
    Scan.setAcceptedBulk((m) => ids.has(m.assetId), false);
  };

  const onSave = async () => {
    if (!family) return;
    const accepted = matches.filter((m) => m.accepted && !m.saved);
    const rejected = matches.filter((m) => !m.accepted && !m.saved);
    if (!accepted.length) {
      Alert.alert('Nothing accepted', 'Tap media to accept it first.');
      return;
    }

    setSavingTotal(accepted.length);
    setSavingCount(0);
    setSavingErrors(0);

    // 6-way concurrent worker pool. Image uploads resize twice; video uploads
    // push the original and a poster frame. This saturates WiFi without
    // overloading the CPU during review.
    const queue = [...accepted];
    const savedIds = [];
    let done = 0;
    let errors = 0;
    const concurrency = 6;
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        const m = queue.shift();
        if (!m) return;
        try {
          await Tags.setBaby({
            familyId: family.id,
            assetId: m.assetId,
            isBaby: true,
            match: m,
            videoPosterOnly: m.mediaType === 'video',
          });
          savedIds.push(m.assetId);
        } catch (e) {
          console.warn('save match failed', m.assetId, e?.message);
          errors += 1;
          setSavingErrors(errors);
        }
        done += 1;
        setSavingCount(done);
      }
    });
    await Promise.all(workers);
    Scan.markSaved(savedIds);
    const savedMatches = accepted.filter((match) => savedIds.includes(match.assetId));
    await refreshTrustedReferences({
      family,
      user,
      matches: savedMatches,
    }).catch((err) => console.warn('refreshTrustedReferences', err?.message));
    await recordCalibrationReview({
      familyId: family.id,
      userId: user?.id,
      accepted: savedMatches,
      rejected,
    }).catch((err) => console.warn('recordCalibrationReview', err?.message));

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/timeline');
  };

  // Pinch gesture — snap to integer column count between 1 and 5.
  const baseCols = useRef(columns);
  const pinch = Gesture.Pinch()
    .onBegin(() => { baseCols.current = columns; })
    .onUpdate((e) => {
      // Inverse: pinch out (scale > 1) → fewer columns (bigger tiles)
      const next = Math.round(baseCols.current / e.scale);
      const clamped = Math.max(1, Math.min(5, next));
      if (clamped !== columns) setColumns(clamped);
    })
    .runOnJS(true);

  const TILE = Dimensions.get('window').width / columns;

  // Chunk the flat list into rows. We render rows (not items) through
  // FlatList because it is more reliable than numColumns + getItemLayout
  // for tiled grids in RN 0.83.
  const rows = useMemo(() => {
    const out = [];
    for (let i = 0; i < visibleMatches.length; i += columns) {
      out.push(visibleMatches.slice(i, i + columns));
    }
    return out;
  }, [visibleMatches, columns]);

  // Track the topmost visible row to drive the floating date header.
  // Only re-renders when the *day* changes so fast scroll never thrashes.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 30 }).current;
  const lastDay = useRef(null);

  const onViewableRowsChanged = useRef(({ viewableItems }) => {
    if (!viewableItems.length) return;
    const firstRow = viewableItems[0].item;
    const ms = Array.isArray(firstRow) ? firstRow[0]?.creationTime : null;
    if (!ms) return;
    const day = Math.floor(ms / 86400000);
    if (day === lastDay.current) return;
    lastDay.current = day;
    setTopDate(ms);
  }).current;

  // ─── Render branches ──────────────────────────────────────────────────────

  if (savingTotal > 0) {
    const pct = Math.round((savingCount / savingTotal) * 100);
    return (
      <Screen variant="dawn">
        <View style={styles.center}>
          <Eyebrow align="center">Saving to your shared world</Eyebrow>
          <Spacer h={space.md} />
          <Hero align="center" style={{ fontSize: 56, lineHeight: 60 }}>{pct}%</Hero>
          <Spacer h={space.sm} />
          <Caption align="center">
            {savingCount.toLocaleString()} of {savingTotal.toLocaleString()} saved
            {savingErrors > 0 ? `   ·   ${savingErrors} retry later` : ''}
          </Caption>
          <Spacer h={space.lg} />
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
        </View>
      </Screen>
    );
  }

  if (scan.phase === 'failed') {
    return (
      <Screen variant="warm">
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
          <Spacer h={space.md} />
          <Hero align="center" style={{ fontSize: 24 }}>Scan didn't finish.</Hero>
          <Caption align="center" style={{ color: colors.danger, marginTop: space.sm }}>
            {scan.error}
          </Caption>
          <Spacer h={space.lg} />
          <Button onPress={() => router.replace('/reference')}>Try again</Button>
        </View>
      </Screen>
    );
  }

  if (scan.phase === 'idle' || (matches.length === 0 && scan.phase === 'scanning')) {
    return (
      <Screen variant="warm">
        <View style={styles.center}>
          <Eyebrow align="center">
            {scan.total ? `${scan.seen.toLocaleString()} of ${scan.total.toLocaleString()} media read` : 'Warming up the scanner'}
          </Eyebrow>
          <Spacer h={space.md} />
          <Hero align="center" style={{ fontSize: 28 }}>
            Looking for {family?.babyName || 'them'}…
          </Hero>
          <Spacer h={space.lg} />
          <Caption align="center">
            Sit tight — the first few matches are about to appear.
          </Caption>
        </View>
      </Screen>
    );
  }

  if (matches.length === 0 && (scan.phase === 'done' || scan.phase === 'aborted')) {
    return (
      <Screen variant="warm">
        <View style={styles.center}>
          <Ionicons name="search-outline" size={56} color={colors.plum} />
          <Spacer h={space.md} />
          <Hero align="center" style={{ fontSize: 26 }}>No matches yet.</Hero>
          <Spacer h={space.sm} />
          <Body align="center">
            We didn't find media that looks like the reference. Try a sharper,
            front-facing reference, or skip ahead and tag from the timeline.
          </Body>
          <Spacer h={space.lg} />
          <Button onPress={() => router.replace('/reference')}>
            Pick a different reference
          </Button>
          <Spacer h={space.sm} />
          <Button variant="quiet" onPress={() => router.replace('/timeline')}>
            Skip to timeline
          </Button>
        </View>
      </Screen>
    );
  }

  const scanning = scan.phase === 'scanning';
  const progressPct = scan.total ? Math.min(100, Math.round((scan.seen / scan.total) * 100)) : null;

  return (
    <Screen variant="warm" bare>
      <View style={{ flex: 1 }}>
        <GestureDetector gesture={pinch}>
          <View style={{ flex: 1 }}>
            <FlatList
              key={`cols-${columns}`}
              data={rows}
              keyExtractor={(row, i) => `r${i}-${row[0]?.assetId || 'empty'}`}
              contentContainerStyle={{ paddingBottom: 140 }}
              initialNumToRender={12}
              windowSize={21}
              maxToRenderPerBatch={10}
              updateCellsBatchingPeriod={50}
              viewabilityConfig={viewabilityConfig}
              onViewableItemsChanged={onViewableRowsChanged}
              getItemLayout={(_, idx) => ({ length: TILE, offset: TILE * idx, index: idx })}
              ListHeaderComponent={(
                <View style={{ paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.md }}>
                  <Eyebrow>{family?.babyName || 'Your baby'}</Eyebrow>
                  <Spacer h={space.xs} />
                  <Hero style={{ fontSize: 30, lineHeight: 36 }}>
                    {scanning
                      ? `${matches.length.toLocaleString()} so far${progressPct != null ? ` · ${progressPct}%` : ''}`
                      : `We found ${matches.length.toLocaleString()}.`}
                  </Hero>
                  <Spacer h={space.sm} />
                  <Body>
                    {scanning
                      ? 'Pinch to resize · tap any item that isn’t them to skip it.'
                      : `Pinch to resize · tap any item that isn’t ${family?.babyName || 'them'} to skip it.`}
                  </Body>
                  <Spacer h={space.md} />
                  <View style={styles.chipRow}>
                    <Chip active={filter === 'all'} onPress={() => setFilter('all')}>
                      All · {counts.all.toLocaleString()}
                    </Chip>
                    <Chip active={filter === 'high'} onPress={() => setFilter('high')}>
                      Sure it's {family?.babyName || 'them'} · {counts.high.toLocaleString()}
                    </Chip>
                    <Chip active={filter === 'borderline'} onPress={() => setFilter('borderline')}>
                      Double-check these · {counts.borderline.toLocaleString()}
                    </Chip>
                  </View>
                </View>
              )}
              renderItem={({ item: row }) => (
                <View style={{ flexDirection: 'row', height: TILE }}>
                  {row.map((item) => (
                    <Tile
                      key={item.assetId}
                      item={item}
                      size={TILE}
                      columns={columns}
                      onToggle={toggle}
                    />
                  ))}
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyFilter}>
                  <Caption align="center">No matches in this group yet.</Caption>
                </View>
              }
              ListFooterComponent={
                <ScanFooter scanning={scanning} scan={scan} matchCount={matches.length} />
              }
            />
          </View>
        </GestureDetector>

          {/* Floating date header (Photos.app style) */}
          {topDate ? (
            <View style={styles.dateHeader} pointerEvents="none">
              <Caption style={styles.dateHeaderText}>{formatHeaderDate(topDate)}</Caption>
            </View>
          ) : null}

          {/* Sticky bottom action bar */}
          <View style={styles.actionBar}>
            <View style={styles.barInner}>
              <View style={styles.barLeft}>
                <Caption>{scan.acceptedCount.toLocaleString()} of {(scan.matches.length - scan.savedCount).toLocaleString()} selected</Caption>
                <View style={{ flexDirection: 'row', gap: space.sm, marginTop: 4 }}>
                  <Pressable onPress={rejectVisible} hitSlop={8}>
                    <Caption style={{ color: colors.plum, fontWeight: '600' }}>
                      Skip {filter === 'all' ? 'all' : 'these'}
                    </Caption>
                  </Pressable>
                  <Caption style={{ color: colors.whisper }}>·</Caption>
                  <Pressable onPress={acceptVisible} hitSlop={8}>
                    <Caption style={{ color: colors.coral, fontWeight: '600' }}>
                      Accept {filter === 'all' ? 'all' : 'these'}
                    </Caption>
                  </Pressable>
                </View>
              </View>
              <View style={styles.barRight}>
                <Button onPress={onSave} disabled={scan.acceptedCount === 0}>
                  Save {scan.acceptedCount.toLocaleString()}
                </Button>
              </View>
            </View>
          </View>
      </View>
    </Screen>
  );
}

async function refreshTrustedReferences({ family, user, matches }) {
  if (!isNative || !family?.id || !user?.id || !matches?.length) return;
  const usedAgeBuckets = new Set();
  const candidates = matches
    .filter((match) => Number(match.score || 0) >= 0.82 && match.faceCount > 0 && (match.localUri || match.uri))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  let added = 0;
  for (const match of candidates) {
    const ageBucket = match.creationTime && family.babyBirthday
      ? Math.floor((new Date(match.creationTime).getTime() - new Date(`${family.babyBirthday}T00:00:00`).getTime()) / (30 * 86400000))
      : added;
    if (usedAgeBuckets.has(ageBucket)) continue;
    usedAgeBuckets.add(ageBucket);
    const embedding = await embedFace(match.localUri || match.uri);
    if (!embedding?.embedding?.length) continue;
    await addTrustedReferenceImage({
      familyId: family.id,
      userId: user.id,
      birthdayISO: family.babyBirthday,
      match,
      embedding: embedding.embedding,
      faceCount: embedding.faceCount || match.faceCount || 1,
    });
    added += 1;
    if (added >= 3) return;
  }
}

function ScanFooter({ scanning, scan, matchCount }) {
  const pct = scan.total ? Math.min(100, Math.round((scan.seen / scan.total) * 100)) : null;
  return (
    <View style={styles.footer}>
      {scanning ? (
        <>
          <View style={styles.shimmerDot} />
          <Spacer h={space.sm} />
          <Caption align="center">
            Scanning more… {scan.seen.toLocaleString()}
            {scan.total ? ` of ${scan.total.toLocaleString()}` : ''}
            {pct != null ? `  ·  ${pct}%` : ''}
          </Caption>
          <Spacer h={space.xs} />
          <Caption align="center" style={{ color: colors.whisper }}>
            You can keep scrolling, accept what you see, or come back later.
          </Caption>
          {pct != null ? (
            <View style={[styles.progressTrack, { marginTop: space.md, alignSelf: 'center' }]}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
            </View>
          ) : null}
        </>
      ) : (
        <Caption align="center" style={{ color: colors.whisper }}>
          {matchCount.toLocaleString()} matches · scan complete
        </Caption>
      )}
      <View style={{ height: 60 /* clears action bar */ }} />
    </View>
  );
}

function Chip({ active, onPress, children }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Caption style={[styles.chipText, active && styles.chipTextActive]}>{children}</Caption>
    </Pressable>
  );
}

const Tile = React.memo(function Tile({ item, size, columns, onToggle }) {
  // Tiny separator so tiles aren't fully glued together — Photos.app uses ~1px.
  const inner = columns >= 4 ? 1 : columns === 3 ? 2 : columns === 2 ? 3 : 0;
  return (
    <Pressable
      onPress={() => onToggle(item.assetId, item.accepted)}
      style={{ width: size, height: size, padding: inner / 2 }}
    >
      <View style={styles.tile}>
        <Image
          source={{ uri: item.uri }}
          style={styles.thumb}
          contentFit="cover"
          transition={120}
          cachePolicy="memory-disk"
          recyclingKey={item.assetId}
        />
        {item.mediaType === 'video' ? (
          <View style={styles.videoBadge}>
            <Ionicons name="play" size={columns >= 4 ? 9 : 11} color={colors.onPrimary} />
          </View>
        ) : null}
        {!item.accepted ? (
          <>
            <View style={styles.dim} />
            <View style={[styles.statusDot, styles.dotRejected, columns >= 4 && styles.statusDotSmall]}>
              <Ionicons name="close" size={columns >= 4 ? 10 : 14} color={colors.onPrimary} />
            </View>
          </>
        ) : columns <= 4 ? (
          <View style={[styles.statusDot, styles.dotAccepted, columns >= 4 && styles.statusDotSmall]}>
            <Ionicons name="heart" size={columns >= 4 ? 10 : 12} color={colors.onPrimary} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}, (prev, next) =>
  prev.item === next.item &&
  prev.size === next.size &&
  prev.columns === next.columns &&
  prev.onToggle === next.onToggle,
);

function formatHeaderDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  if (d.getFullYear() !== now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  emptyFilter: {
    paddingTop: space.xxl,
    alignItems: 'center',
  },
  footer: {
    paddingTop: space.xl,
    paddingBottom: space.lg,
    alignItems: 'center',
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: semantic.cardAlt,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: colors.coral,
    borderColor: colors.coral,
  },
  chipText: {
    color: colors.plum,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.onPrimary,
  },

  tile: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: semantic.cardAlt,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: glass.photoDim,
  },
  statusDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: glass.photoBackdrop,
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
  },
  statusDotSmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
    top: 3,
    right: 3,
  },
  dotAccepted: {
    backgroundColor: colors.coral,
  },
  dotRejected: {
    backgroundColor: glass.inkScrim,
  },
  videoBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.inkScrim,
  },

  shimmerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.coral,
    opacity: 0.7,
  },

  dateHeader: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    paddingHorizontal: space.md,
    paddingVertical: 6,
    backgroundColor: glass.inkScrimStrong,
    borderRadius: radius.pill,
  },
  dateHeaderText: {
    color: colors.onPrimary,
    fontWeight: '600',
    fontSize: 12,
    letterSpacing: 0,
  },

  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xl,
    backgroundColor: glass.floatingPanel,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.border,
  },
  barInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  barLeft: {
    flex: 1,
  },
  barRight: {
    minWidth: 130,
  },

  progressTrack: {
    width: 220,
    height: 6,
    borderRadius: 3,
    backgroundColor: glass.inkHairline,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.coral,
  },
});
