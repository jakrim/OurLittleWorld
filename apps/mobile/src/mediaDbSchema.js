export const MEDIA_DB_SCHEMA_VERSION = 8;

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

export const FIRST_YEAR_CATCHUP_MIGRATION_SQL = `
  alter table discovery_candidates add column capture_timezone text;
  alter table discovery_candidates add column last_seen_scan_key text;
  alter table discovery_candidates add column last_seen_at text;
  alter table discovery_candidates add column unavailable_code text
    check (unavailable_code is null or unavailable_code in (
      'icloud_pending', 'deleted', 'limited_revoked', 'missing_after_full_scan'
    ));
  update discovery_candidates
    set capture_timezone = coalesce(capture_timezone, 'legacy-local'),
        last_seen_scan_key = coalesce(last_seen_scan_key, scan_key),
        last_seen_at = coalesce(last_seen_at, last_analyzed_at),
        unavailable_code = case
          when availability = 'icloud_pending' then 'icloud_pending'
          else unavailable_code
        end;

  create index if not exists discovery_candidates_scope_seen_idx
    on discovery_candidates (family_id, user_id, last_seen_scan_key, capture_time_ms);
  create index if not exists discovery_candidates_scope_availability_idx
    on discovery_candidates (family_id, user_id, availability, unavailable_code, capture_time_ms desc);

  create table if not exists family_saved_day_facts (
    family_id text not null,
    local_day text not null,
    saved_count integer not null check (saved_count > 0),
    refreshed_at text not null,
    primary key (family_id, local_day)
  );
  create index if not exists family_saved_day_facts_scope_day_idx
    on family_saved_day_facts (family_id, local_day);
`;

export const PRIVATE_REMOTE_MEDIA_IDENTITY_MIGRATION_SQL = `
  create table if not exists local_asset_mappings (
    family_id text not null,
    owner_user_id text not null,
    asset_id text not null,
    media_id text,
    last_checked_at text,
    primary key (family_id, owner_user_id, asset_id)
  );
  alter table local_asset_mappings add column remote_asset_key text;
  alter table local_asset_mappings add column moment_id text;
  alter table local_asset_mappings add column updated_at text;
  create unique index if not exists local_asset_mappings_remote_key_idx
    on local_asset_mappings (family_id, owner_user_id, remote_asset_key)
    where remote_asset_key is not null;
`;

export const TONIGHT_COLLECTION_DRAFT_MIGRATION_SQL = `
  alter table nightly_review_enrichment add column draft_collection_keys_json text;
  alter table nightly_review_enrichment add column collection_commit_state text not null default 'idle'
    check (collection_commit_state in ('idle', 'saving', 'saved', 'failed', 'skipped'));
`;

export const TONIGHT_CONTINUATION_MIGRATION_SQL = `
  alter table nightly_review_sessions add column is_continuation integer not null default 0
    check (is_continuation in (0, 1));
  update nightly_review_sessions
    set is_continuation = 1
    where seed like '%:more:%' or seed like '%:revalidated';
`;

export const CANONICAL_KEEP_RESUME_MIGRATION_SQL = `
  alter table nightly_review_enrichment add column parent_interacted integer not null default 0
    check (parent_interacted in (0, 1));
  alter table local_asset_mappings add column provider_upload_json text;
`;

export const LEGACY_PARENT_VIDEO_RECOVERY_MIGRATION_SQL = `
  alter table discovery_candidates add column source_recovery_required integer not null default 0
    check (source_recovery_required in (0, 1));

  update nightly_review_enrichment
    set parent_interacted = 1
    where parent_interacted = 0 and (
      selected_asset_id is not null
      or draft_voice_uri is not null
      or draft_favorite = 1
      or draft_reaction_code is not null
      or retry_id is not null
      or canonical_moment_id is not null
      or canonical_voice_note_id is not null
      or canonical_voice_object_id is not null
      or media_commit_state <> 'idle'
      or text_commit_state <> 'idle'
      or voice_commit_state <> 'idle'
      or reaction_commit_state <> 'idle'
      or collection_commit_state <> 'idle'
      or temp_cleanup_state <> 'idle'
    );

  update discovery_candidates
    set local_uri = null,
        availability = 'unavailable',
        lifecycle_state = 'unavailable',
        source_recovery_required = 1,
        unavailable_reason = 'Reconnect this video to its original in Photos before reviewing it.'
    where media_type = 'video'
      and local_uri is not null
      and preview_uri is not null
      and local_uri = preview_uri
      and availability = 'available'
      and lifecycle_state in ('discovered', 'eligible', 'queued', 'shown');

  update nightly_review_items
    set item_state = 'unavailable',
        last_error_code = 'asset_unavailable',
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    where item_state in ('queued', 'shown')
      and exists (
        select 1
        from discovery_candidates c
        left join nightly_review_enrichment e
          on e.session_id = nightly_review_items.session_id
          and e.position = nightly_review_items.position
        where c.family_id = nightly_review_items.family_id
          and c.user_id = nightly_review_items.user_id
          and c.asset_id = coalesce(e.selected_asset_id, nightly_review_items.asset_id)
          and c.source_recovery_required = 1
      );
`;

export const MEDIA_DB_REQUIRED_CANDIDATE_COLUMNS = Object.freeze([
  'family_id',
  'user_id',
  'asset_id',
  'lifecycle_state',
  'scorer_version',
  'last_analyzed_at',
  'capture_timezone',
  'last_seen_scan_key',
  'last_seen_at',
  'unavailable_code',
  'source_recovery_required',
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
  'parent_interacted',
]);

export const MEDIA_DB_REQUIRED_COLLECTION_DRAFT_COLUMNS = Object.freeze([
  'draft_collection_keys_json',
  'collection_commit_state',
]);

export const MEDIA_DB_REQUIRED_SESSION_COLUMNS = Object.freeze([
  'family_id',
  'user_id',
  'local_day',
  'status',
  'is_continuation',
]);

export const MEDIA_DB_REQUIRED_SAVED_DAY_COLUMNS = Object.freeze([
  'family_id',
  'local_day',
  'saved_count',
  'refreshed_at',
]);

export const MEDIA_DB_REQUIRED_REMOTE_MAPPING_COLUMNS = Object.freeze([
  'family_id',
  'owner_user_id',
  'asset_id',
  'media_id',
  'remote_asset_key',
  'moment_id',
  'provider_upload_json',
  'updated_at',
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
  if (currentVersion < 3) {
    try {
      database.withTransactionSync(() => {
        database.execSync(FIRST_YEAR_CATCHUP_MIGRATION_SQL);
        database.execSync('pragma user_version = 3;');
      });
    } catch (error) {
      throw new Error(`Local first-year catch-up migration failed safely: ${error?.message || error}. Restart the app after freeing device storage.`);
    }
  }
  if (currentVersion < 4) {
    try {
      database.withTransactionSync(() => {
        database.execSync(PRIVATE_REMOTE_MEDIA_IDENTITY_MIGRATION_SQL);
        database.execSync('pragma user_version = 4;');
      });
    } catch (error) {
      throw new Error(`Local private media identity migration failed safely: ${error?.message || error}. Restart the app after freeing device storage.`);
    }
  }
  if (currentVersion < 5) {
    try {
      database.withTransactionSync(() => {
        database.execSync(TONIGHT_COLLECTION_DRAFT_MIGRATION_SQL);
        database.execSync('pragma user_version = 5;');
      });
    } catch (error) {
      throw new Error(`Local Tonight collection draft migration failed safely: ${error?.message || error}. Restart the app after freeing device storage.`);
    }
  }
  if (currentVersion < 6) {
    try {
      database.withTransactionSync(() => {
        database.execSync(TONIGHT_CONTINUATION_MIGRATION_SQL);
        database.execSync('pragma user_version = 6;');
      });
    } catch (error) {
      throw new Error(`Local Tonight continuation migration failed safely: ${error?.message || error}. Restart the app after freeing device storage.`);
    }
  }
  if (currentVersion < 7) {
    try {
      database.withTransactionSync(() => {
        database.execSync(CANONICAL_KEEP_RESUME_MIGRATION_SQL);
        database.execSync('pragma user_version = 7;');
      });
    } catch (error) {
      throw new Error(`Local canonical Keep recovery migration failed safely: ${error?.message || error}. Restart the app after freeing device storage.`);
    }
  }
  if (currentVersion < 8) {
    try {
      database.withTransactionSync(() => {
        database.execSync(LEGACY_PARENT_VIDEO_RECOVERY_MIGRATION_SQL);
        database.execSync('pragma user_version = 8;');
      });
    } catch (error) {
      throw new Error(`Local legacy Tonight recovery migration failed safely: ${error?.message || error}. Restart the app after freeing device storage.`);
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
  const missingCollectionDraft = MEDIA_DB_REQUIRED_COLLECTION_DRAFT_COLUMNS
    .filter((column) => !enrichmentColumns.has(column));
  if (missingCollectionDraft.length) {
    throw new Error(`Local Tonight collection draft store is incomplete; missing columns: ${missingCollectionDraft.join(', ')}. Restart the app after freeing device storage.`);
  }
  const sessionRows = database.getAllSync('pragma table_info(nightly_review_sessions)');
  const sessionColumns = new Set((sessionRows || []).map((row) => row.name));
  const missingSessionColumns = MEDIA_DB_REQUIRED_SESSION_COLUMNS
    .filter((column) => !sessionColumns.has(column));
  if (missingSessionColumns.length) {
    throw new Error(`Local Tonight session store is incomplete; missing columns: ${missingSessionColumns.join(', ')}. Restart the app after freeing device storage.`);
  }
  const savedDayRows = database.getAllSync('pragma table_info(family_saved_day_facts)');
  const savedDayColumns = new Set((savedDayRows || []).map((row) => row.name));
  const missingSavedDayColumns = MEDIA_DB_REQUIRED_SAVED_DAY_COLUMNS
    .filter((column) => !savedDayColumns.has(column));
  if (missingSavedDayColumns.length) {
    throw new Error(`Local saved-day coverage store is incomplete; missing columns: ${missingSavedDayColumns.join(', ')}. Restart the app after freeing device storage.`);
  }
  const mappingRows = database.getAllSync('pragma table_info(local_asset_mappings)');
  const mappingColumns = new Set((mappingRows || []).map((row) => row.name));
  const missingMappingColumns = MEDIA_DB_REQUIRED_REMOTE_MAPPING_COLUMNS
    .filter((column) => !mappingColumns.has(column));
  if (missingMappingColumns.length) {
    throw new Error(`Local private media identity store is incomplete; missing columns: ${missingMappingColumns.join(', ')}. Restart the app after freeing device storage.`);
  }
}
