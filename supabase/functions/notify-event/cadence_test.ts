import { assertEquals } from 'jsr:@std/assert';

import { deliveryDecisionFromRows } from './cadence.ts';

const promptEvent = {
  familyId: 'fam1',
  category: 'partner_activity',
  eventKey: 'partner_prompt:fam1:2026-07-06:actor1',
};

Deno.test('partner activity sends one batch per recipient per day', () => {
  const first = deliveryDecisionFromRows({
    event: promptEvent,
    recipientUserId: 'user2',
    preferences: [],
    deliveries: [],
    today: '2026-07-06',
    now: new Date('2026-07-06T16:00:00Z'),
  });
  assertEquals(first, {
    send: true,
    batchKey: 'partner_activity:fam1:user2:2026-07-06',
  });

  const second = deliveryDecisionFromRows({
    event: promptEvent,
    recipientUserId: 'user2',
    preferences: [],
    deliveries: [{ category: 'partner_activity', batch_key: first.batchKey }],
    today: '2026-07-06',
    now: new Date('2026-07-06T16:00:00Z'),
  });
  assertEquals(second, { send: false, batchKey: first.batchKey });
});

Deno.test('disabled category preference stops partner activity sends', () => {
  const decision = deliveryDecisionFromRows({
    event: promptEvent,
    recipientUserId: 'user2',
    preferences: [{ user_id: 'user2', category: 'partner_activity', enabled: false }],
    deliveries: [],
    today: '2026-07-06',
    now: new Date('2026-07-06T16:00:00Z'),
  });

  assertEquals(decision, { send: false, batchKey: '' });
});

Deno.test('non-transactional notifications honor the daily hard cap', () => {
  const decision = deliveryDecisionFromRows({
    event: { familyId: 'fam1', category: 'daily_prompt', eventKey: 'daily_prompt:fam1' },
    recipientUserId: 'user2',
    preferences: [],
    deliveries: [
      { category: 'weekly_digest', batch_key: 'weekly_digest:1' },
      { category: 'partner_activity', batch_key: 'partner_activity:fam1:user2:2026-07-06' },
    ],
    today: '2026-07-06',
    now: new Date('2026-07-06T16:00:00Z'),
  });

  assertEquals(decision.send, false);
});

Deno.test('server never sends Tonight without private device queue proof', () => {
  const decision = deliveryDecisionFromRows({
    event: { familyId: 'fam1', category: 'tonight_picks', eventKey: 'tonight:2026-07-06' },
    recipientUserId: 'user2',
    preferences: [{ user_id: 'user2', category: 'tonight_picks', enabled: true }],
    deliveries: [],
    today: '2026-07-06',
    now: new Date('2026-07-06T20:00:00Z'),
  });

  assertEquals(decision, { send: false, batchKey: '' });
});
