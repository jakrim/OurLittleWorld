/**
 * "Vision scene labeler" (JS-only edition).
 *
 * We infer useful scene labels from:
 * - geotag clusters (lat/lon)
 * - capture time
 * - memory note keywords
 *
 * This ships now without a native rebuild and keeps a clean API so we can
 * swap in true on-device Vision scene classifiers later.
 */

import { collapsePlacePhotosIntoEvents } from './familyPhotoPresentationModel.js';

function rounded(value, places = 3) {
  const p = 10 ** places;
  return Math.round(value * p) / p;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const MEMORY_KEYWORDS = [
  { label: 'At the mall', words: ['mall', 'shopping', 'target', 'costco', 'store'] },
  { label: 'At the park', words: ['park', 'playground', 'swing', 'slide'] },
  { label: 'At the beach', words: ['beach', 'ocean', 'shore', 'sand'] },
  { label: 'At a restaurant', words: ['restaurant', 'dinner', 'lunch', 'cafe', 'brunch'] },
  { label: 'Bath time', words: ['bath', 'bathtub', 'bubbles'] },
  { label: 'Bedtime', words: ['bedtime', 'sleep', 'asleep', 'nap', 'snuggle'] },
  { label: 'Family visit', words: ['grandma', 'grandpa', 'nana', 'papa', 'family'] },
  { label: 'Outdoor adventure', words: ['outside', 'hike', 'trail', 'walk'] },
];

function labelsFromNote(note) {
  const text = String(note || '').toLowerCase();
  if (!text) return [];
  return MEMORY_KEYWORDS
    .filter((entry) => entry.words.some((word) => text.includes(word)))
    .map((entry) => entry.label);
}

function labelsFromTime(creationTime) {
  if (!creationTime) return [];
  const d = new Date(creationTime);
  if (Number.isNaN(d.getTime())) return [];
  const hour = d.getHours();
  const dow = d.getDay();
  const out = [];
  if (hour >= 6 && hour <= 10) out.push('Morning routine');
  if (hour >= 11 && hour <= 14) out.push('Midday outing');
  if (hour >= 17 && hour <= 20) out.push('Evening wind-down');
  if (dow === 0 || dow === 6) out.push('Weekend together');
  return out;
}

export function inferPhotoSceneLabels({ creationTime, memoryNotes }) {
  const labels = new Set([
    ...labelsFromTime(creationTime),
    ...(memoryNotes || []).flatMap(labelsFromNote),
  ]);
  if (labels.size === 0) labels.add('Family outing');
  return Array.from(labels);
}

export function clusterKeyFromLocation({ latitude, longitude }) {
  const lat = toNumber(latitude);
  const lon = toNumber(longitude);
  if (lat == null || lon == null) return null;
  return `${rounded(lat, 3)}:${rounded(lon, 3)}`;
}

export function formatLocationLabel(location) {
  const known = knownPlaceName(location);
  if (known) return known;
  const lat = toNumber(location?.latitude);
  const lon = toNumber(location?.longitude);
  if (lat == null || lon == null) return 'Unknown place';
  return 'Out and about';
}

export function formatLocationDebugLabel(location) {
  const lat = toNumber(location?.latitude);
  const lon = toNumber(location?.longitude);
  if (lat == null || lon == null) return 'Unknown place';
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(3)}°${latDir} · ${Math.abs(lon).toFixed(3)}°${lonDir}`;
}

export function displayLabelForPlace({ location, topScenes = [], isHome = false } = {}) {
  const known = knownPlaceName(location);
  if (known) return known;
  if (isHome) return 'At home';
  const scenePlace = (topScenes || []).find(isPrimaryPlaceScene);
  if (scenePlace) return scenePlace;
  return formatLocationLabel(location);
}

export function buildPlaceClusters({ shared, metadataByKey, memoriesByKey }) {
  const buckets = new Map();

  for (const photo of shared || []) {
    const key = `${photo.asset_owner_user_id}:${photo.asset_id}`;
    const meta = metadataByKey[key];
    const location = locationForPhoto(photo, meta);
    const clusterKey = clusterKeyFromLocation(location || {});
    if (!clusterKey) continue;

    if (!buckets.has(clusterKey)) {
      buckets.set(clusterKey, {
        id: clusterKey,
        location,
        label: formatLocationLabel(location),
        photos: [],
        sceneCounts: {},
      });
    }

    const bucket = buckets.get(clusterKey);
    const memoryNotes = (memoriesByKey[key] || []).map((m) => m.note).filter(Boolean);
    const labels = inferPhotoSceneLabels({ creationTime: photo.creation_time, memoryNotes });

    for (const label of labels) {
      bucket.sceneCounts[label] = (bucket.sceneCounts[label] || 0) + 1;
    }
    bucket.photos.push(photo);
  }

  const clusters = Array.from(buckets.values()).map((bucket) => {
    const topScenes = Object.entries(bucket.sceneCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([label]) => label);
    const events = collapsePlacePhotosIntoEvents(bucket.photos);
    return {
      ...bucket,
      sourcePhotoCount: bucket.photos.length,
      eventCount: events.length,
      photoEvents: events,
      photos: events.map((event) => ({
        ...event.representative,
        presentationHiddenCount: event.hiddenCount,
      })),
      topScenes,
    };
  });

  if (!clusters.length) return [];

  const homeId = [...clusters]
    .sort((a, b) => b.sourcePhotoCount - a.sourcePhotoCount)[0]?.id;

  return clusters
    .map((cluster) => ({
      ...cluster,
      topScenes: cluster.id === homeId
        ? ['At home', ...cluster.topScenes.filter((label) => label !== 'At home')].slice(0, 4)
        : cluster.topScenes,
      label: displayLabelForPlace({
        location: cluster.location,
        topScenes: cluster.topScenes,
        isHome: cluster.id === homeId,
      }),
    }))
    .sort((a, b) => b.eventCount - a.eventCount);
}

function locationForPhoto(photo, meta) {
  const base = meta?.location || photo?.location || {};
  return {
    ...base,
    latitude: base.latitude ?? photo?.latitude,
    longitude: base.longitude ?? photo?.longitude,
    label: base.label ?? meta?.locationLabel ?? photo?.location_label ?? photo?.place_name,
    name: base.name ?? meta?.placeName,
    formattedAddress: base.formattedAddress ?? meta?.formattedAddress,
  };
}

function knownPlaceName(location) {
  const candidates = [
    location?.label,
    location?.name,
    location?.placeName,
    location?.title,
    location?.formattedAddress,
    location?.address?.name,
    location?.address?.formattedAddress,
  ];
  return candidates.map((value) => String(value || '').trim()).find((value) => value && !looksLikeCoordinates(value)) || '';
}

function looksLikeCoordinates(value) {
  return /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(value)
    || /\d+(\.\d+)?°\s*[NS]\b.*\d+(\.\d+)?°\s*[EW]\b/i.test(value);
}

function isPrimaryPlaceScene(label) {
  return ![
    'Morning routine',
    'Midday outing',
    'Evening wind-down',
    'Weekend together',
    'Family outing',
  ].includes(label);
}
