#!/usr/bin/env node
/**
 * Seed the booted iOS Simulator's Photos library with a realistic test
 * dataset that mirrors a typical parent's library: ~1,500 dated, geotagged
 * photos spread across the baby's life, with a handful of clustered
 * "places" so Places, Monthiversaries, Browse paging and Random modes all
 * have something to work with without needing real photos on hand.
 *
 * Requirements (already installed on this Mac):
 *   - imagemagick `convert`
 *   - `exiftool`
 *   - `xcrun simctl` (Xcode)
 *
 * Usage:
 *   node scripts/seed-simulator-photos.js
 *   node scripts/seed-simulator-photos.js --count 500
 *   node scripts/seed-simulator-photos.js --device "iPhone Air"
 *   node scripts/seed-simulator-photos.js --reset       # clears generated cache first
 *
 * The script writes JPEGs into ./tmp/sim-photos/ then bulk imports them
 * via `xcrun simctl addmedia`. Photos are colored gradients labeled with
 * their fake date so you can visually identify them in the simulator.
 *
 * If you drop real face photos into ./scripts/seed-faces/<anything>.jpg
 * they will be re-used (with new EXIF) so the face matcher has actual
 * faces to find.
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'tmp', 'sim-photos');
const facesDir = path.join(root, 'scripts', 'seed-faces');

// ─── CLI ─────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));
const count = Number(args.count || 1500);
const deviceName = args.device || null;
const reset = !!args.reset;
const skipImport = !!args['skip-import'];
const babyBirth = new Date(args.birth || '2025-07-23T09:00:00');
const now = new Date();

// ─── Sanity checks ───────────────────────────────────────────────────────────

requireBin('convert', 'brew install imagemagick');
requireBin('exiftool', 'brew install exiftool');
requireBin('xcrun', 'install Xcode command line tools');

const targetDevice = pickBootedDevice(deviceName);
if (!targetDevice) {
  console.error('No booted iOS simulator found. Boot one and try again.');
  process.exit(1);
}
console.log(`Target simulator: ${targetDevice.name} (${targetDevice.udid})`);

if (reset && fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// ─── Place / time fixtures ───────────────────────────────────────────────────

// "Places" simulate where the photos were taken. Coords are real-ish so
// the Places map clusters something visible.
const PLACES = [
  { name: 'home', lat: 40.7295, lon: -73.9965, weight: 0.55 },
  { name: 'park', lat: 40.7826, lon: -73.9656, weight: 0.15 },
  { name: 'mall', lat: 40.7587, lon: -73.9787, weight: 0.10 },
  { name: 'grandparents', lat: 41.0534, lon: -73.5387, weight: 0.10 },
  { name: 'beach', lat: 40.5795, lon: -73.8345, weight: 0.05 },
  { name: 'restaurant', lat: 40.7218, lon: -74.0027, weight: 0.05 },
];
const placePicker = weightedPicker(PLACES);

const PALETTES = [
  ['#F8C5B3', '#E89177'],
  ['#EBC3CB', '#C76E7E'],
  ['#F0D9B0', '#D6A45C'],
  ['#D8E3D5', '#94B89B'],
  ['#FBF6F0', '#E0D0C2'],
  ['#5C4250', '#2D1F26'],
  ['#F4ECE3', '#C5B5AC'],
];

// ─── Generate ────────────────────────────────────────────────────────────────

const seedFaces = collectSeedFaces();
if (seedFaces.length) {
  console.log(`Found ${seedFaces.length} seed face image(s) in scripts/seed-faces/`);
} else {
  console.log('No scripts/seed-faces/ images — generating gradient-only test set. Drop real face JPEGs there to also test the face matcher.');
}

console.log(`Generating ${count} photos in ${outDir}…`);
const generated = [];
const startMs = babyBirth.getTime();
const endMs = now.getTime();

for (let i = 0; i < count; i++) {
  const date = randomDate(startMs, endMs);
  const place = Math.random() < 0.85 ? placePicker() : null;
  const useFace = seedFaces.length && Math.random() < 0.18;
  const filename = `seed_${i.toString().padStart(5, '0')}_${date.getTime()}.jpg`;
  const outPath = path.join(outDir, filename);

  if (useFace) {
    const sourceFace = seedFaces[Math.floor(Math.random() * seedFaces.length)];
    copyAndAdjust(sourceFace, outPath);
  } else {
    const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    const portrait = Math.random() < 0.65;
    const width = portrait ? 1200 : 1600;
    const height = portrait ? 1600 : 1200;
    generateGradient(outPath, palette, width, height, formatStamp(date, place?.name));
  }

  writeExif(outPath, date, place);
  generated.push(outPath);

  if ((i + 1) % 100 === 0 || i === count - 1) {
    process.stdout.write(`\r  ${i + 1} / ${count}`);
  }
}
console.log('');

if (skipImport) {
  console.log(`Skipping import. Files are in ${outDir}.`);
  process.exit(0);
}

// ─── Import in chunks (simctl chokes on huge arg lists) ──────────────────────

console.log('Importing into the simulator… (this may take a minute)');
const CHUNK = 100;
for (let i = 0; i < generated.length; i += CHUNK) {
  const slice = generated.slice(i, i + CHUNK);
  const result = spawnSync(
    'xcrun',
    ['simctl', 'addmedia', targetDevice.udid, ...slice],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    console.error(`addmedia failed at chunk ${i}; stopping.`);
    process.exit(1);
  }
  process.stdout.write(`\r  ${Math.min(i + CHUNK, generated.length)} / ${generated.length} imported`);
}
console.log('\nDone. Open Photos in the simulator to confirm.');
console.log('Tip: scripts/sim-screenshot.sh saves a fresh screenshot to ./tmp/screenshots/ for the agent to view.');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.replace(/^--/, '');
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function requireBin(bin, hint) {
  const r = spawnSync('which', [bin]);
  if (r.status !== 0) {
    console.error(`Missing ${bin}. Install: ${hint}`);
    process.exit(1);
  }
}

function pickBootedDevice(preferredName) {
  const json = JSON.parse(execSync('xcrun simctl list devices booted -j').toString());
  const all = [];
  for (const list of Object.values(json.devices || {})) {
    for (const d of list || []) if (d.state === 'Booted') all.push(d);
  }
  if (!all.length) return null;
  if (preferredName) {
    const match = all.find((d) => d.name === preferredName);
    if (match) return match;
    console.warn(`No booted device named "${preferredName}". Falling back to first booted device.`);
  }
  return all[0];
}

function weightedPicker(entries) {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  return () => {
    const r = Math.random() * total;
    let acc = 0;
    for (const e of entries) {
      acc += e.weight;
      if (r <= acc) return e;
    }
    return entries[entries.length - 1];
  };
}

function randomDate(startMs, endMs) {
  // Bias slightly toward more recent dates — most parents take more
  // photos as the baby ages, not fewer.
  const skewed = Math.pow(Math.random(), 0.7);
  return new Date(startMs + skewed * (endMs - startMs));
}

function jitterCoord(value, magnitude = 0.0035) {
  return value + (Math.random() - 0.5) * magnitude * 2;
}

function formatStamp(date, place) {
  const dateLine = date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return place ? `${dateLine}\\n${place}` : dateLine;
}

function generateGradient(outPath, [from, to], width, height, label) {
  // ImageMagick: radial gradient + label overlay so each photo is visually distinct.
  const cmd = [
    'convert',
    '-size', `${width}x${height}`,
    `gradient:${from}-${to}`,
    '-gravity', 'center',
    '-pointsize', '64',
    '-fill', 'white',
    '-stroke', 'rgba(0,0,0,0.35)',
    '-strokewidth', '2',
    '-annotate', '0', label,
    '-quality', '85',
    outPath,
  ];
  spawnSync(cmd[0], cmd.slice(1), { stdio: 'ignore' });
}

function collectSeedFaces() {
  if (!fs.existsSync(facesDir)) return [];
  return fs
    .readdirSync(facesDir)
    .filter((f) => /\.(jpe?g|png|heic)$/i.test(f))
    .map((f) => path.join(facesDir, f));
}

function copyAndAdjust(source, outPath) {
  // Re-encode as JPEG with random light tweaks so they look like
  // different shots, not literal copies. Vision still recognizes them.
  const brightness = 90 + Math.floor(Math.random() * 25);     // 90..114
  const saturation = 90 + Math.floor(Math.random() * 30);     // 90..119
  const hue = 95 + Math.floor(Math.random() * 11);            // 95..105
  spawnSync('convert', [
    source,
    '-modulate', `${brightness},${saturation},${hue}`,
    '-quality', '88',
    outPath,
  ], { stdio: 'ignore' });
}

function writeExif(file, date, place) {
  const iso = date.toISOString();
  const dt = formatExifDate(date);
  const args = [
    '-overwrite_original',
    `-DateTimeOriginal=${dt}`,
    `-CreateDate=${dt}`,
    `-ModifyDate=${dt}`,
    `-FileModifyDate=${dt}`,
    '-Make=Apple',
    '-Model=iPhone Test',
    '-Software=Our Little World seeder',
  ];
  if (place) {
    const lat = jitterCoord(place.lat);
    const lon = jitterCoord(place.lon);
    args.push(
      `-GPSLatitude=${Math.abs(lat)}`,
      `-GPSLatitudeRef=${lat >= 0 ? 'N' : 'S'}`,
      `-GPSLongitude=${Math.abs(lon)}`,
      `-GPSLongitudeRef=${lon >= 0 ? 'E' : 'W'}`,
    );
  }
  args.push(file);
  spawnSync('exiftool', args, { stdio: 'ignore' });
}

function formatExifDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
