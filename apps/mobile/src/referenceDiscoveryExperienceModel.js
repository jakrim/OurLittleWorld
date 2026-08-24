export function referenceDiscoveryBackTarget({ firstValueRequested = false, canGoBack = false } = {}) {
  if (firstValueRequested) {
    return {
      action: 'replace',
      destination: {
        pathname: '/setup',
        params: { source: 'first_value', resumeDiscovery: '1' },
      },
    };
  }
  return canGoBack
    ? { action: 'back', destination: null }
    : { action: 'replace', destination: '/timeline' };
}

export function referenceDiscoveryTrustCopy({ babyName = '' } = {}) {
  return {
    possibility: `These are possibilities, not confirmed matches. You decide which photo is ${babyName || 'your baby'}.`,
    privacy: 'Photos stay on this iPhone.',
  };
}
