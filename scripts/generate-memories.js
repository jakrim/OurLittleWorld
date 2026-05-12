/**
 * Writes a starter stub file from assets/images/ — does NOT touch data/memories.js.
 * Handwritten stories live in data/memories.js. Use this output as a checklist when
 * adding new photos, then copy new Memory(...) rows into memories.js.
 * Run: npm run generate-memories
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const imagesDir = path.join(root, 'assets', 'images');
const outFile = path.join(root, 'data', 'memories.generated.stub.js');

const files = fs
  .readdirSync(imagesDir)
  .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f))
  .sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );

if (files.length === 0) {
  console.warn('No images found in assets/images/');
  process.exit(1);
}

const entries = files.map((file) => {
  const base = path.basename(file, path.extname(file));
  const safeId = base.replace(/'/g, "\\'");
  return `  new Memory(
    '${safeId}',
    'TODO title',
    'TODO location',
    'TODO description',
    require('../assets/images/${file}')
  )`;
});

const content = `/**
 * AUTO-GENERATED — npm run generate-memories
 * Not imported by the app. Copy rows into data/memories.js and replace TODOs.
 */
import Memory from '../models/memory';

export const MEMORIES_STUB = [
${entries.join(',\n')},
];
`;

fs.writeFileSync(outFile, content);
console.log(`Wrote ${files.length} stub entries to data/memories.generated.stub.js`);
