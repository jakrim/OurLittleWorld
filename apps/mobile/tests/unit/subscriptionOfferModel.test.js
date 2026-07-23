import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildFamilyPlans,
  computeAnnualSavings,
  subscriptionAnalyticsProperties,
} from '../../src/subscriptionOfferModel.js';

test('iOS plans use live localized prices and individual annual trial eligibility', () => {
  const plans = buildFamilyPlans([
    {
      id: 'olw.family.yearly',
      price: 69.99,
      currency: 'USD',
      displayPrice: '$69.99',
      introductoryPriceAsAmountIOS: '0',
    },
    { id: 'olw.family.monthly', price: 7.99, currency: 'USD', displayPrice: '$7.99' },
  ], { platform: 'ios', iosTrialEligible: true });

  assert.equal(plans[0].duration, 'annual');
  assert.equal(plans[0].trialEligible, true);
  assert.match(plans[0].monthlyEquivalent, /5\.83/);
  assert.equal(plans[1].trialEligible, false);
  assert.equal(computeAnnualSavings({ annual: plans[0], monthly: plans[1] }), 27);
});

test('Android annual selects the eligible free-trial offer and monthly avoids trial offers', () => {
  const phase = (micros, formattedPrice) => ({
    priceAmountMicros: micros,
    formattedPrice,
    priceCurrencyCode: 'USD',
  });
  const plans = buildFamilyPlans([
    {
      id: 'olw.family.yearly',
      subscriptionOfferDetailsAndroid: [
        { offerId: null, offerToken: 'base-year', pricingPhases: { pricingPhaseList: [phase('69990000', '$69.99')] } },
        { offerId: 'trial', offerToken: 'trial-year', pricingPhases: { pricingPhaseList: [phase('0', '$0.00'), phase('69990000', '$69.99')] } },
      ],
    },
    {
      id: 'olw.family.monthly',
      subscriptionOfferDetailsAndroid: [
        { offerId: 'wrong-trial', offerToken: 'trial-month', pricingPhases: { pricingPhaseList: [phase('0', '$0.00'), phase('7990000', '$7.99')] } },
        { offerId: null, offerToken: 'base-month', pricingPhases: { pricingPhaseList: [phase('7990000', '$7.99')] } },
      ],
    },
  ], { platform: 'android' });

  assert.equal(plans[0].offerToken, 'trial-year');
  assert.equal(plans[0].trialEligible, true);
  assert.equal(plans[1].offerToken, 'base-month');
  assert.equal(plans[1].trialEligible, false);
});

test('missing store prices remain unavailable rather than inventing fallbacks', () => {
  assert.deepEqual(buildFamilyPlans([{ id: 'olw.family.yearly' }], { platform: 'ios' }), []);
  assert.equal(subscriptionAnalyticsProperties(null, { productLoadSuccess: false }).localized_amount, 0);
});
