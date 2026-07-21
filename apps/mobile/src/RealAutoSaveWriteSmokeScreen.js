import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Family } from './families';
import { ensureLibraryPermission, fetchPhotosPage, getAssetDetails } from './photos';
import { recordRecentAutoSave } from './recognitionTrust';
import { removeAutoSavedMemory } from './autoSaveCorrection';
import { Tags } from './storage';
import { resolveRemoteAssetKey } from './mediaDb';
import { supabase } from './supabase';
import { describeSupabaseTarget, isLocalSupabaseUrl } from './supabaseQaGuard';
import { Button, Body, Caption, Card, Eyebrow, Screen, Title, space, useTheme } from './ui';

const BUCKET = 'family-photos';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const LOCAL_QA_PURCHASE_CODE = 'OLWLOCALREALWRITE';

export default function RealAutoSaveWriteSmokeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [state, setState] = useState({
    status: 'running',
    steps: ['Starting local real-write smoke.'],
    result: null,
    error: null,
  });

  const appendStep = useCallback((line) => {
    setState((current) => ({
      ...current,
      steps: [...current.steps, line],
    }));
  }, []);

  const runSmoke = useCallback(async () => {
    setState({
      status: 'running',
      steps: ['Starting local real-write smoke.'],
      result: null,
      error: null,
    });
    try {
      const result = await runRealAutoSaveWriteSmoke({ onStep: appendStep });
      setState((current) => ({
        ...current,
        status: result.passed ? 'passed' : 'failed',
        result,
      }));
    } catch (err) {
      setState((current) => ({
        ...current,
        status: 'failed',
        error: err?.message || String(err),
      }));
    }
  }, [appendStep]);

  useEffect(() => {
    runSmoke();
  }, [runSmoke]);

  const statusLabel = useMemo(() => {
    if (state.status === 'passed') return 'Real-write auto-save: passed';
    if (state.status === 'failed') return 'Real-write auto-save: failed';
    return 'Real-write auto-save: running';
  }, [state.status]);
  const passed = state.status === 'passed';

  return (
    <Screen scroll>
      <View style={styles.stack}>
        <Card>
          <Eyebrow>Dev QA</Eyebrow>
          <Title>Local real-write auto-save smoke.</Title>
          <Body>
            Creates a disposable local family, writes one simulator photo through
            `Tags.setBaby`, then removes it through the assistant correction path.
          </Body>
          <Caption>Local Supabase target: {describeSupabaseTarget(SUPABASE_URL)}</Caption>
          <Caption style={[styles.status, { color: passed ? theme.colors.success : theme.semantic.textMuted }]}>
            {statusLabel}
          </Caption>
          {state.status === 'running' ? <ActivityIndicator color={theme.semantic.primary} /> : null}
          {state.error ? (
            <Caption style={[styles.error, { color: theme.colors.danger || theme.semantic.primary }]}>
              {state.error}
            </Caption>
          ) : null}
          <View style={styles.actions}>
            <Button variant="ghost" fullWidth={false} onPress={runSmoke}>Run again</Button>
            <Button variant="ghost" fullWidth={false} onPress={() => router.replace('/library')}>Close</Button>
          </View>
        </Card>

        {state.result ? (
          <Card>
            <Eyebrow>Result</Eyebrow>
            <Title style={styles.smallTitle}>{state.result.summary}</Title>
            <Body>{state.result.detail}</Body>
            <Caption>Upload verified: {state.result.uploadSummary}</Caption>
            <Caption>Removal verified: {state.result.removalSummary}</Caption>
            <Caption>Correction verified: {state.result.correctionSummary}</Caption>
          </Card>
        ) : null}

        <Card variant="ghost">
          <Eyebrow>Trace</Eyebrow>
          {state.steps.map((step, index) => (
            <Caption key={`${step}-${index}`}>{step}</Caption>
          ))}
        </Card>
      </View>
    </Screen>
  );
}

async function runRealAutoSaveWriteSmoke({ onStep } = {}) {
  if (!isLocalSupabaseUrl(SUPABASE_URL)) {
    throw new Error('Refusing real-write smoke because Supabase is not local.');
  }
  onStep?.(`Using ${describeSupabaseTarget(SUPABASE_URL)}.`);

  const user = await signInDisposableLocalUser(onStep);
  const familyId = await Family.create({
    name: 'OLW Local QA',
    babyName: 'QA Baby',
    babyBirthday: '2026-01-01',
    displayName: 'QA Parent',
    relationshipLabel: 'parent',
  });
  if (!familyId) throw new Error('Could not create disposable local family.');
  onStep?.(`Created disposable local family ${shortId(familyId)}.`);
  await redeemLocalQaEntitlement({ familyId, onStep });

  const asset = await firstWritablePhoto(onStep);
  const match = {
    assetId: asset.id,
    mediaType: 'image',
    score: 0.99,
    faceCount: 1,
    captureQuality: 0.98,
    creationTime: asset.creationTime || Date.now(),
  };
  onStep?.(`Selected simulator photo ${shortId(asset.id)} (${asset.mediaType || 'unknown'}, ${asset.fileName || 'no filename'}, duration ${asset.duration || 0}).`);

  await Tags.setBaby({
    familyId,
    assetId: asset.id,
    isBaby: true,
    match,
    source: 'scan-auto-save',
  });
  await recordRecentAutoSave({ familyId, userId: user.id, match });
  onStep?.('Wrote assistant-added memory through Tags.setBaby.');

  const remoteAssetKey = resolveRemoteAssetKey({
    familyId,
    ownerUserId: user.id,
    localAssetId: asset.id,
  });
  if (!remoteAssetKey) throw new Error('Private media identity mapping was not persisted.');

  const upload = await verifyUpload({ familyId, userId: user.id, assetId: remoteAssetKey });
  onStep?.('Verified opaque shared identity, privacy-safe metadata, moment media, and storage objects.');

  await removeAutoSavedMemory({
    familyId,
    userId: user.id,
    target: {
      assetId: asset.id,
      assetOwnerUserId: user.id,
      momentId: upload.tag.moment_id,
      mediaId: upload.tag.moment_media_id,
      metadata: upload.media.metadata,
      mediaType: 'image',
      creationTime: asset.creationTime || null,
      score: match.score,
      captureQuality: match.captureQuality,
    },
  });
  onStep?.('Removed assistant-added memory through correction path.');

  const removal = await verifyRemoval({
    familyId,
    userId: user.id,
    assetId: remoteAssetKey,
    mediaId: upload.tag.moment_media_id,
    fullPath: upload.fullPath,
    thumbPath: upload.thumbPath,
  });
  onStep?.('Verified tag/media rows and storage objects were removed.');

  const correction = await verifyCorrection({ familyId, userId: user.id, assetId: asset.id });
  onStep?.('Verified correction was recorded.');

  return {
    passed: upload.passed && removal.passed && correction.passed,
    summary: 'Local real-write path passed.',
    detail: 'Used local Supabase only: disposable auth user, disposable family, simulator Photos, real storage upload, assistant-added removal, and correction recording.',
    uploadSummary: `${upload.tag.upload_status}; opaque shared identity; private fields excluded`,
    removalSummary: removal.passed ? 'tag, media, and storage objects removed' : 'cleanup incomplete',
    correctionSummary: `${correction.correctionCount} correction(s), ${correction.negativeCount} negative example(s)`,
  };
}

async function signInDisposableLocalUser(onStep) {
  await supabase.auth.signOut().catch(() => {});
  const suffix = `${Date.now()}-${Math.round(Math.random() * 100000)}`;
  const email = `olw-real-write-${suffix}@example.test`;
  const password = `Qa-${suffix}-password!`;
  const signup = await supabase.auth.signUp({ email, password });
  if (signup.error) throw signup.error;
  let user = signup.data?.user || null;
  if (!signup.data?.session) {
    const signin = await supabase.auth.signInWithPassword({ email, password });
    if (signin.error) throw signin.error;
    user = signin.data?.user || user;
  }
  if (!user?.id) throw new Error('Could not create disposable local user.');
  onStep?.(`Signed in disposable local user ${shortId(user.id)}.`);
  return user;
}

async function redeemLocalQaEntitlement({ familyId, onStep }) {
  const { data, error } = await supabase.rpc('redeem_purchase_code', {
    p_code: LOCAL_QA_PURCHASE_CODE,
    target_family_id: familyId,
  });
  if (error) {
    throw new Error(`Local QA entitlement code was not available: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.family_id) throw new Error('Local QA entitlement redemption did not return a family.');
  onStep?.(`Redeemed local QA entitlement (${row.plan_key || 'unknown plan'}).`);
  return row;
}

async function firstWritablePhoto(onStep) {
  const permission = await ensureLibraryPermission();
  if (!permission?.granted) throw new Error('Photo permission is not granted for the simulator.');
  onStep?.('Photo permission granted.');

  const page = await fetchPhotosPage({ pageSize: 20 });
  const candidates = page.assets || [];
  for (const candidate of candidates) {
    if (!candidate?.id) continue;
    const details = await getAssetDetails(candidate.id, { downloadFromNetwork: true }).catch(() => null);
    onStep?.(`Candidate ${shortId(candidate.id)} detail: ${details?.mediaType || 'unknown'}, ${details?.fileName || 'no filename'}, duration ${details?.duration || 0}.`);
    if (isStillImageDetails(details) && (details.localUri || details.uri)) {
      return {
        ...candidate,
        ...details,
        id: candidate.id,
      };
    }
  }
  throw new Error('No writable local simulator photo found.');
}

function isStillImageDetails(details) {
  if (!details) return false;
  const mediaType = String(details.mediaType || '').toLowerCase();
  const fileName = String(details.fileName || details.localUri || details.uri || '').toLowerCase();
  const hasVideoExtension = /\.(mov|mp4|m4v)(\?|$)/i.test(fileName);
  const hasImageExtension = /\.(jpg|jpeg|heic|heif|png)(\?|$)/i.test(fileName);
  const duration = Number(details.duration || 0);
  if (hasVideoExtension || duration > 0) return false;
  return mediaType === 'image' || mediaType === 'photo' || hasImageExtension;
}

async function verifyUpload({ familyId, userId, assetId }) {
  const { data: tag, error: tagError } = await supabase
    .from('photo_tags')
    .select('asset_owner_user_id, asset_id, upload_status, storage_object, thumb_object, moment_id, moment_media_id')
    .eq('family_id', familyId)
    .eq('asset_owner_user_id', userId)
    .eq('asset_id', assetId)
    .single();
  if (tagError) throw tagError;
  if (tag.upload_status !== 'ready') throw new Error(`Photo tag upload status was ${tag.upload_status}.`);
  if (!tag.storage_object || !tag.thumb_object || !tag.moment_media_id) {
    throw new Error('Photo tag did not record storage objects and moment media.');
  }

  const { data: media, error: mediaError } = await supabase
    .from('moment_media')
    .select('id, local_identifier, metadata, upload_status')
    .eq('family_id', familyId)
    .eq('id', tag.moment_media_id)
    .single();
  if (mediaError) throw mediaError;
  if (media.upload_status !== 'ready') throw new Error(`Moment media upload status was ${media.upload_status}.`);
  if (media.metadata?.source !== 'scan-auto-save') throw new Error('Moment media was not marked as scan-auto-save.');
  if (!isOpaqueSharedMediaKey(tag.asset_id) || media.local_identifier !== tag.asset_id) {
    throw new Error('Shared media rows did not use one opaque canonical identity.');
  }
  const forbiddenMetadataKeys = [
    'localAssetId',
    'pickerAssetId',
    'recognitionCandidateId',
    'recognitionScore',
    'faceCount',
    'visualFingerprint',
    'identityEvidence',
  ];
  if (forbiddenMetadataKeys.some((key) => Object.prototype.hasOwnProperty.call(media.metadata || {}, key))) {
    throw new Error('Shared media metadata contained private device or recognition evidence.');
  }

  const fullPath = media.metadata?.fullPath || `${familyId}/full/${tag.storage_object}.jpg`;
  const thumbPath = media.metadata?.thumbPath || `${familyId}/thumb/${tag.thumb_object}.jpg`;
  const fullExists = await storageObjectExists(fullPath);
  const thumbExists = await storageObjectExists(thumbPath);
  if (!fullExists || !thumbExists) throw new Error('Uploaded storage objects were not visible.');

  return { passed: true, tag, media, fullPath, thumbPath };
}

async function verifyRemoval({ familyId, userId, assetId, mediaId, fullPath, thumbPath }) {
  const [{ data: tag, error: tagError }, { data: media, error: mediaError }] = await Promise.all([
    supabase
      .from('photo_tags')
      .select('asset_id')
      .eq('family_id', familyId)
      .eq('asset_owner_user_id', userId)
      .eq('asset_id', assetId)
      .maybeSingle(),
    supabase
      .from('moment_media')
      .select('id')
      .eq('family_id', familyId)
      .eq('id', mediaId)
      .maybeSingle(),
  ]);
  if (tagError) throw tagError;
  if (mediaError) throw mediaError;
  const fullExists = await storageObjectExists(fullPath);
  const thumbExists = await storageObjectExists(thumbPath);
  if (tag || media || fullExists || thumbExists) {
    throw new Error('Assistant-added memory cleanup left rows or storage objects behind.');
  }
  return { passed: true };
}

async function verifyCorrection({ familyId, userId, assetId }) {
  const { data, error } = await supabase
    .from('media_import_calibrations')
    .select('corrections, negative_examples, auto_save_enabled')
    .eq('family_id', familyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  const corrections = Array.isArray(data?.corrections) ? data.corrections : [];
  const negativeExamples = Array.isArray(data?.negative_examples) ? data.negative_examples : [];
  const hasCorrection = corrections.some((item) => item?.assetId === assetId && item?.verdict === 'removed');
  const hasNegative = negativeExamples.some((item) => item?.assetId === assetId && item?.verdict === 'removed');
  if (!hasCorrection || !hasNegative || data?.auto_save_enabled !== false) {
    throw new Error('Correction row did not record removed auto-save state.');
  }
  return {
    passed: true,
    correctionCount: corrections.length,
    negativeCount: negativeExamples.length,
  };
}

async function storageObjectExists(path) {
  const clean = String(path || '').replace(/^\/+/, '');
  const parts = clean.split('/').filter(Boolean);
  const name = parts.pop();
  const folder = parts.join('/');
  if (!name || !folder) return false;
  const { data, error } = await supabase.storage.from(BUCKET).list(folder);
  if (error) throw error;
  return (data || []).some((item) => item.name === name);
}

function shortId(value) {
  const text = String(value || '');
  if (text.length <= 12) return text;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function isOpaqueSharedMediaKey(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

const styles = StyleSheet.create({
  stack: {
    gap: space.md,
    paddingTop: space.md,
    paddingBottom: space.xxl,
  },
  status: {
    marginTop: space.md,
  },
  smallTitle: {
    fontSize: 22,
    lineHeight: 27,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.md,
  },
  error: {
    marginTop: space.sm,
  },
});
