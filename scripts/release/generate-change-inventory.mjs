import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const sourceRoot = process.argv[2] || '/Users/jessekrim/Desktop/ourLittleWorld';
const outputRoot = process.argv[3]
  || join(process.cwd(), 'reports/release-convergence-2026-07-23');

function git(args) {
  return execFileSync('git', args, {
    cwd: sourceRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function nulFields(value) {
  return value.split('\0').filter(Boolean);
}

function trackedChanges() {
  const fields = nulFields(git(['diff', '--name-status', '-z']));
  const result = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (status.startsWith('R') || status.startsWith('C')) {
      const from = fields[index++];
      const path = fields[index++];
      result.push({ path, status, from });
    } else {
      result.push({ path: fields[index++], status });
    }
  }
  return result;
}

function untrackedChanges() {
  return nulFields(git(['ls-files', '--others', '--exclude-standard', '-z']))
    .map((path) => ({ path, status: '??' }));
}

function classify(path) {
  if (path.startsWith('.cursor/') || path.startsWith('.serena/')) {
    return {
      workstream: 'unknown_or_overlapping',
      ownerEvidence: 'Editor/agent metadata only; no task or commit evidence establishes a release owner.',
      disposition: 'Preserve in the canonical dirty checkout; exclude from every release commit.',
      reconstructedCommit: null,
    };
  }

  if (path.startsWith('apps/mobile/app-store/')) {
    return {
      workstream: 'web_marketing_analytics',
      ownerEvidence: 'Modified July 23 after release reconstruction began; content is App Store metadata, source UI, review boards, and screenshots from an active separate session.',
      disposition: 'Active App Store asset work: preserve and quarantine from source/release PRs until its owning session hands off.',
      reconstructedCommit: null,
    };
  }

  if (path.startsWith('competitors/')) {
    return {
      workstream: 'generated_reports_artifacts',
      ownerEvidence: 'Large July 20 competitor screenshots and screen recordings; research evidence rather than application source.',
      disposition: 'Preserve locally outside Git and release archives; never include in build or PR.',
      reconstructedCommit: null,
    };
  }

  if (path.startsWith('reports/hybrid-reconciliation-2026-07-14/')) {
    return {
      workstream: 'generated_reports_artifacts',
      ownerEvidence: 'Dated hybrid-reconciliation report bundle with screenshots, matrices, and design notes.',
      disposition: 'Preserve as historical evidence; exclude from release source and code PRs.',
      reconstructedCommit: null,
    };
  }

  if (
    path === 'docs/session-019f688d-deep-dive.md'
    || path === 'reports/session-019f688d-deep-dive-2026-07-21.html'
  ) {
    return {
      workstream: 'generated_reports_artifacts',
      ownerEvidence: 'Session 019f688d review artifacts dated July 21.',
      disposition: 'Preserve as historical analysis; superseded for current release truth by this evidence package.',
      reconstructedCommit: null,
    };
  }

  if (
    path === 'AGENTS.md'
    || path === 'package.json'
    || path === 'docs/current-product-state.md'
    || path === 'docs/product-contract.md'
    || path === 'docs/release-runbook.md'
    || path === 'docs/smoke-testing.md'
    || path === 'docs/sprint-progress.md'
    || path.startsWith('scripts/agent/')
  ) {
    return {
      workstream: 'release_smoke_tooling_runbooks',
      ownerEvidence: 'Release-contract and canonical-command changes reconstructed and verified together.',
      disposition: 'Reconstructed on codex/olw-first-look-release.',
      reconstructedCommit: 'd3f462a',
    };
  }

  if (path === 'apps/mobile/.maestro/smoke-primary.yaml') {
    return {
      workstream: 'release_smoke_tooling_runbooks',
      ownerEvidence: 'Repository primary-family Maestro flow referenced by the new smoke runbook.',
      disposition: 'Reconstructed on codex/olw-first-look-release.',
      reconstructedCommit: '2d16eae',
    };
  }

  if (
    path === 'apps/mobile/app.json'
    || path === 'apps/mobile/eas.json'
    || path === 'apps/mobile/package.json'
    || path === 'pnpm-lock.yaml'
    || path === 'pnpm-workspace.yaml'
    || path.startsWith('patches/')
  ) {
    return {
      workstream: 'release_smoke_tooling_runbooks',
      ownerEvidence: 'Expo 57 dependency, native patch, and build-configuration reconstruction; Expo Doctor and frozen install verified.',
      disposition: path === 'apps/mobile/app.json' || path === 'apps/mobile/eas.json'
        ? 'Reconstructed, then intentionally advanced to build 1.1.11 with a non-mutating release-candidate profile.'
        : 'Reconstructed on codex/olw-first-look-release.',
      reconstructedCommit: path === 'apps/mobile/app.json' || path === 'apps/mobile/eas.json'
        ? 'ff75b0e + 5560b74'
        : 'ff75b0e',
    };
  }

  if (path === 'apps/mobile/modules/expo-face-matcher/ios/ExpoFaceMatcherModule.swift') {
    return {
      workstream: 'native_matcher_media_ingestion',
      ownerEvidence: 'Native PhotoKit/iCloud timeout repair isolated from First Look and billing.',
      disposition: 'Reconstructed on codex/olw-first-look-release.',
      reconstructedCommit: 'ffb0835',
    };
  }

  if (path === 'apps/mobile/tests/unit/curatedMemoryContracts.test.js') {
    return {
      workstream: 'unknown_or_overlapping',
      ownerEvidence: 'Curated-memory contract file changed by the later First Look/privacy analytics work.',
      disposition: 'Overlap is explicitly retained in the First Look commit and covered by full contract tests.',
      reconstructedCommit: '643f9c1',
    };
  }

  if (
    path.startsWith('apps/mobile/app/')
    || path.startsWith('apps/mobile/src/')
    || path.startsWith('apps/mobile/tests/')
    || path === 'apps/mobile/.maestro/family-first-value-paywall.yaml'
  ) {
    return {
      workstream: 'subscription_paywall_first_look',
      ownerEvidence: 'Device-local First Look, route guards, live store products, redemption, analytics, and earned-value paywall were reconstructed and tested as one mobile journey.',
      disposition: 'Reconstructed on codex/olw-first-look-release.',
      reconstructedCommit: '643f9c1',
    };
  }

  if (path.startsWith('supabase/')) {
    return {
      workstream: 'billing_provider_verification',
      ownerEvidence: 'Apple signed-data validation, Google/Apple trial mapping, Stripe attribution/status, and provider tests.',
      disposition: 'Reconstructed on codex/olw-first-look-release; not deployed to production.',
      reconstructedCommit: 'f09c0f1',
    };
  }

  if (path.startsWith('apps/web/')) {
    return {
      workstream: 'web_marketing_analytics',
      ownerEvidence: 'Consent-gated attribution and verified Stripe checkout completion reconstructed with the Next.js build.',
      disposition: 'Reconstructed on codex/olw-first-look-release; not deployed to production.',
      reconstructedCommit: '0b8b809',
    };
  }

  return {
    workstream: 'unknown_or_overlapping',
    ownerEvidence: 'No sufficiently specific task, content, path, or commit evidence.',
    disposition: 'Preserve in place and exclude from release commits pending owner confirmation.',
    reconstructedCommit: null,
  };
}

function fileEvidence(path, status) {
  if (status === 'D') return { sizeBytes: null, modifiedAt: null, sha256: null };
  const absolute = join(sourceRoot, path);
  const stats = statSync(absolute);
  const sha256 = createHash('sha256').update(readFileSync(absolute)).digest('hex');
  return {
    sizeBytes: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    sha256,
  };
}

const changes = [...trackedChanges(), ...untrackedChanges()]
  .sort((left, right) => left.path.localeCompare(right.path))
  .map((change) => ({
    ...change,
    ...classify(change.path),
    ...fileEvidence(change.path, change.status),
  }));

const totalsByWorkstream = Object.fromEntries(
  [...new Set(changes.map((change) => change.workstream))]
    .sort()
    .map((workstream) => [
      workstream,
      changes.filter((change) => change.workstream === workstream).length,
    ]),
);

const inventory = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceCheckout: sourceRoot,
  sourceBranch: git(['branch', '--show-current']).trim(),
  sourceCommit: git(['rev-parse', 'HEAD']).trim(),
  releaseBranch: 'codex/olw-first-look-release',
  releaseCommitAtInventory: '5560b740d04269f538978da1c8377ebfaee52f30',
  itemCount: changes.length,
  totalsByWorkstream,
  changes,
};

mkdirSync(outputRoot, { recursive: true });
writeFileSync(join(outputRoot, 'change-inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);

const lines = [
  '# Our Little World change inventory',
  '',
  `Generated: ${inventory.generatedAt}`,
  '',
  `Canonical dirty checkout: \`${inventory.sourceBranch}\` at \`${inventory.sourceCommit}\``,
  '',
  `Clean release reconstruction: \`${inventory.releaseBranch}\` at \`${inventory.releaseCommitAtInventory}\``,
  '',
  `Expanded inventory: **${inventory.itemCount} files**.`,
  '',
  '## Totals by workstream',
  '',
  '| Workstream | Files |',
  '| --- | ---: |',
  ...Object.entries(totalsByWorkstream).map(([workstream, count]) => `| ${workstream} | ${count} |`),
  '',
  '## File-by-file disposition',
  '',
  '| State | Path | Workstream | Disposition | Clean commit |',
  '| --- | --- | --- | --- | --- |',
  ...changes.map((change) => [
    `| ${change.status}`,
    `\`${change.path.replaceAll('|', '\\|')}\``,
    change.workstream,
    change.disposition.replaceAll('|', '\\|'),
    change.reconstructedCommit ? `\`${change.reconstructedCommit}\`` : '—',
  ].join(' | ') + ' |'),
  '',
  'The JSON companion contains modification times, byte sizes, SHA-256 hashes, and the evidence statement used for each classification. Hashes describe the preserved canonical files only; deleted files have null evidence fields.',
];

writeFileSync(join(outputRoot, 'change-inventory.md'), `${lines.join('\n')}\n`);

console.log(JSON.stringify({
  itemCount: inventory.itemCount,
  totalsByWorkstream,
  json: join(outputRoot, 'change-inventory.json'),
  markdown: join(outputRoot, 'change-inventory.md'),
}, null, 2));
