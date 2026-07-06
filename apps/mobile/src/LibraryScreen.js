import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  AppShell,
  AnimatedPressable,
  Body,
  Button,
  Caption,
  Card,
  Eyebrow,
  PhotoPlaceholder,
  SegmentedContent,
  SegmentedControl,
  Title,
  glass,
  radius,
  space,
  useTheme,
} from './ui';
import { useFamily } from './FamilyContext';
import { useAuth } from './AuthContext';
import { createPhotoBookExport } from './archiveExport';
import { ageAt, ensureLibraryPermission, fetchPhotosPage, formatAge } from './photos';
import { Tags } from './storage';
import { backfillPendingForOwner, deleteForTag, getUploadQueueStatus, listSharedTagged } from './photoSync';
import { listMomentArchive } from './moments';
import { countLabel } from './plural';
import { dismissRecentAutoSave, getRecentAutoSaves, recordNegativeExample } from './recognitionTrust';
import PhotoActionSheet from './PhotoActionSheet';
import { buildPlaceClusters } from './visionSceneLabeler';
import { describeMediaLibraryChange, useMediaLibraryChangeObserver } from './mediaLibraryChanges';
import { useICloudRetryCount } from './iCloudRetryQueue';
import { formatTagLabel } from './tagModel';

export default function LibraryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const theme = useTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const { family } = useFamily();
  const { user } = useAuth();
  const [segment, setSegment] = useState(() => normalizeLibrarySegment(params.segment) || 'photos');
  const [shared, setShared] = useState([]);
  const [moments, setMoments] = useState([]);
  const [recentAutoSaves, setRecentAutoSaves] = useState([]);
  const [local, setLocal] = useState([]);
  const [tags, setTags] = useState({});
  const [cursor, setCursor] = useState(undefined);
  const [hasNext, setHasNext] = useState(true);
  const [loading, setLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [actionPhoto, setActionPhoto] = useState(null);
  const [query, setQuery] = useState('');
  const [archiveFilter, setArchiveFilter] = useState('all');
  const [exportFile, setExportFile] = useState(null);
  const [buildingExport, setBuildingExport] = useState(false);
  const [uploadQueue, setUploadQueue] = useState({ total: 0, pending: 0, uploading: 0, failed: 0, lastError: null });
  const [repairingUploads, setRepairingUploads] = useState(false);
  const [showLocalPhotos, setShowLocalPhotos] = useState(false);
  const { pendingChange } = useMediaLibraryChangeObserver({
    familyId: family?.id,
    userId: user?.id,
    enabled: !!family?.id && !!user?.id,
  });
  const iCloudRetry = useICloudRetryCount({
    familyId: family?.id,
    userId: user?.id,
    refreshKey: `${pendingChange?.changedAt || ''}:${uploadQueue.total}`,
  });

  useEffect(() => {
    const next = normalizeLibrarySegment(params.segment);
    if (next && next !== segment) setSegment(next);
  }, [params.segment, segment]);

  const loadShared = useCallback(async () => {
    if (!family?.id) return;
    const [sharedRows, tagRows, momentRows, recentRows, uploadStatus] = await Promise.all([
      listSharedTagged(family.id, { limit: 90 }).catch(() => []),
      Tags.all(family.id).catch(() => ({})),
      listMomentArchive(family.id, { limit: 500 }).catch(() => []),
      user?.id ? getRecentAutoSaves({ familyId: family.id, userId: user.id }).catch(() => []) : [],
      getUploadQueueStatus({ familyId: family.id }).catch(() => ({ total: 0, pending: 0, uploading: 0, failed: 0, lastError: null })),
    ]);
    setShared(sharedRows);
    setMoments(momentRows);
    setTags(tagRows);
    setRecentAutoSaves(recentRows);
    setUploadQueue(uploadStatus);
  }, [family?.id, user?.id]);

  const loadLocalInitial = useCallback(async () => {
    if (!family?.id) return;
    setLoading(true);
    try {
      const perm = await ensureLibraryPermission();
      if (!perm.granted) {
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);
      const page = await fetchPhotosPage({});
      setLocal(page.assets);
      setCursor(page.endCursor);
      setHasNext(page.hasNextPage);
    } catch (err) {
      Alert.alert('Could not load library', err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [family?.id]);

  useFocusEffect(useCallback(() => { loadShared(); }, [loadShared]));

  useEffect(() => {
    if (segment === 'photos' && showLocalPhotos && local.length === 0) loadLocalInitial();
  }, [loadLocalInitial, local.length, segment, showLocalPhotos]);

  const loadMore = async () => {
    if (loading || !hasNext) return;
    setLoading(true);
    try {
      const page = await fetchPhotosPage({ after: cursor });
      setLocal((prev) => [...prev, ...page.assets]);
      setCursor(page.endCursor);
      setHasNext(page.hasNextPage);
    } finally {
      setLoading(false);
    }
  };

  const openLocal = (photo) => {
    const params = { assetId: photo.id, uri: photo.uri };
    if (photo.creationTime != null) params.creationTime = String(photo.creationTime);
    router.push({ pathname: '/photo/[assetId]', params });
  };

  const places = useMemo(
    () => buildPlaceClusters({ shared, metadataByKey: {}, memoriesByKey: {} }),
    [shared],
  );
  const archiveRecords = useMemo(() => buildArchiveRecords({ moments, shared }), [moments, shared]);
  const archiveStats = useMemo(() => buildArchiveStats(archiveRecords), [archiveRecords]);
  const archiveSections = useMemo(
    () => buildArchiveMonthSections({ records: archiveRecords, babyBirthday: family?.babyBirthday }),
    [archiveRecords, family?.babyBirthday],
  );
  const yearSummaries = useMemo(() => buildYearSummaries(archiveRecords), [archiveRecords]);
  const recentAutoSaveRows = useMemo(
    () => hydrateRecentAutoSaves({ recent: recentAutoSaves, shared, moments, currentUserId: user?.id }),
    [moments, recentAutoSaves, shared, user?.id],
  );
  const searchResults = useMemo(
    () => filterArchiveRecords({ records: archiveRecords, query, filter: archiveFilter }),
    [archiveFilter, archiveRecords, query],
  );
  const libraryTileSize = useMemo(() => libraryTileSizeForWidth(viewportWidth), [viewportWidth]);

  const openShared = (photo) => {
    if (photo.moment_id) {
      router.push({ pathname: '/moment/[momentId]', params: { momentId: photo.moment_id } });
      return;
    }
    const params = { assetId: photo.asset_id };
    if (photo.asset_owner_user_id) params.ownerUserId = photo.asset_owner_user_id;
    const previewUri = photo.thumbUrl || photo.fullUrl;
    if (previewUri) params.uri = previewUri;
    if (photo.creation_time) params.creationTime = String(new Date(photo.creation_time).getTime());
    router.push({ pathname: '/photo/[assetId]', params });
  };

  const openMoment = (moment) => {
    if (!moment?.id) return;
    router.push({ pathname: '/moment/[momentId]', params: { momentId: moment.id } });
  };

  const openArchiveRecord = (record) => {
    if (record?.moment) openMoment(record.moment);
    else if (record?.photo) openShared(record.photo);
  };

  const removeShared = async () => {
    if (!family?.id || !actionPhoto) return;
    const photo = actionPhoto;
    setActionPhoto(null);
    try {
      await deleteForTag({
        familyId: family.id,
        assetOwnerUserId: photo.asset_owner_user_id,
        assetId: photo.asset_id,
      });
      loadShared();
    } catch (err) {
      Alert.alert('Could not remove', err?.message || String(err));
    }
  };

  const removeRecentAutoSave = async (row) => {
    if (!family?.id || !user?.id || !row?.assetId) return;
    try {
      await deleteForTag({
        familyId: family.id,
        assetOwnerUserId: row.assetOwnerUserId || user.id,
        assetId: row.assetId,
      });
      await recordNegativeExample({
        familyId: family.id,
        userId: user.id,
        match: {
          assetId: row.assetId,
          score: row.score,
          faceCount: row.faceCount,
          creationTime: row.creationTime,
        },
      });
      const next = await dismissRecentAutoSave({
        familyId: family.id,
        userId: user.id,
        assetId: row.assetId,
      });
      setRecentAutoSaves(next);
      setShared((prev) => prev.filter((item) => item.asset_id !== row.assetId));
      setMoments((prev) => prev.filter((moment) => moment.id !== row.momentId));
      Alert.alert('Removed from auto-save', 'Future scans will treat this as a correction.');
    } catch (err) {
      Alert.alert('Could not remove auto-save', err?.message || String(err));
    }
  };

  const photoSheetActions = actionPhoto ? [
    {
      icon: 'open-outline',
      label: 'Open moment',
      onPress: () => {
        const photo = actionPhoto;
        setActionPhoto(null);
        openShared(photo);
      },
    },
    {
      icon: 'trash-outline',
      label: 'Remove from timeline',
      destructive: true,
      onPress: removeShared,
    },
  ] : [];

  const shareArchiveSummary = async () => {
    try {
      await Share.share({
        title: 'Our Little World archive summary',
        message: buildExportMessage({
          family,
          stats: archiveStats,
          years: yearSummaries,
        }),
      });
    } catch (err) {
      Alert.alert('Could not open export sheet', err?.message || String(err));
    }
  };

  const repairUploadQueue = async () => {
    if (!family?.id || repairingUploads) return;
    setRepairingUploads(true);
    try {
      const result = await backfillPendingForOwner({ familyId: family.id });
      await loadShared();
      Alert.alert(
        'Upload repair finished',
        `${result.uploaded} repaired · ${result.skipped} still need attention`,
      );
    } catch (err) {
      Alert.alert('Could not repair uploads', err?.message || String(err));
    } finally {
      setRepairingUploads(false);
    }
  };

  const buildPhotoBookFile = async () => {
    setBuildingExport(true);
    try {
      const file = await createPhotoBookExport({
        family,
        stats: archiveStats,
        years: yearSummaries,
      });
      setExportFile(file);
      await Share.share({
        title: file.title,
        url: file.uri,
        message: `${file.title}\n${file.uri}`,
      });
      if (file.fallback) {
        Alert.alert('Built HTML preview', 'PDF rendering was not available, so the app shared the print-ready HTML file instead.');
      }
    } catch (err) {
      Alert.alert('Could not build photo book file', err?.message || String(err));
    } finally {
      setBuildingExport(false);
    }
  };

  return (
    <AppShell
      active="library"
      title={`${possessiveName(family?.babyName || 'Baby')} photos.`}
      subtitle={archiveMediaSubtitle(archiveStats)}
    >
      <SegmentedControl
        value={segment}
        onChange={setSegment}
        options={[
          { value: 'photos', label: 'Photos' },
          { value: 'places', label: 'Places' },
          { value: 'search', label: 'Search' },
          { value: 'export', label: 'Export' },
        ]}
      />

      <SegmentedContent segmentKey={segment}>
        {segment === 'photos' ? (
          <>
            <LibraryChangePanel
              change={pendingChange}
              onScan={() => router.push('/scan')}
              theme={theme}
            />
            <ICloudWaitPanel queue={iCloudRetry} onScan={() => router.push('/scan')} theme={theme} />
            <UploadQueuePanel status={uploadQueue} repairing={repairingUploads} onRepair={repairUploadQueue} theme={theme} />
            <RecentAutoSavedPanel rows={recentAutoSaveRows} onRemove={removeRecentAutoSave} onOpen={openMoment} theme={theme} />
            <LocalCameraRollPanel
              visible={showLocalPhotos}
              onShow={() => {
                setShowLocalPhotos(true);
                if (!local.length) loadLocalInitial();
              }}
              local={local}
              loading={loading}
              hasNext={hasNext}
              permissionDenied={permissionDenied}
              tags={tags}
              userId={user?.id}
              childName={family?.babyName}
              babyBirthday={family?.babyBirthday}
              onGrant={loadLocalInitial}
              onLoadMore={loadMore}
              onOpen={openLocal}
              tileSize={libraryTileSize}
              theme={theme}
            />
            <SavedMomentGrid
              childName={family?.babyName}
              sections={archiveSections}
              stats={archiveStats}
              onPress={openArchiveRecord}
              tileSize={libraryTileSize}
              theme={theme}
            />
            {!archiveRecords.length ? <ArchiveEmptyState onAdd={() => router.push('/add')} theme={theme} /> : null}
          </>
        ) : segment === 'places' ? (
          <View style={styles.placeList}>
            {places.length ? places.map((place) => (
              <Card key={place.id} padding="md" style={styles.placeRow}>
                <View style={styles.placeText}>
                  <Eyebrow>{place.label}</Eyebrow>
                  <Title style={styles.placeTitle}>{countText(place.photos.length, 'saved moment')}</Title>
                  <Caption>{place.topScenes.slice(0, 3).join(' · ') || 'Family outing'}</Caption>
                </View>
                <View style={styles.placeThumbRow}>
                  {place.photos.slice(0, 3).map((photo) => (
                    <Pressable
                      key={`${photo.asset_owner_user_id}:${photo.asset_id}`}
                      onPress={() => openShared(photo)}
                      onLongPress={() => setActionPhoto(photo)}
                      delayLongPress={220}
                      accessibilityRole="button"
                      accessibilityLabel={`Open moment from ${place.label}`}
                      accessibilityHint="Long press for more actions."
                      style={styles.placeThumb}
                    >
                      {photo.thumbUrl || photo.fullUrl ? (
                        <Image source={{ uri: photo.thumbUrl || photo.fullUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                      ) : (
                        <PhotoPlaceholder style={StyleSheet.absoluteFill} />
                      )}
                    </Pressable>
                  ))}
                </View>
              </Card>
            )) : (
              <Card>
                <Eyebrow>Places</Eyebrow>
                <Title style={styles.cardTitle}>No mapped moments yet.</Title>
                <Body>Photos with location metadata will collect here as the archive grows.</Body>
              </Card>
            )}
          </View>
        ) : (
          segment === 'search' ? (
            <SearchPanel
              query={query}
              onQueryChange={setQuery}
              filter={archiveFilter}
              onFilterChange={setArchiveFilter}
              results={searchResults}
              stats={archiveStats}
              onOpen={openArchiveRecord}
              theme={theme}
            />
          ) : (
            <ExportPanel
              stats={archiveStats}
              years={yearSummaries}
              onShare={shareArchiveSummary}
              onBuildFile={buildPhotoBookFile}
              buildingFile={buildingExport}
              exportFile={exportFile}
              onOpen={openArchiveRecord}
              theme={theme}
            />
          )
        )}
      </SegmentedContent>
      <PhotoActionSheet
        photo={actionPhoto}
        visible={!!actionPhoto}
        onClose={() => setActionPhoto(null)}
        actions={photoSheetActions}
        subtitle={actionPhoto ? 'What should happen with this saved moment?' : undefined}
      />
    </AppShell>
  );
}

function normalizeLibrarySegment(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return ['photos', 'places', 'search', 'export'].includes(raw) ? raw : null;
}

function libraryTileSizeForWidth(width) {
  const viewportWidth = Number(width || 0);
  const columns = viewportWidth >= 600 ? 4 : 3;
  const contentWidth = Math.max(220, viewportWidth - (space.xl * 4));
  const boundedWidth = Math.min(contentWidth, 640);
  return Math.max(68, Math.floor((boundedWidth - (space.xs * (columns - 1))) / columns));
}

function SavedMomentGrid({ childName, sections, stats, onPress, tileSize, theme }) {
  if (!sections.length) return null;
  return (
    <Card>
      <View style={styles.sectionHeader}>
        <View>
          <Eyebrow>{possessiveName(childName || 'Baby')} photos</Eyebrow>
          <Title style={styles.cardTitle}>Month by month.</Title>
        </View>
        <Caption>{archiveStatsCaption(stats)}</Caption>
      </View>
      {sections.map((section, index) => (
        <View
          key={section.key}
          style={[
            styles.archiveMonthSection,
            index ? [styles.archiveMonthDivider, { borderTopColor: theme.semantic.border }] : null,
          ]}
        >
          <View style={styles.archiveMonthHeader}>
            <View style={styles.resultText}>
              <Title style={styles.archiveMonthTitle}>{section.title}</Title>
              {section.ageLabel ? <Caption>{section.ageLabel}</Caption> : null}
            </View>
            <Caption>{section.summary}</Caption>
          </View>
          <View style={styles.savedGrid}>
            {section.records.map((record) => (
              <ArchiveRecordTile
                key={record.key}
                record={record}
                onPress={() => onPress(record)}
                tileSize={tileSize}
                theme={theme}
              />
            ))}
          </View>
        </View>
      ))}
    </Card>
  );
}

function ArchiveRecordTile({ record, onPress, tileSize, theme }) {
  const media = record.moment?.media || [];
  const firstMedia = media[0];
  const hasVoiceOnly = record.voiceOnly;
  const groupedMediaCount = Math.max(0, (record.imageCount || 0) + (record.videoCount || 0));
  const thumbUri = firstMedia?.thumbUrl || firstMedia?.fullUrl || record.thumbUrl;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open archive photo: ${record.title || 'Untitled moment'}`}
      style={[
        styles.savedTile,
        { width: tileSize, height: tileSize, backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border },
      ]}
    >
      {firstMedia?.media_type === 'video' ? (
        <VideoArchiveTile media={firstMedia} theme={theme} />
      ) : thumbUri ? (
        <PhotoPlaceholder
          source={{ uri: thumbUri }}
          seed={record.key}
          radius={radius.sm}
          style={StyleSheet.absoluteFill}
        />
      ) : hasVoiceOnly ? (
        <View style={styles.voiceOnlyTile}>
          <Ionicons name="mic" size={26} color={theme.semantic.primary} />
          <Caption style={[styles.voiceOnlyLabel, { color: theme.semantic.textMuted }]}>Voice</Caption>
          <Caption style={[styles.voiceOnlyTitle, { color: theme.semantic.text }]} numberOfLines={1}>
            {record.title || 'Untitled moment'}
          </Caption>
        </View>
      ) : (
        <PhotoPlaceholder seed={record.key} radius={radius.sm} style={StyleSheet.absoluteFill} />
      )}
      {groupedMediaCount > 1 ? (
        <View style={styles.savedCountBadge}>
          <Caption style={styles.savedCountText}>+{groupedMediaCount - 1}</Caption>
        </View>
      ) : null}
      {record.title && !hasVoiceOnly ? (
        <Caption style={[styles.savedCaption, { color: theme.colors.onPrimary }]} numberOfLines={1}>
          {record.title}
        </Caption>
      ) : null}
    </Pressable>
  );
}

function ArchiveEmptyState({ onAdd, theme }) {
  return (
    <Card variant="muted">
      <View style={styles.sectionHeader}>
        <View style={styles.resultText}>
          <Eyebrow>Saved archive</Eyebrow>
          <Title style={styles.cardTitle}>No saved moments yet.</Title>
          <Body>Use Add or automatic discovery to start the archive that will become the book.</Body>
        </View>
        <Ionicons name="book-outline" size={22} color={theme.semantic.primary} />
      </View>
      <Button
        size="md"
        fullWidth={false}
        style={styles.cardButton}
        onPress={onAdd}
        icon={<Ionicons name="add" size={16} color={theme.colors.onPrimary} />}
      >
        Add first moment
      </Button>
    </Card>
  );
}

function LocalCameraRollPanel({
  visible,
  onShow,
  local,
  loading,
  hasNext,
  permissionDenied,
  tags,
  userId,
  childName,
  babyBirthday,
  onGrant,
  onLoadMore,
  onOpen,
  tileSize,
  theme,
}) {
  if (!visible) {
    return (
      <AnimatedPressable
        onPress={onShow}
        accessibilityRole="button"
        accessibilityLabel="Browse camera roll"
        accessibilityHint="Shows this device's local camera roll."
      >
        <Card variant="ghost">
          <View style={styles.sectionHeader}>
            <View style={styles.resultText}>
              <Eyebrow>Device camera roll</Eyebrow>
              <Title style={styles.cardTitle}>Browse this device when you need one.</Title>
              <Body>{possessiveName(childName || 'Baby')} archive stays in the month-by-month grid.</Body>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.semantic.textMuted} />
          </View>
        </Card>
      </AnimatedPressable>
    );
  }

  return (
    <>
      {permissionDenied ? (
        <Card>
          <Eyebrow>Photo library</Eyebrow>
          <Title style={styles.cardTitle}>Access is needed to browse.</Title>
          <Body>Allow photo access to tag local moments for the family archive.</Body>
          <Button style={styles.cardButton} onPress={onGrant}>Grant access</Button>
        </Card>
      ) : null}
      <View style={styles.grid}>
        {local.map((photo) => {
          const tagged = !!(userId && tags[Tags.key(photo.id, userId)]);
          const age = babyBirthday ? formatAge(ageAt(babyBirthday, photo.creationTime)) : '';
          return (
            <Pressable
              key={photo.id}
              style={[
                styles.tile,
                { width: tileSize, height: tileSize, backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border },
              ]}
              onPress={() => onOpen(photo)}
              accessibilityRole="button"
              accessibilityLabel={`Open local photo${age ? ` from ${age}` : ''}`}
            >
              <PhotoPlaceholder source={{ uri: photo.uri }} seed={photo.id} radius={radius.sm} style={StyleSheet.absoluteFill} />
              {tagged ? (
                <View style={[styles.tagBadge, { backgroundColor: theme.semantic.primary }]}>
                  <Ionicons name="heart" size={12} color={theme.colors.onPrimary} />
                </View>
              ) : null}
              {age ? <Caption style={[styles.ageLabel, { color: theme.colors.onPrimary }]}>{age}</Caption> : null}
            </Pressable>
          );
        })}
      </View>
      {loading ? <ActivityIndicator color={theme.semantic.primary} /> : null}
      {hasNext && local.length ? (
        <Button variant="ghost" onPress={onLoadMore} loading={loading}>Load more</Button>
      ) : null}
      {!loading && !local.length && !permissionDenied ? (
        <Card variant="ghost">
          <Body>No local photos found.</Body>
        </Card>
      ) : null}
    </>
  );
}

function RecentAutoSavedPanel({ rows, onRemove, onOpen, theme }) {
  if (!rows.length) return null;
  return (
    <Card>
      <View style={styles.sectionHeader}>
        <View>
          <Eyebrow>Added by the assistant</Eyebrow>
          <Title style={styles.cardTitle}>Recently added photos.</Title>
        </View>
        <Caption>{rows.length} recent</Caption>
      </View>
      <View style={styles.recentAutoList}>
        {rows.slice(0, 6).map((row) => (
          <View key={row.assetId} style={[styles.recentAutoRow, { borderColor: theme.semantic.border }]}>
            <Pressable
              onPress={() => row.moment ? onOpen(row.moment) : null}
              disabled={!row.moment}
              accessibilityRole="button"
              accessibilityLabel={`Open auto-saved moment: ${row.title}`}
              accessibilityState={{ disabled: !row.moment }}
              style={[styles.recentAutoThumb, { backgroundColor: theme.semantic.cardAlt }]}
            >
              {row.thumbUrl ? (
                <Image source={{ uri: row.thumbUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <Ionicons name="image-outline" size={22} color={theme.semantic.primary} />
              )}
            </Pressable>
            <View style={styles.resultText}>
              <Body style={styles.resultTitle} numberOfLines={1}>{row.title}</Body>
              <Caption numberOfLines={1}>
                Assistant added · {formatDateLabel(row.savedAt || row.creationTime)}
              </Caption>
            </View>
            <Pressable
              onPress={() => onRemove(row)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${row.title} from recently added photos`}
              style={[styles.removeAutoButton, { backgroundColor: theme.semantic.cardAlt }]}
            >
              <Ionicons name="remove-circle-outline" size={18} color={theme.colors.danger || theme.semantic.primary} />
            </Pressable>
          </View>
        ))}
      </View>
      <Caption style={styles.searchMeta}>
        Remove anything that does not belong; future scans learn from it.
      </Caption>
    </Card>
  );
}

function UploadQueuePanel({ status, repairing, onRepair, theme }) {
  if (!status?.total) return null;
  const failed = status.failed || 0;
  const uploading = status.uploading || 0;
  const pending = status.pending || 0;
  return (
    <Card variant="muted">
      <View style={styles.sectionHeader}>
        <View>
          <Eyebrow>Upload repair</Eyebrow>
          <Title style={styles.cardTitle}>{status.total} moment {status.total === 1 ? 'needs' : 'need'} attention</Title>
        </View>
        <Ionicons name="cloud-upload-outline" size={22} color={theme.semantic.primary} />
      </View>
      <Body>
        {failed ? `${failed} failed` : 'No failed uploads'} · {uploading} uploading · {pending} waiting.
      </Body>
      {status.lastError ? <Caption numberOfLines={2}>{status.lastError}</Caption> : null}
      <Button
        size="md"
        fullWidth={false}
        style={styles.cardButton}
        onPress={onRepair}
        loading={repairing}
        icon={<Ionicons name="refresh" size={16} color={theme.colors.onPrimary} />}
      >
        Retry uploads
      </Button>
    </Card>
  );
}

function ICloudWaitPanel({ queue, onScan, theme }) {
  const count = queue?.count || 0;
  if (!count) return null;
  return (
    <Card variant="muted">
      <View style={styles.sectionHeader}>
        <View style={styles.resultText}>
          <Eyebrow>iCloud originals</Eyebrow>
          <Title style={styles.cardTitle}>
            {count.toLocaleString()} {count === 1 ? 'photo is' : 'photos are'} waiting for iCloud.
          </Title>
          <Caption>Open Photos on this device, then retry the scan when the originals finish downloading.</Caption>
        </View>
        <Ionicons name="cloud-download-outline" size={22} color={theme.semantic.primary} />
      </View>
      <Button
        size="sm"
        fullWidth={false}
        style={styles.cardButton}
        onPress={onScan}
      >
        Retry scan
      </Button>
    </Card>
  );
}

function LibraryChangePanel({ change, onScan, theme }) {
  if (!change) return null;
  return (
    <Card variant="muted">
      <View style={styles.sectionHeader}>
        <View style={styles.resultText}>
          <Eyebrow>Photo library</Eyebrow>
          <Title style={styles.cardTitle}>New camera roll changes.</Title>
          <Caption>{describeMediaLibraryChange(change)}</Caption>
        </View>
        <Ionicons name="sync-outline" size={22} color={theme.semantic.primary} />
      </View>
      <Button
        size="sm"
        fullWidth={false}
        style={styles.cardButton}
        onPress={onScan}
      >
        Scan changes
      </Button>
    </Card>
  );
}

const ARCHIVE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'photos', label: 'Photos' },
  { value: 'videos', label: 'Videos' },
  { value: 'voice', label: 'Voice' },
  { value: 'firsts', label: 'Firsts' },
];

function SearchPanel({ query, onQueryChange, filter, onFilterChange, results, stats, onOpen, theme }) {
  return (
    <View style={styles.searchStack}>
      <Card>
        <Eyebrow>Archive search</Eyebrow>
        <Title style={styles.cardTitle}>Find the saved thread.</Title>
        <View style={[styles.searchBox, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
          <Ionicons name="search" size={17} color={theme.semantic.textMuted} />
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="Search title, place, tag, date, voice..."
            placeholderTextColor={theme.semantic.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: theme.semantic.text }]}
          />
          {query ? (
            <Pressable
              onPress={() => onQueryChange('')}
              accessibilityRole="button"
              accessibilityLabel="Clear archive search"
              style={styles.searchClearButton}
            >
              <Ionicons name="close-circle" size={17} color={theme.semantic.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.filterRow}>
          {ARCHIVE_FILTERS.map((option) => {
            const active = filter === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => onFilterChange(option.value)}
                accessibilityRole="radio"
                accessibilityLabel={`Show ${option.label}`}
                accessibilityState={{ checked: active }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? theme.semantic.primary : theme.semantic.cardAlt,
                    borderColor: active ? theme.semantic.primary : theme.semantic.border,
                  },
                ]}
              >
                <Caption style={{ color: active ? theme.colors.onPrimary : theme.semantic.textSoft }}>
                  {option.label}
                </Caption>
              </Pressable>
            );
          })}
        </View>
        <Caption style={styles.searchMeta}>
          {countText(stats.moments, 'moment')} · {countText(stats.photos, 'photo')} · {countText(stats.videos, 'video')} · {countText(stats.voiceNotes, 'voice note')}
        </Caption>
      </Card>

      {results.length ? results.map((record) => (
        <ArchiveResultRow key={record.key} record={record} onPress={() => onOpen(record)} theme={theme} />
      )) : (
        <Card variant="ghost">
          <Eyebrow>No matches</Eyebrow>
          <Title style={styles.cardTitle}>Nothing saved under that yet.</Title>
          <Body>Try a place, year, tag, "video", "voice", or clear the filter.</Body>
        </Card>
      )}
    </View>
  );
}

function ExportPanel({ stats, years, onShare, onBuildFile, buildingFile, exportFile, onOpen, theme }) {
  return (
    <View style={styles.searchStack}>
      <Card>
        <View style={styles.exportHeader}>
          <View style={styles.resultText}>
            <Eyebrow>Export</Eyebrow>
            <Title style={styles.cardTitle}>Photo book and year-in-review queue.</Title>
          </View>
          <View style={styles.exportActions}>
            <Button
              variant="ghost"
              size="sm"
              fullWidth={false}
              onPress={onBuildFile}
              loading={buildingFile}
              icon={<Ionicons name="print-outline" size={16} color={theme.semantic.primary} />}
            >
              Build PDF
            </Button>
            <Button
              variant="quiet"
              size="sm"
              fullWidth={false}
              onPress={onShare}
              icon={<Ionicons name="share-outline" size={16} color={theme.semantic.primary} />}
            >
              Summary
            </Button>
          </View>
        </View>
        <View style={styles.statGrid}>
          <StatTile label={countLabel(stats.moments, 'moment')} value={stats.moments} theme={theme} />
          <StatTile label={countLabel(stats.photos, 'photo')} value={stats.photos} theme={theme} />
          <StatTile label={countLabel(stats.videos, 'video')} value={stats.videos} theme={theme} />
          <StatTile label={countLabel(stats.voiceNotes, 'voice note')} value={stats.voiceNotes} theme={theme} />
        </View>
        {exportFile?.uri ? (
          <View style={[styles.exportFileBox, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
            <Ionicons name="checkmark-circle-outline" size={18} color={theme.semantic.primary} />
            <View style={styles.resultText}>
              <Caption>{exportFile.format === 'pdf' ? 'Generated PDF photo book' : 'Generated print-ready HTML preview'}</Caption>
              <Caption numberOfLines={1}>{exportFile.uri}</Caption>
              {exportFile.htmlUri ? <Caption numberOfLines={1}>HTML companion: {exportFile.htmlUri}</Caption> : null}
            </View>
          </View>
        ) : null}
      </Card>

      {years.length ? years.map((year) => (
        <Card key={year.year}>
          <View style={styles.sectionHeader}>
            <View>
              <Eyebrow>{year.year} year in review</Eyebrow>
              <Title style={styles.cardTitle}>{countText(year.moments, 'saved moment')}</Title>
            </View>
            <Caption>{countText(year.photos, 'photo')} · {countText(year.videos, 'video')} · {countText(year.voiceNotes, 'voice note')}</Caption>
          </View>
          <View style={styles.yearThumbRow}>
            {year.representative.slice(0, 4).map((record) => (
              <Pressable
                key={record.key}
                onPress={() => onOpen(record)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${year.year} representative moment`}
                style={[styles.yearThumb, { backgroundColor: theme.semantic.cardAlt }]}
              >
                {record.thumbUrl ? (
                  <Image source={{ uri: record.thumbUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <View style={styles.savedVideo}>
                    <Ionicons name={record.voiceOnly ? 'mic' : 'image-outline'} size={24} color={theme.semantic.primary} />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
          <Caption style={styles.searchMeta}>
            {year.places.length ? `Places: ${year.places.slice(0, 3).join(', ')}` : 'No places saved yet'}
          </Caption>
        </Card>
      )) : (
        <Card variant="ghost">
          <Eyebrow>Year in review</Eyebrow>
          <Title style={styles.cardTitle}>Save a few moments first.</Title>
          <Body>As the archive grows, each year gets a ready-made summary and representative strip.</Body>
        </Card>
      )}
    </View>
  );
}

function ArchiveResultRow({ record, onPress, theme }) {
  const icon = record.videoCount ? 'play-circle' : record.voiceOnly ? 'mic' : 'image-outline';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open archive result: ${record.title || 'Untitled moment'}`}
      style={({ pressed }) => [
        styles.resultRow,
        {
          backgroundColor: theme.semantic.card,
          borderColor: theme.semantic.border,
          opacity: pressed ? 0.76 : 1,
        },
      ]}
    >
      <View style={[styles.resultThumb, { backgroundColor: theme.semantic.cardAlt }]}>
        {record.thumbUrl ? (
          <Image source={{ uri: record.thumbUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Ionicons name={icon} size={24} color={theme.semantic.primary} />
        )}
      </View>
      <View style={styles.resultText}>
        <Body style={styles.resultTitle} numberOfLines={1}>{record.title || 'Untitled moment'}</Body>
        <Caption numberOfLines={1}>{record.subtitle}</Caption>
        <View style={styles.tagRow}>
          {record.tags.slice(0, 3).map((tag) => (
            <View key={tag} style={[styles.smallTag, { backgroundColor: theme.semantic.cardAlt }]}>
              <Caption style={styles.smallTagText}>{formatTagLabel(tag)}</Caption>
            </View>
          ))}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.semantic.textMuted} />
    </Pressable>
  );
}

function VideoArchiveTile({ media, theme }) {
  if (media?.posterUrl || media?.thumbUrl) {
    return (
      <View style={styles.savedVideo}>
        <Image source={{ uri: media.posterUrl || media.thumbUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={styles.savedVideoOverlay}>
          <Ionicons name="play-circle" size={30} color={theme.colors.onPrimary} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.savedVideo}>
      <Ionicons name="play-circle" size={30} color={theme.semantic.primary} />
      <Caption style={styles.savedVideoLabel}>Video</Caption>
    </View>
  );
}

function StatTile({ label, value, theme }) {
  return (
    <View style={[styles.statTile, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
      <Title style={styles.statNumber}>{value}</Title>
      <Caption>{label}</Caption>
    </View>
  );
}

function buildArchiveRecords({ moments, shared }) {
  const momentRecords = (moments || []).map((moment) => {
    const media = moment.media || [];
    const voiceNotes = moment.voiceNotes || [];
    const imageCount = media.filter((item) => item.media_type !== 'video').length;
    const videoCount = media.filter((item) => item.media_type === 'video').length;
    const firstMedia = media[0];
    const capturedAt = moment.captured_at || moment.created_at;
    const tags = Array.from(new Set((moment.tags || []).filter(Boolean)));
    const dateLabel = formatDateLabel(capturedAt);
    return {
      key: `moment:${moment.id}`,
      id: moment.id,
      moment,
      title: moment.title || firstMeaningful([moment.caption_note, tags[0], moment.place_name, dateLabel]),
      subtitle: [dateLabel, moment.place_name, mediaSummary({ imageCount, videoCount, voiceCount: voiceNotes.length })].filter(Boolean).join(' · '),
      capturedAt,
      year: yearFor(capturedAt),
      place: moment.place_name || '',
      tags,
      imageCount,
      videoCount,
      voiceCount: voiceNotes.length,
      voiceOnly: !media.length && !!voiceNotes.length,
      thumbUrl: firstMedia?.thumbUrl || firstMedia?.posterUrl || firstMedia?.fullUrl || null,
      searchText: [
        moment.title,
        moment.caption_note,
        moment.place_name,
        dateLabel,
        String(yearFor(capturedAt) || ''),
        tags.join(' '),
        videoCount ? 'video' : '',
        voiceNotes.length ? 'voice audio recording' : '',
        imageCount ? 'photo image' : '',
      ].filter(Boolean).join(' ').toLowerCase(),
    };
  });

  const legacyRecords = (shared || [])
    .filter((photo) => !photo.moment_id)
    .map((photo) => {
      const capturedAt = photo.creation_time || photo.tagged_at;
      const dateLabel = formatDateLabel(capturedAt);
      const place = photo.location_label || '';
      return {
        key: `legacy:${photo.asset_owner_user_id}:${photo.asset_id}`,
        id: photo.asset_id,
        moment: null,
        photo,
        title: firstMeaningful([place, dateLabel, 'Saved photo']),
        subtitle: [dateLabel, place, 'Photo'].filter(Boolean).join(' · '),
        capturedAt,
        year: yearFor(capturedAt),
        place,
        tags: ['photo'],
        imageCount: 1,
        videoCount: 0,
        voiceCount: 0,
        voiceOnly: false,
        thumbUrl: photo.thumbUrl || photo.fullUrl || null,
        searchText: [dateLabel, place, 'saved photo image'].filter(Boolean).join(' ').toLowerCase(),
      };
    });

  return [...momentRecords, ...legacyRecords]
    .filter((record) => record.capturedAt || record.title)
    .sort((a, b) => new Date(b.capturedAt || 0).getTime() - new Date(a.capturedAt || 0).getTime());
}

function buildArchiveMonthSections({ records, babyBirthday }) {
  const buckets = new Map();
  for (const record of records || []) {
    const date = validDate(record.capturedAt);
    const key = date ? `${date.getFullYear()}-${date.getMonth()}` : 'undated';
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        date,
        title: date
          ? date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
          : 'Undated',
        ageLabel: sectionAgeLabel({ date, babyBirthday }),
        records: [],
        photos: 0,
        videos: 0,
      });
    }
    const bucket = buckets.get(key);
    bucket.records.push(record);
    bucket.photos += record.imageCount || 0;
    bucket.videos += record.videoCount || 0;
  }

  return Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    summary: monthSectionSummary(bucket),
  }));
}

function hydrateRecentAutoSaves({ recent, shared, moments, currentUserId }) {
  const sharedByAssetId = new Map((shared || []).map((row) => [row.asset_id, row]));
  const momentById = new Map((moments || []).map((moment) => [moment.id, moment]));
  return (recent || []).map((row) => {
    const sharedRow = sharedByAssetId.get(row.assetId);
    const moment = sharedRow?.moment_id ? momentById.get(sharedRow.moment_id) : null;
    const firstMedia = moment?.media?.[0];
    return {
      ...row,
      assetOwnerUserId: sharedRow?.asset_owner_user_id || currentUserId,
      momentId: sharedRow?.moment_id || null,
      moment,
      title: moment?.title || sharedRow?.location_label || 'Auto-saved photo',
      thumbUrl: firstMedia?.thumbUrl || firstMedia?.posterUrl || sharedRow?.thumbUrl || row.uri || null,
      creationTime: row.creationTime || sharedRow?.creation_time || moment?.captured_at || null,
    };
  }).filter((row) => row.assetId);
}

function filterArchiveRecords({ records, query, filter }) {
  const q = (query || '').trim().toLowerCase();
  return (records || []).filter((record) => {
    if (filter === 'photos' && !record.imageCount) return false;
    if (filter === 'videos' && !record.videoCount) return false;
    if (filter === 'voice' && !record.voiceCount) return false;
    if (filter === 'firsts' && !record.tags.some((tag) => tag.toLowerCase().includes('first'))) return false;
    if (!q) return true;
    return record.searchText.includes(q);
  }).slice(0, 80);
}

function buildArchiveStats(records) {
  return (records || []).reduce((acc, record) => {
    acc.moments += 1;
    acc.photos += record.imageCount || 0;
    acc.videos += record.videoCount || 0;
    acc.voiceNotes += record.voiceCount || 0;
    if (record.tags.some((tag) => tag.toLowerCase().includes('first'))) acc.firsts += 1;
    return acc;
  }, { moments: 0, photos: 0, videos: 0, voiceNotes: 0, firsts: 0 });
}

function archiveMediaSubtitle(stats) {
  const photos = stats?.photos || 0;
  const videos = stats?.videos || 0;
  const mediaTotal = photos + videos;
  if (!mediaTotal) return 'Month by month as the archive fills';
  if (photos && videos) return `${mediaTotal.toLocaleString()} photos and videos by month`;
  if (photos) return `${countText(photos, 'photo')} by month`;
  return `${countText(videos, 'video')} by month`;
}

function archiveStatsCaption(stats) {
  const photos = stats?.photos || 0;
  const videos = stats?.videos || 0;
  if (photos && videos) return `${countText(photos, 'photo')} · ${countText(videos, 'video')}`;
  if (photos) return countText(photos, 'photo');
  if (videos) return countText(videos, 'video');
  return 'No photos yet';
}

function monthSectionSummary(section) {
  const photos = section.photos || 0;
  const videos = section.videos || 0;
  if (photos && videos) return `${countText(photos, 'photo')} · ${countText(videos, 'video')}`;
  if (photos) return countText(photos, 'photo');
  if (videos) return countText(videos, 'video');
  return countText(section.records.length, 'moment');
}

function buildYearSummaries(records) {
  const byYear = new Map();
  for (const record of records || []) {
    const year = record.year || 'Undated';
    if (!byYear.has(year)) {
      byYear.set(year, {
        year,
        moments: 0,
        photos: 0,
        videos: 0,
        voiceNotes: 0,
        places: [],
        representative: [],
      });
    }
    const bucket = byYear.get(year);
    bucket.moments += 1;
    bucket.photos += record.imageCount || 0;
    bucket.videos += record.videoCount || 0;
    bucket.voiceNotes += record.voiceCount || 0;
    if (record.place && !bucket.places.includes(record.place)) bucket.places.push(record.place);
    if (bucket.representative.length < 6) bucket.representative.push(record);
  }
  return Array.from(byYear.values()).sort((a, b) => String(b.year).localeCompare(String(a.year)));
}

function buildExportMessage({ family, stats, years }) {
  const child = family?.babyName || 'Our little one';
  const lines = [
    `${child}'s Our Little World archive`,
    '',
    countText(stats.moments, 'saved moment'),
    `${countText(stats.photos, 'photo')}, ${countText(stats.videos, 'video')}, ${countText(stats.voiceNotes, 'voice note')}`,
  ];
  if (stats.firsts) lines.push(`${stats.firsts} firsts marked for the memory book`);
  lines.push('');
  lines.push('Year in review queue:');
  if (!years.length) lines.push('- No saved years yet.');
  years.forEach((year) => {
    lines.push(`- ${year.year}: ${countText(year.moments, 'moment')}, ${countText(year.photos, 'photo')}, ${countText(year.videos, 'video')}, ${countText(year.voiceNotes, 'voice note')}`);
  });
  return lines.join('\n');
}

function firstMeaningful(values) {
  return (values || []).find((value) => String(value || '').trim()) || '';
}

function possessiveName(name) {
  const clean = String(name || '').trim();
  if (!clean) return 'Baby';
  return clean.endsWith('s') ? `${clean}'` : `${clean}'s`;
}

function sectionAgeLabel({ date, babyBirthday }) {
  if (!date || !babyBirthday) return '';
  const label = formatAge(ageAt(babyBirthday, date.getTime()));
  return label ? `Around ${label}` : '';
}

function formatDateLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function yearFor(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getFullYear();
}

function mediaSummary({ imageCount, videoCount, voiceCount }) {
  const parts = [];
  if (imageCount) parts.push(countText(imageCount, 'photo'));
  if (videoCount) parts.push(countText(videoCount, 'video'));
  if (voiceCount) parts.push(countText(voiceCount, 'voice note'));
  return parts.join(' · ');
}

function countText(value, singular, pluralValue) {
  const count = Number(value || 0);
  return `${count.toLocaleString()} ${countLabel(count, singular, pluralValue)}`;
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  tile: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  tagBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ageLabel: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    textShadowColor: glass.mediaTextShadow,
    textShadowRadius: 5,
    fontSize: 10,
  },
  cardTitle: {
    fontSize: 23,
    lineHeight: 29,
    marginVertical: space.sm,
  },
  cardButton: {
    marginTop: space.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  exportActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  exportHeader: {
    gap: space.md,
  },
  exportFileBox: {
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    marginTop: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  searchStack: {
    gap: space.sm,
  },
  searchBox: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: space.md,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    fontSize: 15,
  },
  searchClearButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -space.sm,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.md,
  },
  filterChip: {
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchMeta: {
    marginTop: space.md,
  },
  resultRow: {
    minHeight: 86,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  resultThumb: {
    width: 62,
    height: 62,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultText: {
    flex: 1,
    minWidth: 0,
  },
  resultTitle: {
    fontSize: 14,
    lineHeight: 19,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 7,
  },
  smallTag: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    minHeight: 22,
    justifyContent: 'center',
  },
  smallTagText: {
    fontSize: 10,
    letterSpacing: 0,
    textTransform: 'none',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.md,
  },
  statTile: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 78,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    justifyContent: 'center',
  },
  statNumber: {
    fontSize: 25,
    lineHeight: 30,
  },
  yearThumbRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.md,
  },
  yearThumb: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentAutoList: {
    gap: space.sm,
    marginTop: space.md,
  },
  recentAutoRow: {
    minHeight: 68,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  recentAutoThumb: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeAutoButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.md,
  },
  archiveMonthSection: {
    marginTop: space.lg,
  },
  archiveMonthDivider: {
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  archiveMonthHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
  },
  archiveMonthTitle: {
    fontSize: 18,
    lineHeight: 22,
  },
  savedTile: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  savedVideo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedVideoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: glass.mediaScrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedVideoLabel: {
    marginTop: 2,
    fontSize: 10,
  },
  voiceOnlyTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
    paddingVertical: space.sm,
  },
  voiceOnlyLabel: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 12,
  },
  voiceOnlyTitle: {
    marginTop: 2,
    maxWidth: '100%',
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
  },
  savedCaption: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    textShadowColor: glass.mediaTextShadow,
    textShadowRadius: 5,
    fontSize: 10,
  },
  savedCountBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 26,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.mediaChrome,
    borderWidth: 1,
    borderColor: glass.mediaChromeBorder,
  },
  savedCountText: {
    color: glass.inverseTextBody,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
  },
  placeList: {
    gap: space.sm,
  },
  placeRow: {
    borderRadius: 14,
  },
  placeThumbRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.md,
  },
  placeThumb: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  placeText: {
    flex: 1,
  },
  placeTitle: {
    fontSize: 19,
    lineHeight: 23,
    marginTop: 2,
  },
});
