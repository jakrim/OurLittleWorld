import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { clearDeletedAccountLocalData } from './accountDeletionLocal';
import { deletePushTokensForSignOut } from './pushNotifications';
import { supabase } from './supabase';

const AuthContext = createContext({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const lastUserIdRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      let nextSession = data.session ?? null;
      if (nextSession) {
        const { error } = await supabase.auth.getUser();
        if (isRevokedSessionError(error)) {
          await clearDeletedAccountLocalData({ userId: nextSession.user?.id });
          await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
          nextSession = null;
        }
      }
      if (!mounted) return;
      lastUserIdRef.current = nextSession?.user?.id || null;
      setSession(nextSession);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const previousUserId = lastUserIdRef.current;
      lastUserIdRef.current = nextSession?.user?.id || null;
      if (event === 'SIGNED_OUT' && previousUserId) {
        clearDeletedAccountLocalData({ userId: previousUserId }).catch(() => undefined);
      }
      setSession(nextSession ?? null);
    });

    // Refresh tokens proactively when the app returns to the foreground.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      appStateSub.remove();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signOut: async () => {
        await deletePushTokensForSignOut({ userId: session?.user?.id });
        await clearDeletedAccountLocalData({ userId: session?.user?.id });
        return supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  return useContext(AuthContext);
}

function isRevokedSessionError(error) {
  if (!error) return false;
  return [401, 403, 404].includes(Number(error.status))
    || ['bad_jwt', 'session_not_found', 'refresh_token_not_found', 'user_not_found'].includes(
      String(error.code || ''),
    );
}
