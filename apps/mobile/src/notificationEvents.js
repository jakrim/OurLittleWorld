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

export function notifyPartnerLetterSaved({ familyId, actorUserId, letterId }) {
  return notifyPartnerActivity({
    familyId,
    actorUserId,
    kind: 'letter_saved',
    route: '/letters',
    title: 'A letter was saved',
    body: 'Your co-parent saved a letter in your family world.',
    eventKey: letterId ? `partner_letter:${letterId}` : null,
    metadata: { letterId },
  });
}

export function notifyPartnerNoteSaved({ familyId, actorUserId, momentId }) {
  return notifyPartnerActivity({
    familyId,
    actorUserId,
    kind: 'parent_note_saved',
    route: momentId ? `/moment/${momentId}` : '/timeline',
    title: 'A note from your co-parent',
    body: 'Open the note in your private family world.',
    eventKey: momentId ? `partner_note:${momentId}` : null,
    metadata: { momentId },
  });
}

export function notifyPartnerReaction({ familyId, actorUserId, momentId, reaction }) {
  return notifyPartnerActivity({
    familyId,
    actorUserId,
    kind: 'moment_reaction',
    route: momentId ? `/moment/${momentId}` : '/timeline',
    title: 'Your co-parent reacted',
    body: 'Open the moment in your private family world.',
    eventKey: momentId && actorUserId && reaction
      ? `partner_reaction:${momentId}:${actorUserId}:${reaction}`
      : null,
    metadata: { momentId, reaction },
  });
}

export function notifyPartnerReply({ familyId, actorUserId, momentId, replyId }) {
  return notifyPartnerActivity({
    familyId,
    actorUserId,
    kind: 'moment_reply',
    route: momentId ? `/moment/${momentId}` : '/timeline',
    title: 'Your co-parent replied',
    body: 'Open the moment in your private family world.',
    eventKey: replyId ? `partner_reply:${replyId}` : null,
    metadata: { momentId, replyId },
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
