import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC_DIR = path.join(ROOT, 'src');

test('screen styles do not unset typography colors in dark mode', async () => {
  const offenders = [];
  for (const file of await sourceFiles(SRC_DIR)) {
    const text = await readFile(file, 'utf8');
    if (/color\s*:\s*undefined/.test(text)) {
      offenders.push(path.relative(ROOT, file));
    }
  }

  assert.deepEqual(offenders, []);
});

test('family onboarding does not pin the root to the light palette', async () => {
  const text = await readFile(path.join(SRC_DIR, 'FamilyOnboardingScreen.js'), 'utf8');

  assert.match(text, /useTheme\(\)/);
  assert.match(text, /backgroundColor:\s*theme\.semantic\.bg/);
  assert.doesNotMatch(text, /backgroundColor:\s*['"]#FAF4EE['"]/);
});

test('glass buttons keep readable icons in dark mode', async () => {
  const text = await readFile(path.join(SRC_DIR, 'ui/GlassButton.js'), 'utf8');

  assert.match(text, /const iconColor = theme\.colors\.ink/);
  assert.doesNotMatch(text, /theme\.isDark\s*\?\s*theme\.colors\.bg/);
});

test('back chevrons do not use dark background tokens as icon colors', async () => {
  const offenders = [];
  const blockedColorTokens = [
    'theme.colors.bg',
    'colors.plum',
    'colors.ink',
  ];

  for (const file of await sourceFiles(SRC_DIR)) {
    const text = await readFile(file, 'utf8');
    const chevrons = text.match(/<Ionicons[\s\S]*?name=["']chevron-back["'][\s\S]*?\/>/g) || [];
    for (const chevron of chevrons) {
      if (blockedColorTokens.some((token) => chevron.includes(`color={${token}}`))) {
        offenders.push(path.relative(ROOT, file));
        break;
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test('birthday discovery panel uses the active theme in dark mode', async () => {
  const text = await readFile(path.join(SRC_DIR, 'ReferencePhotoScreen.js'), 'utf8');

  assert.match(text, /backgroundColor:\s*theme\.semantic\.cardAlt/);
  assert.match(text, /borderColor:\s*theme\.semantic\.border/);
  assert.match(text, /ActivityIndicator color=\{theme\.semantic\.primary\}/);
  assert.doesNotMatch(text, /style=\{styles\.frame\}/);
  assert.doesNotMatch(text, /backgroundColor:\s*semantic\.cardAlt/);
});

test('welcome carousel themes both page copy and illustration surfaces', async () => {
  const text = await readFile(path.join(SRC_DIR, 'WelcomeScreen.js'), 'utf8');

  assert.match(text, /const theme = useTheme\(\)/);
  assert.match(text, /color:\s*theme\.semantic\.text/);
  assert.match(text, /color:\s*theme\.semantic\.textSoft/);
  assert.match(text, /color:\s*theme\.semantic\.textMuted/);
  assert.match(text, /styles\.bookCard, \{ backgroundColor: theme\.semantic\.card/);
  assert.match(text, /styles\.noteCard, \{ backgroundColor: theme\.semantic\.card/);
  assert.match(text, /styles\.growthCard, \{ backgroundColor: theme\.semantic\.card/);
  assert.match(text, /styles\.privateCard, \{ backgroundColor: theme\.semantic\.card/);
  assert.doesNotMatch(text, /headline:\s*\{[^}]*color:/s);
  assert.doesNotMatch(text, /legalText:\s*\{[^}]*color:/s);
  assert.doesNotMatch(text, /rgba\(255,\s*250,\s*246/);
});

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await sourceFiles(fullPath));
    } else if (/\.[jt]sx?$/.test(entry.name)) {
      out.push(fullPath);
    }
  }
  return out;
}
