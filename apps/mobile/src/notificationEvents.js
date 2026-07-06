import { supabase } from './supabase';

export function notifyPartnerPromptAnswered({ familyId, actorUserId, promptDate }) {
  return notifyPartnerActivity({
    familyId,
    actorUserId,
    kind: 'prompt_response',
    route: '/prompt',
    title: "Your co-parent answered today's prompt",
    body: "Open today's prompt.",
    eventKey: promptDate && actorUserId ? `partner_prompt:${familyId}:${promptDate}:${actorUserId}` : null,
    metadata: { promptDate },
  });
}

export function notifyPartnerFirstSaved({ familyId, actorUserId, firstId, title }) {
  return notifyPartnerActivity({
    familyId,
    actorUserId,
    kind: 'first_saved',
    route: '/firsts',
    title: 'A First was saved',
    body: `${title || 'A First'} was added to the family story.`,
    eventKey: firstId ? `partner_first:${firstId}` : null,
    metadata: { firstId },
  });
}

export function notifyPartnerLetterSealed({ familyId, actorUserId, letterId }) {
  return notifyPartnerActivity({
    familyId,
    actorUserId,
    kind: 'letter_sealed',
    route: '/letters',
    title: 'A letter was sealed',
    body: 'Your co-parent sealed a letter for later.',
    eventKey: letterId ? `partner_letter:${letterId}` : null,
    metadata: { letterId },
  });
}

async function notifyPartnerActivity({
  familyId,
  actorUserId,
  kind,
  route,
  title,
  body,
  eventKey,
  metadata,
}) {
  if (!familyId || !actorUserId) return { sent: 0, reason: 'missing-context' };
  const { data, error } = await supabase.functions.invoke('notify-event', {
    body: {
      familyId,
      actorUserId,
      category: 'partner_activity',
      kind,
      route,
      title,
      body,
      eventKey,
      metadata,
    },
  });
  if (error) throw error;
  return data;
}
