import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
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
import { useBilling } from './BillingContext';
import { isManualQaRuntime } from './manualQaRuntime';
import { createPhotoBookExport } from './archiveExport';
import { EXPORT_PREVIEW_LIMITATIONS } from './archiveExportModel';
import { EXPORT_POLICY_COPY } from './exportPolicyCopy';
import { ageAt, ensureLibraryPermission, fetchPhotosPage, formatAge } from './photos';
import { Tags } from './storage';
import {
  backfillPendingForOwner,
  deleteForTag,
  getUploadQueueStatus,
  listSharedTaggedWithLatestKeep,
  silentlyRepairUploadsForOwner,
} from './photoSync';
import { getFamilyArchiveCounts, getMomentDetail, listMomentArchive, listMomentDayArchive } from './moments';
import { countLabel } from './plural';
import { removeAutoSavedMemory } from './autoSaveCorrection';
import { AUTO_SAVE_CORRECTION_COPY } from './autoSaveCorrectionModel';
import { buildBookUtilityVisibility } from './bookUtilityVisibilityModel';
import { getRecentAutoSaves } from './recognitionTrust';
import PhotoActionSheet from './PhotoActionSheet';
import { buildPlaceClusters } from './visionSceneLabeler';
import { describeMediaLibraryChange, useMediaLibraryChangeObserver } from './mediaLibraryChanges';
import { useICloudRetryCount } from './iCloudRetryQueue';
import { formatTagLabel } from './tagModel';
import { DailyPrompts, Firsts, Letters } from './rituals';
import { buildArchiveRecords, buildBookHomeModel } from './bookHomeModel';
import { buildPrivateBookPreviewSharePayload } from './privateRecapShareModel';
import { buildLibraryManualQaFixture } from './libraryManualQaFixtures';
import { groupArchiveRecordsForPresentation } from './familyPhotoPresentationModel';
import { Family } from './families';
import { listFamilyLibraryConnections } from './familyLibrarySync';
import { buildFamilyLibrarySyncModel } from './familyLibrarySyncModel';
import { buildSavedDailyAlbum } from './dailyCurationModel';
import { deviceTimeZone, getFamilyRitualSettings } from './ritualSettings';
import {
  listAutomaticCollections,
  listCollectionMoments,
  setCollectionMembershipVisible,
  COLLECTION_MOMENT_PAGE_SIZE,
} from './collections';
import { collectionKindLabel } from './automaticCollectionModel';
import { listFamilyAnnotationExport } from './sharedEnrichment';
import { trackAnalyticsEvent } from './analytics';
import { analyticsEnvironment, analyticsPlatform } from './analyticsProductContext';
import { prioritizeImmediateKeepForOpening, selectWorldOpening } from './worldOpeningModel';
import { latestReadyTaggedRow } from './latestKeepVisibilityModel.js';

const PRINT_DRAFT_COPY = 'Printing is an optional future extra. This export keeps the focus on your digital family record; any physical-book layout still needs separate planning and parent approval.';
const TIMELINE_RENDER_LIMIT = 500;
const LIBRARY_RICH_ARCHIVE_LIMIT = 500;

export default function LibraryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const theme = useTheme();
  const { width: viewportWidth, fontScale } = useWindowDimensions();
  const { family } = useFamily();
  const { user } = useAuth();
  const { entitlement, loading: billingLoading } = useBilling();
  const writer = ['creator', 'partner'].includes(family?.me?.role);
  const canManageLibrary = !billingLoading
    && entitlement?.isActive === true
    && writer
    && !!family?.id
    && !!user?.id;
  const [segment, setSegment] = useState(() => normalizeLibrarySegment(params.segment) || 'photos');
  const [scrollResetKey, setScrollResetKey] = useState(0);
  const [shared, setShared] = useState([]);
  const [latestKeptOpening, setLatestKeptOpening] = useState(null);
  const [moments, setMoments] = useState([]);
  const [dailyArchiveRecords, setDailyArchiveRecords] = useState([]);
  const [archiveCounts, setArchiveCounts] = useState(null);
  const [archiveTimezone, setArchiveTimezone] = useState(deviceTimeZone() || 'UTC');
  const [firsts, setFirsts] = useState([]);
  const [letters, setLetters] = useState([]);
  const [promptResponses, setPromptResponses] = useState([]);
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
  const [showUtilityDetails, setShowUtilityDetails] = useState(false);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [libraryConnections, setLibraryConnections] = useState([]);
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [collectionMoments, setCollectionMoments] = useState([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [collectionHasMore, setCollectionHasMore] = useState(false);
  const { pendingChange } = useMediaLibraryChangeObserver({
    familyId: family?.id,
    userId: user?.id,
    enabled: canManageLibrary,
  });
  const iCloudRetry = useICloudRetryCount({
    familyId: canManageLibrary ? family.id : null,
    userId: canManageLibrary ? user.id : null,
    refreshKey: `${pendingChange?.changedAt || ''}:${uploadQueue.total}`,
  });
  const manualQaFixture = useMemo(
    () => (isManualQaRuntime() ? buildLibraryManualQaFixture(params.qa, { userId: user?.id }) : null),
    [params.qa, user?.id],
  );
  const effectiveShared = manualQaFixture?.shared || shared;
  const effectiveMoments = manualQaFixture?.moments || moments;
  const effectiveFirsts = manualQaFixture?.firsts || firsts;
  const effectiveLetters = manualQaFixture?.letters || letters;
  const effectivePromptResponses = manualQaFixture?.promptResponses || promptResponses;
  const effectiveRecentAutoSaves = manualQaFixture?.recentAutoSaves || recentAutoSaves;
  const effectiveUploadQueue = manualQaFixture?.uploadQueue || uploadQueue;
  const effectivePendingChange = manualQaFixture ? null : pendingChange;
  const effectiveICloudRetry = manualQaFixture?.iCloudRetry || iCloudRetry;
  const effectiveCollections = manualQaFixture?.collections || collections;

  const openSegment = useCallback((next) => {
    setSegment(next);
    setScrollResetKey((value) => value + 1);
  }, []);

  useEffect(() => {
    const next = normalizeLibrarySegment(params.segment);
    if (next && next !== segment) {
      setSegment(next);
      setScrollResetKey((value) => value + 1);
    }
  }, [params.segment, segment]);

  const loadShared = useCallback(async () => {
    if (!family?.id) return;
    const ritualSettings = await getFamilyRitualSettings({
      familyId: family.id,
      family: { babyBirthday: family?.babyBirthday },
    }).catch(() => null);
    const familyTimezone = ritualSettings?.timezone && ritualSettings.timezone !== 'local'
      ? ritualSettings.timezone
      : deviceTimeZone() || 'UTC';
    const [
      sharedRows,
      tagRows,
      momentRows,
      firstRows,
      letterRows,
      promptRows,
      recentRows,
      uploadStatus,
      memberRows,
      connectionRows,
      dayRows,
      countRows,
      collectionRows,
    ] = await Promise.all([
      listSharedTaggedWithLatestKeep(family.id, { limit: 90 }).catch(() => []),
      Tags.all(family.id).catch(() => ({})),
      listMomentArchive(family.id, { limit: LIBRARY_RICH_ARCHIVE_LIMIT }).catch(() => []),
      Firsts.list(family.id).catch(() => []),
      Letters.list(family.id).catch(() => []),
      DailyPrompts.listResponses(family.id).catch(() => []),
      canManageLibrary ? getRecentAutoSaves({ familyId: family.id, userId: user.id }).catch(() => []) : [],
      canManageLibrary
        ? getUploadQueueStatus({ familyId: family.id }).catch(() => ({ total: 0, pending: 0, uploading: 0, failed: 0, lastError: null }))
        : { total: 0, pending: 0, uploading: 0, failed: 0, lastError: null },
      Family.members(family.id).catch(() => []),
      listFamilyLibraryConnections(family.id).catch(() => []),
      listMomentDayArchive(family.id, { momentLimit: 5000, timezone: familyTimezone }).catch(() => []),
      getFamilyArchiveCounts(family.id).catch(() => null),
      listAutomaticCollections(family.id).catch(() => []),
    ]);
    const latestTagged = latestReadyTaggedRow(sharedRows);
    const latestMoment = latestTagged?.moment_id
      ? momentRows.find((moment) => moment.id === latestTagged.moment_id)
        || await getMomentDetail({ familyId: family.id, momentId: latestTagged.moment_id }).catch(() => null)
      : null;
    setShared(sharedRows);
    setLatestKeptOpening(latestTagged
      ? { photo: latestTagged, moment: latestMoment }
      : null);
    setMoments(momentRows);
    setFirsts(firstRows);
    setLetters(letterRows);
    setPromptResponses(promptRows);
    setTags(tagRows);
    setRecentAutoSaves(recentRows);
    setUploadQueue(uploadStatus);
    setFamilyMembers(memberRows);
    setLibraryConnections(connectionRows);
    setDailyArchiveRecords(dayRows);
    setArchiveCounts(countRows);
    setArchiveTimezone(familyTimezone);
    setCollections(collectionRows);
  }, [canManageLibrary, family?.babyBirthday, family?.id, user?.id]);

  const loadLocalInitial = useCallback(async () => {
    if (!canManageLibrary) return;
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
  }, [canManageLibrary]);

  useFocusEffect(useCallback(() => {
    let active = true;
    loadShared();
    if (canManageLibrary) {
      silentlyRepairUploadsForOwner({ familyId: family.id })
        .then((result) => {
          if (active && result?.attempted) loadShared();
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [canManageLibrary, family?.id, loadShared]));

  useEffect(() => {
    if (!canManageLibrary) {
      setShowLocalPhotos(false);
      setLocal([]);
      return;
    }
    if (segment === 'photos' && showLocalPhotos && local.length === 0) loadLocalInitial();
  }, [canManageLibrary, loadLocalInitial, local.length, segment, showLocalPhotos]);

  const loadMore = async () => {
    if (!canManageLibrary || loading || !hasNext) return;
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
    if (!canManageLibrary) return;
    const params = { assetId: photo.id, uri: photo.uri };
    if (photo.creationTime != null) params.creationTime = String(photo.creationTime);
    router.push({ pathname: '/photo/[assetId]', params });
  };

  const places = useMemo(
    () => buildPlaceClusters({ shared: effectiveShared, metadataByKey: {}, memoriesByKey: {} }),
    [effectiveShared],
  );
  const bookHome = useMemo(() => buildBookHomeModel({
    moments: effectiveMoments,
    sharedPhotos: effectiveShared,
    firsts: effectiveFirsts,
    letters: effectiveLetters,
    digests: [],
    childBirthday: family?.babyBirthday,
    promptResponses: effectivePromptResponses,
    voiceNotes: [],
    uploadRepairState: effectiveUploadQueue,
    exportLimitations: EXPORT_PREVIEW_LIMITATIONS,
    lapsedSubscriptionPolicy: null,
  }), [effectiveFirsts, effectiveLetters, effectiveMoments, effectivePromptResponses, effectiveShared, effectiveUploadQueue, family?.babyBirthday]);
  const latestKeptOpeningRecord = useMemo(() => buildArchiveRecords({
    moments: latestKeptOpening?.moment ? [latestKeptOpening.moment] : [],
    sharedPhotos: latestKeptOpening?.moment ? [] : [latestKeptOpening?.photo].filter(Boolean),
  })[0] || null, [latestKeptOpening]);
  const worldOpeningRecords = useMemo(
    () => prioritizeImmediateKeepForOpening(bookHome.records, latestKeptOpeningRecord),
    [bookHome.records, latestKeptOpeningRecord],
  );
  const archiveRecords = bookHome.records;
  const collectionHome = useMemo(() => buildBookHomeModel({
    moments: collectionMoments,
    sharedPhotos: [],
    firsts: effectiveFirsts,
    letters: [],
    digests: [],
    childBirthday: family?.babyBirthday,
    promptResponses: [],
    voiceNotes: [],
    uploadRepairState: null,
    exportLimitations: [],
    lapsedSubscriptionPolicy: null,
  }), [collectionMoments, effectiveFirsts, family?.babyBirthday]);
  const archiveStats = manualQaFixture || !archiveCounts
    ? bookHome.stats
    : { ...bookHome.stats, ...archiveCounts };
  const archiveSections = bookHome.chapters;
  const presentationSections = useMemo(
    () => limitArchiveSectionsForTimeline(archiveSections, TIMELINE_RENDER_LIMIT),
    [archiveSections],
  );
  const dailyAlbum = useMemo(
    () => buildSavedDailyAlbum(manualQaFixture ? archiveRecords : dailyArchiveRecords, {
      babyBirthday: family?.babyBirthday,
      timezone: archiveTimezone,
    }),
    [archiveRecords, archiveTimezone, dailyArchiveRecords, family?.babyBirthday, manualQaFixture],
  );
  const yearSummaries = bookHome.yearSummaries;
  const recentAutoSaveRows = useMemo(
    () => hydrateRecentAutoSaves({ recent: effectiveRecentAutoSaves, shared: effectiveShared, moments: effectiveMoments, currentUserId: user?.id }),
    [effectiveMoments, effectiveRecentAutoSaves, effectiveShared, user?.id],
  );
  const memberNamesById = useMemo(
    () => Object.fromEntries(familyMembers.map((member) => [member.userId, member.displayName || 'A parent'])),
    [familyMembers],
  );
  const searchResults = useMemo(
    () => filterArchiveRecords({ records: archiveRecords, query, filter: archiveFilter }),
    [archiveFilter, archiveRecords, query],
  );
  const searchEventGroups = useMemo(
    () => groupArchiveRecordsForPresentation(searchResults),
    [searchResults],
  );
  const libraryTileSize = useMemo(() => libraryTileSizeForWidth(viewportWidth), [viewportWidth]);
  const utilityVisibility = useMemo(
    () => buildBookUtilityVisibility({
      uploadQueue: canManageLibrary ? effectiveUploadQueue : null,
      iCloudRetry: canManageLibrary ? effectiveICloudRetry : null,
      pendingChange: canManageLibrary ? effectivePendingChange : null,
    }),
    [canManageLibrary, effectiveICloudRetry, effectivePendingChange, effectiveUploadQueue],
  );
  const familyLibraryModel = useMemo(
    () => buildFamilyLibrarySyncModel({
      members: familyMembers,
      connections: libraryConnections,
      currentUserId: user?.id,
    }),
    [familyMembers, libraryConnections, user?.id],
  );

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

  const openCollection = useCallback(async (collection) => {
    if (!family?.id || !collection?.id) return;
    setSelectedCollection(collection);
    openSegment('collections');
    if (manualQaFixture) {
      const momentIds = new Set(collection.moment_ids || []);
      setCollectionMoments(effectiveMoments.filter((moment) => momentIds.has(moment.id)));
      setCollectionHasMore(false);
      return;
    }
    setCollectionLoading(true);
    try {
      const rows = await listCollectionMoments(family.id, collection.id, { offset: 0 });
      setCollectionMoments(rows);
      setCollectionHasMore(rows.length === COLLECTION_MOMENT_PAGE_SIZE);
    } catch (collectionError) {
      Alert.alert('Could not open collection', collectionError?.message || String(collectionError));
      setCollectionMoments([]);
      setCollectionHasMore(false);
    } finally {
      setCollectionLoading(false);
    }
  }, [effectiveMoments, family?.id, manualQaFixture, openSegment]);

  const loadMoreCollection = useCallback(async () => {
    if (!family?.id || !selectedCollection?.id || collectionLoading || !collectionHasMore) return;
    setCollectionLoading(true);
    try {
      const rows = await listCollectionMoments(family.id, selectedCollection.id, { offset: collectionMoments.length });
      setCollectionMoments((current) => [...current, ...rows]);
      setCollectionHasMore(rows.length === COLLECTION_MOMENT_PAGE_SIZE);
    } finally {
      setCollectionLoading(false);
    }
  }, [collectionHasMore, collectionLoading, collectionMoments.length, family?.id, selectedCollection?.id]);

  const removeFromCollection = useCallback(async (record) => {
    const momentId = record?.moment?.id;
    if (!canManageLibrary || !family?.id || !selectedCollection?.id || !momentId) return;
    try {
      await setCollectionMembershipVisible({
        familyId: family.id,
        collectionId: selectedCollection.id,
        momentId,
        visible: false,
      });
      setCollectionMoments((current) => current.filter((moment) => moment.id !== momentId));
      trackAnalyticsEvent('collection_correction_applied', {
        surface: 'collections',
        correction: 'excluded',
        collection_kind: analyticsCollectionKind(selectedCollection.kind),
      }, libraryAnalyticsContext({ family, entitlement }));
      Alert.alert('Removed from this collection', 'The memory is still safely kept in Our World.', [
        { text: 'Done', style: 'cancel' },
        {
          text: 'Undo',
          onPress: async () => {
            try {
              await setCollectionMembershipVisible({
                familyId: family.id,
                collectionId: selectedCollection.id,
                momentId,
                visible: true,
              });
              trackAnalyticsEvent('collection_correction_applied', {
                surface: 'collections',
                correction: 'restored',
                collection_kind: analyticsCollectionKind(selectedCollection.kind),
              }, libraryAnalyticsContext({ family, entitlement }));
              openCollection(selectedCollection);
            } catch (undoError) {
              Alert.alert('Could not restore memory', undoError?.message || String(undoError));
            }
          },
        },
      ]);
    } catch (collectionError) {
      Alert.alert('Could not update collection', collectionError?.message || String(collectionError));
    }
  }, [canManageLibrary, entitlement, family, openCollection, selectedCollection]);

  const openCameraRollTools = () => {
    if (!canManageLibrary) return;
    setShowLocalPhotos(true);
    if (!local.length) loadLocalInitial();
  };

  const removeShared = async () => {
    if (!canManageLibrary || !actionPhoto) return;
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
    if (!canManageLibrary || !row?.assetId) return;
    try {
      const result = await removeAutoSavedMemory({
        familyId: family.id,
        userId: user.id,
        target: row,
      });
      if (Array.isArray(result.recentAutoSaves)) setRecentAutoSaves(result.recentAutoSaves);
      setShared((prev) => prev.filter((item) => item.asset_id !== row.assetId));
      setMoments((prev) => prev.filter((moment) => moment.id !== row.momentId));
      Alert.alert(AUTO_SAVE_CORRECTION_COPY.successTitle, AUTO_SAVE_CORRECTION_COPY.successBody);
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
    ...(canManageLibrary ? [{
      icon: 'trash-outline',
      label: 'Remove from Our World',
      destructive: true,
      onPress: removeShared,
    }] : []),
  ] : [];

  const shareArchiveSummary = async () => {
    try {
      const payload = buildPrivateBookPreviewSharePayload({
        family,
        stats: archiveStats,
        years: yearSummaries,
      });
      await Share.share({
        title: payload.title,
        message: payload.message,
      });
    } catch (err) {
      Alert.alert('Could not open export sheet', err?.message || String(err));
    }
  };

  const repairUploadQueue = async () => {
    if (!canManageLibrary || repairingUploads) return;
    setRepairingUploads(true);
    try {
      const result = await backfillPendingForOwner({ familyId: family.id });
      await loadShared();
      Alert.alert(
        'Retry finished',
        `${result.uploaded} saved · ${result.skipped} still need attention`,
      );
    } catch (err) {
      console.warn('repairUploadQueue', err?.message || err);
      Alert.alert('Could not retry', 'Some memories still need attention. Try again in a moment.');
    } finally {
      setRepairingUploads(false);
    }
  };

  const buildPhotoBookFile = async () => {
    setBuildingExport(true);
    try {
      const annotations = manualQaFixture ? [] : await listFamilyAnnotationExport({ familyId: family.id });
      const annotationAuthors = Object.fromEntries(familyMembers.map((member) => [member.userId, member.displayName || 'A parent']));
      const file = await createPhotoBookExport({
        family,
        stats: archiveStats,
        years: yearSummaries,
        firsts: effectiveFirsts,
        letters: effectiveLetters,
        promptResponses: effectivePromptResponses,
        chapters: archiveSections,
        annotations,
        annotationAuthors,
        collections: effectiveCollections,
        limitations: EXPORT_PREVIEW_LIMITATIONS,
      });
      setExportFile(file);
      const payload = buildPrivateBookPreviewSharePayload({
        family,
        stats: archiveStats,
        years: yearSummaries,
      });
      await Share.share({
        title: file.title,
        url: file.uri,
        message: payload.message,
      });
      if (file.fallback) {
        Alert.alert('Built HTML preview', 'PDF rendering was not available, so the app shared the print-ready HTML file instead.');
      }
    } catch (err) {
      Alert.alert('Could not build family archive file', err?.message || String(err));
    } finally {
      setBuildingExport(false);
    }
  };

  return (
    <AppShell
      active="world"
      title={`${possessiveName(family?.babyName || 'Baby')} world.`}
      subtitle={archiveStats.moments
        ? `${countText(archiveStats.moments, 'moment')} kept privately.`
        : 'A private space for your family.'}
      showsVerticalScrollIndicator
      showJumpToTop
      scrollToTopSignal={scrollResetKey}
    >
      {segment === 'photos' ? (
        <BookHome
          childName={family?.babyName}
          childBirthday={family?.babyBirthday}
          model={bookHome}
          openingRecords={worldOpeningRecords}
          canWrite={canManageLibrary}
          onDiscover={canManageLibrary ? () => router.push('/timeline') : null}
          onOpen={openArchiveRecord}
          membersById={memberNamesById}
          theme={theme}
        />
      ) : null}

      {segment !== 'photos' ? (
        <SegmentedControl
          value={segment}
          onChange={openSegment}
          columns={fontScale >= 1.4 ? 2 : 3}
          options={[
            { value: 'photos', label: 'Timeline' },
            { value: 'collections', label: 'Collections' },
            { value: 'places', label: 'Places' },
            { value: 'search', label: 'Search' },
            { value: 'export', label: 'Export' },
          ]}
        />
      ) : null}

      <SegmentedContent segmentKey={segment}>
        {segment === 'photos' ? (
          <View style={styles.photoStack}>
            <DailyAlbumPanel
              childName={family?.babyName}
              model={dailyAlbum}
              onOpen={openArchiveRecord}
              onOpenAlbum={() => router.push('/daily-album')}
              theme={theme}
            />
            <SavedMomentGrid
              childName={family?.babyName}
              sections={presentationSections}
              stats={archiveStats}
              onPress={openArchiveRecord}
              tileSize={libraryTileSize}
              theme={theme}
            />
            <AutomaticCollectionsPreview collections={effectiveCollections} onOpen={openCollection} theme={theme} />
            {archiveRecords.length ? (
              <BookToolsPanel
                hasUtilityDetails={utilityVisibility.hasSecondaryDetails}
                utilityDetailCount={utilityVisibility.secondaryDetailCount}
                showUtilityDetails={showUtilityDetails}
                localVisible={showLocalPhotos}
                onOpenPlaces={() => openSegment('places')}
                onOpenSearch={() => openSegment('search')}
                onOpenExport={() => openSegment('export')}
                onOpenCameraRoll={canManageLibrary ? openCameraRollTools : null}
                onToggleUtilityDetails={() => setShowUtilityDetails((value) => !value)}
                theme={theme}
              />
            ) : null}
            {showUtilityDetails ? (
              <View style={styles.secondaryUtilityStack}>
                {utilityVisibility.showCameraRollChangeDetails ? (
                  <LibraryChangePanel
                    change={effectivePendingChange}
                    onScan={() => router.push('/scan')}
                    theme={theme}
                  />
                ) : null}
                {utilityVisibility.showNonBlockingUploadDetails ? (
                  <UploadQueuePanel status={effectiveUploadQueue} repairing={repairingUploads} onRepair={repairUploadQueue} theme={theme} />
                ) : null}
                {utilityVisibility.showBlockingICloud ? (
                  <ICloudWaitPanel queue={effectiveICloudRetry} onScan={() => router.push('/scan')} theme={theme} />
                ) : null}
                {utilityVisibility.showBlockingUpload ? (
                  <UploadQueuePanel status={effectiveUploadQueue} repairing={repairingUploads} onRepair={repairUploadQueue} theme={theme} />
                ) : null}
                <FamilyLibraryPanel
                  model={familyLibraryModel}
                  onScan={canManageLibrary ? () => router.push('/scan') : null}
                  theme={theme}
                />
                <RecentAutoSavedPanel
                  rows={recentAutoSaveRows}
                  onRemove={canManageLibrary ? removeRecentAutoSave : null}
                  onOpen={openMoment}
                  theme={theme}
                />
              </View>
            ) : null}
            {showLocalPhotos ? (
              <LocalCameraRollPanel
                visible
                onShow={openCameraRollTools}
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
            ) : null}
          </View>
        ) : segment === 'collections' ? (
          <CollectionsPanel
            collections={effectiveCollections}
            selected={selectedCollection}
            records={collectionHome.records}
            loading={collectionLoading}
            hasMore={collectionHasMore}
            onSelect={openCollection}
            onOpen={openArchiveRecord}
            onLoadMore={loadMoreCollection}
            canEdit={canManageLibrary && !manualQaFixture}
            onRemove={removeFromCollection}
            theme={theme}
          />
        ) : segment === 'places' ? (
          <View style={styles.placeList}>
            {places.length ? places.map((place) => (
              <Card key={place.id} padding="md" style={styles.placeRow}>
                <View style={styles.placeText}>
                  <Eyebrow>{place.label}</Eyebrow>
                  <Title style={styles.placeTitle}>{countText(place.eventCount ?? place.photos.length, 'saved event')}</Title>
                  {place.sourcePhotoCount > place.eventCount ? (
                    <Caption>{countText(place.sourcePhotoCount, 'photo')} grouped into distinct visits</Caption>
                  ) : null}
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
                <Body>Photos with location metadata will collect here as your world grows.</Body>
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
              results={searchEventGroups}
              stats={archiveStats}
              collections={effectiveCollections}
              onOpenCollection={openCollection}
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
              limitations={EXPORT_PREVIEW_LIMITATIONS}
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
        subtitle={actionPhoto && canManageLibrary
          ? 'Remove only from Our Little World; the original stays in Photos.'
          : undefined}
      />
    </AppShell>
  );
}

function normalizeLibrarySegment(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return ['photos', 'collections', 'places', 'search', 'export'].includes(raw) ? raw : null;
}

function AutomaticCollectionsPreview({ collections, onOpen, theme }) {
  if (!collections?.length) return null;
  return (
    <View style={styles.autoCollectionSection}>
      <View style={styles.sectionHeader}>
        <View style={styles.resultText}>
          <Eyebrow>Filed for you</Eyebrow>
          <Title style={styles.cardTitle}>Collections that organize themselves.</Title>
          <Caption>Date, media, parent choices, confirmed Firsts, and safe places update from the memories you keep.</Caption>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.autoCollectionRail}>
        {collections.slice(0, 8).map((collection) => (
          <Pressable
            key={collection.id}
            onPress={() => onOpen(collection)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${collection.title} collection`}
            style={[styles.autoCollectionCard, { backgroundColor: theme.semantic.card, borderColor: theme.semantic.border }]}
          >
            <Caption>{collectionKindLabel(collection.kind)}</Caption>
            <Title style={styles.autoCollectionTitle} numberOfLines={2}>{collection.title}</Title>
            <Caption>{countText(collection.moment_count, 'memory')}</Caption>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function CollectionsPanel({ collections, selected, records, loading, hasMore, onSelect, onOpen, onLoadMore, canEdit, onRemove, theme }) {
  return (
    <View style={styles.collectionPanel}>
      <Card padding="md">
        <Eyebrow>Automatic collections</Eyebrow>
        <Title style={styles.cardTitle} maxFontSizeMultiplier={1.6}>Less filing. More remembering.</Title>
        <Body>These use facts already saved with your family memories. An unkept camera-roll photo never appears here.</Body>
        <View style={styles.collectionChooser}>
          {(collections || []).map((collection) => {
            const active = selected?.id === collection.id;
            return (
              <Pressable
                key={collection.id}
                testID={`collection-${collection.collection_key}`}
                onPress={() => onSelect(collection)}
                accessibilityRole="button"
                accessibilityLabel={`${collection.title}, ${countText(collection.moment_count, 'memory')}`}
                accessibilityState={{ selected: active }}
                style={[
                  styles.collectionChoice,
                  {
                    backgroundColor: active ? theme.colors.primarySoft : theme.semantic.cardAlt,
                    borderColor: active ? theme.semantic.primary : theme.semantic.border,
                  },
                ]}
              >
                <Caption style={styles.collectionChoiceTitle}>{collection.title}</Caption>
                <Caption>{Number(collection.moment_count || 0).toLocaleString()}</Caption>
              </Pressable>
            );
          })}
        </View>
      </Card>
      {selected ? (
        <View style={styles.collectionResults}>
          <View style={styles.sectionHeader}>
            <View style={styles.resultText}>
              <Eyebrow>{collectionKindLabel(selected.kind)}</Eyebrow>
              <Title style={styles.cardTitle}>{selected.title}</Title>
              <Caption>{countText(selected.moment_count, 'memory')} · {collectionSourceLabel(selected.source_code)}</Caption>
            </View>
          </View>
          {records.map((record) => (
            <View key={record.key} style={styles.collectionResultRow}>
              <ArchiveResultRow record={record} onPress={() => onOpen(record)} theme={theme} />
              {canEdit ? (
                <Pressable
                  onPress={() => onRemove(record)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${record.title || 'memory'} from ${selected.title}`}
                  style={styles.collectionRemoveButton}
                >
                  <Caption>Not in this collection</Caption>
                </Pressable>
              ) : null}
            </View>
          ))}
          {loading ? <ActivityIndicator color={theme.semantic.primary} /> : null}
          {hasMore && !loading ? <Button variant="ghost" onPress={onLoadMore}>Load more</Button> : null}
          {!loading && !records.length ? <Caption>No visible memories remain in this collection.</Caption> : null}
        </View>
      ) : (
        <Card><Body>Choose a collection to browse it.</Body></Card>
      )}
    </View>
  );
}

function collectionSourceLabel(sourceCode) {
  const labels = {
    date_year: 'From saved dates',
    date_month: 'From saved dates',
    media_type: 'From saved media',
    author: 'From saved authorship',
    confirmed_first: 'From a confirmed First',
    parent_place: 'From a parent-added place',
    favorite: 'From a parent favorite',
    reaction: 'From family reactions',
    life_stage: 'From birth and capture dates',
  };
  return labels[sourceCode] || 'From saved facts';
}

function libraryTileSizeForWidth(width) {
  const viewportWidth = Number(width || 0);
  const columns = viewportWidth >= 600 ? 4 : 3;
  const contentWidth = Math.max(220, viewportWidth - (space.xl * 4));
  const boundedWidth = Math.min(contentWidth, 640);
  return Math.max(68, Math.floor((boundedWidth - (space.xs * (columns - 1))) / columns));
}

function BookHome({ childName, childBirthday, model, openingRecords, canWrite, onDiscover, onOpen, membersById, theme }) {
  const opening = selectWorldOpening(openingRecords || model?.records || [], membersById);
  const primary = opening.primary;
  const age = primary?.capturedAt && childBirthday
    ? formatAge(ageAt(childBirthday, primary.capturedAt.getTime()))
    : '';

  if (!primary) {
    return (
      <View style={[styles.worldEmptyOpening, { backgroundColor: theme.semantic.cardAlt }]} testID="world-empty-opening">
        <View style={[styles.bookIcon, { backgroundColor: theme.colors.primarySoft }]}>
          <Ionicons name="images-outline" size={23} color={theme.semantic.primary} />
        </View>
        <Eyebrow>Our World</Eyebrow>
        <Title style={styles.worldEmptyTitle}>Your first kept memory will open here.</Title>
        <Body align="center">
          Tonight and private discovery can build the family world. You decide what becomes part of it.
        </Body>
        {canWrite ? (
          <Button size="md" variant="quiet" fullWidth={false} onPress={onDiscover}>See what’s ready</Button>
        ) : (
          <Caption>Saved letters remain available to read.</Caption>
        )}
      </View>
    );
  }

  return (
    <View style={styles.bookHomeStack} testID="world-photo-opening">
      <Pressable
        onPress={() => onOpen(primary.record)}
        accessibilityRole="button"
        accessibilityLabel={`Open latest kept memory from ${primary.capturedAt ? formatBookDateLabel(primary.capturedAt) : 'Our World'}`}
        style={[styles.worldHero, { backgroundColor: theme.semantic.cardAlt }]}
      >
        <Image source={{ uri: primary.mediaUri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
        <View style={styles.worldHeroScrim} />
        <LinearGradient
          colors={['rgba(20,14,13,0)', 'rgba(20,14,13,0.72)']}
          locations={[0, 1]}
          pointerEvents="none"
          style={styles.worldHeroBottomGradient}
        />
        <View style={styles.worldHeroCopy}>
          <Eyebrow style={styles.worldHeroEyebrow}>Recently kept</Eyebrow>
          <Title style={styles.worldHeroTitle} maxFontSizeMultiplier={1.45}>
            {primary.capturedAt ? formatBookDateLabel(primary.capturedAt) : `${possessiveName(childName || 'Baby')} world`}
          </Title>
          <Caption style={styles.worldHeroContext} maxFontSizeMultiplier={1.5}>
            {[age, primary.author ? `kept by ${primary.author}` : null].filter(Boolean).join(' · ')}
          </Caption>
        </View>
        {primary.mediaType === 'video' ? (
          <View style={styles.worldVideoBadge}>
            <Ionicons name="play" size={15} color={theme.colors.onPrimary} />
          </View>
        ) : null}
      </Pressable>
      {opening.continuity.length ? (
        <View style={styles.worldContinuity}>
          <View style={styles.worldContinuityHeader}>
            <Eyebrow maxFontSizeMultiplier={1.5} style={styles.worldContinuityHeading}>Across the days</Eyebrow>
            <Caption maxFontSizeMultiplier={1.5} style={styles.worldContinuityCount}>
              {model?.stats?.moments ? `${model.stats.moments.toLocaleString()} kept` : ''}
            </Caption>
          </View>
          <View style={styles.worldContinuityRail}>
            {opening.continuity.map((item) => (
              <Pressable
                key={item.record.key}
                onPress={() => onOpen(item.record)}
                accessibilityRole="button"
                accessibilityLabel={`Open memory from ${item.capturedAt ? formatBookDateLabel(item.capturedAt) : 'another day'}`}
                style={[styles.worldContinuityItem, { backgroundColor: theme.semantic.cardAlt }]}
              >
                <Image source={{ uri: item.mediaUri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                <LinearGradient
                  colors={['rgba(20,14,13,0)', 'rgba(20,14,13,0.64)']}
                  locations={[0.45, 1]}
                  pointerEvents="none"
                  style={StyleSheet.absoluteFill}
                />
                <Caption style={styles.worldContinuityDate}>
                  {item.capturedAt ? formatDailyAlbumDate(item.capturedAt) : 'Saved'}
                </Caption>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <Caption style={styles.worldQuietCount}>
          One memory kept. The next clear moment will join it here.
        </Caption>
      )}
    </View>
  );
}

function BookToolsPanel({
  hasUtilityDetails,
  utilityDetailCount,
  showUtilityDetails,
  localVisible,
  onOpenPlaces,
  onOpenSearch,
  onOpenExport,
  onOpenCameraRoll,
  onToggleUtilityDetails,
  theme,
}) {
  const detailLabel = utilityDetailCount === 1 ? '1 background item' : `${utilityDetailCount} background items`;
  return (
    <Card padding="md" style={styles.bookToolsCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.resultText}>
          <Eyebrow>More in your world</Eyebrow>
          <Title style={styles.bookToolsTitle}>Find, export, or review photos.</Title>
          <Caption>Places, search, camera-roll review, and export stay out of the main family flow.</Caption>
        </View>
        <Ionicons name="ellipsis-horizontal-circle-outline" size={22} color={theme.semantic.primary} />
      </View>
      <View style={styles.bookToolGrid}>
        <BookToolButton
          icon="map-outline"
          title="Places"
          body="Browse saved places."
          onPress={onOpenPlaces}
          theme={theme}
        />
        <BookToolButton
          icon="search"
          title="Search"
          body="Find a saved thread."
          onPress={onOpenSearch}
          theme={theme}
        />
        <BookToolButton
          icon="download-outline"
          title="Export"
          body="Export your record."
          onPress={onOpenExport}
          theme={theme}
        />
        {onOpenCameraRoll ? (
          <BookToolButton
            icon="images-outline"
            title="Camera roll"
            body={localVisible ? 'Browsing below.' : 'Open local photos.'}
            onPress={onOpenCameraRoll}
            theme={theme}
          />
        ) : null}
      </View>
      {hasUtilityDetails ? (
        <Pressable
          onPress={onToggleUtilityDetails}
          accessibilityRole="button"
          accessibilityLabel={showUtilityDetails ? 'Hide saving details' : 'Review saving details'}
          style={[styles.utilityDetailsButton, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}
        >
          <Ionicons name="construct-outline" size={18} color={theme.semantic.primary} />
          <View style={styles.resultText}>
            <Caption style={styles.bookEntryDetail}>Saving details</Caption>
            <Caption>{showUtilityDetails ? 'Hide background camera-roll and upload notices.' : `Review ${detailLabel} when you need it.`}</Caption>
          </View>
          <Ionicons name={showUtilityDetails ? 'chevron-up' : 'chevron-down'} size={16} color={theme.semantic.textMuted} />
        </Pressable>
      ) : null}
    </Card>
  );
}

function BookToolButton({ icon, title, body, onPress, theme }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[styles.bookToolButton, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}
    >
      <View style={[styles.bookToolIcon, { backgroundColor: theme.colors.primarySoft }]}>
        <Ionicons name={icon} size={17} color={theme.semantic.primary} />
      </View>
      <View style={styles.resultText}>
        <Caption style={styles.bookToolTitle}>{title}</Caption>
        <Caption style={styles.bookToolBody}>{body}</Caption>
      </View>
      <Ionicons name="chevron-forward" size={14} color={theme.semantic.textMuted} />
    </Pressable>
  );
}

function SavedMomentGrid({ childName, sections, stats, onPress, tileSize, theme }) {
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const toggleGroup = (key) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  if (!sections.length) return null;
  return (
    <Card>
      <View style={styles.sectionHeader}>
        <View style={styles.resultText}>
          <Eyebrow>{possessiveName(childName || 'Baby')} timeline</Eyebrow>
          <Title style={styles.cardTitle}>Everything, month by month.</Title>
        </View>
        <Caption style={styles.headerCaption} numberOfLines={2}>{archiveStatsCaption(stats)}</Caption>
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
          <ChapterContextList items={section.contextItems || []} theme={theme} />
          <View style={styles.savedGrid}>
            {(section.presentationGroups || groupArchiveRecordsForPresentation(section.records)).flatMap((group) => {
              const expanded = expandedGroups.has(group.key);
              const records = expanded ? group.records : [group.representative];
              return records.map((record, index) => (
                <ArchiveRecordTile
                  key={expanded ? record.key : group.key}
                  record={record}
                  onPress={() => onPress(record)}
                  tileSize={tileSize}
                  theme={theme}
                  groupedCount={!expanded && index === 0 ? group.hiddenCount : 0}
                  groupExpanded={expanded}
                  onToggleGroup={group.hiddenCount ? () => toggleGroup(group.key) : null}
                />
              ));
            })}
          </View>
        </View>
      ))}
    </Card>
  );
}

function DailyAlbumPanel({ childName, model, onOpen, onOpenAlbum, theme }) {
  if (!model?.savedDayCount) return null;
  const elapsed = Number(model.firstYearElapsedDays || 0);
  const covered = Number(model.firstYearPhotoDays || 0);
  return (
    <Card>
      <View style={styles.sectionHeader}>
        <View style={styles.resultText}>
          <Eyebrow>Day by day</Eyebrow>
          <Title style={styles.cardTitle}>A photo for every day.</Title>
          <Body>
            {elapsed
              ? `${covered.toLocaleString()} of ${elapsed.toLocaleString()} first-year days have a saved photo.`
              : `${model.photoDayCount.toLocaleString()} days have a saved photo.`}
          </Body>
          <Caption>
            A day counts only when an eligible photo of {childName || 'your baby'} exists. Distinct standout photos and special videos stay with that day too.
          </Caption>
        </View>
        <View style={[styles.dailyCountBadge, { backgroundColor: theme.colors.primarySoft }]}>
          <Title style={{ color: theme.semantic.primary }}>{covered || model.photoDayCount}</Title>
          <Caption>days</Caption>
        </View>
      </View>
      {model.recentDays?.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dailyRail}
        >
          {model.recentDays.map((day) => (
            <Pressable
              key={day.dayKey}
              onPress={() => onOpen(day.representative)}
              accessibilityRole="button"
              accessibilityLabel={`Open saved media from ${formatDailyAlbumDate(day.dayKey)}`}
              style={[styles.dailyTile, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}
            >
              {day.representative?.thumbUrl ? (
                <Image source={{ uri: day.representative.thumbUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <PhotoPlaceholder seed={day.dayKey} style={StyleSheet.absoluteFill} />
              )}
              <View style={styles.dailyTileScrim} />
              <Caption style={styles.dailyTileDate}>{formatDailyAlbumDate(day.dayKey)}</Caption>
              {day.videos.length ? (
                <View style={styles.dailyVideoBadge}>
                  <Ionicons name="play" size={10} color={theme.colors.onPrimary} />
                </View>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <Button
        size="md"
        variant="quiet"
        fullWidth={false}
        style={styles.cardButton}
        onPress={onOpenAlbum}
        icon={<Ionicons name="calendar-outline" size={16} color={theme.semantic.primary} />}
      >
        Open all 365 days
      </Button>
    </Card>
  );
}

function ArchiveRecordTile({
  record,
  onPress,
  tileSize,
  theme,
  groupedCount = 0,
  groupExpanded = false,
  onToggleGroup = null,
}) {
  const media = record.moment?.media || [];
  const firstMedia = media[0];
  const hasVoiceOnly = record.voiceOnly;
  const groupedMediaCount = Math.max(0, (record.imageCount || 0) + (record.videoCount || 0));
  const thumbUri = firstMedia?.thumbUrl || firstMedia?.fullUrl || record.thumbUrl;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open saved moment: ${record.title || 'Untitled moment'}`}
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
      {groupedCount > 0 ? (
        <Pressable
          onPress={(event) => {
            event?.stopPropagation?.();
            onToggleGroup?.();
          }}
          accessibilityRole="button"
          accessibilityLabel={`${groupExpanded ? 'Collapse' : 'Show'} ${groupedCount} similar ${groupedCount === 1 ? 'photo' : 'photos'}`}
          accessibilityState={{ expanded: groupExpanded }}
          style={[styles.savedEventBadge, { backgroundColor: theme.semantic.primary }]}
        >
          <Ionicons name="copy-outline" size={11} color={theme.colors.onPrimary} />
          <Caption style={[styles.savedCountText, { color: theme.colors.onPrimary }]}>+{groupedCount}</Caption>
        </Pressable>
      ) : null}
      {record.title && !hasVoiceOnly ? (
        <Caption style={[styles.savedCaption, { color: theme.colors.onPrimary }]} numberOfLines={1}>
          {record.title}
        </Caption>
      ) : null}
    </Pressable>
  );
}

function ChapterContextList({ items, theme }) {
  if (!items?.length) return null;
  return (
    <View style={styles.chapterContextList}>
      {items.slice(0, 5).map((item) => (
        <View key={item.key} style={[styles.chapterContextRow, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
          <View style={[styles.chapterContextIcon, { backgroundColor: theme.colors.primarySoft }]}>
            <Ionicons name={chapterContextIcon(item.kind)} size={15} color={theme.semantic.primary} />
          </View>
          <View style={styles.resultText}>
            <Caption style={styles.chapterContextKind}>{chapterContextKindLabel(item.kind)}</Caption>
            <Body style={styles.chapterContextTitle} numberOfLines={1}>{item.title}</Body>
            <Caption numberOfLines={1}>{item.caption}</Caption>
          </View>
        </View>
      ))}
      {items.length > 5 ? (
        <Caption style={styles.searchMeta}>{items.length - 5} more notes stay with this month.</Caption>
      ) : null}
    </View>
  );
}

function chapterContextIcon(kind) {
  if (kind === 'first') return 'sparkles-outline';
  if (kind === 'letter') return 'mail-outline';
  if (kind === 'prompt') return 'chatbubble-ellipses-outline';
  if (kind === 'voice') return 'mic-outline';
  return 'bookmark-outline';
}

function chapterContextKindLabel(kind) {
  if (kind === 'first') return 'First';
  if (kind === 'letter') return 'Letter';
  if (kind === 'prompt') return 'Prompt';
  if (kind === 'voice') return 'Voice';
  return 'Note';
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
              <Body>{possessiveName(childName || 'Baby')} world stays in the month-by-month timeline.</Body>
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
          <Body>Allow photo access to choose local moments for your private family record.</Body>
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
          <Title style={styles.cardTitle}>Recently saved clear matches.</Title>
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
            {onRemove ? (
              <Pressable
                onPress={() => onRemove(row)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${row.title} from recently added photos`}
                style={[styles.removeAutoButton, { backgroundColor: theme.semantic.cardAlt }]}
              >
                <Ionicons name="remove-circle-outline" size={18} color={theme.colors.danger || theme.semantic.primary} />
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      <Caption style={styles.searchMeta}>
        {onRemove
          ? 'Remove anything that does not belong; the original stays in Photos, and auto-save pauses with a correction.'
          : 'These saved memories remain available in your read-only family archive.'}
      </Caption>
    </Card>
  );
}

function FamilyLibraryPanel({ model, onScan, theme }) {
  if (!model?.parents?.length) return null;
  return (
    <Card variant="muted">
      <View style={styles.sectionHeader}>
        <View style={styles.resultText}>
          <Eyebrow>Family photo sources</Eyebrow>
          <Title style={styles.cardTitle}>{model.heading}</Title>
        </View>
        <Ionicons name="phone-portrait-outline" size={22} color={theme.semantic.primary} />
      </View>
      <Body>{model.privacyCopy}</Body>
      <View style={styles.familyLibraryList}>
        {model.parents.map((parent) => (
          <View
            key={parent.userId}
            style={[styles.familyLibraryRow, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}
          >
            <View style={[styles.familyLibraryIcon, { backgroundColor: theme.colors.primarySoft }]}>
              <Ionicons
                name={parent.status === 'ready' ? 'checkmark' : parent.status === 'scanning' ? 'sync' : 'images-outline'}
                size={16}
                color={theme.semantic.primary}
              />
            </View>
            <View style={styles.resultText}>
              <Caption style={styles.bookEntryDetail}>{parent.title}</Caption>
              <Caption>{parent.detail}</Caption>
            </View>
            {parent.canScan && onScan ? (
              <Button size="sm" variant="quiet" fullWidth={false} onPress={onScan}>
                Scan
              </Button>
            ) : null}
          </View>
        ))}
      </View>
    </Card>
  );
}

function UploadQueuePanel({ status, repairing, onRepair, theme }) {
  if (!status?.total) return null;
  const failed = status.failed || 0;
  const uploading = status.uploading || 0;
  const pending = status.pending || 0;
  const hasFailed = failed > 0;
  const retrySentence = hasFailed
    ? `${countText(failed, 'memory')} ${failed === 1 ? 'needs' : 'need'} a retry.`
    : 'No memories need a retry.';
  return (
    <Card variant="muted">
      <View style={styles.sectionHeader}>
        <View style={styles.resultText}>
          <Eyebrow>{hasFailed ? 'Needs attention' : 'Still saving'}</Eyebrow>
          <Title style={styles.cardTitle}>
            {hasFailed ? 'Some memories did not finish saving' : 'Some memories are still saving'}
          </Title>
        </View>
        <Ionicons name="cloud-upload-outline" size={22} color={theme.semantic.primary} />
      </View>
      <Body>
        {retrySentence} {uploading} uploading · {pending} waiting.
      </Body>
      <Caption>
        We retry quietly when Our World opens. If these are still here, one tap will try again now.
      </Caption>
      <Button
        size="md"
        fullWidth={false}
        style={styles.cardButton}
        onPress={onRepair}
        loading={repairing}
        icon={<Ionicons name="refresh" size={16} color={theme.colors.onPrimary} />}
      >
        Retry
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

function SearchPanel({ query, onQueryChange, filter, onFilterChange, results, stats, collections, onOpenCollection, onOpen, theme }) {
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const collectionMatches = (collections || []).filter((collection) => {
    if (filter !== 'all' || !query.trim()) return false;
    return `${collection.title} ${collectionKindLabel(collection.kind)}`.toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase());
  }).slice(0, 8);
  const toggleGroup = (key) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  return (
    <View style={styles.searchStack}>
      <Card padding="md" style={styles.searchCard}>
        <View style={styles.searchHeader}>
          <View style={styles.resultText}>
            <Eyebrow>Search your world</Eyebrow>
            <Title style={styles.searchTitle}>Find the saved thread.</Title>
          </View>
          <View style={[styles.searchCountBadge, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
            <Caption style={styles.searchCountText}>{countText(stats.moments, 'moment')}</Caption>
          </View>
        </View>

        <View style={[styles.searchBox, { backgroundColor: theme.semantic.bg, borderColor: theme.semantic.border }]}>
          <Ionicons name="search" size={18} color={theme.semantic.primary} />
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            accessibilityLabel="Search saved memories and collections"
            placeholder="Title, place, tag, date, voice..."
            placeholderTextColor={theme.semantic.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: theme.semantic.text }]}
          />
          {query ? (
            <Pressable
              onPress={() => onQueryChange('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              style={styles.searchClearButton}
            >
              <Ionicons name="close-circle" size={17} color={theme.semantic.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <SearchFilterBar
          value={filter}
          onChange={onFilterChange}
          theme={theme}
        />

        <View style={styles.searchStatsGrid}>
          <SearchStat label={countLabel(stats.photos, 'photo')} value={stats.photos} theme={theme} />
          <SearchStat label={countLabel(stats.videos, 'video')} value={stats.videos} theme={theme} />
          <SearchStat label={countLabel(stats.voiceNotes, 'voice note')} value={stats.voiceNotes} theme={theme} />
          <SearchStat label={countLabel(stats.firsts, 'first')} value={stats.firsts} theme={theme} />
        </View>
      </Card>

      {collectionMatches.length ? (
        <View style={styles.searchCollectionMatches}>
          <Eyebrow>Matching collections</Eyebrow>
          <View style={styles.collectionChooser}>
            {collectionMatches.map((collection) => (
              <Pressable
                key={collection.id}
                onPress={() => onOpenCollection(collection)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${collection.title} collection`}
                style={[styles.collectionChoice, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}
              >
                <Caption style={styles.collectionChoiceTitle}>{collection.title}</Caption>
                <Caption>{Number(collection.moment_count || 0).toLocaleString()}</Caption>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {results.length ? results.flatMap((group) => {
        const expanded = expandedGroups.has(group.key);
        const records = expanded ? group.records : [group.representative];
        return records.map((record) => (
          <ArchiveResultRow
            key={expanded ? record.key : group.key}
            record={record}
            onPress={() => onOpen(record)}
            theme={theme}
            groupedCount={expanded ? 0 : group.hiddenCount}
            onToggleGroup={group.hiddenCount ? () => toggleGroup(group.key) : null}
          />
        ));
      }) : (
        <Card variant="ghost">
          <Eyebrow>No matches</Eyebrow>
          <Title style={styles.cardTitle}>Nothing saved under that yet.</Title>
          <Body>Try a place, year, tag, "video", "voice", or clear the filter.</Body>
        </Card>
      )}
    </View>
  );
}

function SearchStat({ label, value, theme }) {
  return (
    <View style={[styles.searchStat, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
      <Title style={styles.searchStatValue}>{Number(value || 0).toLocaleString()}</Title>
      <Caption style={styles.searchStatLabel} numberOfLines={1}>{label}</Caption>
    </View>
  );
}

function SearchFilterBar({ value, onChange, theme }) {
  return (
    <View style={[styles.searchFilterBar, { backgroundColor: theme.semantic.bg, borderColor: theme.semantic.border }]}>
      {ARCHIVE_FILTERS.map((option) => {
        const active = value === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (!active) onChange(option.value);
            }}
            accessibilityRole="radio"
            accessibilityLabel={`Show ${option.label}`}
            accessibilityState={{ checked: active }}
            style={[
              styles.searchFilterItem,
              active
                ? { backgroundColor: theme.semantic.primary }
                : { backgroundColor: 'transparent' },
            ]}
          >
            <Caption
              style={[
                styles.searchFilterText,
                { color: active ? theme.colors.onPrimary : theme.semantic.textSoft },
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Caption>
          </Pressable>
        );
      })}
    </View>
  );
}

function ExportPanel({ stats, years, onShare, onBuildFile, buildingFile, exportFile, limitations = [], onOpen, theme }) {
  return (
    <View style={styles.searchStack}>
      <Card>
        <View style={styles.exportHeader}>
          <View style={styles.resultText}>
            <Eyebrow>Export</Eyebrow>
            <Title style={styles.cardTitle}>Export your family record.</Title>
            <Body>{PRINT_DRAFT_COPY}</Body>
            <Caption style={styles.exportPolicyNote}>
              {EXPORT_POLICY_COPY.alwaysExportable} {EXPORT_POLICY_COPY.exportScope} {EXPORT_POLICY_COPY.privateShare}
            </Caption>
          </View>
          <View style={styles.exportActions}>
            <Button
              variant="ghost"
              size="sm"
              fullWidth={false}
              onPress={onBuildFile}
              loading={buildingFile}
              icon={<Ionicons name="download-outline" size={16} color={theme.semantic.primary} />}
            >
              Build archive PDF
            </Button>
            <Button
              variant="quiet"
              size="sm"
              fullWidth={false}
              onPress={onShare}
              icon={<Ionicons name="share-outline" size={16} color={theme.semantic.primary} />}
            >
              Private summary
            </Button>
          </View>
        </View>
        <View style={styles.statGrid}>
          <StatTile label={countLabel(stats.moments, 'moment')} value={stats.moments} theme={theme} />
          <StatTile label={countLabel(stats.photos, 'photo')} value={stats.photos} theme={theme} />
          <StatTile label={countLabel(stats.videos, 'video')} value={stats.videos} theme={theme} />
          <StatTile label={countLabel(stats.voiceNotes, 'voice note')} value={stats.voiceNotes} theme={theme} />
        </View>
        {limitations.length ? (
          <View style={[styles.exportLimitBox, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
            <Ionicons name="information-circle-outline" size={18} color={theme.semantic.primary} />
            <View style={styles.resultText}>
              <Caption style={styles.bookEntryDetail}>Current preview limits</Caption>
              {limitations.map((item) => (
                <Caption key={item}>{item}</Caption>
              ))}
            </View>
          </View>
        ) : null}
        {exportFile?.uri ? (
          <View style={[styles.exportFileBox, { backgroundColor: theme.semantic.cardAlt, borderColor: theme.semantic.border }]}>
            <Ionicons name="checkmark-circle-outline" size={18} color={theme.semantic.primary} />
            <View style={styles.resultText}>
              <Caption>{exportFile.format === 'pdf' ? 'Generated PDF archive' : 'Generated HTML archive preview'}</Caption>
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

function ArchiveResultRow({ record, onPress, theme, groupedCount = 0, onToggleGroup = null }) {
  const icon = record.videoCount ? 'play-circle' : record.voiceOnly ? 'mic' : 'image-outline';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open saved result: ${record.title || 'Untitled moment'}`}
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
          <View style={[styles.smallTag, { backgroundColor: theme.semantic.cardAlt }]}>
            <Caption style={styles.smallTagText}>{record.archiveStatusLabel || 'Saved privately'}</Caption>
          </View>
          {record.tags.slice(0, 3).map((tag) => (
            <View key={tag} style={[styles.smallTag, { backgroundColor: theme.semantic.cardAlt }]}>
              <Caption style={styles.smallTagText}>{formatTagLabel(tag)}</Caption>
            </View>
          ))}
        </View>
      </View>
      {groupedCount > 0 ? (
        <Pressable
          onPress={(event) => {
            event?.stopPropagation?.();
            onToggleGroup?.();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Show ${groupedCount} similar ${groupedCount === 1 ? 'photo' : 'photos'}`}
          style={[styles.searchGroupButton, { backgroundColor: theme.colors.primarySoft }]}
        >
          <Ionicons name="copy-outline" size={13} color={theme.semantic.primary} />
          <Caption style={{ color: theme.semantic.primary }}>+{groupedCount}</Caption>
        </Pressable>
      ) : null}
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

function archiveStatsCaption(stats) {
  const photos = stats?.photos || 0;
  const videos = stats?.videos || 0;
  if (photos && videos) return `${countText(photos, 'photo')} · ${countText(videos, 'video')}`;
  if (photos) return countText(photos, 'photo');
  if (videos) return countText(videos, 'video');
  return 'No photos yet';
}

function limitArchiveSectionsForTimeline(sections, limit) {
  let remaining = Math.max(0, Number(limit || 0));
  const out = [];
  for (const section of sections || []) {
    if (remaining <= 0) break;
    const records = (section.records || []).slice(0, remaining);
    if (!records.length) continue;
    remaining -= records.length;
    out.push({
      ...section,
      records,
      presentationGroups: groupArchiveRecordsForPresentation(records),
    });
  }
  return out;
}

function possessiveName(name) {
  const clean = String(name || '').trim();
  if (!clean) return 'Baby';
  return clean.endsWith('s') ? `${clean}'` : `${clean}'s`;
}

function formatDateLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatBookDateLabel(value) {
  if (!value) return '';
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDailyAlbumDate(value) {
  if (!value) return '';
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function countText(value, singular, pluralValue) {
  const count = Number(value || 0);
  return `${count.toLocaleString()} ${countLabel(count, singular, pluralValue)}`;
}

function analyticsCollectionKind(kind) {
  const map = {
    year: 'date',
    month: 'date',
    media: 'media',
    author: 'author',
    first: 'first',
    place: 'place',
    favorite: 'favorite',
    reaction: 'reaction',
    life_stage: 'first_year',
  };
  return map[kind] || 'unknown';
}

function libraryAnalyticsContext({ family, entitlement }) {
  return {
    family_id: family?.id || null,
    actor_role: family?.me?.role || 'unknown',
    plan_state: entitlement?.isActive ? 'active' : 'lapsed',
    platform: analyticsPlatform('ios'),
    environment: analyticsEnvironment(),
  };
}

const styles = StyleSheet.create({
  photoStack: {
    gap: space.md,
  },
  familyLibraryList: {
    gap: space.sm,
  },
  familyLibraryRow: {
    minHeight: 68,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  familyLibraryIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookHomeStack: {
    gap: space.md,
  },
  worldHero: {
    width: '100%',
    aspectRatio: 0.88,
    borderRadius: 28,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  worldHeroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20, 14, 13, 0.08)',
  },
  worldHeroBottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '54%',
  },
  worldHeroCopy: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    paddingTop: 100,
  },
  worldHeroEyebrow: { color: '#fff' },
  worldHeroTitle: {
    color: '#fff',
    fontSize: 31,
    lineHeight: 37,
    marginTop: space.xs,
  },
  worldHeroContext: {
    color: 'rgba(255,255,255,0.9)',
    marginTop: space.xs,
  },
  worldVideoBadge: {
    position: 'absolute',
    right: space.md,
    top: space.md,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.mediaChrome,
  },
  worldContinuity: { gap: space.sm },
  worldContinuityHeader: {
    minHeight: 34,
    paddingHorizontal: space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.md,
  },
  worldContinuityHeading: { flexShrink: 1 },
  worldContinuityCount: { flexShrink: 1 },
  worldContinuityRail: {
    flexDirection: 'row',
    gap: space.sm,
  },
  worldContinuityItem: {
    flex: 1,
    aspectRatio: 0.78,
    minWidth: 0,
    borderRadius: radius.md,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  worldContinuityScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: glass.mediaScrim,
  },
  worldContinuityDate: {
    color: glass.inverseTextBody,
    fontWeight: '800',
    padding: space.sm,
  },
  worldQuietCount: { paddingHorizontal: space.xs },
  worldEmptyOpening: {
    minHeight: 360,
    borderRadius: 28,
    paddingHorizontal: space.xl,
    paddingVertical: space.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
  worldEmptyTitle: {
    textAlign: 'center',
    fontSize: 28,
    lineHeight: 34,
  },
  bookChapterCard: {
    borderRadius: 18,
  },
  bookChapterTitle: {
    fontSize: 25,
    lineHeight: 31,
    marginVertical: space.sm,
  },
  bookIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.md,
  },
  chapterStat: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 78,
    minHeight: 62,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.sm,
    justifyContent: 'center',
  },
  chapterStatValue: {
    fontSize: 20,
    lineHeight: 24,
  },
  chapterStatLabel: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 13,
  },
  bookEntryGrid: {
    gap: space.sm,
  },
  bookEntryPressable: {
    width: '100%',
  },
  bookEntryCard: {
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  bookEntryCardWithAction: {
    flexDirection: 'column',
    gap: space.md,
  },
  bookEntryMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  bookEntryAction: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
  },
  bookEntryIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bookEntryTitle: {
    fontSize: 18,
    lineHeight: 23,
    marginTop: 3,
    marginBottom: 4,
  },
  bookEntryDetail: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    marginBottom: 5,
  },
  bookEntryBody: {
    lineHeight: 17,
  },
  bookToolsCard: {
    borderRadius: 18,
    gap: space.md,
  },
  bookToolsTitle: {
    fontSize: 21,
    lineHeight: 26,
    marginTop: space.xs,
  },
  bookToolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  bookToolButton: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 148,
    minHeight: 78,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  bookToolIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bookToolTitle: {
    fontWeight: '800',
    lineHeight: 15,
  },
  bookToolBody: {
    marginTop: 2,
    lineHeight: 15,
  },
  utilityDetailsButton: {
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  secondaryUtilityStack: {
    gap: space.sm,
  },
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
  detailsButton: {
    marginTop: space.sm,
  },
  autoSaveSetting: {
    marginTop: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    gap: space.sm,
  },
  autoSaveModeControl: {
    marginTop: space.xs,
  },
  autoSaveFootnote: {
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  headerCaption: {
    flexShrink: 0,
    maxWidth: 112,
    textAlign: 'right',
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
  exportPolicyNote: {
    marginTop: space.sm,
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
  exportLimitBox: {
    minHeight: 68,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginTop: space.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  searchStack: {
    gap: space.sm,
  },
  searchCard: {
    borderRadius: 24,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
  },
  searchTitle: {
    fontSize: 24,
    lineHeight: 30,
    marginTop: space.xs,
  },
  searchCountBadge: {
    minHeight: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchCountText: {
    fontSize: 11,
    fontWeight: '800',
  },
  searchBox: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: space.lg,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  searchInput: {
    flex: 1,
    minHeight: 52,
    fontSize: 16,
  },
  searchClearButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -space.sm,
  },
  searchFilterBar: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 4,
    marginTop: space.md,
    flexDirection: 'row',
    gap: 4,
  },
  searchFilterItem: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  searchFilterText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
  searchStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.md,
  },
  searchStat: {
    flexGrow: 1,
    flexBasis: '23%',
    minWidth: 66,
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.sm,
    justifyContent: 'center',
  },
  searchStatValue: {
    fontSize: 18,
    lineHeight: 22,
  },
  searchStatLabel: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 13,
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
  searchGroupButton: {
    minWidth: 44,
    minHeight: 36,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
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
  dailyCountBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dailyRail: {
    gap: space.sm,
    paddingTop: space.lg,
    paddingRight: space.xs,
  },
  dailyTile: {
    width: 104,
    height: 132,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  dailyTileScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: glass.mediaScrim,
  },
  dailyTileDate: {
    position: 'absolute',
    left: space.sm,
    right: space.sm,
    bottom: space.sm,
    color: glass.inverseTextBody,
    fontWeight: '800',
    textShadowColor: glass.mediaTextShadow,
    textShadowRadius: 5,
  },
  dailyVideoBadge: {
    position: 'absolute',
    top: space.xs,
    right: space.xs,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.mediaChrome,
    borderWidth: 1,
    borderColor: glass.mediaChromeBorder,
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
  chapterContextList: {
    gap: space.xs,
    marginTop: space.md,
  },
  chapterContextRow: {
    minHeight: 66,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  chapterContextIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chapterContextKind: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  chapterContextTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
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
  savedEventBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    minWidth: 40,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  savedCountText: {
    color: glass.inverseTextBody,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
  },
  autoCollectionSection: {
    marginTop: space.lg,
    gap: space.sm,
  },
  autoCollectionRail: {
    gap: space.sm,
    paddingRight: space.xl,
  },
  autoCollectionCard: {
    width: 156,
    minHeight: 112,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.md,
    justifyContent: 'space-between',
  },
  autoCollectionTitle: {
    fontSize: 18,
    lineHeight: 22,
  },
  collectionPanel: {
    gap: space.lg,
  },
  collectionChooser: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.md,
  },
  collectionChoice: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  collectionChoiceTitle: {
    fontWeight: '800',
  },
  collectionResults: {
    gap: space.sm,
  },
  searchCollectionMatches: {
    gap: space.sm,
  },
  collectionResultRow: {
    gap: 2,
  },
  collectionRemoveButton: {
    alignSelf: 'flex-end',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
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
