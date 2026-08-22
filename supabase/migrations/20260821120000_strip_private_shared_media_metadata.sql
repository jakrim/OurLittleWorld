-- Historical repair for two fields that predated the current explicit shared
-- media metadata allowlist. Neither field is read by the app. Recognition frame
-- timing belongs only in the device-local candidate ledger, and raw poster
-- errors may contain provider or local-path detail.

update public.moment_media
set metadata = coalesce(metadata, '{}'::jsonb)
  - 'recognitionFrameTimeMs'
  - 'posterError'
where coalesce(metadata, '{}'::jsonb) ?| array[
  'recognitionFrameTimeMs',
  'posterError'
];
