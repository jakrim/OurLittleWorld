import assert from 'node:assert/strict';
import test from 'node:test';

import {
  familyOnboardingSurfaceStyle,
  glassButtonIconColor,
  referenceDiscoveryPanelStyle,
  welcomeCardStyle,
} from '../../src/themeStyleContractModel.js';

const darkTheme = {
  colors: { ink: '#F8EFE7' },
  semantic: {
    bg: '#1A130E',
    card: '#2A211A',
    cardAlt: '#211912',
    border: '#3E3026',
    primary: '#D98268',
    text: '#F8EFE7',
    textSoft: '#D7C7BA',
    textMuted: '#A99588',
  },
};

test('dark-mode surfaces and controls use readable semantic colors', () => {
  assert.deepEqual(familyOnboardingSurfaceStyle(darkTheme), { backgroundColor: '#1A130E' });
  assert.equal(glassButtonIconColor(darkTheme), '#F8EFE7');
  assert.deepEqual(referenceDiscoveryPanelStyle(darkTheme), {
    frame: {
      backgroundColor: '#211912',
      borderColor: '#3E3026',
    },
    progressColor: '#D98268',
  });
  assert.deepEqual(welcomeCardStyle(darkTheme), {
    backgroundColor: '#2A211A',
    borderColor: '#3E3026',
    titleColor: '#F8EFE7',
    bodyColor: '#D7C7BA',
    captionColor: '#A99588',
  });
});
