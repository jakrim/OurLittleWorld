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

test('Tonight media gives the review controls more room as the parent scrolls', () => {
  assert.equal(TONIGHT_MEDIA_COLLAPSE_DISTANCE, 140);
  assert.deepEqual(tonightMediaHeights(667), { expanded: 270, collapsed: 160 });
  assert.deepEqual(tonightMediaHeights(844), { expanded: 338, collapsed: 177 });
  assert.deepEqual(tonightMediaHeights(1366), { expanded: 410, collapsed: 210 });
  assert.deepEqual(tonightMediaHeights(null), { expanded: 338, collapsed: 177 });

  const screen = tonightSource();
  assert.match(screen, /<Animated\.View[\s\S]*height: mediaHeight/);
  assert.match(screen, /<Animated\.ScrollView[\s\S]*contentOffset: \{ y: detailsScrollY \}/);
  assert.match(screen, /useNativeDriver: false/);
});

test('Tonight copy explains the pending Keep without implementation language', () => {
  const screen = tonightSource();
  assert.match(screen, /Add a note \(optional\)/);
  assert.match(screen, /Selected collections are added when you Keep\./);
  assert.match(screen, /Review more photos/);
  assert.match(screen, /This memory didn’t finish saving\. Retry Keep before moving on\./);
  assert.doesNotMatch(screen, /Filed for you|Tap only if one does not belong|Advanced review grid|· \{remaining\} left/);
});
