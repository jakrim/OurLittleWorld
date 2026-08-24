import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { matchAgainstReferenceProfile, embedFace, isNative } from './faceMatcher';
import {
  ensureLibraryPermission,
  fetchPhotosPage,
  getAssetDetails,
} from './photos';
import * as Scan from './scanController';
import {
  TRUST_AUTO_SAVE_THRESHOLD,
  TRUST_CLEAN_BATCH_MIN,
  buildPhotoIngestionTrustModel,
} from './photoIngestionTrustModel';
import { buildScanAutoSaveRuntimePlan } from './scanAutoSaveModel';
import { Button, Card, Screen, Title, Body, Caption, Eyebrow, useTheme, space } from './ui';

const SMOKE_PAGE_SIZE = 24;
const FUTURE_SCAN_SINCE_MS = Date.now() + 365 * 86400000;
let NativeFaceMatcher = null;
try {
  NativeFaceMatcher = require('../modules/expo-face-matcher').default;
} catch {
  NativeFaceMatcher = null;
}

export default function NativeAutoSaveSmokeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [state, setState] = useState({
    status: 'running',
    steps: ['Starting native smoke.'],
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
      steps: ['Starting native smoke.'],
      result: null,
      error: null,
    });
    try {
      const result = await runNativeAutoSaveSmoke({ onStep: appendStep });
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
    return () => {
      Scan.reset();
    };
  }, [runSmoke]);

  const statusLabel = useMemo(() => {
    if (state.status === 'passed') return 'Dry-run auto-save: passed';
    if (state.status === 'failed') return 'Dry-run auto-save: failed';
    return 'Dry-run auto-save: running';
  }, [state.status]);

  const passed = state.status === 'passed';

  return (
    <Screen scroll>
      <View style={styles.stack}>
        <Card>
          <Eyebrow>Dev QA</Eyebrow>
          <Title>Native calibrated auto-save smoke.</Title>
          <Body>
            Runs the native photo matcher and scan auto-save queue with a dry-run save function.
            It never writes to the family archive.
          </Body>
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
            <Caption>Face reference: {state.result.faceSummary}</Caption>
            <Caption>Review-first scan: {state.result.firstScanSummary}</Caption>
            <Caption>Active auto-save scan: {state.result.activeScanSummary}</Caption>
            <Caption>Correction state: {state.result.correctionSummary}</Caption>
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

async function runNativeAutoSaveSmoke({ onStep } = {}) {
  if (!isNative) {
    throw new Error('Native face matcher module is not available in this build.');
  }
  onStep?.('Native face matcher module available.');

  const permission = await ensureLibraryPermission();
  if (!permission?.granted) {
    throw new Error('Photo permission is not granted for the simulator.');
  }
  onStep?.('Photo permission granted.');

  const page = await fetchPhotosPage({ pageSize: SMOKE_PAGE_SIZE });
  const assets = await enrichSmokeAssets((page.assets || [])
    .filter((asset) => asset?.id && (asset.localUri || asset.uri)));
  if (!assets.length) {
    throw new Error('No local photos available for native smoke.');
  }
  onStep?.(`Read ${assets.length} candidate photos.`);

  const reference = await firstFaceReference(assets, onStep);
  if (!reference?.embedding?.length) {
    throw new Error('No face embedding found in the first candidate photos.');
  }
  onStep?.(`Face reference found in ${reference.assetId}.`);

  const scored = await matchAgainstReferenceProfile({
    profile: {
      references: [reference],
    },
    fallbackReference: reference,
    candidates: assets.map((asset) => ({
      assetId: asset.id,
      localUri: asset.localUri || asset.uri,
      uri: asset.uri,
      creationTime: asset.creationTime,
      mediaType: asset.mediaType || 'image',
    })),
  });
  const best = scored[0];
  if (!best || Number(best.score || 0) < TRUST_AUTO_SAVE_THRESHOLD) {
    throw new Error(`Native matcher did not produce a clear match. Best score: ${Number(best?.score || 0).toFixed(3)}`);
  }
  onStep?.(`Best native score ${Number(best.score).toFixed(3)} for ${best.assetId}.`);

  const cleanCorrections = Array.from({ length: TRUST_CLEAN_BATCH_MIN }, (_, index) => ({
    assetId: `smoke-clean-${index}`,
    score: Math.max(0.94, Number(best.score || 0)),
    verdict: 'keep',
  }));
  const plan = buildScanAutoSaveRuntimePlan({
    calibration: {
      autoSaveEnabled: true,
      corrections: cleanCorrections,
    },
    matches: scored,
  });
  if (!plan.enabled || !plan.autoSaveMatches.length) {
    throw new Error('Calibrated auto-save plan did not select a clear match.');
  }
  onStep?.(`Runtime plan selected ${plan.autoSaveMatches.length} dry-run auto-save match(es).`);

  const firstScan = await runScanPass({
    reference,
    assetId: best.assetId,
    autoSave: null,
  });
  const firstScanPassed = firstScan.matches.length > 0 && firstScan.autoSavedCount === 0;
  onStep?.(`Review-first scan found ${firstScan.matches.length} match(es), auto-saved ${firstScan.autoSavedCount}.`);

  const dryRunSaves = [];
  const activeScan = await runScanPass({
    reference,
    assetId: best.assetId,
    autoSave: {
      threshold: TRUST_AUTO_SAVE_THRESHOLD,
      save: async (assetId, match) => {
        dryRunSaves.push({ assetId, match });
      },
    },
  });
  const activeScanPassed = activeScan.autoSavedCount > 0 && dryRunSaves.length > 0;
  onStep?.(`Active scan dry-saved ${activeScan.autoSavedCount} match(es).`);

  const correction = buildPhotoIngestionTrustModel({
    calibration: {
      autoSaveEnabled: true,
      corrections: cleanCorrections,
    },
    negativeExamples: [{
      assetId: best.assetId,
      score: best.score,
      verdict: 'removed',
    }],
  });
  const correctionPassed = correction.state === 'needs_correction_review';
  onStep?.(`Correction model state: ${correction.state}.`);

  const passed = firstScanPassed && activeScanPassed && correctionPassed;
  return {
    passed,
    summary: passed ? 'Native calibrated path passed.' : 'Native calibrated path needs review.',
    detail: 'Used real simulator Photos, native face embedding/matching, scanController queueing, and a dry-run save function with no archive writes.',
    faceSummary: `${reference.faceCount || 0} face(s), capture quality ${formatNumber(reference.captureQuality)}`,
    firstScanSummary: `${firstScan.matches.length} match(es), ${firstScan.autoSavedCount} auto-saved`,
    activeScanSummary: `${activeScan.matches.length} match(es), ${activeScan.autoSavedCount} dry-run auto-saved`,
    correctionSummary: correction.state,
  };
}

async function firstFaceReference(assets, onStep) {
  for (const asset of assets) {
    const uri = asset.localUri || asset.uri;
    const embedded = await embedFaceForSmoke(uri);
    if (!embedded?.embedding?.length || embedded.faceCount === 0) {
      onStep?.(`No face embedding in ${describeSmokeAsset(asset, uri)}.`);
      continue;
    }
    return {
      id: 'native-smoke-reference',
      assetId: asset.id,
      uri,
      embedding: embedded.embedding,
      faceCount: embedded.faceCount || 1,
      captureQuality: embedded.captureQuality ?? null,
      faceSizeRatio: embedded.faceSizeRatio ?? null,
      sharpness: embedded.sharpness ?? null,
      capturedAt: asset.creationTime || Date.now(),
      source: 'native-smoke',
      weight: 1,
    };
  }
  return null;
}

async function embedFaceForSmoke(uri) {
  if (!NativeFaceMatcher?.embedFace) return embedFace(uri);
  return NativeFaceMatcher.embedFace(uri);
}

async function enrichSmokeAssets(assets) {
  const enriched = await Promise.all(assets.map(async (asset) => {
    const details = await getAssetDetails(asset.id, { downloadFromNetwork: true }).catch(() => null);
    return {
      ...asset,
      uri: details?.uri || asset.uri,
      localUri: details?.localUri || asset.localUri || asset.uri,
      downloadStatus: details?.downloadStatus || asset.downloadStatus || 'ready',
      downloadError: details?.downloadError || asset.downloadError || null,
    };
  }));
  return enriched.filter((asset) => asset.localUri || asset.uri);
}

function describeSmokeAsset(asset, uri) {
  const scheme = String(uri || '').split(':')[0] || 'unknown';
  const size = asset.width && asset.height ? `${asset.width}x${asset.height}` : 'unknown size';
  const status = asset.downloadStatus || 'unknown status';
  return `${asset.id} (${scheme}, ${size}, ${status})`;
}

async function runScanPass({ reference, assetId, autoSave }) {
  Scan.reset();
  await Scan.start({
    reference,
    referenceProfile: { references: [reference] },
    birthdayISO: null,
    since: FUTURE_SCAN_SINCE_MS,
    threshold: 0.6,
    autoSave,
    excludeIds: new Set(),
    extraAssetIds: [assetId],
    extraAssetCreatedAfterMs: 0,
  });
  return Scan.getState();
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(3) : 'n/a';
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
