import type { Metadata } from "next";
import Link from "next/link";

import { metadataFor } from "@/lib/siteSeo";

export const metadata: Metadata = metadataFor("notFound");

export default function NotFound() {
  return (
    <main id="main">
      <section className="page-hero">
        <div className="narrow center">
          <p className="script">a quiet wrong turn</p>
          <h1 className="page-title">This page is not part of our little world.</h1>
          <p className="lead">
            The address may have changed, or the page may not be publicly available.
          </p>
          <Link className="button button-dark" href="/">
            Return home
          </Link>
        </div>
      </section>
    </main>
  );
}
