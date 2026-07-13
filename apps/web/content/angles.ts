export type OurLittleWorldAngle = {
  slug: string;
  eyebrow: string;
  headline: string;
  subheadline: string;
  image: string;
  imageAlt: string;
  promise: string;
  situations: Array<{ title: string; body: string }>;
  benefits: Array<{ title: string; body: string }>;
  objections: Array<{ question: string; answer: string }>;
};

export const ourLittleWorldAngles: Record<string, OurLittleWorldAngle> = {
  "two-caregivers": {
    slug: "two-caregivers",
    eyebrow: "A baby book both of you can write",
    headline: "One parent should not have to remember everything.",
    subheadline:
      "Our Little World gives two caregivers one private place for the photos, firsts, voice notes, and small stories that make up your baby's beginning.",
    image: "/assets/screens/timeline.png",
    imageAlt: "A shared private baby timeline in Our Little World",
    promise: "Two voices. One private story.",
    situations: [
      {
        title: "One phone holds most of the story",
        body: "Photos and notes collect with the parent who happens to capture them, while the other caregiver sees only pieces in texts and shared albums.",
      },
      {
        title: "The invisible job defaults to one person",
        body: "Remembering dates, adding context, and making the baby book becomes one more responsibility that nobody explicitly chose.",
      },
      {
        title: "You notice different things",
        body: "The sleepy phrase one parent remembers and the tiny routine the other notices belong in the same family story.",
      },
    ],
    benefits: [
      {
        title: "Invite one other caregiver",
        body: "Both of you can add selected photos, notes, firsts, voice memories, and letters in your own words.",
      },
      {
        title: "Keep the context together",
        body: "Age, place, reactions, and the sentence behind the photo stay organized around your child—not around a device.",
      },
      {
        title: "Write forward together",
        body: "Letters for later and quiet recaps preserve two perspectives your child can return to one day.",
      },
    ],
    objections: [
      {
        question: "What if my partner barely uses it?",
        answer: "The baby book still works when one caregiver adds most moments. The invitation makes it easy for the second caregiver to contribute when something matters to them.",
      },
      {
        question: "Is this another family social network?",
        answer: "No. There is no public feed, follower count, like system, or advertising algorithm. It is a private family space for selected memories.",
      },
    ],
  },
  "unfinished-baby-book": {
    slug: "unfinished-baby-book",
    eyebrow: "For the baby book you meant to make",
    headline: "Keep the beginning without creating another backlog.",
    subheadline:
      "Save one photo, one line, or one first while it is still close. Our Little World lets a lasting baby book grow from small moments instead of one enormous project later.",
    image: "/assets/screens/moment.png",
    imageAlt: "A saved baby memory with photo, note, and voice in Our Little World",
    promise: "A baby book that grows while life happens.",
    situations: [
      {
        title: "The camera roll keeps growing",
        body: "The photos are there, but the age, sound, joke, and reason you took them are already starting to blur.",
      },
      {
        title: "The perfect book never gets started",
        body: "Choosing photos, writing captions, and laying out months at once turns remembering into a project that needs a free weekend.",
      },
      {
        title: "Falling behind creates more guilt",
        body: "Traditional milestone checklists can make ordinary family life feel incomplete when the real story was never supposed to follow a template.",
      },
    ],
    benefits: [
      {
        title: "Keep one moment",
        body: "A photo, a voice note, a first, or one sentence is enough. There are no streaks and no completion score.",
      },
      {
        title: "Add meaning while it is fresh",
        body: "Save the age, place, sound, and words that a camera roll cannot reconstruct for you later.",
      },
      {
        title: "Let small entries compound",
        body: "A private timeline, letters, firsts, and weekly recaps turn scattered memories into the book you meant to make.",
      },
    ],
    objections: [
      {
        question: "Will this become another chore?",
        answer: "It is designed around selected moments, not daily completion. Keep something when it matters and let the archive build slowly.",
      },
      {
        question: "Why not organize my photos later?",
        answer: "You can organize files later. The part that is hardest to recover is the story around them: what changed, what they sounded like, and what you wanted to remember.",
      },
    ],
  },
  "private-family": {
    slug: "private-family",
    eyebrow: "A keepsake, not an audience",
    headline: "Your baby's story does not need a feed.",
    subheadline:
      "Keep selected photos, firsts, voice memories, and letters in a private family space built for remembering—not likes, followers, comparison, or performance.",
    image: "/assets/screens/letters.png",
    imageAlt: "Private letters for later in Our Little World",
    promise: "For your family. Not for an algorithm.",
    situations: [
      {
        title: "Posting changes the moment",
        body: "A memory can start feeling like content when the next question is how it will look to everyone else.",
      },
      {
        title: "Shared albums keep files, not a childhood",
        body: "They are useful for distribution, but they do not preserve firsts, voice, letters, age-aware context, or a family narrative.",
      },
      {
        title: "Privacy should be understandable",
        body: "Parents need a clear place for selected memories without public discovery, engagement mechanics, or an advertising feed.",
      },
    ],
    benefits: [
      {
        title: "No public audience",
        body: "No public feed, likes, follower counts, leaderboards, or pressure to turn ordinary family life into a performance.",
      },
      {
        title: "Selected by you",
        body: "You choose the memories that belong in the family story and add the context in your own words.",
      },
      {
        title: "Made for later",
        body: "Private firsts, notes, voice memories, and sealed letters become a keepsake your family can revisit together.",
      },
    ],
    objections: [
      {
        question: "Does the app scan or publish my whole camera roll?",
        answer: "The product is built around selected memories and parent confirmation. Your private baby book contains what you choose to keep.",
      },
      {
        question: "Is the Family plan original-quality backup?",
        answer: "No. Family saves beautiful app-quality copies for replay. Vault adds original-quality backup for selected photos and videos.",
      },
    ],
  },
};

