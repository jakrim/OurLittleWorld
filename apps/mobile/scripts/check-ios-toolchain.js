#!/usr/bin/env node

const { execFileSync } = require('child_process');

const MIN_XCODE = [26, 4, 0];
const MIN_SWIFT = [6, 3, 0];

if (process.env.SKIP_IOS_TOOLCHAIN_CHECK === '1') {
  process.exit(0);
}

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr).trim() : '';
    throw new Error(`${command} ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
}

function parseVersion(value) {
  return value.split('.').map((part) => Number(part)).concat([0, 0, 0]).slice(0, 3);
}

function compareVersions(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return 1;
    if (a[index] < b[index]) return -1;
  }
  return 0;
}

function formatVersion(version) {
  return version.join('.');
}

let xcodeOutput;
let swiftOutput;

try {
  xcodeOutput = run('xcodebuild', ['-version']);
  swiftOutput = run('xcrun', ['swift', '--version']);
} catch (error) {
  console.error(error.message);
  console.error('Install Xcode 26.4 or newer before running local iOS builds.');
  process.exit(1);
}

const xcodeMatch = xcodeOutput.match(/^Xcode\s+([0-9]+(?:\.[0-9]+)*)/m);
const swiftMatch = swiftOutput.match(/Apple Swift version\s+([0-9]+(?:\.[0-9]+)*)/);
const selectedDeveloperDir = run('xcode-select', ['-p']);

if (!xcodeMatch || !swiftMatch) {
  console.error('Could not determine the selected Xcode or Swift version.');
  console.error(xcodeOutput);
  console.error(swiftOutput);
  process.exit(1);
}

const xcodeVersion = parseVersion(xcodeMatch[1]);
const swiftVersion = parseVersion(swiftMatch[1]);
const hasCompatibleXcode = compareVersions(xcodeVersion, MIN_XCODE) >= 0;
const hasCompatibleSwift = compareVersions(swiftVersion, MIN_SWIFT) >= 0;

if (!hasCompatibleXcode || !hasCompatibleSwift) {
  console.error(`Local iOS builds require Xcode ${formatVersion(MIN_XCODE)}+ with Swift ${formatVersion(MIN_SWIFT)}+ for Expo SDK 56.`);
  console.error(`Selected Xcode: ${xcodeMatch[1]} (${selectedDeveloperDir})`);
  console.error(`Selected Swift: ${swiftMatch[1]}`);
  console.error('Update Xcode from the App Store, then rerun this command.');
  process.exit(1);
}

console.log(`iOS toolchain OK: Xcode ${xcodeMatch[1]}, Swift ${swiftMatch[1]}`);
