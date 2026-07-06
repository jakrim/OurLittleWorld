import { useCallback, useEffect, useRef, useState } from 'react';
import { useRootNavigationState, useRouter } from 'expo-router';

import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { useAppGate } from './navigation/RouteGuards';
import {
  addPushNotificationResponseListener,
  watchPushTokenRefresh,
} from './pushNotifications';

export default function usePushNotifications() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user } = useAuth();
  const { family } = useFamily();
  const gate = useAppGate();
  const pendingRouteRef = useRef(null);
  const [pendingRouteVersion, setPendingRouteVersion] = useState(0);

  useEffect(() => {
    if (!user?.id || !family?.id) return undefined;
    return watchPushTokenRefresh({ familyId: family.id, userId: user.id });
  }, [family?.id, user?.id]);

  const queueRoute = useCallback((route) => {
    pendingRouteRef.current = route;
    setPendingRouteVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    const subscription = addPushNotificationResponseListener(queueRoute);
    return () => subscription.remove();
  }, [queueRoute]);

  useEffect(() => {
    const route = pendingRouteRef.current;
    if (!route || !rootNavigationState?.key || gate.loading) return;

    pendingRouteRef.current = null;
    if (gate.reason === 'ready') {
      router.push(route);
    } else {
      router.replace(gate.href || '/');
    }
  }, [
    gate.href,
    gate.loading,
    gate.reason,
    pendingRouteVersion,
    rootNavigationState?.key,
    router,
  ]);
}
