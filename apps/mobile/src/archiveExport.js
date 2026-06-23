import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';

export async function createPhotoBookExport({ family, stats, years }) {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('Document storage is not available on this device.');

  const directory = `${root}exports/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => {});

  const child = family?.babyName || 'our-little-world';
  const stamp = new Date().toISOString().slice(0, 10);
  const baseName = `our-little-world-${slugify(child)}-${stamp}`;
  const htmlFileName = `${baseName}.html`;
  const htmlUri = `${directory}${htmlFileName}`;
  const html = buildPhotoBookHtml({ family, stats, years, generatedAt: new Date() });

  await FileSystem.writeAsStringAsync(htmlUri, html, { encoding: FileSystem.EncodingType.UTF8 });

  try {
    const printed = await Print.printToFileAsync({ html, base64: false });
    const fileName = `${baseName}.pdf`;
    const uri = `${directory}${fileName}`;
    await FileSystem.copyAsync({ from: printed.uri, to: uri });
    await FileSystem.deleteAsync(printed.uri, { idempotent: true }).catch(() => {});
    return {
      uri,
      fileName,
      htmlUri,
      htmlFileName,
      format: 'pdf',
      mimeType: 'application/pdf',
      title: `${family?.babyName || 'Our Little World'} photo book`,
    };
  } catch (err) {
    console.warn('createPhotoBookExport.pdfFallback', err?.message || err);
  }

  return {
    uri: htmlUri,
    fileName: htmlFileName,
    format: 'html',
    mimeType: 'text/html',
    fallback: true,
    title: `${family?.babyName || 'Our Little World'} photo book preview`,
  };
}

function buildPhotoBookHtml({ family, stats, years, generatedAt }) {
  const child = family?.babyName || 'Our little one';
  const generated = generatedAt.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const yearSections = (years || []).length
    ? years.map(renderYearSection).join('\n')
    : '<section class="empty"><p>No saved years yet. Add a few moments, then rebuild this file.</p></section>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(child)} - Our Little World Photo Book</title>
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
    @page {
      size: Letter;
      margin: 0.6in;
    }
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
    h3 { font-size: 25px; }
    .lede { max-width: 680px; margin-top: 18px; color: var(--soft); font-size: 18px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-top: 28px;
    }
    .stat {
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
    .stat span { color: var(--soft); font-size: 12px; }
    section.year {
      padding: 36px 0;
      border-bottom: 1px solid var(--line);
      break-inside: avoid;
    }
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
    .places { margin-top: 14px; color: var(--soft); font-size: 14px; }
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
      section.year { break-inside: avoid; page-break-inside: avoid; }
      .stat, .tile, .note { break-inside: avoid; }
    }
    @media (max-width: 640px) {
      .stats, .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .year-head { display: block; }
      .counts { text-align: left; margin-top: 8px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="eyebrow">Our Little World photo book</div>
      <h1>${escapeHtml(child)}</h1>
      <p class="lede">A private keepsake preview generated from the saved family archive on ${escapeHtml(generated)}.</p>
      <div class="stats">
        <div class="stat"><strong>${number(stats?.moments)}</strong><span>moments</span></div>
        <div class="stat"><strong>${number(stats?.photos)}</strong><span>photos</span></div>
        <div class="stat"><strong>${number(stats?.videos)}</strong><span>videos</span></div>
        <div class="stat"><strong>${number(stats?.voiceNotes)}</strong><span>voice notes</span></div>
      </div>
    </header>
    ${yearSections}
    <p class="note">This file is a local preview generated by the app. Image links come from the current private archive session and should be exported again before printing or sharing broadly.</p>
  </main>
</body>
</html>`;
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
  if (!src) {
    return `<div class="tile empty">${escapeHtml(record.title || 'Saved moment')}</div>`;
  }
  return `<div class="tile"><img src="${escapeAttr(src)}" alt="${escapeAttr(record.title || 'Saved moment')}"></div>`;
}

function number(value) {
  return Number(value || 0).toLocaleString();
}

function slugify(value) {
  return String(value || 'archive')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'archive';
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
