import { Linking, Platform } from 'react-native';
import { deepLinkToSubscriptions } from 'expo-iap';

import { supabase } from './supabase';
import {
  FAMILY_MONTHLY_PRODUCT_ID,
  FAMILY_PRODUCT_IDS,
  FAMILY_YEARLY_PRODUCT_ID,
  SUBSCRIPTION_GROUP_ID_IOS,
  SUBSCRIPTION_PRODUCT_IDS,
  VAULT_MONTHLY_PRODUCT_ID,
  VAULT_PRODUCT_IDS,
  VAULT_YEARLY_PRODUCT_ID,
} from './subscriptionProducts';
export { hasReadOnlyArchiveAccess, READ_ONLY_ARCHIVE_STATUSES } from './entitlementAccessModel';
export {
  FAMILY_MONTHLY_PRODUCT_ID,
  FAMILY_PRODUCT_IDS,
  FAMILY_YEARLY_PRODUCT_ID,
  SUBSCRIPTION_GROUP_ID_IOS,
  SUBSCRIPTION_PRODUCT_IDS,
  VAULT_MONTHLY_PRODUCT_ID,
  VAULT_PRODUCT_IDS,
  VAULT_YEARLY_PRODUCT_ID,
};

export const SUPPORT_EMAIL = 'support@ourlittleworld.me';

// Family-tier defaults, used until the entitlement row carries quota fields.
const DEFAULT_QUOTAS = {
  storageTier: 'family',
  mediaQuotaBytes: 20000000000,
  optimizedMediaQuotaBytes: 20000000000,
  originalQuotaBytes: 0,
  videoQuotaSeconds: 18000,
  videoQuotaBytes: 10000000000,
  originalsEnabled: false,
  maxVideoDurationSec: 120,
  maxVideoSourceBytes: 500000000,
};

function normalizeQuotas(row) {
  if (!row) return { ...DEFAULT_QUOTAS };
  return {
    storageTier: row.storage_tier || DEFAULT_QUOTAS.storageTier,
    mediaQuotaBytes: Number(row.media_quota_bytes ?? DEFAULT_QUOTAS.mediaQuotaBytes),
    optimizedMediaQuotaBytes: Number(row.optimized_media_quota_bytes ?? DEFAULT_QUOTAS.optimizedMediaQuotaBytes),
    originalQuotaBytes: Number(row.original_quota_bytes ?? DEFAULT_QUOTAS.originalQuotaBytes),
    videoQuotaSeconds: Number(row.video_quota_seconds ?? DEFAULT_QUOTAS.videoQuotaSeconds),
    videoQuotaBytes: Number(row.video_quota_bytes ?? DEFAULT_QUOTAS.videoQuotaBytes),
    originalsEnabled: Boolean(row.originals_enabled),
    maxVideoDurationSec: Number(row.max_video_duration_sec ?? DEFAULT_QUOTAS.maxVideoDurationSec),
    maxVideoSourceBytes: Number(row.max_video_source_bytes ?? DEFAULT_QUOTAS.maxVideoSourceBytes),
  };
}
export const BILLING_BYPASS_ENABLED = process.env.EXPO_PUBLIC_OLW_BILLING_DISABLED === 'true';

export const ACTIVE_ENTITLEMENT_STATUSES = new Set([
  'active',
  'trialing',
  'grace_period',
  'gift_active',
  'comped',
]);

export function normalizeEntitlement(row) {
  if (BILLING_BYPASS_ENABLED) {
    return {
      familyId: 'development',
      status: 'comped',
      source: 'admin',
      planKey: 'comp_year',
      childLimit: 1,
      isActive: true,
      isBillingOwner: true,
      supportEmail: SUPPORT_EMAIL,
      ...normalizeQuotas(null),
    };
  }

  if (!row) {
    return {
      status: 'inactive',
      source: 'none',
      planKey: null,
      childLimit: 1,
      isActive: false,
      isBillingOwner: false,
      supportEmail: SUPPORT_EMAIL,
      ...normalizeQuotas(null),
    };
  }

  return {
    familyId: row.family_id,
    status: row.status || 'inactive',
    source: row.source || 'none',
    planKey: row.plan_key || null,
    childLimit: row.child_limit || 1,
    billingOwnerUserId: row.billing_owner_user_id || null,
    billingOwnerEmail: row.billing_owner_email || null,
    startsAt: row.starts_at || null,
    expiresAt: row.expires_at || null,
    graceEndsAt: row.grace_ends_at || null,
    isActive: Boolean(row.is_active) || ACTIVE_ENTITLEMENT_STATUSES.has(row.status),
    isBillingOwner: Boolean(row.is_billing_owner),
    supportEmail: row.support_email || SUPPORT_EMAIL,
    ...normalizeQuotas(row),
  };
}

export async function getFamilyStorageUsage(familyId) {
  if (!familyId || BILLING_BYPASS_ENABLED) return null;
  const { data, error } = await supabase
    .from('family_storage_usage')
    .select('*')
    .eq('family_id', familyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return {
      optimizedMediaBytes: 0,
      originalMediaBytes: 0,
      videoSeconds: 0,
      videoBytes: 0,
      imageCount: 0,
      videoCount: 0,
      audioBytes: 0,
      objectCount: 0,
    };
  }
  return {
    optimizedMediaBytes: Number(data.optimized_media_bytes || 0),
    originalMediaBytes: Number(data.original_media_bytes || 0),
    videoSeconds: Number(data.video_seconds || 0),
    videoBytes: Number(data.video_bytes || 0),
    imageCount: Number(data.image_count || 0),
    videoCount: Number(data.video_count || 0),
    audioBytes: Number(data.audio_bytes || 0),
    objectCount: Number(data.object_count || 0),
  };
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1e9) return `${(value / 1e9).toFixed(value >= 1e10 ? 0 : 1)} GB`;
  if (value >= 1e6) return `${Math.round(value / 1e6)} MB`;
  if (value > 0) return `${Math.max(1, Math.round(value / 1e3))} KB`;
  return '0 MB';
}

export function formatVideoMinutes(seconds) {
  return `${Math.round(Number(seconds || 0) / 60)} min`;
}

export async function getFamilyEntitlement(familyId) {
  if (BILLING_BYPASS_ENABLED) return normalizeEntitlement(null);
  if (!familyId) return normalizeEntitlement(null);

  const { data, error } = await supabase.rpc('get_my_family_entitlement', {
    target_family_id: familyId,
  });
  if (error) throw error;
  return normalizeEntitlement(Array.isArray(data) ? data[0] : data);
}

export async function redeemPurchaseCode({ familyId, code }) {
  const { data, error } = await supabase.functions.invoke('redeem-purchase-code', {
    body: { familyId, code },
  });
  if (error) throw new Error(error.message || data?.error || 'Could not redeem code');
  if (data?.error) throw new Error(data.error);
  return data?.entitlement;
}

export async function verifyStorePurchase({ familyId, purchase, provider, productId }) {
  const { data, error } = await supabase.functions.invoke('verify-store-purchase', {
    body: {
      familyId,
      purchase,
      provider,
      productId: productId || purchase?.productId,
    },
  });
  if (error) throw new Error(error.message || data?.error || 'Purchase could not be verified');
  if (data?.error) throw new Error(data.error);
  return data?.entitlement;
}

export async function createBillingPortal({ familyId }) {
  const { data, error } = await supabase.functions.invoke('create-billing-portal', {
    body: {
      familyId,
      returnUrl: 'https://ourlittleworld.me/pricing/',
    },
  });
  if (error) throw new Error(error.message || data?.error || 'Billing portal could not be opened');
  if (data?.error) throw new Error(data.error);
  return data?.url;
}

export async function openManageSubscription({ source, productId = FAMILY_YEARLY_PRODUCT_ID } = {}) {
  if (source === 'stripe') return false;
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    await deepLinkToSubscriptions({
      skuAndroid: productId,
      packageNameAndroid: 'com.jessekrim.ourlittleworld',
    });
    return true;
  }
  return Linking.openURL('https://ourlittleworld.me/pricing/');
}

export function entitlementStatusLabel(entitlement) {
  if (!entitlement || entitlement.status === 'inactive') return 'No active plan';
  if (entitlement.status === 'gift_active') {
    return entitlement.planKey === 'gift_vault_year' ? 'Vault gift year active' : 'Gift year active';
  }
  if (entitlement.status === 'comped') return 'Partner access active';
  if (entitlement.status === 'grace_period') return 'Grace period';
  if (entitlement.status === 'past_due') return 'Payment needs attention';
  if (entitlement.status === 'canceled') return 'Canceled';
  if (entitlement.status === 'expired') return 'Expired';
  if (entitlement.planKey === 'family_monthly') return 'Family monthly';
  if (entitlement.planKey === 'family_yearly') return 'Family yearly';
  if (entitlement.planKey === 'vault_monthly') return 'Vault monthly';
  if (entitlement.planKey === 'vault_yearly') return 'Vault yearly';
  if (entitlement.planKey === 'gift_vault_year') return 'Vault gift year active';
  return 'Family plan active';
}
