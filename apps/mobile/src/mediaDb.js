import * as SQLite from 'expo-sqlite';

/**
 * Local media index (plan: "Local SQLite Media Index").
 *
 * The archive renders from this cache immediately on launch while network
 * sync catches up, and the upload queue survives app restarts. Every read
 * is scoped by family_id so a cached archive can never leak across
 * families or accounts.
 */

let db = null;

function getDb() {
  if (db) return db;
  db = SQLite.openDatabaseSync('olw-media.db');
  db.execSync(`
    pragma journal_mode = WAL;

    create table if not exists media_items (
      media_id text primary key,
      family_id text not null,
      moment_id text,
      owner_user_id text,
      asset_owner_user_id text,
      asset_id text,
      media_type text not null,
      upload_status text,
      creation_time text,
      width integer,
      height integer,
      duration_sec real,
      thumb_object text,
      full_object text,
      poster_object text,
      storage_provider text,
      playback_provider text,
      variants_json text,
      updated_at text,
      last_seen_at text
    );
    create index if not exists media_items_family_created_idx
      on media_items (family_id, creation_time desc);

    create table if not exists media_sync_cursors (
      family_id text primary key,
      cursor text,
      synced_at text
    );

    create table if not exists upload_jobs (
      id text primary key,
      family_id text not null,
      local_asset_id text,
      media_type text not null,
      source_uri text,
      target_plan_key text,
      status text not null,
      attempts integer not null default 0,
      reserved_bytes integer,
      reserved_seconds integer,
      error text,
      created_at text,
      updated_at text
    );

    create table if not exists media_variant_cache (
      cache_key text primary key,
      media_id text not null,
      variant text not null,
      url text,
      expires_at text,
      local_uri text,
      byte_size integer,
      updated_at text
    );

    create table if not exists local_asset_mappings (
      family_id text not null,
      owner_user_id text not null,
      asset_id text not null,
      media_id text,
      last_checked_at text,
      primary key (family_id, owner_user_id, asset_id)
    );
  `);
  return db;
}

function nowIso() {
  return new Date().toISOString();
}

// ─── Media items ─────────────────────────────────────────────────────────────

/** Upserts timeline page rows (photo_tags + joined moment_media shape). */
export function cacheTaggedRows(familyId, rows) {
  if (!familyId || !rows?.length) return;
  const database = getDb();
  const stamp = nowIso();
  database.withTransactionSync(() => {
    for (const row of rows) {
      const mediaId = row.moment_media_id || `${row.asset_owner_user_id}:${row.asset_id}`;
      database.runSync(
        `insert into media_items (
           media_id, family_id, moment_id, owner_user_id, asset_owner_user_id, asset_id,
           media_type, upload_status, creation_time, width, height, duration_sec,
           thumb_object, full_object, poster_object, variants_json, updated_at, last_seen_at
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(media_id) do update set
           family_id = excluded.family_id,
           moment_id = excluded.moment_id,
           asset_owner_user_id = excluded.asset_owner_user_id,
           asset_id = excluded.asset_id,
           media_type = excluded.media_type,
           upload_status = excluded.upload_status,
           creation_time = excluded.creation_time,
           width = excluded.width,
           height = excluded.height,
           duration_sec = excluded.duration_sec,
           thumb_object = excluded.thumb_object,
           full_object = excluded.full_object,
           variants_json = excluded.variants_json,
           updated_at = excluded.updated_at,
           last_seen_at = excluded.last_seen_at`,
        [
          mediaId,
          familyId,
          row.moment_id || null,
          row.asset_owner_user_id || null,
          row.asset_owner_user_id || null,
          row.asset_id || null,
          row.media_type || row.moment_media?.media_type || 'image',
          row.upload_status || 'ready',
          row.creation_time || null,
          row.original_width || null,
          row.original_height || null,
          row.moment_media?.duration_sec || null,
          row.thumb_object || null,
          row.storage_object || null,
          null,
          JSON.stringify(row.moment_media?.metadata || {}),
          stamp,
          stamp,
        ],
      );
    }
  });
}

/** Reads cached rows back in the shape listSharedTaggedPage returns. */
export function readCachedTaggedRows(familyId, { limit = 120 } = {}) {
  if (!familyId) return [];
  const rows = getDb().getAllSync(
    `select * from media_items
     where family_id = ?
     order by (creation_time is null), creation_time desc, asset_owner_user_id, asset_id
     limit ?`,
    [familyId, limit],
  );
  return rows.map((row) => {
    let metadata = {};
    try {
      metadata = JSON.parse(row.variants_json || '{}');
    } catch {}
    return {
      family_id: row.family_id,
      asset_owner_user_id: row.asset_owner_user_id,
      asset_id: row.asset_id,
      creation_time: row.creation_time,
      original_width: row.width,
      original_height: row.height,
      storage_object: row.full_object,
      thumb_object: row.thumb_object,
      upload_status: row.upload_status,
      moment_id: row.moment_id,
      moment_media_id: row.media_id,
      media_type: row.media_type,
      moment_media: { media_type: row.media_type, duration_sec: row.duration_sec, metadata },
      fromCache: true,
      fullUrl: null,
      thumbUrl: null,
    };
  });
}

export function removeCachedMedia({ familyId, assetOwnerUserId, assetId }) {
  if (!familyId || !assetId) return;
  getDb().runSync(
    'delete from media_items where family_id = ? and asset_owner_user_id = ? and asset_id = ?',
    [familyId, assetOwnerUserId || '', assetId],
  );
}

export function clearFamilyCache(familyId) {
  if (!familyId) return;
  const database = getDb();
  database.runSync('delete from media_items where family_id = ?', [familyId]);
  database.runSync('delete from media_sync_cursors where family_id = ?', [familyId]);
  database.runSync('delete from upload_jobs where family_id = ?', [familyId]);
  database.runSync('delete from local_asset_mappings where family_id = ?', [familyId]);
}

// ─── Sync cursors ────────────────────────────────────────────────────────────

export function getSyncCursor(familyId) {
  if (!familyId) return null;
  const row = getDb().getFirstSync('select cursor, synced_at from media_sync_cursors where family_id = ?', [familyId]);
  return row?.cursor || null;
}

export function setSyncCursor(familyId, cursor) {
  if (!familyId) return;
  getDb().runSync(
    `insert into media_sync_cursors (family_id, cursor, synced_at) values (?, ?, ?)
     on conflict(family_id) do update set cursor = excluded.cursor, synced_at = excluded.synced_at`,
    [familyId, cursor || null, nowIso()],
  );
}

// ─── Upload jobs ─────────────────────────────────────────────────────────────

export function enqueueUploadJob({ id, familyId, localAssetId, mediaType, sourceUri = null, videoPosterOnly = false }) {
  if (!id || !familyId) return;
  const stamp = nowIso();
  getDb().runSync(
    `insert into upload_jobs (id, family_id, local_asset_id, media_type, source_uri, target_plan_key, status, attempts, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)
     on conflict(id) do update set status = 'queued', updated_at = excluded.updated_at`,
    [id, familyId, localAssetId || null, mediaType || 'image', sourceUri, videoPosterOnly ? 'poster_only' : null, stamp, stamp],
  );
}

export function markUploadJob(id, status, error = null) {
  if (!id) return;
  if (status === 'done') {
    getDb().runSync('delete from upload_jobs where id = ?', [id]);
    return;
  }
  getDb().runSync(
    `update upload_jobs
     set status = ?, error = ?, attempts = attempts + (case when ? = 'failed' then 1 else 0 end), updated_at = ?
     where id = ?`,
    [status, error, status, nowIso(), id],
  );
}

export function listPendingUploadJobs(familyId, { maxAttempts = 5 } = {}) {
  if (!familyId) return [];
  return getDb().getAllSync(
    `select * from upload_jobs
     where family_id = ? and status in ('queued', 'failed') and attempts < ?
     order by created_at asc limit 50`,
    [familyId, maxAttempts],
  );
}

// ─── Signed URL variant cache ────────────────────────────────────────────────

export function getCachedVariantUrl(mediaId, variant) {
  if (!mediaId) return null;
  const row = getDb().getFirstSync(
    'select url, expires_at from media_variant_cache where cache_key = ?',
    [`${mediaId}:${variant}`],
  );
  if (!row?.url) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now() + 60000) return null;
  return row.url;
}

export function setCachedVariantUrl(mediaId, variant, url, ttlSeconds = 3600) {
  if (!mediaId || !url) return;
  getDb().runSync(
    `insert into media_variant_cache (cache_key, media_id, variant, url, expires_at, updated_at)
     values (?, ?, ?, ?, ?, ?)
     on conflict(cache_key) do update set url = excluded.url, expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
    [`${mediaId}:${variant}`, mediaId, variant, url, new Date(Date.now() + ttlSeconds * 1000).toISOString(), nowIso()],
  );
}
