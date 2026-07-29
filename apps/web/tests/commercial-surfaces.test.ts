import assert from "node:assert/strict";
import test from "node:test";

import { publicPageContent } from "../content/publicPageContent.ts";
import sitemap from "../app/sitemap.ts";
import robots from "../app/robots.ts";
import {
  compactAvailabilityAction,
  primaryCommercialAction,
  resolveCommercialConfig,
} from "../lib/commercialConfig.ts";
import { marketingTarget } from "../lib/marketingAnalytics.ts";

test("commercial configuration defaults to an honest pre-launch state", () => {
  const config = resolveCommercialConfig({});
  assert.equal(config.commerceState, "coming_soon");
  assert.equal(config.checkoutEnabled, false);
  assert.equal(config.storeAvailability, "coming_soon");
  assert.equal(config.partnersEnabled, false);
});

test("available store state requires a verified official listing host", () => {
  const missing = resolveCommercialConfig({ NEXT_PUBLIC_OLW_STORE_AVAILABILITY: "available" });
  assert.equal(missing.storeAvailability, "temporarily_unavailable");

  const fake = resolveCommercialConfig({
    NEXT_PUBLIC_OLW_STORE_AVAILABILITY: "available",
    NEXT_PUBLIC_OLW_APPLE_APP_STORE_URL: "https://example.com/not-an-app",
  });
  assert.equal(fake.appleUrl, "");
  assert.equal(fake.storeAvailability, "temporarily_unavailable");

  const verified = resolveCommercialConfig({
    NEXT_PUBLIC_OLW_STORE_AVAILABILITY: "available",
    NEXT_PUBLIC_OLW_APPLE_APP_STORE_URL: "https://apps.apple.com/us/app/example/id123456789",
  });
  assert.equal(verified.storeAvailability, "available");
  assert.match(verified.appleUrl, /^https:\/\/apps\.apple\.com\//);
  assert.deepEqual(primaryCommercialAction(verified), { href: "/#launch-list", label: "View the app" });
  assert.deepEqual(compactAvailabilityAction(verified.storeAvailability), {
    href: "/#launch-list",
    label: "View app store links",
  });
});

test("launch-list and verified store links use a non-private store-interest target", () => {
  assert.equal(marketingTarget("/#launch-list"), "store");
  assert.equal(marketingTarget("https://apps.apple.com/us/app/example/id123456789"), "store");
  assert.equal(marketingTarget("https://play.google.com/store/apps/details?id=example"), "store");
});

test("public pre-launch pages hide commerce forms and all Partners links", () => {
  const options = { commerceState: "coming_soon" as const, partnersEnabled: false };
  for (const page of ["home", "story", "pricing", "gift"] as const) {
    const html = publicPageContent(page, options);
    assert.doesNotMatch(html, /href="\/partners\//);
    assert.doesNotMatch(html, /sealed until (their|they turn) eighteen/i);
    assert.doesNotMatch(html, /future printed books turn/i);
    assert.doesNotMatch(html, /Start (the|your) (private )?baby book/i);
    assert.doesNotMatch(html, /Create your own family space/i);
  }

  assert.doesNotMatch(publicPageContent("pricing", options), /data-conversion-form="self"/);
  const pricing = publicPageContent("pricing", options);
  const gift = publicPageContent("gift", options);
  assert.doesNotMatch(gift, /data-conversion-form="gift"/);
  assert.doesNotMatch(gift, /Giving Our Little World to more than one family/);
  const home = publicPageContent("home", options);
  assert.match(home, /Join the launch list/);
  assert.match(home, /data-marketing-action="hero-primary"/);
  assert.match(home, /data-marketing-action="hero-secondary"/);
  assert.doesNotMatch(home, /Start your (private )?baby book/);
  assert.doesNotMatch(home, /Gift the first year/);
  assert.doesNotMatch(home, /Create a private family space today/);
  assert.doesNotMatch(home, /Send a year of Our Little World/);
  assert.doesNotMatch(pricing, /Yes\. The gift flow collects/);
  assert.match(gift, /Purchase and redemption are not publicly available yet|Planned gift years/);
  assert.equal(sitemap().some((entry) => entry.url.includes("/partners/")), false);
  assert.equal((robots().rules as { disallow?: string[] }).disallow, undefined);
});

test("test commerce preserves sandbox forms and announces test mode", () => {
  const options = { commerceState: "test" as const, partnersEnabled: false };
  const pricing = publicPageContent("pricing", options);
  assert.match(pricing, /data-conversion-form="self"/);
  assert.match(pricing, /Stripe test mode/);
  assert.match(pricing, /id="parent-email"/);
  assert.doesNotMatch(pricing, /id="parent-name"/);
  assert.doesNotMatch(pricing, /id="child-stage"/);
  assert.match(publicPageContent("gift", options), /data-conversion-form="gift"/);
});
