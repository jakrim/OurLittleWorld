import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export default function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduced(Boolean(enabled));
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  return reduced;
}
