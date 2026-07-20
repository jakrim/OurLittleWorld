export const MEDIA_DB_SCHEMA_VERSION = 2;

export const CANDIDATE_LEDGER_MIGRATION_SQL = `
  create table if not exists discovery_candidates (
    family_id text not null,
    user_id text not null,
    asset_id text not null,
    media_type text not null check (media_type in ('image', 'video')),
    local_uri text,
    preview_uri text,
    availability text not null default 'available'
      check (availability in ('available', 'icloud_pending', 'unavailable')),
    capture_time_ms integer,
    local_day text,
    width integer,
    height integer,
    duration_sec real,
    identity_score real,
    identity_band text check (identity_band is null or identity_band in ('clear', 'uncertain')),
    face_count integer,
    capture_quality real,
    face_size_ratio real,
    sharpness real,
    smile_score real,
    video_presence_ratio real,
    video_sampled_frames integer,
    video_matched_frames integer,
    visual_fingerprint_json text,
    identity_evidence_json text,
    event_cluster_key text,
    representative_asset_id text,
    cluster_member_count integer not null default 1,
    scorer_version text not null,
    selection_reason_code text check (selection_reason_code is null or selection_reason_code in (
      'best_day', 'best_burst', 'distinct_standout', 'clear_video', 'first_year_coverage', 'parent_pick'
    )),
    lifecycle_state text not null check (lifecycle_state in (
      'discovered', 'eligible', 'queued', 'shown', 'kept', 'skipped', 'unavailable', 'rejected', 'superseded'
    )),
    scan_key text,
    first_seen_at text not null,
    last_analyzed_at text not null,
    queued_at text,
    shown_at text,
    decided_at text,
    unavailable_reason text,
    superseded_by_asset_id text,
    primary key (family_id, user_id, asset_id)
  );

  create index if not exists discovery_candidates_scope_state_day_idx
    on discovery_candidates (family_id, user_id, lifecycle_state, local_day, capture_quality desc);
  create index if not exists discovery_candidates_scope_capture_idx
    on discovery_candidates (family_id, user_id, capture_time_ms desc);
  create index if not exists discovery_candidates_scope_cluster_idx
    on discovery_candidates (family_id, user_id, event_cluster_key, representative_asset_id);
  create index if not exists discovery_candidates_scope_scan_idx
    on discovery_candidates (family_id, user_id, scan_key);

  create table if not exists candidate_clusters (
    family_id text not null,
    user_id text not null,
    cluster_id text not null,
    representative_asset_id text not null,
    member_count integer not null check (member_count > 0),
    cluster_kind text not null check (cluster_kind in ('burst', 'event', 'video')),
    scorer_version text not null,
    updated_at text not null,
    primary key (family_id, user_id, cluster_id)
  );

  create table if not exists candidate_cluster_members (
    family_id text not null,
    user_id text not null,
    cluster_id text not null,
    asset_id text not null,
    is_representative integer not null default 0 check (is_representative in (0, 1)),
    updated_at text not null,
    primary key (family_id, user_id, cluster_id, asset_id),
    foreign key (family_id, user_id, cluster_id)
      references candidate_clusters (family_id, user_id, cluster_id) on delete cascade,
    foreign key (family_id, user_id, asset_id)
      references discovery_candidates (family_id, user_id, asset_id) on delete cascade
  );

  create index if not exists candidate_cluster_members_asset_idx
    on candidate_cluster_members (family_id, user_id, asset_id);

  create table if not exists nightly_review_sessions (
    session_id text primary key,
    family_id text not null,
    user_id text not null,
    local_day text not null,
    timezone text not null,
    seed text not null,
    status text not null check (status in ('active', 'completed')),
    generation_version text not null,
    model_version text not null,
    current_position integer not null default 0 check (current_position >= 0),
    item_count integer not null check (item_count >= 0),
    created_at text not null,
    updated_at text not null,
    completed_at text
  );

  create unique index if not exists nightly_review_one_active_scope_idx
    on nightly_review_sessions (family_id, user_id) where status = 'active';
  create index if not exists nightly_review_sessions_scope_day_idx
    on nightly_review_sessions (family_id, user_id, local_day desc);

  create table if not exists nightly_review_items (
    session_id text not null,
    position integer not null check (position >= 0),
    family_id text not null,
    user_id text not null,
    asset_id text not null,
    reason_code text not null check (reason_code in (
      'best_day', 'best_burst', 'distinct_standout', 'clear_video', 'first_year_coverage', 'parent_pick'
    )),
    item_state text not null check (item_state in ('queued', 'shown', 'kept', 'skipped', 'unavailable')),
    commit_state text not null default 'idle' check (commit_state in ('idle', 'saving', 'done', 'failed')),
    draft_text text,
    shown_at text,
    decided_at text,
    last_error_code text,
    updated_at text not null,
    primary key (session_id, position),
    unique (session_id, asset_id),
    foreign key (session_id) references nightly_review_sessions (session_id) on delete cascade,
    foreign key (family_id, user_id, asset_id)
      references discovery_candidates (family_id, user_id, asset_id) on delete restrict
  );

  create index if not exists nightly_review_items_resume_idx
    on nightly_review_items (session_id, item_state, position);
`;

export const TONIGHT_ENRICHMENT_MIGRATION_SQL = `
  create table if not exists nightly_review_enrichment (
    session_id text not null,
    position integer not null check (position >= 0),
    family_id text not null,
    user_id text not null,
    selected_asset_id text,
    draft_voice_uri text,
    draft_voice_duration_sec real,
    draft_voice_mime_type text,
    draft_voice_waveform_json text,
    draft_favorite integer not null default 0 check (draft_favorite in (0, 1)),
    draft_reaction_code text check (draft_reaction_code is null or draft_reaction_code in ('spark', 'seen')),
    retry_id text,
    canonical_moment_id text,
    canonical_voice_note_id text,
    canonical_voice_object_id text,
    media_commit_state text not null default 'idle'
      check (media_commit_state in ('idle', 'saving', 'saved', 'failed')),
    text_commit_state text not null default 'idle'
      check (text_commit_state in ('idle', 'saving', 'saved', 'failed', 'skipped')),
    voice_commit_state text not null default 'idle'
      check (voice_commit_state in ('idle', 'saving', 'saved', 'failed', 'skipped')),
    reaction_commit_state text not null default 'idle'
      check (reaction_commit_state in ('idle', 'saving', 'saved', 'failed', 'skipped')),
    temp_cleanup_state text not null default 'idle'
      check (temp_cleanup_state in ('idle', 'pending', 'done', 'failed')),
    updated_at text not null,
    primary key (session_id, position),
    foreign key (session_id, position)
      references nightly_review_items (session_id, position) on delete cascade,
    foreign key (family_id, user_id, selected_asset_id)
      references discovery_candidates (family_id, user_id, asset_id) on delete restrict
  );

  create index if not exists nightly_review_enrichment_scope_idx
    on nightly_review_enrichment (family_id, user_id, session_id, position);
`;

export const MEDIA_DB_REQUIRED_CANDIDATE_COLUMNS = Object.freeze([
  'family_id',
  'user_id',
  'asset_id',
  'lifecycle_state',
  'scorer_version',
  'last_analyzed_at',
]);

export const MEDIA_DB_REQUIRED_ENRICHMENT_COLUMNS = Object.freeze([
  'family_id',
  'user_id',
  'selected_asset_id',
  'draft_voice_uri',
  'draft_favorite',
  'retry_id',
  'canonical_moment_id',
  'media_commit_state',
  'voice_commit_state',
]);

export function applyMediaDbMigrations(database) {
  if (!database) throw new Error('Local media database is unavailable');
  const versionRow = database.getFirstSync('pragma user_version');
  const currentVersion = Number(versionRow?.user_version || 0);
  if (currentVersion > MEDIA_DB_SCHEMA_VERSION) {
    throw new Error(`Local media database version ${currentVersion} is newer than supported version ${MEDIA_DB_SCHEMA_VERSION}`);
  }
  if (currentVersion < 1) {
    try {
      database.withTransactionSync(() => {
        database.execSync(CANDIDATE_LEDGER_MIGRATION_SQL);
        database.execSync('pragma user_version = 1;');
      });
    } catch (error) {
      throw new Error(`Local candidate ledger migration failed safely: ${error?.message || error}. Restart the app after freeing device storage.`);
    }
  }
  if (currentVersion < 2) {
    try {
      database.withTransactionSync(() => {
        database.execSync(TONIGHT_ENRICHMENT_MIGRATION_SQL);
        database.execSync('pragma user_version = 2;');
      });
    } catch (error) {
      throw new Error(`Local Tonight enrichment migration failed safely: ${error?.message || error}. Restart the app after freeing device storage.`);
    }
  }
  assertCandidateLedgerSchema(database);
  return MEDIA_DB_SCHEMA_VERSION;
}

export function assertCandidateLedgerSchema(database) {
  const rows = database.getAllSync('pragma table_info(discovery_candidates)');
  const columns = new Set((rows || []).map((row) => row.name));
  const missing = MEDIA_DB_REQUIRED_CANDIDATE_COLUMNS.filter((column) => !columns.has(column));
  if (missing.length) {
    throw new Error(`Local candidate ledger is incomplete; missing columns: ${missing.join(', ')}. Restart the app after freeing device storage.`);
  }
  const enrichmentRows = database.getAllSync('pragma table_info(nightly_review_enrichment)');
  const enrichmentColumns = new Set((enrichmentRows || []).map((row) => row.name));
  const missingEnrichment = MEDIA_DB_REQUIRED_ENRICHMENT_COLUMNS.filter((column) => !enrichmentColumns.has(column));
  if (missingEnrichment.length) {
    throw new Error(`Local Tonight enrichment store is incomplete; missing columns: ${missingEnrichment.join(', ')}. Restart the app after freeing device storage.`);
  }
}
