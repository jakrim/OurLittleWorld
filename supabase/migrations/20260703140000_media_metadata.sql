-- Media metadata columns (Phase 2 of the media/pricing plan).
-- Provider fields stay 'supabase' until the Stream/R2 milestone; quota_class
-- lets scan-discovered videos exist as poster-only memories.

alter table public.moment_media
  add column if not exists storage_provider text not null default 'supabase'
    check (storage_provider in ('supabase', 'r2', 'stream')),
  add column if not exists playback_provider text
    check (playback_provider in ('supabase', 'stream', 'r2')),
  add column if not exists optimized_bytes bigint,
  add column if not exists original_bytes bigint,
  add column if not exists source_bytes bigint,
  add column if not exists playback_seconds integer,
  add column if not exists stream_uid text,
  add column if not exists original_object uuid,
  add column if not exists quota_class text not null default 'optimized'
    check (quota_class in ('optimized', 'original', 'poster_only')),
  add column if not exists variants jsonb not null default '{}'::jsonb;
