import { NextResponse } from "next/server";

import { publicCommercialConfig } from "@/lib/commercialConfig";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "our-little-world-web",
      commerce: publicCommercialConfig.commerceState,
      app_availability: publicCommercialConfig.storeAvailability,
      release:
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.VERCEL_DEPLOYMENT_ID ||
        process.env.VERCEL_URL ||
        "local",
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    },
  );
}
