import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  TONIGHT_MEDIA_COLLAPSE_DISTANCE,
  tonightMediaHeights,
} from '../../src/tonightReviewLayoutModel.js';

const tonightSource = () => readFileSync(
  new URL('../../src/TonightScreen.js', import.meta.url),
  'utf8',
);
const todaySource = () => readFileSync(
  new URL('../../src/TodayScreen.js', import.meta.url),
  'utf8',
);

test('Tonight media gives the review controls more room as the parent scrolls', () => {
  assert.equal(TONIGHT_MEDIA_COLLAPSE_DISTANCE, 140);
  assert.deepEqual(tonightMediaHeights(667), { expanded: 347, collapsed: 170 });
  assert.deepEqual(tonightMediaHeights(844), { expanded: 439, collapsed: 186 });
  assert.deepEqual(tonightMediaHeights(1366), { expanded: 520, collapsed: 240 });
  assert.deepEqual(tonightMediaHeights(null), { expanded: 439, collapsed: 186 });

  const screen = tonightSource();
  assert.match(screen, /<Animated\.View[\s\S]*height: mediaHeight/);
  assert.match(screen, /<Animated\.ScrollView[\s\S]*contentOffset: \{ y: detailsScrollY \}/);
  assert.match(screen, /useNativeDriver: false/);
  assert.ok(screen.indexOf('testID="tonight-keep"') > screen.indexOf('</Animated.ScrollView>'));
  assert.ok(screen.indexOf('testID="tonight-skip"') > screen.indexOf('</Animated.ScrollView>'));
});

test('Tonight copy explains the pending Keep without implementation language', () => {
  const screen = tonightSource();
  assert.match(screen, /Add a note \(optional\)/);
  assert.match(screen, /Selected collections are added when you Keep\./);
  assert.match(screen, />Another</);
  assert.match(screen, /This memory didn’t finish saving\. Retry Keep before moving on\./);
  assert.doesNotMatch(screen, /Review more photos|Filed for you|Tap only if one does not belong|Advanced review grid|· \{remaining\} left/);
});

test('photo-first QA is non-mutating and carries from Today into Tonight', () => {
  assert.match(todaySource(), /manualQaFixture \? \{ qa: 'photo-first' \} : \{\}/);
  const screen = tonightSource();
  assert.match(screen, /buildTodayManualQaFixture\(params\.qa\)/);
  assert.match(screen, /if \(manualQaFixture\) \{[\s\S]*setSession\(manualQaFixture\.session\)/);
  assert.match(screen, /if \(manualQaFixture \|\| activePosition == null/);
});
