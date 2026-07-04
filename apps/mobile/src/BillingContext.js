import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import {
  BILLING_BYPASS_ENABLED,
  getFamilyEntitlement,
  normalizeEntitlement,
  redeemPurchaseCode,
} from './billing';

const BillingContext = createContext({
  entitlement: normalizeEntitlement(null),
  loading: true,
  error: null,
  refresh: async () => normalizeEntitlement(null),
  redeemCode: async () => null,
});

export function BillingProvider({ children }) {
  const { session } = useAuth();
  const { family } = useFamily();
  const [entitlement, setEntitlement] = useState(() => normalizeEntitlement(null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (BILLING_BYPASS_ENABLED) {
      const bypass = normalizeEntitlement(null);
      setEntitlement(bypass);
      setLoading(false);
      setError(null);
      return bypass;
    }

    if (!session || !family?.id) {
      const empty = normalizeEntitlement(null);
      setEntitlement(empty);
      setLoading(false);
      setError(null);
      return empty;
    }

    setLoading(true);
    try {
      const next = await getFamilyEntitlement(family.id);
      setEntitlement(next);
      setError(null);
      return next;
    } catch (err) {
      setError(err);
      setEntitlement(normalizeEntitlement(null));
      return null;
    } finally {
      setLoading(false);
    }
  }, [family?.id, session]);

  const redeemCode = useCallback(async (code) => {
    if (!family?.id) throw new Error('Create your family before redeeming a code.');
    const redeemed = await redeemPurchaseCode({ familyId: family.id, code });
    await refresh();
    return redeemed;
  }, [family?.id, refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      entitlement,
      loading,
      error,
      refresh,
      redeemCode,
    }),
    [entitlement, error, loading, redeemCode, refresh],
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling() {
  return useContext(BillingContext);
}
