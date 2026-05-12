import { Image as RNImage, Share } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;
const STORY_ASPECT = STORY_WIDTH / STORY_HEIGHT;

function getImageSize(uri) {
  return new Promise((resolve) => {
    if (!uri) {
      resolve({ width: STORY_WIDTH, height: STORY_HEIGHT });
      return;
    }
    RNImage.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve({ width: STORY_WIDTH, height: STORY_HEIGHT }),
    );
  });
}

function buildCaption({ babyName, ageLabel }) {
  const who = babyName || 'Our little one';
  const age = ageLabel ? ` (${ageLabel})` : '';
  return `${who}${age}\nshared from our little world`;
}

function buildRichCaption({
  babyName,
  ageLabel,
  dateLabel,
  memoryNote,
  memoryAuthor,
  placeLabel,
}) {
  const who = babyName || 'Our little one';
  const title = ageLabel ? `${who} · ${ageLabel}` : who;
  const lines = [title];
  if (dateLabel) lines.push(dateLabel);
  if (placeLabel) lines.push(placeLabel);
  if (memoryNote) {
    const clean = String(memoryNote).trim().replace(/\s+/g, ' ');
    const excerpt = clean.length > 180 ? `${clean.slice(0, 177)}...` : clean;
    lines.push(`"${excerpt}"${memoryAuthor ? ` — ${memoryAuthor}` : ''}`);
  }
  lines.push('shared from our little world');
  return lines.join('\n');
}

async function renderStoryImage(sourceUri) {
  const { width, height } = await getImageSize(sourceUri);
  const sourceAspect = width / height;

  const resizeAction = sourceAspect > STORY_ASPECT
    ? { resize: { height: STORY_HEIGHT } }
    : { resize: { width: STORY_WIDTH } };

  const resized = await ImageManipulator.manipulateAsync(
    sourceUri,
    [resizeAction],
    { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
  );

  if (resized.width < STORY_WIDTH || resized.height < STORY_HEIGHT) {
    return resized.uri;
  }

  const originX = Math.max(0, Math.round((resized.width - STORY_WIDTH) / 2));
  const originY = Math.max(0, Math.round((resized.height - STORY_HEIGHT) / 2));

  const cropped = await ImageManipulator.manipulateAsync(
    resized.uri,
    [{ crop: { originX, originY, width: STORY_WIDTH, height: STORY_HEIGHT } }],
    { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
  );

  return cropped.uri;
}

export async function shareMomentFromUri({ sourceUri, babyName, ageLabel }) {
  if (!sourceUri) throw new Error('No photo available to share');
  const storyUri = await renderStoryImage(sourceUri);
  const message = buildCaption({ babyName, ageLabel });
  await Share.share({
    title: `${babyName || 'Our little world'} moment`,
    message,
    url: storyUri,
  });
}

export async function shareMemoryMoment({
  sourceUri,
  babyName,
  ageLabel,
  dateLabel,
  memoryNote,
  memoryAuthor,
  placeLabel,
}) {
  if (!sourceUri) throw new Error('No photo available to share');
  const storyUri = await renderStoryImage(sourceUri);
  const message = buildRichCaption({
    babyName,
    ageLabel,
    dateLabel,
    memoryNote,
    memoryAuthor,
    placeLabel,
  });
  await Share.share({
    title: `${babyName || 'Our little world'} memory`,
    message,
    url: storyUri,
  });
}
