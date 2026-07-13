import type { Metadata, Viewport } from "next";
import { Caveat, Manrope, Newsreader } from "next/font/google";
import type { ReactNode } from "react";

import SiteChrome from "@/components/SiteChrome";
import { publicCommercialConfig } from "@/lib/commercialConfig";
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
  metadataBase: new URL("https://ourlittleworld.me"),
  title: {
    default: "Our Little World | Private baby book for family",
    template: "%s | Our Little World",
  },
  description:
    "A private baby book for photos, firsts, voice notes, and letters. Coming soon to iPhone and Android; join the launch list for verified availability.",
  referrer: "no-referrer",
  icons: {
    icon: "/assets/brand/logo-mark-circle.png",
  },
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
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
