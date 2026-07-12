import { buildAnalyticsEvent } from './analyticsEventsModel.js';

let analyticsTransport = null;

export function setAnalyticsTransport(transport) {
  analyticsTransport = typeof transport === 'function' ? transport : null;
}

export function resetAnalyticsTransport() {
  analyticsTransport = null;
}

export function trackAnalyticsEvent(eventName, properties = {}, context = {}) {
  const event = buildAnalyticsEvent(eventName, properties, context);
  if (analyticsTransport) {
    Promise.resolve(analyticsTransport(event)).catch((error) => {
      console.warn('[analytics] transport failed', error?.message || error);
    });
  }
  return event;
}

export async function deliverAnalyticsEvent(eventName, properties = {}, context = {}) {
  const event = buildAnalyticsEvent(eventName, properties, context);
  if (!analyticsTransport) return { event, delivered: false, reason: 'transport_not_configured' };
  const result = await analyticsTransport(event);
  return { event, delivered: result?.accepted === true, result };
}
