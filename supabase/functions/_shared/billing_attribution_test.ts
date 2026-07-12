import {
  acquisitionMetadataFromBody,
  acquisitionMetadataFromRecord,
  appendAcquisitionMetadata,
} from './billing.ts';

Deno.test('checkout attribution accepts only safe portfolio dimensions', () => {
  const result = acquisitionMetadataFromBody({
    attribution_campaign: 'july-organic',
    attribution_angle: 'unfinished-baby-book',
    attribution_creative: 'one-photo-one-line',
    attribution_channel: 'instagram',
    attribution_landing_page: '/for/unfinished-baby-book',
    attribution_email: 'parent@example.com',
    attribution_caption: 'private family text',
  });
  assertEquals(result, {
    campaign: 'july-organic',
    angle: 'unfinished-baby-book',
    creative: 'one-photo-one-line',
    channel: 'instagram',
    landing_page: '/for/unfinished-baby-book',
  });
});

Deno.test('unsafe attribution values are dropped rather than copied to Stripe', () => {
  const result = acquisitionMetadataFromBody({
    attribution_campaign: 'parent@example.com',
    attribution_angle: 'unfinished baby book',
    attribution_creative: 'https://private.example/photo',
    attribution_channel: 'instagram',
    attribution_landing_page: 'https://example.com/for/private',
  });
  assertEquals(result, { channel: 'instagram' });
});

Deno.test('Stripe parameter projection keeps acquisition separate from checkout form data', () => {
  const params = new URLSearchParams();
  appendAcquisitionMetadata(params, acquisitionMetadataFromRecord({
    campaign: 'july-organic',
    angle: 'unfinished-baby-book',
  }), ['metadata', 'subscription_data[metadata]']);

  assertEquals(params.get('metadata[acquisition_campaign]'), 'july-organic');
  assertEquals(params.get('subscription_data[metadata][acquisition_angle]'), 'unfinished-baby-book');
  assertEquals(params.toString().includes('email'), false);
  assertEquals(params.toString().includes('caption'), false);
});

function assertEquals(actual: unknown, expected: unknown) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}
