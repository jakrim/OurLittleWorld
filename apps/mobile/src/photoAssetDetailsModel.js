function failedRead(error) {
  return { value: null, error };
}

async function readField(read) {
  try {
    return { value: await read(), error: null };
  } catch (error) {
    return failedRead(error);
  }
}

/**
 * Read Photos metadata without letting an unavailable local media URI erase
 * independently accessible facts such as the asset's capture time.
 */
export async function readMediaLibraryAssetDetails({ asset, assetId, visionUri }) {
  if (!asset || !assetId) throw new Error('A Photos asset and identifier are required');

  const [
    uriRead,
    creationTimeRead,
    locationRead,
    widthRead,
    heightRead,
    mediaTypeRead,
    durationRead,
    fileNameRead,
  ] = await Promise.all([
    readField(() => asset.getUri()),
    readField(() => asset.getCreationTime()),
    readField(() => asset.getLocation()),
    readField(() => asset.getWidth()),
    readField(() => asset.getHeight()),
    readField(() => asset.getMediaType()),
    readField(() => asset.getDuration()),
    readField(() => asset.getFilename()),
  ]);

  const uri = uriRead.value || null;
  const uriFailed = Boolean(uriRead.error);
  return {
    id: assetId,
    mediaType: mediaTypeRead.value ?? null,
    uri: visionUri,
    localUri: uri || (uriFailed ? null : visionUri),
    downloadStatus: uri ? 'ready' : uriFailed ? 'failed' : 'pending',
    ...(uriFailed ? {
      downloadError: String(uriRead.error?.message || uriRead.error || 'Could not load photo from library'),
    } : {}),
    creationTime: creationTimeRead.value ?? undefined,
    location: locationRead.value ?? null,
    width: widthRead.value ?? undefined,
    height: heightRead.value ?? undefined,
    duration: durationRead.value ?? undefined,
    fileName: fileNameRead.value ?? null,
  };
}
