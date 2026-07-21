import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

test('shared automatic collections are derived only after canonical Keep', () => {
  const tonightCommit = source('../../src/tonightCommit.js');
  const tonightModel = source('../../src/tonightCommitModel.js');
  const collections = source('../../src/collections.js');

  assert.match(tonightCommit, /saveCollections:\s*applyMomentCollectionChoices/);
  assert.match(tonightModel, /const momentId = current\.canonicalMomentId/);
  assert.match(tonightModel, /if \(!momentId\) throw new Error\('Saved memory target is not ready yet'\)/);
  assert.match(collections, /rpc\('apply_moment_collection_choices'/);
  assert.doesNotMatch(collections, /asset[_A-Z]?id|fingerprint|identity|face|candidate|draft_voice_uri/i);
});

test('collection reads are bounded and never load the full archive into JavaScript', () => {
  const collections = source('../../src/collections.js');
  const moments = source('../../src/moments.js');

  assert.match(collections, /COLLECTION_MOMENT_PAGE_SIZE = 60/);
  assert.match(collections, /Math\.min\(COLLECTION_MOMENT_PAGE_SIZE/);
  assert.match(collections, /safeOffset \+ bounded - 1/);
  assert.match(collections, /from\('family_collection_moments'\)/);
  assert.match(collections, /order\('captured_at', \{ ascending: false \}\)/);
  assert.match(moments, /slice\(0, 60\)/);
  const library = source('../../src/LibraryScreen.js');
  assert.match(library, /columns=\{fontScale >= 1\.4 \? 2 : 3\}/);
  assert.match(library, /accessibilityLabel=\{`\$\{collection\.title\}, \$\{countText/);
});

test('migration grants archive collection access only to writers and gates mutations on entitlement', () => {
  const migration = source('../../../../supabase/migrations/20260720220000_automatic_factual_collections.sql');

  assert.match(migration, /collections_select_writers[\s\S]*is_family_writer\(family_id\)/);
  assert.match(migration, /collection_memberships_select_writers[\s\S]*is_family_writer\(family_id\)/);
  assert.match(migration, /family_has_active_entitlement\(target_family_id\)/);
  assert.match(migration, /parent_override[\s\S]*'excluded'/);
  assert.match(migration, /create or replace view public\.family_collection_moments/);
  assert.match(migration, /valid_collection_keys[\s\S]*delete from public\.collection_memberships[\s\S]*not \(c\.collection_key = any\(valid_collection_keys\)\)/);
  assert.doesNotMatch(migration, /'(activity|emotion|development|preference|intent)'/);
});

test('visual activity suggestions remain deliberately gated', () => {
  const model = source('../../src/automaticCollectionModel.js');
  const migration = source('../../../../supabase/migrations/20260720220000_automatic_factual_collections.sql');
  const combined = `${model}\n${migration}`;

  assert.doesNotMatch(combined, /kind[^\n]*(activity|scene)|source_code[^\n]*(activity|scene)/i);
  assert.doesNotMatch(combined, /model_version[^\n]*(vision|scene|activity)/i);
});
