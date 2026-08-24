export function attachmentTarget({ familyId, momentId = null, letterId = null }) {
  if (Boolean(momentId) === Boolean(letterId)) {
    throw new Error('Media must belong to exactly one moment or letter');
  }

  const kind = letterId ? 'letters' : 'moments';
  const id = letterId || momentId;

  return {
    id,
    basePath: `${familyId}/${kind}/${id}`,
    columns: letterId ? { letter_id: letterId } : { moment_id: momentId },
  };
}
