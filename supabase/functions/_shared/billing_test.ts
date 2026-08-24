import {
  checkoutAttributionFromInput,
  setStripeMetadata,
} from './billing.ts';

Deno.test('checkout attribution accepts only bounded allowlisted values after consent', () => {
  const attribution = checkoutAttributionFromInput({
    attribution_consent: 'granted',
    first_utm_source: 'instagram',
    last_utm_campaign: `launch\u0000${'x'.repeat(200)}`,
    last_utm_content: 'ugc-camera-roll-001',
    landing_path: `/for/unfinished-baby-book/${'y'.repeat(300)}`,
    email: 'must-not-enter-metadata@example.com',
    arbitrary: 'nope',
  });

  if (attribution.first_utm_source !== 'instagram') throw new Error('source was not preserved');
  if (attribution.last_utm_content !== 'ugc-camera-roll-001') throw new Error('creative was not preserved');
  if (attribution.last_utm_campaign.includes('\u0000')) throw new Error('control characters were not removed');
  if (attribution.last_utm_campaign.length !== 160) throw new Error('campaign was not bounded');
  if (attribution.landing_path.length !== 240) throw new Error('path was not bounded');
  if ('email' in attribution || 'arbitrary' in attribution) throw new Error('non-allowlisted values leaked');
});

Deno.test('checkout attribution is empty without explicit consent', () => {
  const attribution = checkoutAttributionFromInput({
    attribution_consent: 'unknown',
    last_utm_campaign: 'launch',
  });
  if (Object.keys(attribution).length !== 0) throw new Error('attribution persisted without consent');
});

Deno.test('Stripe metadata helper writes the requested namespace', () => {
  const params = new URLSearchParams();
  setStripeMetadata(params, { last_utm_campaign: 'launch' }, 'subscription_data[metadata]');
  if (params.get('subscription_data[metadata][last_utm_campaign]') !== 'launch') {
    throw new Error('metadata namespace was not applied');
  }
});
