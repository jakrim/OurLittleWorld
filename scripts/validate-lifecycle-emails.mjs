import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const path = new URL('../operations/lifecycle-emails.json', import.meta.url);
const definition = JSON.parse(await readFile(path, 'utf8'));
const mailchimpPath = new URL('../operations/welcome-sequence-mailchimp.json', import.meta.url);
const mailchimp = JSON.parse(await readFile(mailchimpPath, 'utf8'));
const parentPath = new URL('../operations/parent-onboarding-v2.json', import.meta.url);
const parent = JSON.parse(await readFile(parentPath, 'utf8'));

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
    assert.ok(message.subject.length >= 20 && message.subject.length <= 60, `subject length: ${message.message_id}`);
    assert.ok(message.preview.length >= 38 && message.preview.length <= 140, `preview length: ${message.message_id}`);
    assert.equal(/child_name|birthday|caption|letter_body|prompt_answer|media_identifier/i.test(JSON.stringify(message.provider_data)), false);
  }
}

assert.ok(ids.has('gift-purchase-confirmed'));
assert.ok(ids.has('gift-recipient-delivery'));
assert.ok(ids.has('orientation-one-moment'));
assert.ok(ids.has('privacy-and-control'));
assert.ok(ids.has('welcome-no-catch-up'));
assert.ok(ids.has('inactivity-no-guilt'));

const welcome = definition.sequences.find((sequence) => sequence.sequence_id === 'activation-first-approved-memory');
assert.equal(welcome.messages.length, 5);
assert.equal(welcome.status, 'retired_no_entry');
assert.equal(welcome.superseded_by, 'operations/parent-onboarding-v2.json');
assert.equal(parent.emails.length, 6);
assert.equal(mailchimp.classification, 'marketing');
assert.equal(mailchimp.source_sequence, 'operations/parent-onboarding-v2.json');
assert.equal(mailchimp.flow_status, 'draft_not_activated');
assert.equal(parent.entry.audience_id, mailchimp.audience_id);
assert.ok(parent.suppression.includes('consent_revoked'));
for (const message of parent.emails) {
  assert.ok(message.subject_alternatives.length >= 3, `subject alternatives missing: ${message.id}`);
  assert.ok(message.preview_alternatives.length >= 2, `preview alternatives missing: ${message.id}`);
  assert.ok(message.paragraphs.length > 0, `copy missing: ${message.id}`);
  assert.equal(typeof mailchimp.mailchimp[message.id].template_id, 'number', `template missing: ${message.id}`);
}

console.log(`Validated ${definition.sequences.length} lifecycle sequences, ${ids.size} legacy/transactional messages, and ${parent.emails.length} V2 parent emails.`);
