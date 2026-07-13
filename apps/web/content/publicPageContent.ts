import { pageContent, type PageContentKey } from "./pageContent.ts";
import type { CommerceState } from "@/lib/commercialConfig";

type PublicPageOptions = {
  commerceState: CommerceState;
  partnersEnabled: boolean;
};

const COPY_REPAIRS: Array<[string, string]> = [
  [
    "The archive is ready for later, including future printed keepsakes.",
    "Selected memories stay together so your family can revisit them later.",
  ],
  [
    "Weekly recaps, letters, and future printed books turn small entries into a family archive.",
    "Weekly recaps and letters turn small entries into a family archive over time.",
  ],
  [
    "Seal a letter today and it stays closed until their eighteenth birthday. The two of you trade off through the years, a slow correspondence with a person who doesn't exist yet.",
    "Write a letter for your child, your partner, or a future birthday. Keep adding to the story in your own words as family life changes.",
  ],
  ["Sealed until they turn eighteen", "Choose when a letter belongs in the story"],
  ["Opened together, one day", "Revisit letters together when the time feels right"],
  [
    "The first promise is a private baby book in your pocket. The next chapter is turning the best saved photos, notes, firsts, and letters into printed keepsakes families can hold.",
    "The current product is a private baby book in your pocket. Printed keepsakes are a future direction, not a feature available today.",
  ],
  ["Designed for future monthly, annual, and milestone books.", "Organized so selected memories remain useful for future keepsakes."],
  ["A year of small moments, printed.", "Printed keepsakes are on the roadmap."],
  [
    "Yes. It is built for private family spaces, not public posting, followers, likes, or an advertising algorithm.",
    "It is built for private family spaces, not public posting, followers, likes, or an advertising algorithm.",
  ],
  [
    "Yes. The gift path lets you send the first year with a personal note and scheduled delivery.",
    "Gift years are planned as a separate purchase and redemption path. Join the launch list for availability updates.",
  ],
];

export function publicPageContent(
  key: PageContentKey,
  { commerceState, partnersEnabled }: PublicPageOptions,
) {
  let html: string = pageContent[key];
  for (const [before, after] of COPY_REPAIRS) html = html.replaceAll(before, after);

  if (!partnersEnabled) {
    html = html
      .replace(/<a class="button button-ghost" href="\/partners\/">[\s\S]*?<\/a>/g, "")
      .replace(/<div class="cta-row" style="justify-content: center;">\s*<a class="button button-dark" href="\/partners\/">[\s\S]*?<\/a>\s*<\/div>/g, "");
  }

  if (commerceState !== "live" && commerceState !== "test") {
    html = removeSection(html, '<section class="section" id="checkout"');
    html = removeSection(html, '<section class="section band-dark" aria-labelledby="gift-form-title"');
    html = html
      .replaceAll('href="/pricing/#chapter-one"', 'href="#launch-list"')
      .replaceAll("<span>Start your baby book</span>", "<span>Join the launch list</span>")
      .replaceAll(">Start your baby book</a>", ">Join the launch list</a>")
      .replaceAll("<span>Start your private baby book</span>", "<span>Join the launch list</span>")
      .replaceAll(">Start your private baby book</a>", ">Join the launch list</a>")
      .replaceAll("<span>Gift the first year</span>", "<span>Explore planned gift years</span>")
      .replaceAll(">Gift the first year</a>", ">Explore planned gift years</a>")
      .replaceAll('href="/pricing/#chapter-one">Start your baby book', 'href="#launch-list">Join the launch list')
      .replaceAll('href="/pricing/#chapter-one">Start your private baby book', 'href="#launch-list">Join the launch list')
      .replaceAll('href="/gift/">Gift the first year', 'href="/gift/#launch-list">Get gift launch updates')
      .replaceAll('href="#checkout">Choose Family', 'href="#launch-list">Get Family launch updates')
      .replaceAll('href="#checkout">Choose Vault', 'href="#launch-list">Get Vault launch updates')
      .replaceAll('href="/gift/">Gift a year', 'href="/gift/#launch-list">Get gift launch updates')
      .replace("<p class=\"script\">pricing</p>", "<p class=\"script\">planned launch pricing</p>")
      .replace("<p class=\"script\">gift the first year</p>", "<p class=\"script\">gift years at launch</p>");
  }

  if (commerceState === "test") {
    html = html.replace(
      '<section class="page-hero" id="chapter-one">',
      '<section class="page-hero" id="chapter-one"><div class="test-mode-banner" role="status">Stripe test mode — no real charges or production access.</div>',
    );
  }

  if (commerceState === "live" || commerceState === "test") {
    html = removeField(html, "parent-name");
    html = removeField(html, "child-stage");
    html = html.replace(
      "Enter a few details, choose a plan, and continue to secure checkout for your private family space.",
      "Enter your email, choose a plan, and continue to secure checkout for your private family space.",
    );
  }

  return html;
}

function removeSection(html: string, startMarker: string) {
  const start = html.indexOf(startMarker);
  if (start < 0) return html;
  const end = html.indexOf("</section>", start);
  if (end < 0) return html;
  return `${html.slice(0, start)}${html.slice(end + "</section>".length)}`;
}

function removeField(html: string, inputId: string) {
  const label = html.indexOf(`for="${inputId}"`);
  if (label < 0) return html;
  const start = html.lastIndexOf('<div class="field">', label);
  const end = html.indexOf("</div>", label);
  if (start < 0 || end < 0) return html;
  return `${html.slice(0, start)}${html.slice(end + "</div>".length)}`;
}
