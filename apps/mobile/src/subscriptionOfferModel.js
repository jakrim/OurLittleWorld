import {
  FAMILY_MONTHLY_PRODUCT_ID,
  FAMILY_YEARLY_PRODUCT_ID,
} from './subscriptionProducts.js';

export const OLW_PAYWALL_VERSION = 'olw-first-look-v1';
export const OLW_OFFER_VERSION = 'olw-family-2026-07';

export function buildFamilyPlans(products, { platform, iosTrialEligible = false } = {}) {
  const byId = new Map((products || []).map((product) => [product.id, product]));
  return [
    buildPlan(byId.get(FAMILY_YEARLY_PRODUCT_ID), 'annual', { platform, iosTrialEligible }),
    buildPlan(byId.get(FAMILY_MONTHLY_PRODUCT_ID), 'monthly', { platform, iosTrialEligible: false }),
  ].filter(Boolean);
}

export function buildPlan(product, duration, { platform, iosTrialEligible = false } = {}) {
  if (!product?.id || !['annual', 'monthly'].includes(duration)) return null;
  const isAnnual = duration === 'annual';
  const googleOffer = platform === 'android'
    ? selectGoogleOffer(product, { includeTrial: isAnnual })
    : null;
  const paidPhase = googleOffer ? paidGooglePhase(googleOffer) : null;
  const numericPrice = platform === 'android'
    ? microsToAmount(paidPhase?.priceAmountMicros)
    : finiteNumber(product.price);
  const currency = platform === 'android'
    ? paidPhase?.priceCurrencyCode || product.currency || null
    : product.currency || null;
  const displayPrice = platform === 'android'
    ? paidPhase?.formattedPrice || product.displayPrice || null
    : product.displayPrice || null;
  if (!numericPrice || !currency || !displayPrice) return null;

  const trialEligible = isAnnual && (
    platform === 'android'
      ? hasFreePhase(googleOffer)
      : iosTrialEligible && hasFreeIosIntro(product)
  );

  return {
    id: product.id,
    duration,
    displayPrice,
    numericPrice,
    currency,
    monthlyEquivalent: isAnnual ? formatCurrency(numericPrice / 12, currency) : displayPrice,
    trialEligible,
    offerToken: googleOffer?.offerToken || null,
    native: product,
  };
}

export function computeAnnualSavings({ annual, monthly }) {
  if (!annual || !monthly || annual.currency !== monthly.currency) return null;
  const monthlyAnnualized = monthly.numericPrice * 12;
  if (!(monthlyAnnualized > annual.numericPrice)) return null;
  return Math.round((1 - annual.numericPrice / monthlyAnnualized) * 100);
}

export function subscriptionAnalyticsProperties(plan, {
  productLoadSuccess = true,
  verifiedEntitlementOutcome = 'not_checked',
} = {}) {
  return {
    paywall_source: 'first_value_preview',
    paywall_version: OLW_PAYWALL_VERSION,
    offer_version: OLW_OFFER_VERSION,
    product: 'family',
    entitlement: 'family',
    product_id: plan?.id || 'unknown',
    duration: plan?.duration || 'unknown',
    storefront_bucket: 'unknown',
    localized_amount: plan?.numericPrice || 0,
    currency: plan?.currency || 'unknown',
    trial_eligibility: plan?.duration === 'annual'
      ? (plan?.trialEligible ? 'eligible' : 'ineligible')
      : 'not_applicable',
    experiment: 'default',
    cohort: 'new_user',
    product_load_success: Boolean(productLoadSuccess),
    verified_entitlement_outcome: verifiedEntitlementOutcome,
  };
}

export function storefrontBucket(countryCode) {
  if (!countryCode) return 'unknown';
  return String(countryCode).toUpperCase() === 'USA' || String(countryCode).toUpperCase() === 'US'
    ? 'us'
    : 'non_us';
}

function selectGoogleOffer(product, { includeTrial }) {
  const offers = product?.subscriptionOfferDetailsAndroid || [];
  if (includeTrial) {
    return offers.find(hasFreePhase) || offers.find((offer) => !offer.offerId) || offers[0] || null;
  }
  return offers.find((offer) => !hasFreePhase(offer) && !offer.offerId)
    || offers.find((offer) => !hasFreePhase(offer))
    || null;
}

function hasFreePhase(offer) {
  return (offer?.pricingPhases?.pricingPhaseList || [])
    .some((phase) => Number.parseInt(phase.priceAmountMicros, 10) === 0);
}

function paidGooglePhase(offer) {
  return [...(offer?.pricingPhases?.pricingPhaseList || [])]
    .reverse()
    .find((phase) => Number.parseInt(phase.priceAmountMicros, 10) > 0) || null;
}

function hasFreeIosIntro(product) {
  return Number(product?.introductoryPriceAsAmountIOS) === 0
    || String(product?.introductoryPricePaymentModeIOS || '').toLowerCase().includes('free');
}

function microsToAmount(value) {
  const micros = Number.parseInt(value, 10);
  return Number.isFinite(micros) && micros > 0 ? micros / 1_000_000 : null;
}

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function formatCurrency(value, currency) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}
