import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ourLittleWorldAngles } from "@/content/angles";

export function generateStaticParams() {
  return Object.keys(ourLittleWorldAngles).map((segment) => ({ segment }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ segment: string }>;
}): Promise<Metadata> {
  const { segment } = await params;
  const angle = ourLittleWorldAngles[segment];
  if (!angle) return {};

  return {
    title: angle.headline,
    description: angle.subheadline,
    alternates: { canonical: `/for/${angle.slug}/` },
    openGraph: {
      title: angle.headline,
      description: angle.subheadline,
      url: `/for/${angle.slug}/`,
    },
  };
}

export default async function OurLittleWorldAnglePage({
  params,
}: {
  params: Promise<{ segment: string }>;
}) {
  const { segment } = await params;
  const angle = ourLittleWorldAngles[segment];
  if (!angle) notFound();

  const startHref = `/pricing/?angle=${angle.slug}#chapter-one`;

  return (
    <main id="main" className="olw-angle-page">
      <section className="olw-angle-hero">
        <div className="wrap olw-angle-hero-grid">
          <div>
            <p className="eyebrow">{angle.eyebrow}</p>
            <h1>{angle.headline}</h1>
            <p className="olw-angle-lede">{angle.subheadline}</p>
            <div className="olw-angle-actions">
              <Link className="button button-dark" href={startHref}>
                Start your baby book
              </Link>
              <Link className="button button-ghost" href={`/gift/?angle=${angle.slug}`}>
                Gift the first year
              </Link>
            </div>
            <p className="olw-angle-trust">Private family space · No public feed · One invited caregiver</p>
          </div>
          <div className="olw-angle-device">
            <Image src={angle.image} alt={angle.imageAlt} width={720} height={1280} priority />
          </div>
        </div>
      </section>

      <section className="olw-angle-section">
        <div className="wrap">
          <p className="eyebrow">Why this feels harder than it should</p>
          <h2>{angle.promise}</h2>
          <div className="olw-angle-grid">
            {angle.situations.map((situation, index) => (
              <article className="olw-angle-card" key={situation.title}>
                <span>0{index + 1}</span>
                <h3>{situation.title}</h3>
                <p>{situation.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="olw-angle-section olw-angle-section--paper">
        <div className="wrap">
          <p className="eyebrow">What changes</p>
          <h2>A small ritual that becomes a lasting story.</h2>
          <div className="olw-angle-grid">
            {angle.benefits.map((benefit) => (
              <article className="olw-angle-card olw-angle-card--warm" key={benefit.title}>
                <h3>{benefit.title}</h3>
                <p>{benefit.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="olw-angle-section">
        <div className="wrap olw-angle-objections">
          <div>
            <p className="eyebrow">Before you begin</p>
            <h2>Quiet answers to the questions parents actually have.</h2>
          </div>
          <div>
            {angle.objections.map((item) => (
              <article key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="olw-angle-final">
        <div className="narrow">
          <p className="eyebrow">For two, for now, for later</p>
          <h2>{angle.promise}</h2>
          <p>{angle.subheadline}</p>
          <Link className="button button-dark" href={startHref}>
            Start your baby book
          </Link>
        </div>
      </section>
    </main>
  );
}
