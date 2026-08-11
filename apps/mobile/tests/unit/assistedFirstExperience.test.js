import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../src/FirstComposeSheetScreen.js', import.meta.url), 'utf8');

test('an assisted First begins with a large candidate and parent confirmation', () => {
  const heroIndex = source.indexOf('<FirstCandidateHero');
  const noteIndex = source.indexOf('placeholder="What happened around it?"');

  assert.match(source, /Could this be the moment\?/);
  assert.match(source, /testID="first-candidate-hero"/);
  assert.match(source, /Possible First/);
  assert.match(source, /Confirm First/);
  assert.match(source, /Nothing is asserted until you confirm/);
  assert.match(source, /Choose another/);
  assert.ok(heroIndex > 0 && heroIndex < noteIndex, 'candidate media appears before optional authorship');
  assert.match(source, /caption="Optional\. One small detail is enough\."/);
});

test('assisted First preserves parent correction authority', () => {
  assert.match(source, /Correct date/);
  assert.match(source, /Edit first title/);
  assert.doesNotMatch(source, /automatically confirmed|we know this was|definitely (?:a )?first/i);
});
