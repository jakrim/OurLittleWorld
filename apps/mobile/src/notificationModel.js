export const NOTIFICATION_DEEP_LINK_ROUTES = ['/digest', '/prompt', '/review', '/letters'];

export function normalizeNotificationRoute(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed || /^(https?:|javascript:|mailto:)/i.test(trimmed)) return null;

  const route = normalizeAppRoute(trimmed);
  const path = route.split(/[?#]/)[0];
  return NOTIFICATION_DEEP_LINK_ROUTES.includes(path) ? route : null;
}

function normalizeAppRoute(value) {
  const schemeMatch = value.match(/^[a-z][a-z0-9+.-]*:\/\/(.+)$/i);
  if (!schemeMatch) return value.startsWith('/') ? value : `/${value}`;

  const withoutScheme = schemeMatch[1] || '';
  const slashIndex = withoutScheme.indexOf('/');
  if (slashIndex < 0) return `/${withoutScheme}`;
  return withoutScheme.slice(slashIndex) || '/';
}

export function notificationPromptStorageKey({ familyId, userId }) {
  return `olw:push-permission:v1:${familyId || 'no-family'}:${userId || 'anonymous'}`;
}
