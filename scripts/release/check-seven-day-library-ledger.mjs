import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const defaultLedger = resolve(
  process.cwd(),
  'reports/release-convergence-2026-07-23/seven-day-library-ledger.json',
);
const ledgerPath = resolve(process.argv.find((arg) => arg.endsWith('.json')) || defaultLedger);
const requireComplete = process.argv.includes('--require-complete');
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));

if (!Array.isArray(ledger.days) || ledger.days.length !== 7) {
  throw new Error('The ledger must contain exactly seven day entries.');
}

const expectedDays = [1, 2, 3, 4, 5, 6, 7];
const actualDays = ledger.days.map(({ day }) => day);
if (JSON.stringify(actualDays) !== JSON.stringify(expectedDays)) {
  throw new Error('Ledger days must be ordered from 1 through 7.');
}

const forbiddenDayKeys = new Set([
  'assetId',
  'assetIds',
  'candidateExample',
  'candidateExamples',
  'faceEvidence',
  'filename',
  'filenames',
  'fingerprint',
  'media',
  'mediaContent',
  'photo',
  'photos',
  'selectionRationale',
  'video',
  'videosContent',
]);

function inspectKeys(value, path = 'days') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenDayKeys.has(key)) {
      throw new Error(`Privacy-unsafe ledger key at ${path}.${key}`);
    }
    inspectKeys(child, `${path}.${key}`);
  }
}

inspectKeys(ledger.days);

const pendingDays = ledger.days
  .filter((entry) => entry.parentConfirmation !== 'pass' || entry.privacyAudit !== 'pass')
  .map((entry) => entry.day);
const wrongBuildDays = ledger.days
  .filter((entry) => entry.capturedDate && !entry.buildVerified)
  .map((entry) => entry.day);
const complete = pendingDays.length === 0
  && wrongBuildDays.length === 0
  && ledger.status === 'complete';

console.log(JSON.stringify({
  ledgerPath,
  exactBuild: ledger.requiredCandidateBuild,
  status: ledger.status,
  complete,
  pendingDays,
  capturedDays: 7 - ledger.days.filter((entry) => entry.capturedDate === null).length,
  wrongBuildDays,
  privacySchema: 'pass',
}, null, 2));

if (requireComplete && !complete) {
  process.exitCode = 2;
}
