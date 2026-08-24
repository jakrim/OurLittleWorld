import type { Metadata, MetadataRoute } from "next";

export const SITE_NAME = "Our Little World";
export const SITE_ORIGIN = "https://ourlittleworld.me";
export const BRAND_MARK_PATH = "/assets/brand/logo-mark-circle.png";
export const SOCIAL_PREVIEW_PATH = "/assets/brand/social-preview-1200x630.png";

type SitemapSettings = {
  changeFrequency: "weekly" | "monthly";
  priority: number;
};

type SiteRouteDefinition = {
  path: `/${string}` | "/";
  title: string;
  description: string;
  indexable: boolean;
  canonical?: boolean;
  breadcrumbName?: string;
  sitemap?: SitemapSettings;
};

export const siteRoutes = {
  home: {
    path: "/",
    title: "Private Baby Book App for Two Caregivers | Our Little World",
    description:
      "A private, parent-approved baby book app for selected photos, videos, firsts, voice notes, and letters. Coming soon to iPhone and Android.",
    indexable: true,
    sitemap: { changeFrequency: "weekly", priority: 1 },
  },
  story: {
    path: "/story/",
    title: "Why We Built a Private Baby Book | Our Little World",
    description:
      "Why Our Little World keeps the ordinary days in one private family space for two caregivers—with no public feed, likes, followers, or streaks.",
    indexable: true,
    breadcrumbName: "Story",
    sitemap: { changeFrequency: "monthly", priority: 0.7 },
  },
  pricing: {
    path: "/pricing/",
    title: "Planned Baby Book App Pricing | Our Little World",
    description:
      "See planned Family and Vault pricing, storage, video limits, original-backup differences, renewal terms, and what happens if a subscription lapses.",
    indexable: true,
    breadcrumbName: "Pricing",
    sitemap: { changeFrequency: "weekly", priority: 0.8 },
  },
  gift: {
    path: "/gift/",
    title: "Planned Baby Book Gifts for New Parents | Our Little World",
    description:
      "Explore planned one-year Our Little World gifts for new parents. Gift purchase, delivery, and redemption are not publicly available yet.",
    indexable: true,
    breadcrumbName: "Gift",
    sitemap: { changeFrequency: "weekly", priority: 0.8 },
  },
  privacy: {
    path: "/privacy/",
    title: "Privacy Policy | Our Little World",
    description:
      "How Our Little World handles family memories, optional photo discovery, selected uploads, analytics consent, export, deletion, billing, and support.",
    indexable: true,
    breadcrumbName: "Privacy",
    sitemap: { changeFrequency: "monthly", priority: 0.5 },
  },
  terms: {
    path: "/terms/",
    title: "Terms of Service | Our Little World",
    description:
      "Terms for Our Little World accounts, family spaces, planned subscriptions and gifts, media storage, exports, cancellation, refunds, and support.",
    indexable: true,
    breadcrumbName: "Terms",
    sitemap: { changeFrequency: "monthly", priority: 0.4 },
  },
  refunds: {
    path: "/refunds/",
    title: "Cancellation & Refunds | Our Little World",
    description:
      "Cancellation and refund terms for future native-store purchases, enabled Stripe subscriptions, duplicate purchases, gift codes, and billing support.",
    indexable: true,
    breadcrumbName: "Refunds",
    sitemap: { changeFrequency: "monthly", priority: 0.4 },
  },
  unfinishedBabyBook: {
    path: "/for/unfinished-baby-book/",
    title: "An Easier Baby Book for an Unfinished Camera Roll | Our Little World",
    description:
      "Review likely moments, choose what belongs, and let a private baby book grow from selected photos, notes, firsts, voice memories, and letters.",
    indexable: true,
    breadcrumbName: "For an unfinished baby book",
    sitemap: { changeFrequency: "monthly", priority: 0.7 },
  },
  emailPreferences: {
    path: "/email-preferences/",
    title: "Email Preferences | Our Little World",
    description:
      "How Our Little World handles marketing unsubscribe requests, suppression, and separate transactional service messages.",
    indexable: false,
    canonical: true,
    breadcrumbName: "Email preferences",
  },
  partners: {
    path: "/partners/",
    title: "Partners | Our Little World",
    description: "The Our Little World partner program is not publicly available.",
    indexable: false,
    canonical: false,
  },
  checkoutSuccess: {
    path: "/checkout/success/",
    title: "Verify Checkout | Our Little World",
    description: "Verify an Our Little World website checkout before connecting it to a family space.",
    indexable: false,
    canonical: false,
  },
  giftCheckoutSuccess: {
    path: "/checkout/gift-success/",
    title: "Verify Gift Checkout | Our Little World",
    description: "Verify an Our Little World gift checkout before delivery or redemption details are shown.",
    indexable: false,
    canonical: false,
  },
  notFound: {
    path: "/404/",
    title: "Page Not Found | Our Little World",
    description: "The requested Our Little World page could not be found.",
    indexable: false,
    canonical: false,
  },
} as const satisfies Record<string, SiteRouteDefinition>;

export type SiteRouteId = keyof typeof siteRoutes;

const SOCIAL_IMAGE = {
  url: absoluteUrl(SOCIAL_PREVIEW_PATH),
  width: 1200,
  height: 630,
  alt: "Our Little World, a private baby book for two caregivers",
};

export function absoluteUrl(path: string) {
  return new URL(path, SITE_ORIGIN).toString();
}

export function metadataFor(routeId: SiteRouteId): Metadata {
  const route = siteRoutes[routeId];
  const canonical = absoluteUrl(route.path);

  return {
    title: { absolute: route.title },
    description: route.description,
    ...("canonical" in route && route.canonical === false ? {} : { alternates: { canonical } }),
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: SITE_NAME,
      title: route.title,
      description: route.description,
      url: canonical,
      images: [SOCIAL_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: route.title,
      description: route.description,
      images: [SOCIAL_IMAGE.url],
    },
    ...(route.indexable
      ? {}
      : {
          robots: {
            index: false,
            follow: false,
            nocache: true,
          },
        }),
  };
}

export function sitemapEntries(): MetadataRoute.Sitemap {
  return Object.values(siteRoutes).flatMap((route) => {
    if (!route.indexable || !("sitemap" in route)) return [];
    return [
      {
        url: absoluteUrl(route.path),
        changeFrequency: route.sitemap.changeFrequency,
        priority: route.sitemap.priority,
      },
    ];
  });
}

export function organizationStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_ORIGIN}/#organization`,
    name: SITE_NAME,
    url: `${SITE_ORIGIN}/`,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl(BRAND_MARK_PATH),
      width: 1024,
      height: 1024,
    },
  } as const;
}

export function websiteStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_ORIGIN}/#website`,
    url: `${SITE_ORIGIN}/`,
    name: SITE_NAME,
    description: siteRoutes.home.description,
    inLanguage: "en-US",
    publisher: { "@id": `${SITE_ORIGIN}/#organization` },
  } as const;
}

export function breadcrumbStructuredData(routeId: SiteRouteId) {
  const route = siteRoutes[routeId];
  if (!("breadcrumbName" in route)) return null;

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${SITE_ORIGIN}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: route.breadcrumbName,
        item: absoluteUrl(route.path),
      },
    ],
  } as const;
}
