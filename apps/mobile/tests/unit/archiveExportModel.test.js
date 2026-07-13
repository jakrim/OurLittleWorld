import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPORT_PREVIEW_LIMITATIONS,
  buildPhotoBookHtml,
  slugifyExportName,
} from '../../src/archiveExportModel.js';

test('photo book export html includes trust copy and available book sections', () => {
  const html = buildPhotoBookHtml({
    family: { babyName: 'Noa' },
    stats: { moments: 3, photos: 2, videos: 1, voiceNotes: 1 },
    years: [
      {
        year: 2026,
        moments: 3,
        photos: 2,
        videos: 1,
        voiceNotes: 1,
        places: ['At home'],
        representative: [
          { title: 'Splash day', thumbUrl: 'splash.jpg', videoCount: 1 },
          { title: 'Morning smile', thumbUrl: 'smile.jpg', imageCount: 1 },
        ],
      },
    ],
    firsts: [
      { id: 'first-laugh', title: 'First laugh', done: true, happened_at: '2026-07-01', note: 'Everyone stopped to listen.' },
    ],
    letters: [
      { id: 'letter-1', title: 'For your first summer', body: 'You loved the light.', open_on: '2030-01-01' },
    ],
    promptResponses: [
      {
        id: 'prompt-1',
        prompt_text: 'What surprised you today?',
        response_text: 'The sudden belly laugh.',
        prompt_date: '2026-07-02',
      },
    ],
    chapters: [
      {
        title: 'July 2026',
        contextItems: [
          {
            kind: 'voice',
            title: 'Grandma singing',
            caption: '1 voice note saved with this moment',
          },
        ],
      },
    ],
    limitations: EXPORT_PREVIEW_LIMITATIONS,
    generatedAt: new Date('2026-07-09T12:00:00'),
  });

  assert.match(html, /Memories are always exportable/);
  assert.match(html, /read-only vault/);
  assert.match(html, /new uploads, assistant photo discovery, and auto-save pause/);
  assert.match(html, /dates, metadata, and chapter summaries/);
  assert.match(html, /Video poster/);
  assert.match(html, /First laugh/);
  assert.match(html, /For your first summer/);
  assert.match(html, /What surprised you today\?/);
  assert.match(html, /The sudden belly laugh/);
  assert.match(html, /Voice references/);
  assert.match(html, /Grandma singing/);
  assert.match(html, /Playable video files are represented by posters/);
  assert.match(html, /Voice recordings are listed as references/);
  assert.match(html, /Private share links and print fulfillment/);
});

test('photo book export html labels unavailable sections as a limited preview', () => {
  const html = buildPhotoBookHtml({
    family: { babyName: 'Noa' },
    stats: { moments: 0, photos: 0, videos: 0, voiceNotes: 0 },
    years: [],
    firsts: [],
    letters: [],
    promptResponses: [],
    chapters: [],
    generatedAt: new Date('2026-07-09T12:00:00'),
  });

  assert.match(html, /Limited preview: No saved firsts/);
  assert.match(html, /Limited preview: No letters/);
  assert.match(html, /Limited preview: No prompt answers/);
  assert.match(html, /Limited preview: No voice notes/);
});

test('export file slugs stay filesystem-safe', () => {
  assert.equal(slugifyExportName("Noa's First Summer!"), 'noa-s-first-summer');
  assert.equal(slugifyExportName(''), 'archive');
});
