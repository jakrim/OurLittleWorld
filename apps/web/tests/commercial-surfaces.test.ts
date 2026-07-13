import assert from "node:assert/strict";
import test from "node:test";

import { publicPageContent } from "../content/publicPageContent.ts";
import sitemap from "../app/sitemap.ts";
import robots from "../app/robots.ts";
import { resolveCommercialConfig } from "../lib/commercialConfig.ts";

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
});

test("public pre-launch pages hide commerce forms and all Partners links", () => {
  const options = { commerceState: "coming_soon" as const, partnersEnabled: false };
  for (const page of ["home", "story", "pricing", "gift"] as const) {
    const html = publicPageContent(page, options);
    assert.doesNotMatch(html, /href="\/partners\//);
    assert.doesNotMatch(html, /sealed until (their|they turn) eighteen/i);
    assert.doesNotMatch(html, /future printed books turn/i);
  }

  assert.doesNotMatch(publicPageContent("pricing", options), /data-conversion-form="self"/);
  assert.doesNotMatch(publicPageContent("gift", options), /data-conversion-form="gift"/);
  const home = publicPageContent("home", options);
  assert.match(home, /Join the launch list/);
  assert.doesNotMatch(home, /Start your (private )?baby book/);
  assert.doesNotMatch(home, /Gift the first year/);
  assert.equal(sitemap().some((entry) => entry.url.includes("/partners/")), false);
  assert.ok(robots().rules && !Array.isArray(robots().rules));
  assert.ok((robots().rules as { disallow?: string[] }).disallow?.includes("/partners/"));
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
