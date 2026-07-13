import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import robots from "../app/robots.ts";
import sitemap from "../app/sitemap.ts";
import {
  absoluteUrl,
  breadcrumbStructuredData,
  metadataFor,
  organizationStructuredData,
  siteRoutes,
  SOCIAL_PREVIEW_PATH,
  websiteStructuredData,
  type SiteRouteId,
} from "../lib/siteSeo.ts";

const indexableRouteIds = [
  "home",
  "story",
  "pricing",
  "gift",
  "privacy",
  "terms",
  "refunds",
  "unfinishedBabyBook",
] as const satisfies readonly SiteRouteId[];

test("every indexable route has unique canonical and social metadata", () => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();

  for (const routeId of indexableRouteIds) {
    const route = siteRoutes[routeId];
    const metadata = metadataFor(routeId);
    const canonical = absoluteUrl(route.path);

    assert.deepEqual(metadata.title, { absolute: route.title });
    assert.equal(metadata.description, route.description);
    assert.equal(metadata.alternates?.canonical, canonical);
    assert.equal(metadata.openGraph?.url, canonical);
    assert.equal(metadata.openGraph?.title, route.title);
    assert.equal(metadata.twitter?.title, route.title);
    assert.ok(metadata.openGraph?.images);
    assert.ok(metadata.twitter?.images);
    assert.match(JSON.stringify(metadata.twitter), /summary_large_image/);
    assert.match(JSON.stringify(metadata.openGraph?.images), new RegExp(SOCIAL_PREVIEW_PATH));
    assert.equal(metadata.robots, undefined);
    assert.equal(titles.has(route.title), false, `duplicate title for ${routeId}`);
    assert.equal(descriptions.has(route.description), false, `duplicate description for ${routeId}`);
    titles.add(route.title);
    descriptions.add(route.description);
  }
});

test("sitemap is derived from canonical indexable routes without fabricated modification dates", () => {
  const entries = sitemap();
  const expectedUrls = indexableRouteIds.map((routeId) => absoluteUrl(siteRoutes[routeId].path));

  assert.deepEqual(entries.map((entry) => entry.url), expectedUrls);
  assert.equal(entries.some((entry) => "lastModified" in entry), false);
  assert.equal(entries.some((entry) => entry.url.includes("/checkout/")), false);
  assert.equal(entries.some((entry) => entry.url.includes("/partners/")), false);
  assert.equal(entries.some((entry) => entry.url.includes("/email-preferences/")), false);
});

test("robots lets crawlers see noindex and 404 responses", () => {
  assert.ok(robots().rules && !Array.isArray(robots().rules));
  const disallow: string[] = (robots().rules as { disallow?: string[] }).disallow || [];
  assert.equal(disallow.includes("/checkout/"), false);
  assert.equal(disallow.includes("/partners/"), false);
  assert.equal(disallow.length, 0);
});

test("site structured data stays within verified pre-launch facts", () => {
  const serialized = JSON.stringify([organizationStructuredData(), websiteStructuredData()]);
  assert.match(serialized, /Our Little World/);
  assert.match(serialized, /logo-mark-circle\.png/);
  assert.doesNotMatch(serialized, /SoftwareApplication|Product|Offer|legalName|aggregateRating|review/);

  const breadcrumb = breadcrumbStructuredData("story");
  assert.equal(breadcrumb?.itemListElement[1]?.item, absoluteUrl("/story/"));
});

test("email preferences remains crawlable for users but noindex for search", () => {
  const metadata = metadataFor("emailPreferences");
  const robotsMetadata = typeof metadata.robots === "object" ? metadata.robots : undefined;
  assert.equal(robotsMetadata?.index, false);
  assert.equal(metadata.alternates?.canonical, absoluteUrl("/email-preferences/"));
});

test("noncanonical routes cannot inherit the homepage canonical from the root layout", () => {
  const layoutSource = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(layoutSource, /metadataFor\("home"\)/);
  assert.equal(metadataFor("checkoutSuccess").alternates, undefined);
  assert.equal(metadataFor("giftCheckoutSuccess").alternates, undefined);
  assert.equal(metadataFor("partners").alternates, undefined);
  assert.equal(metadataFor("notFound").alternates, undefined);
});

test("unfinished baby-book angle uses the pre-launch form instead of purchase CTAs", () => {
  const source = readFileSync(
    new URL("../app/for/unfinished-baby-book/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /CommercialAvailability surface="angle"/);
  assert.match(source, /Join the launch list/);
  assert.match(source, /Explore planned gift years/);
  assert.doesNotMatch(source, />\s*Start your baby book\s*</);
  assert.doesNotMatch(source, />\s*Gift the first year\s*</);
});
