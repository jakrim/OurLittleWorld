export const SHARED_DAILY_PROMPTS = [
  {
    key: 'shared-laugh-today',
    text: 'What made them laugh today?',
  },
  {
    key: 'shared-tiny-change',
    text: 'What tiny change did you notice?',
  },
  {
    key: 'shared-ordinary-scene',
    text: 'What ordinary scene do you want to remember?',
  },
  {
    key: 'shared-sound-of-today',
    text: 'What sound filled the house today?',
  },
  {
    key: 'shared-hard-part',
    text: 'What felt hard, but worth keeping?',
  },
  {
    key: 'shared-favorite-look',
    text: 'What look did they give you today?',
  },
  {
    key: 'shared-new-little-skill',
    text: 'What small skill is starting to appear?',
  },
  {
    key: 'shared-where-they-were',
    text: 'Where did they seem most themselves today?',
  },
  {
    key: 'shared-parent-note',
    text: 'What would you tell your future self about this day?',
  },
  {
    key: 'shared-almost-missed',
    text: 'What almost slipped by unnoticed?',
  },
];

export const PROMPT_AGE_BANDS = [
  {
    key: '0-3m',
    minDays: 0,
    maxDays: 89,
    prompts: [
      { key: 'newborn-smallest-calm', text: 'What helped them settle today?' },
      { key: 'newborn-sleep-face', text: 'What did their sleeping face look like?' },
      { key: 'newborn-tiny-hands', text: 'What did their hands do today?' },
      { key: 'newborn-feeding-moment', text: 'What feeding moment do you want to remember?' },
      { key: 'newborn-new-sound', text: 'What little sound did they make today?' },
      { key: 'newborn-best-hold', text: 'Where did they like being held?' },
      { key: 'newborn-room-light', text: 'What did the room feel like when they were calm?' },
      { key: 'newborn-first-rhythm', text: 'What rhythm is your family finding?' },
      { key: 'newborn-brave-minute', text: 'What minute felt hard and tender at once?' },
      { key: 'newborn-soft-change', text: 'What changed in their face this week?' },
      { key: 'newborn-night-detail', text: 'What detail from the night do you want saved?' },
      { key: 'newborn-sibling-pet-look', text: 'Who watched them closely today?' },
      { key: 'newborn-parent-body', text: 'What did your body learn about them today?' },
      { key: 'newborn-tiny-proof', text: 'What tiny proof of them being here still surprises you?' },
    ],
  },
  {
    key: '3-6m',
    minDays: 90,
    maxDays: 179,
    prompts: [
      { key: 'baby-smile-trigger', text: 'What reliably brought out a smile today?' },
      { key: 'baby-coo-conversation', text: 'What did their coos seem to be saying?' },
      { key: 'baby-reaching-for', text: 'What did they reach for with purpose?' },
      { key: 'baby-looking-at-you', text: 'How did they look at you today?' },
      { key: 'baby-neck-strength', text: 'What strength is starting to show?' },
      { key: 'baby-rolling-clue', text: 'What made you think a roll is coming?' },
      { key: 'baby-bath-detail', text: 'What bath or changing-table detail should stay?' },
      { key: 'baby-favorite-person', text: 'Who got the biggest reaction today?' },
      { key: 'baby-morning-mood', text: 'What was their morning mood?' },
      { key: 'baby-new-texture', text: 'What texture caught their attention?' },
      { key: 'baby-tired-tell', text: 'How did they tell you they were tired?' },
      { key: 'baby-carrier-view', text: 'What did they notice from your arms?' },
      { key: 'baby-little-routine', text: 'What tiny routine is becoming yours?' },
      { key: 'baby-surprise-laugh', text: 'What almost became a laugh today?' },
    ],
  },
  {
    key: '6-12m',
    minDays: 180,
    maxDays: 364,
    prompts: [
      { key: 'crawler-food-face', text: 'What food face should you remember?' },
      { key: 'crawler-new-reach', text: 'What did they reach, grab, or pull toward?' },
      { key: 'crawler-floor-adventure', text: 'Where did the floor take them today?' },
      { key: 'crawler-babble-string', text: 'What did their babble sound like?' },
      { key: 'crawler-favorite-game', text: 'What game did they ask for without words?' },
      { key: 'crawler-sitting-view', text: 'What did they notice from sitting up?' },
      { key: 'crawler-almost-mobile', text: 'What movement looked new today?' },
      { key: 'crawler-stranger-reaction', text: 'How did they react to someone outside the usual circle?' },
      { key: 'crawler-object-love', text: 'What object mattered more than expected?' },
      { key: 'crawler-mess-worth-it', text: 'What mess was worth keeping?' },
      { key: 'crawler-sleep-resistance', text: 'What did bedtime reveal about them?' },
      { key: 'crawler-pointing-look', text: 'What did they point, stare, or lean toward?' },
      { key: 'crawler-clap-wave', text: 'What little social trick showed up?' },
      { key: 'crawler-near-first', text: 'What felt like the edge of a first?' },
    ],
  },
  {
    key: '12m-plus',
    minDays: 365,
    maxDays: null,
    prompts: [
      { key: 'toddler-word-of-day', text: 'What word or sound got used today?' },
      { key: 'toddler-walking-route', text: 'Where did their feet want to go?' },
      { key: 'toddler-big-opinion', text: 'What strong opinion appeared today?' },
      { key: 'toddler-helping-job', text: 'What did they try to help with?' },
      { key: 'toddler-pretend-play', text: 'What pretend moment showed up?' },
      { key: 'toddler-favorite-book', text: 'What page, song, or book held their attention?' },
      { key: 'toddler-meltdown-repair', text: 'What helped after a hard feeling?' },
      { key: 'toddler-copycat', text: 'What did they copy from someone else?' },
      { key: 'toddler-outside-notice', text: 'What did they notice outside?' },
      { key: 'toddler-tiny-joke', text: 'What did they think was funny?' },
      { key: 'toddler-independent-try', text: 'What did they insist on doing themselves?' },
      { key: 'toddler-sweet-phrase', text: 'What phrase or gesture felt especially like them?' },
      { key: 'toddler-table-moment', text: 'What happened around food or the table?' },
      { key: 'toddler-before-bed', text: 'What did they do right before sleep?' },
    ],
  },
];

export const DAILY_PROMPTS = SHARED_DAILY_PROMPTS;

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed) {
  let value = hashString(seed) || 1;
  return () => {
    value = (value + 0x6D2B79F5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shufflePrompts(prompts, seed) {
  const out = [...prompts];
  const random = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function isoDateForLocalDay(date = new Date()) {
  const value = typeof date === 'string' ? new Date(`${date}T00:00:00`) : new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function daysSinceEpoch(date = new Date()) {
  const [year, month, day] = isoDateForLocalDay(date).split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

export function promptAgeBandForDate({ babyBirthday = null, date = new Date() } = {}) {
  const ageDays = ageInDaysOn(babyBirthday, date);
  if (ageDays == null || ageDays < 0) return null;
  return PROMPT_AGE_BANDS.find((band) => {
    if (ageDays < band.minDays) return false;
    return band.maxDays == null || ageDays <= band.maxDays;
  }) || PROMPT_AGE_BANDS[PROMPT_AGE_BANDS.length - 1];
}

export function promptPoolForDate({ babyBirthday = null, date = new Date() } = {}) {
  const band = promptAgeBandForDate({ babyBirthday, date });
  return {
    band,
    prompts: band ? [...band.prompts, ...SHARED_DAILY_PROMPTS] : SHARED_DAILY_PROMPTS,
  };
}

export function promptForDate({ familyId = '', date = new Date(), babyBirthday = null } = {}) {
  const promptDate = typeof date === 'string' ? date : isoDateForLocalDay(date);
  const anchorDate = promptAnchorDate({ babyBirthday, date: promptDate });
  const days = Math.max(0, daysSinceEpoch(promptDate) - daysSinceEpoch(anchorDate));
  let previous = null;
  let current = null;
  for (let offset = 0; offset <= days; offset += 1) {
    const currentDate = offsetIsoDate(anchorDate, offset);
    current = promptForDateWithoutRepeatGuard({ familyId, date: currentDate, babyBirthday });
    if (previous?.key === current?.key) {
      current = nextPromptForDate({ familyId, date: currentDate, babyBirthday, excludeKey: previous.key });
    }
    previous = current;
  }
  return current;
}

function promptForDateWithoutRepeatGuard({ familyId = '', date = new Date(), babyBirthday = null } = {}) {
  const promptDate = typeof date === 'string' ? date : isoDateForLocalDay(date);
  const { band, prompts } = promptPoolForDate({ babyBirthday, date: promptDate });
  const sequence = shufflePrompts(prompts, `${familyId}:${band?.key || 'shared'}`);
  return sequence[daysSinceEpoch(promptDate) % sequence.length];
}

function nextPromptForDate({ familyId = '', date = new Date(), babyBirthday = null, excludeKey = null } = {}) {
  const promptDate = typeof date === 'string' ? date : isoDateForLocalDay(date);
  const { band, prompts } = promptPoolForDate({ babyBirthday, date: promptDate });
  const sequence = shufflePrompts(prompts, `${familyId}:${band?.key || 'shared'}`);
  const startIndex = daysSinceEpoch(promptDate) % sequence.length;
  for (let step = 1; step < sequence.length; step += 1) {
    const candidate = sequence[(startIndex + step) % sequence.length];
    if (candidate.key !== excludeKey) return candidate;
  }
  return sequence[startIndex];
}

function promptAnchorDate({ babyBirthday = null, date = new Date() } = {}) {
  const promptDate = typeof date === 'string' ? date : isoDateForLocalDay(date);
  if (babyBirthday) {
    const birthday = isoDateForLocalDay(babyBirthday);
    if (daysSinceEpoch(birthday) <= daysSinceEpoch(promptDate)) {
      return offsetIsoDate(birthday, -(maxPromptPoolLength() + 1));
    }
  }
  return offsetIsoDate(promptDate, -(maxPromptPoolLength() + 1));
}

function maxPromptPoolLength() {
  return Math.max(
    SHARED_DAILY_PROMPTS.length,
    ...PROMPT_AGE_BANDS.map((band) => band.prompts.length + SHARED_DAILY_PROMPTS.length),
  );
}

function offsetIsoDate(isoDate, days) {
  const [year, month, day] = isoDateForLocalDay(isoDate).split('-').map(Number);
  const value = new Date(year, month - 1, day);
  value.setDate(value.getDate() + days);
  return isoDateForLocalDay(value);
}

function ageInDaysOn(birthdayISO, date = new Date()) {
  if (!birthdayISO) return null;
  const birth = new Date(`${birthdayISO}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = typeof date === 'string' ? new Date(`${date}T00:00:00`) : new Date(date);
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - birth.getTime()) / 86400000);
}
