import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import CommercialAvailability from "@/components/CommercialAvailability";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import { metadataFor } from "@/lib/siteSeo";
import { unfinishedBabyBookActions } from "@/lib/unfinishedBabyBookPageModel";

export const metadata: Metadata = metadataFor("unfinishedBabyBook");

export default function UnfinishedBabyBookPage() {
  const launchHref = unfinishedBabyBookActions.launch.href;
  const giftHref = unfinishedBabyBookActions.gift.href;

  return (
    <main id="main" className="olw-angle-page">
      <BreadcrumbStructuredData route="unfinishedBabyBook" />
      <section className="olw-angle-hero">
        <div className="wrap olw-angle-hero-grid">
          <div>
            <div className="breadcrumbs">
              <Link href="/">Home</Link>
              <span>/</span>
              <span>For an unfinished baby book</span>
            </div>
            <p className="eyebrow">For the baby book you meant to make</p>
            <h1>Keep the beginning without creating another backlog.</h1>
            <p className="olw-angle-lede">
              With your permission, Our Little World helps surface likely moments from
              your photo library. You review them, choose what belongs, and add a line
              only when you want to.
            </p>
            <div className="olw-angle-actions">
              <Link className="button button-dark" href={launchHref}>
                {unfinishedBabyBookActions.launch.label}
              </Link>
              <Link className="button button-ghost" href={giftHref}>
                {unfinishedBabyBookActions.gift.label}
              </Link>
            </div>
            <p className="olw-angle-trust">
              Parent-approved saves · Private family space · No public feed
            </p>
          </div>
          <div className="olw-angle-device">
            <Image
              src="/assets/screens/moment.png"
              alt="A parent reviewing a likely moment before saving it to a private baby book"
              width={720}
              height={1280}
              priority
            />
          </div>
        </div>
      </section>

      <section className="olw-angle-section">
        <div className="wrap">
          <p className="eyebrow">A small, parent-approved workflow</p>
          <h2>You stay the author. The app helps with the sorting.</h2>
          <div className="olw-angle-grid">
            <article className="olw-angle-card">
              <span>01</span>
              <h3>Choose photo access</h3>
              <p>
                Optional discovery runs only with the photo-library permission you grant.
                You can change that permission in device settings.
              </p>
            </article>
            <article className="olw-angle-card">
              <span>02</span>
              <h3>Review likely moments</h3>
              <p>
                On-device matching can surface possibilities. A suggestion is not a memory
                until you keep it, and uncertain matches remain review-first.
              </p>
            </article>
            <article className="olw-angle-card">
              <span>03</span>
              <h3>Save only what belongs</h3>
              <p>
                Your approved selections are uploaded to the private family archive. The
                app does not delete originals from your camera roll.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="olw-angle-section olw-angle-section--paper">
        <div className="wrap">
          <p className="eyebrow">What the keepsake actually holds</p>
          <h2>One photo, one line, or one first is enough.</h2>
          <div className="olw-angle-grid">
            <article className="olw-angle-card olw-angle-card--warm">
              <h3>Selected saves, not a whole-device backup</h3>
              <p>
                Family stores app-quality copies of memories you save. Vault adds
                original-quality backup for selected photos and videos.
              </p>
            </article>
            <article className="olw-angle-card olw-angle-card--warm">
              <h3>A book you can take with you</h3>
              <p>
                Saved memories remain viewable and exportable if a subscription lapses.
                Current exports disclose any video-poster or voice-reference limitations.
              </p>
            </article>
            <article className="olw-angle-card olw-angle-card--warm">
              <h3>Deletion requests start with support</h3>
              <p>
                Self-serve account deletion is not implemented yet. Verified requests
                start with support while the required export-first, role-aware deletion
                flow is completed; camera-roll originals are never part of app deletion.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="olw-angle-section">
        <div className="wrap olw-angle-objections">
          <div>
            <p className="eyebrow">Before you begin</p>
            <h2>Built to reduce work without taking over the story.</h2>
          </div>
          <div>
            <article>
              <h3>Will this become another chore?</h3>
              <p>
                There are no streaks or completion scores. Keep something when it matters;
                one approved moment can be enough for today.
              </p>
            </article>
            <article>
              <h3>Does the app invent milestones or captions?</h3>
              <p>
                No. Suggestions use real metadata and uncertainty language. You confirm,
                correct, write, or dismiss them before they become part of the book.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="olw-angle-final">
        <div className="narrow">
          <p className="eyebrow">A small beginning</p>
          <h2>Save one parent-approved moment.</h2>
          <p>Let the baby book grow from there, without asking today to become a project.</p>
          <Link className="button button-dark" href={launchHref}>
            {unfinishedBabyBookActions.launch.label}
          </Link>
        </div>
      </section>
      <CommercialAvailability surface="angle" />
    </main>
  );
}
