import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPlaceClusters,
  displayLabelForPlace,
  formatLocationDebugLabel,
  formatLocationLabel,
} from '../../src/visionSceneLabeler.js';

test('place labels never use raw coordinates as primary copy', () => {
  const label = formatLocationLabel({ latitude: 40.7128, longitude: -74.006 });
  const debug = formatLocationDebugLabel({ latitude: 40.7128, longitude: -74.006 });

  assert.equal(label, 'Out and about');
  assert.match(debug, /40\.713°N/);
  assert.doesNotMatch(label, /\d+(\.\d+)?°|40\.7128|-74\.006/);
});

test('known place names win unless they look like coordinates', () => {
  assert.equal(formatLocationLabel({
    latitude: 34.0522,
    longitude: -118.2437,
    label: "Grandma's house",
  }), "Grandma's house");

  assert.equal(formatLocationLabel({
    latitude: 34.0522,
    longitude: -118.2437,
    label: '34.052, -118.244',
  }), 'Out and about');
});

test('place clusters use home and scene fallbacks instead of coordinate titles', () => {
  const shared = [
    photoRow('home-1', { latitude: 40.1, longitude: -73.9, creation_time: '2026-07-01T08:00:00Z' }),
    photoRow('home-2', { latitude: 40.1002, longitude: -73.9002, creation_time: '2026-07-02T08:00:00Z' }),
    photoRow('park-1', { latitude: 40.8, longitude: -73.2, creation_time: '2026-07-03T15:00:00Z' }),
  ];
  const memoriesByKey = {
    'parent:park-1': [{ note: 'At the park on the swings.' }],
  };

  const clusters = buildPlaceClusters({ shared, metadataByKey: {}, memoriesByKey });

  assert.equal(clusters[0].label, 'At home');
  assert.equal(clusters[1].label, 'At the park');
  for (const cluster of clusters) {
    assert.doesNotMatch(cluster.label, /\d+(\.\d+)?°|^-?\d+(\.\d+)?:-?\d+(\.\d+)?$/);
  }
});

test('places without coordinates remain unknown unless a human fallback is available', () => {
  assert.equal(formatLocationLabel({}), 'Unknown place');
  assert.equal(displayLabelForPlace({ location: {}, isHome: true }), 'At home');
  assert.equal(displayLabelForPlace({ location: {}, topScenes: ['At a restaurant'] }), 'At a restaurant');
});

function photoRow(assetId, overrides = {}) {
  return {
    asset_owner_user_id: 'parent',
    asset_id: assetId,
    creation_time: '2026-07-01T12:00:00Z',
    ...overrides,
  };
}
