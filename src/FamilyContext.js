import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { Family } from './families';
import { useAuth } from './AuthContext';

const FamilyContext = createContext({
  family: null,
  loading: true,
  refresh: async () => {},
});

export function FamilyProvider({ children }) {
  const { session, loading: authLoading } = useAuth();
  const [family, setFamily] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) {
      setFamily(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    const next = await Family.current();
    setFamily(next);
    setLoading(false);
    return next;
  }, [session]);

  useEffect(() => {
    if (authLoading) return;
    refresh();
  }, [authLoading, refresh]);

  const value = useMemo(
    () => ({ family, loading, refresh }),
    [family, loading, refresh],
  );

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
}

export function useFamily() {
  return useContext(FamilyContext);
}
