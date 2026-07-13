import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';

import { buildPhotoBookHtml, slugifyExportName } from './archiveExportModel';

export async function createPhotoBookExport({
  family,
  stats,
  years,
  firsts,
  letters,
  promptResponses,
  chapters,
  limitations,
} = {}) {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('Document storage is not available on this device.');

  const directory = `${root}exports/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => {});

  const child = family?.babyName || 'our-little-world';
  const stamp = new Date().toISOString().slice(0, 10);
  const baseName = `our-little-world-${slugifyExportName(child)}-${stamp}`;
  const htmlFileName = `${baseName}.html`;
  const htmlUri = `${directory}${htmlFileName}`;
  const html = buildPhotoBookHtml({
    family,
    stats,
    years,
    firsts,
    letters,
    promptResponses,
    chapters,
    limitations,
    generatedAt: new Date(),
  });

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
