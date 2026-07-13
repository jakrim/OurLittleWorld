import { EXPORT_POLICY_COPY } from './exportPolicyCopy.js';

export const EXPORT_PREVIEW_LIMITATIONS = EXPORT_POLICY_COPY.previewLimitations;

export function buildPhotoBookHtml({
  family,
  stats = {},
  years = [],
  firsts = [],
  letters = [],
  promptResponses = [],
  chapters = [],
  limitations = EXPORT_PREVIEW_LIMITATIONS,
  generatedAt = new Date(),
} = {}) {
  const child = family?.babyName || 'Our little one';
  const generated = generatedAt.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const yearSections = (years || []).length
    ? years.map(renderYearSection).join('\n')
    : '<section class="empty"><p>No saved chapters yet. Add a few moments, then rebuild this file.</p></section>';
  const voiceItems = voiceItemsFromChapters(chapters);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(child)} - Our Little World Book Preview</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #fffaf4;
      --ink: #251f1c;
      --soft: #796b62;
      --line: #e6d8ca;
      --accent: #9f5d48;
      --mist: #f3eadf;
    }
    * { box-sizing: border-box; }
    @page { size: Letter; margin: 0.6in; }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    main { max-width: 920px; margin: 0 auto; padding: 32px 20px 56px; }
    header {
      min-height: 58vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      border-bottom: 1px solid var(--line);
    }
    .eyebrow {
      color: var(--accent);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    h1, h2, h3 {
      font-family: Georgia, "Times New Roman", serif;
      font-style: italic;
      font-weight: 500;
      line-height: 1.08;
      margin: 0;
    }
    h1 { margin-top: 12px; font-size: clamp(42px, 10vw, 92px); }
    h2 { margin-top: 42px; font-size: clamp(30px, 6vw, 54px); }
    h3 { font-size: 24px; }
    .lede { max-width: 700px; margin-top: 18px; color: var(--soft); font-size: 18px; }
    .stats, .chapter-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-top: 28px;
    }
    .stat, .note-card {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 15px;
      background: white;
    }
    .stat strong {
      display: block;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 30px;
      font-style: italic;
      font-weight: 500;
      line-height: 1;
    }
    .stat span, .muted { color: var(--soft); font-size: 13px; }
    section { padding: 34px 0; border-bottom: 1px solid var(--line); break-inside: avoid; }
    .year-head {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: flex-end;
      margin-bottom: 18px;
    }
    .counts { color: var(--soft); font-size: 13px; text-align: right; }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
    .tile {
      min-height: 170px;
      border-radius: 14px;
      overflow: hidden;
      background: var(--mist);
      border: 1px solid var(--line);
      position: relative;
    }
    .tile img {
      width: 100%;
      height: 100%;
      min-height: 170px;
      object-fit: cover;
      display: block;
    }
    .tile.empty {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--soft);
      padding: 14px;
      text-align: center;
    }
    .badge {
      position: absolute;
      left: 8px;
      bottom: 8px;
      border-radius: 999px;
      background: rgba(37, 31, 28, 0.78);
      color: white;
      font-size: 11px;
      padding: 4px 7px;
    }
    .places { margin-top: 14px; color: var(--soft); font-size: 14px; }
    .note-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
    .note-card h3 { margin-bottom: 6px; }
    .note {
      margin-top: 32px;
      padding: 16px;
      border-radius: 16px;
      background: var(--mist);
      color: var(--soft);
      font-size: 13px;
    }
    @media print {
      body { background: white; }
      main { max-width: none; padding: 0; }
      header { min-height: 90vh; break-after: page; page-break-after: always; }
      section { break-inside: avoid; page-break-inside: avoid; }
      .stat, .tile, .note, .note-card { break-inside: avoid; }
    }
    @media (max-width: 640px) {
      .stats, .grid, .note-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .year-head { display: block; }
      .counts { text-align: left; margin-top: 8px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="eyebrow">Our Little World book preview</div>
      <h1>${escapeHtml(child)}</h1>
      <p class="lede">${escapeHtml(EXPORT_POLICY_COPY.alwaysExportable)} ${escapeHtml(EXPORT_POLICY_COPY.lapsedVault)} ${escapeHtml(EXPORT_POLICY_COPY.exportScope)} This parent-approved preview was generated from saved family book chapters on ${escapeHtml(generated)}.</p>
      <div class="stats">
        <div class="stat"><strong>${number(stats?.moments)}</strong><span>moments</span></div>
        <div class="stat"><strong>${number(stats?.photos)}</strong><span>photos</span></div>
        <div class="stat"><strong>${number(stats?.videos)}</strong><span>videos</span></div>
        <div class="stat"><strong>${number(stats?.voiceNotes)}</strong><span>voice notes</span></div>
      </div>
    </header>
    ${yearSections}
    ${renderFirstsSection(firsts)}
    ${renderLettersSection(letters)}
    ${renderPromptSection(promptResponses)}
    ${renderVoiceSection(voiceItems, stats)}
    ${renderLimitationsSection(limitations)}
    <p class="note">This file is a local preview generated by the app. Image links come from the current private book session and should be exported again before printing or sharing broadly.</p>
  </main>
</body>
</html>`;
}

export function slugifyExportName(value) {
  return String(value || 'archive')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'archive';
}

function renderYearSection(year) {
  const tiles = (year.representative || []).slice(0, 8);
  const tileHtml = tiles.length
    ? tiles.map(renderTile).join('\n')
    : '<div class="tile empty">No representative media yet.</div>';
  const places = year.places?.length
    ? `<p class="places">Places: ${escapeHtml(year.places.slice(0, 6).join(', '))}</p>`
    : '';
  return `<section class="year">
  <div class="year-head">
    <div>
      <div class="eyebrow">Year in review</div>
      <h2>${escapeHtml(String(year.year))}</h2>
    </div>
    <div class="counts">${number(year.moments)} moments<br>${number(year.photos)} photos, ${number(year.videos)} videos, ${number(year.voiceNotes)} voice</div>
  </div>
  <div class="grid">${tileHtml}</div>
  ${places}
</section>`;
}

function renderTile(record) {
  const src = record.thumbUrl || record.fullUrl;
  const badge = record.videoCount ? '<span class="badge">Video poster</span>' : record.voiceOnly ? '<span class="badge">Voice</span>' : '';
  if (!src) {
    return `<div class="tile empty">${escapeHtml(record.title || 'Saved moment')}${badge}</div>`;
  }
  return `<div class="tile"><img src="${escapeAttr(src)}" alt="${escapeAttr(record.title || 'Saved moment')}">${badge}</div>`;
}

function renderFirstsSection(firsts) {
  const rows = (firsts || []).filter((first) => first && first.done !== false);
  if (!rows.length) {
    return renderLimitedSection('Firsts', 'Saved firsts', 'No saved firsts are available in this preview yet.');
  }
  return renderNoteSection('Firsts', 'Saved firsts', rows.map((first) => ({
    title: first.title || 'Saved first',
    body: [formatDate(first.happened_at), first.note].filter(Boolean).join(' - ') || 'Kept with the baby book.',
  })));
}

function renderLettersSection(letters) {
  const rows = (letters || []).filter(Boolean);
  if (!rows.length) {
    return renderLimitedSection('Letters', 'Letters', 'No letters are available in this preview yet.');
  }
  return renderNoteSection('Letters', 'Letters', rows.map((letter) => ({
    title: letter.title || 'Letter saved for later',
    body: [letter.body, letter.open_on ? `Opens ${formatDate(letter.open_on)}` : 'Saved with the baby book.'].filter(Boolean).join(' '),
  })));
}

function renderPromptSection(promptResponses) {
  const rows = (promptResponses || [])
    .filter((row) => String(row?.response_text || row?.responseText || '').trim());
  if (!rows.length) {
    return renderLimitedSection('Prompt answers', 'Prompt answers', 'No prompt answers are available in this preview yet.');
  }
  return renderNoteSection('Prompt answers', 'Prompt answers', rows.map((row) => ({
    title: row.prompt_text || row.promptText || 'Prompt answered',
    body: [String(row.response_text || row.responseText || '').trim(), formatDate(row.prompt_date || row.promptDate)].filter(Boolean).join(' - '),
  })));
}

function renderVoiceSection(voiceItems, stats) {
  if (!voiceItems.length && !Number(stats?.voiceNotes || 0)) {
    return renderLimitedSection('Voice', 'Voice references', 'No voice notes are available in this preview yet.');
  }
  const items = voiceItems.length
    ? voiceItems
    : [{ title: 'Voice notes', body: `${number(stats?.voiceNotes)} voice notes are saved in the book.` }];
  return renderNoteSection('Voice', 'Voice references', items);
}

function renderLimitationsSection(limitations) {
  const rows = (limitations || []).filter(Boolean);
  if (!rows.length) return '';
  const items = rows.map((item) => `<li>${escapeHtml(typeof item === 'string' ? item : item.label || item.title || item.body)}</li>`).join('');
  return `<section>
  <div class="eyebrow">Export notes</div>
  <h2>What this preview includes</h2>
  <p class="muted">${escapeHtml(EXPORT_POLICY_COPY.exportScope)}</p>
  <ul>${items}</ul>
</section>`;
}

function renderLimitedSection(eyebrow, title, body) {
  return `<section>
  <div class="eyebrow">${escapeHtml(eyebrow)}</div>
  <h2>${escapeHtml(title)}</h2>
  <p class="muted">Limited preview: ${escapeHtml(body)}</p>
</section>`;
}

function renderNoteSection(eyebrow, title, rows) {
  const cards = rows.slice(0, 12).map((row) => `<article class="note-card">
  <div class="eyebrow">${escapeHtml(eyebrow)}</div>
  <h3>${escapeHtml(row.title)}</h3>
  <p class="muted">${escapeHtml(row.body || 'Saved with the baby book.')}</p>
</article>`).join('\n');
  return `<section>
  <div class="eyebrow">${escapeHtml(eyebrow)}</div>
  <h2>${escapeHtml(title)}</h2>
  <div class="note-list">${cards}</div>
</section>`;
}

function voiceItemsFromChapters(chapters = []) {
  return (chapters || []).flatMap((chapter) => (chapter.contextItems || [])
    .filter((item) => item.kind === 'voice')
    .map((item) => ({
      title: item.title || 'Voice note',
      body: [chapter.title, item.caption].filter(Boolean).join(' - '),
    })));
}

function formatDate(value) {
  if (!value) return '';
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function number(value) {
  return Number(value || 0).toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
