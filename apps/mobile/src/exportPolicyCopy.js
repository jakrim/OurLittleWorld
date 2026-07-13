export const EXPORT_POLICY_COPY = Object.freeze({
  alwaysExportable: 'Memories are always exportable.',
  lapsedVault: 'Memories are never deleted for non-payment. If a subscription lapses, saved memories stay in a read-only vault. You can view and export what you already kept; new uploads, assistant photo discovery, and auto-save pause until a plan is active again.',
  exportScope: 'Exports include photos, videos as video posters in the current local preview, voice references, letters, firsts, prompt answers, dates, metadata, and chapter summaries when available.',
  privateShare: 'Private summary sharing uses your device share sheet and does not create a feed or public link.',
  previewLimitations: [
    'Playable video files are represented by posters in this local preview.',
    'Voice recordings are listed as references in this local preview; full audio files are not included yet.',
    'Private share links and print fulfillment are not included in this file.',
  ],
});
