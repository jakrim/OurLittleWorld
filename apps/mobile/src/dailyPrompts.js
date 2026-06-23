export const DAILY_PROMPTS = [
  {
    key: 'laugh-today',
    text: 'What made them laugh today?',
  },
  {
    key: 'tiny-change',
    text: 'What tiny change did you notice?',
  },
  {
    key: 'ordinary-scene',
    text: 'What ordinary scene do you want to remember?',
  },
  {
    key: 'sound-of-today',
    text: 'What sound filled the house today?',
  },
  {
    key: 'hard-part',
    text: 'What felt hard, but worth keeping?',
  },
  {
    key: 'favorite-look',
    text: 'What look did they give you today?',
  },
  {
    key: 'new-little-skill',
    text: 'What small skill is starting to appear?',
  },
  {
    key: 'where-they-were',
    text: 'Where did they seem most themselves today?',
  },
  {
    key: 'parent-note',
    text: 'What would you tell your future self about this day?',
  },
  {
    key: 'almost-missed',
    text: 'What almost slipped by unnoticed?',
  },
];

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function isoDateForLocalDay(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function promptForDate({ familyId = '', date = new Date() } = {}) {
  const promptDate = typeof date === 'string' ? date : isoDateForLocalDay(date);
  const seed = `${familyId}:${promptDate}`;
  return DAILY_PROMPTS[hashString(seed) % DAILY_PROMPTS.length];
}
