import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

import SiteEnhancer from "./SiteEnhancer";
import AnalyticsConsent from "./AnalyticsConsent";

const navItems = [
  { href: "/story/", label: "Story" },
  { href: "/pricing/", label: "Pricing" },
  { href: "/gift/", label: "Gift" },
  { href: "/partners/", label: "Partners" },
  { href: "/privacy/", label: "Privacy" },
  { href: "/terms/", label: "Terms" },
];

export default function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-nav">
        <div className="wrap nav-inner">
          <Link className="brand-link" href="/" aria-label="Our Little World home">
            <Image src="/assets/brand/logo-mark-circle.png" alt="" width={44} height={44} priority />
            <span>our little world</span>
          </Link>
          <nav className="nav-links" data-nav-links aria-label="Primary navigation">
            {navItems.map((item) => (
              <Link data-nav-link href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="nav-actions">
            <Link className="button button-dark" href="/pricing/#chapter-one">
              Start your baby book
            </Link>
            <button
              className="nav-toggle"
              type="button"
              data-menu-toggle
              aria-label="Open menu"
              aria-expanded="false"
            >
              <i data-lucide="menu" />
            </button>
          </div>
        </div>
      </header>

      {children}

      <footer className="site-footer">
        <div className="wrap">
          <div className="footer-grid">
            <div className="footer-brand">
              <Link className="brand-link" href="/">
                <Image src="/assets/brand/logo-mark-circle.png" alt="" width={44} height={44} />
                <span>our little world</span>
              </Link>
              <p>A private baby book for photos, firsts, notes, and letters.</p>
            </div>
            <div className="footer-cols">
              <div>
                <p className="footer-h">Explore</p>
                <Link href="/story/">Story</Link>
                <Link href="/pricing/">Pricing</Link>
                <Link href="/gift/">Gift</Link>
                <Link href="/terms/">Terms</Link>
                <Link href="/refunds/">Refunds</Link>
              </div>
              <div>
                <p className="footer-h">Company</p>
                <Link href="/partners/">Partners</Link>
                <Link href="/privacy/">Privacy</Link>
                <button
                  className="footer-link-button"
                  type="button"
                  data-analytics-preferences
                >
                  Analytics choices
                </button>
                <a href="mailto:support@ourlittleworld.me">Contact</a>
              </div>
              <div>
                <p className="footer-h">Promise</p>
                <Link href="/privacy/">No feed</Link>
                <Link href="/privacy/">No likes</Link>
                <Link href="/privacy/">Private by design</Link>
              </div>
            </div>
          </div>
          <div className="footer-base">
            <span>Copyright 2026 Get Mentors, Inc.</span>
            <span>For two, for now, for later.</span>
          </div>
        </div>
      </footer>

      <SiteEnhancer />
      <AnalyticsConsent />
    </>
  );
}
