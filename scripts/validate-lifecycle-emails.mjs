import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const path = new URL('../operations/lifecycle-emails.json', import.meta.url);
const definition = JSON.parse(await readFile(path, 'utf8'));

assert.equal(definition.project_id, 'our-little-world');
assert.equal(definition.global_rules.production_send_default, false);
assert.equal(definition.global_rules.marketing_requires_explicit_consent, true);

const ids = new Set();
for (const sequence of definition.sequences) {
  assert.ok(['transactional', 'marketing'].includes(sequence.classification));
  if (sequence.classification === 'marketing') {
    assert.match(sequence.consent_requirement, /explicit marketing consent/i);
    assert.ok(sequence.suppression.includes('unsubscribed'));
    assert.ok(sequence.suppression.includes('consent_revoked'));
  } else {
    assert.match(sequence.consent_requirement, /service|fulfill|none/i);
  }
  for (const message of sequence.messages) {
    assert.ok(!ids.has(message.message_id), `duplicate message_id: ${message.message_id}`);
    ids.add(message.message_id);
    assert.ok(message.subject && message.preview && message.body && message.cta && message.destination);
    assert.equal(/child_name|birthday|caption|letter_body|prompt_answer|media_identifier/i.test(JSON.stringify(message.provider_data)), false);
  }
}

assert.ok(ids.has('gift-purchase-confirmed'));
assert.ok(ids.has('gift-recipient-delivery'));
assert.ok(ids.has('orientation-one-moment'));
assert.ok(ids.has('inactivity-no-guilt'));

console.log(`Validated ${definition.sequences.length} lifecycle sequences and ${ids.size} messages.`);
