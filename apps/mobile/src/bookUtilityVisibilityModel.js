export function buildBookUtilityVisibility({
  uploadQueue = null,
  iCloudRetry = null,
  pendingChange = null,
} = {}) {
  const uploadTotal = Number(uploadQueue?.total || 0);
  const failedUploads = Number(uploadQueue?.failed || 0);
  const iCloudWaitCount = Number(iCloudRetry?.count || 0);
  const showBlockingUpload = uploadTotal > 0 && failedUploads > 0;
  const showBlockingICloud = iCloudWaitCount > 0;
  const showNonBlockingUploadDetails = uploadTotal > 0 && !showBlockingUpload;
  const showCameraRollChangeDetails = !!pendingChange;
  const secondaryDetailCount = [
    showNonBlockingUploadDetails,
    showCameraRollChangeDetails,
  ].filter(Boolean).length;

  return {
    showBlockingUpload,
    showBlockingICloud,
    hasBlockingAction: showBlockingUpload || showBlockingICloud,
    showNonBlockingUploadDetails,
    showCameraRollChangeDetails,
    hasSecondaryDetails: secondaryDetailCount > 0,
    secondaryDetailCount,
  };
}
