export const ADD_INTENT_MOMENT = 'moment';
export const ADD_INTENT_PARTNER_NOTE = 'partner-note';
export const ADD_INTENT_VOICE = 'voice';

export const ADD_INTENT_OPTIONS = [
  {
    key: ADD_INTENT_MOMENT,
    icon: 'images-outline',
    title: 'Photos or a moment',
    body: 'Keep photos, video, and the story around them.',
  },
  {
    key: ADD_INTENT_PARTNER_NOTE,
    icon: 'chatbubbles-outline',
    title: 'Note to each other',
    body: 'Leave a private note for your co-parent.',
  },
  {
    key: ADD_INTENT_VOICE,
    icon: 'mic-outline',
    title: 'Voice note',
    body: 'Keep a voice exactly as it sounds today.',
  },
  {
    key: 'letter',
    icon: 'mail-outline',
    title: 'Letter to baby',
    body: 'Write, record, or attach something for them.',
    route: '/letter-compose',
  },
];

export function normalizeAddIntent(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return [ADD_INTENT_MOMENT, ADD_INTENT_PARTNER_NOTE, ADD_INTENT_VOICE].includes(raw)
    ? raw
    : null;
}

export function buildAddIntentPresentation(intent, { babyName = '' } = {}) {
  if (intent === ADD_INTENT_PARTNER_NOTE) {
    return {
      heading: 'Note to each other',
      caption: 'A private note shared only with the parents in this world.',
      notePlaceholder: 'Write something for your co-parent',
      noteCaption: 'It will appear in your shared family timeline.',
      saveLabel: 'Share note',
      defaultTitle: 'A note between us',
      showMedia: false,
      showVoice: false,
      showContext: false,
      showDate: false,
    };
  }
  if (intent === ADD_INTENT_VOICE) {
    return {
      heading: 'Keep a voice note',
      caption: `Record a voice for ${babyName || 'your family'} and keep the original audio private.`,
      notePlaceholder: 'Add a line about this recording (optional)',
      noteCaption: 'The recording can stand on its own.',
      saveLabel: 'Save voice note',
      defaultTitle: 'Voice note',
      showMedia: false,
      showVoice: true,
      showContext: true,
      showDate: true,
    };
  }
  return {
    heading: 'Save a moment',
    caption: 'Add photos, video, voice, or a few words. Context can come later.',
    notePlaceholder: 'Write one line about this moment',
    noteCaption: 'A few words are enough, or leave this blank if the media or voice already says it.',
    saveLabel: 'Save moment',
    defaultTitle: '',
    showMedia: true,
    showVoice: true,
    showContext: true,
    showDate: true,
  };
}
