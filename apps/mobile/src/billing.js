import { Linking, Platform } from 'react-native';
import { deepLinkToSubscriptions } from 'expo-iap';

import { supabase } from './supabase';

export const SUPPORT_EMAIL = 'support@ourlittleworld.me';
export const FAMILY_MONTHLY_PRODUCT_ID = 'olw.family.monthly';
export const FAMILY_YEARLY_PRODUCT_ID = 'olw.family.yearly';
export const FAMILY_PRODUCT_IDS = [FAMILY_MONTHLY_PRODUCT_ID, FAMILY_YEARLY_PRODUCT_ID];
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
  };
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
  if (entitlement.status === 'gift_active') return 'Gift year active';
  if (entitlement.status === 'comped') return 'Partner access active';
  if (entitlement.status === 'grace_period') return 'Grace period';
  if (entitlement.status === 'past_due') return 'Payment needs attention';
  if (entitlement.status === 'canceled') return 'Canceled';
  if (entitlement.status === 'expired') return 'Expired';
  if (entitlement.planKey === 'family_monthly') return 'Monthly family plan';
  if (entitlement.planKey === 'family_yearly') return 'Yearly family plan';
  return 'Family plan active';
}
