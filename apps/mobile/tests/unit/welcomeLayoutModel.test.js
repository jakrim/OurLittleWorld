import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WELCOME_ACCESSIBLE_FONT_SCALE,
  shouldUseAccessibleWelcomeLayout,
  welcomeSlideAccessibilityLabel,
} from '../../src/welcomeLayoutModel.js';

test('standard text keeps the photo-forward paged welcome', () => {
  assert.equal(shouldUseAccessibleWelcomeLayout({ fontScale: 1 }), false);
  assert.equal(
    shouldUseAccessibleWelcomeLayout({ fontScale: WELCOME_ACCESSIBLE_FONT_SCALE - 0.01 }),
    false,
  );
});

test('accessibility text switches to the readable scrolling welcome', () => {
  assert.equal(shouldUseAccessibleWelcomeLayout({ fontScale: 1.1 }), true);
  assert.equal(
    shouldUseAccessibleWelcomeLayout({ fontScale: WELCOME_ACCESSIBLE_FONT_SCALE }),
    true,
  );
  assert.equal(shouldUseAccessibleWelcomeLayout({ fontScale: 3.1 }), true);
});

test('invalid scale evidence fails back to the standard layout', () => {
  assert.equal(shouldUseAccessibleWelcomeLayout({ fontScale: Number.NaN }), false);
  assert.equal(shouldUseAccessibleWelcomeLayout(), false);
});

test('pager announcements preserve grounded copy without forced visual line breaks', () => {
  assert.equal(
    welcomeSlideAccessibilityLabel({
      slide: {
        eyebrow: 'Your private family space',
        title: 'Likely moments.\nYou approve what stays.',
        body: 'You decide what is kept.',
      },
      index: 0,
      total: 4,
    }),
    'Slide 1 of 4. Your private family space Likely moments. You approve what stays. You decide what is kept.',
  );
  assert.equal(welcomeSlideAccessibilityLabel(), '');
});
