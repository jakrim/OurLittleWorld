import type { Metadata, Viewport } from "next";
import { Caveat, Manrope, Newsreader } from "next/font/google";
import type { ReactNode } from "react";

import SiteChrome from "@/components/SiteChrome";
import { SiteStructuredData } from "@/components/StructuredData";
import { publicCommercialConfig } from "@/lib/commercialConfig";
import { SITE_ORIGIN } from "@/lib/siteSeo";
import "./globals.css";

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-caveat",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  referrer: "no-referrer",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/assets/brand/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#faf4ee",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${manrope.variable} ${newsreader.variable} ${caveat.variable}`}
        data-commerce-state={publicCommercialConfig.commerceState}
        data-store-availability={publicCommercialConfig.storeAvailability}
      >
        <SiteStructuredData />
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
