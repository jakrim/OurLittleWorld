import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { publicPageContent } from "../content/publicPageContent.ts";

const EXPECTED_SOURCE_SHA256 = "a90e02e2ef2b5c6363a19679882af8634c50eb9665a967bef67379124b104c6b";
const canonicalUrl = new URL("../../mobile/assets/brand/logo-mark-circle.png", import.meta.url);
const publicUrl = new URL("../public/", import.meta.url);
const webMasterUrl = new URL("assets/brand/logo-mark-circle.png", publicUrl);
const manifestUrl = new URL("assets/brand/brand-assets-manifest.json", publicUrl);

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function pngDimensions(bytes: Buffer) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25],
  };
}

function icoSizes(bytes: Buffer) {
  assert.equal(bytes.readUInt16LE(0), 0);
  assert.equal(bytes.readUInt16LE(2), 1);
  const count = bytes.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 16;
    return [bytes[offset] || 256, bytes[offset + 1] || 256];
  }).sort((left, right) => left[0] - right[0]);
}

test("web brand master is the exact canonical mobile mark", async () => {
  const [canonical, webMaster] = await Promise.all([readFile(canonicalUrl), readFile(webMasterUrl)]);
  assert.equal(sha256(canonical), EXPECTED_SOURCE_SHA256);
  assert.equal(sha256(webMaster), EXPECTED_SOURCE_SHA256);
  assert.deepEqual(webMaster, canonical);
  assert.deepEqual(pngDimensions(canonical), { width: 1024, height: 1024, colorType: 6 });
});

test("generated brand renditions match the integrity manifest", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8")) as {
    source: { sha256: string; width: number; height: number; mode: string };
    outputs: Array<{
      public_path: string;
      sha256: string;
      width?: number;
      height?: number;
      sizes?: number[][];
    }>;
  };

  assert.equal(manifest.source.sha256, EXPECTED_SOURCE_SHA256);
  assert.deepEqual(
    [manifest.source.width, manifest.source.height, manifest.source.mode],
    [1024, 1024, "RGBA"],
  );
  const expectedPngs = new Map([
    ["/apple-touch-icon.png", [180, 180]],
    ["/assets/brand/icon-192.png", [192, 192]],
    ["/assets/brand/icon-512.png", [512, 512]],
    ["/assets/brand/logo-mark-circle.png", [1024, 1024]],
    ["/assets/brand/social-preview-1200x630.png", [1200, 630]],
  ]);
  assert.deepEqual(
    manifest.outputs.map((output) => output.public_path).sort(),
    [...expectedPngs.keys(), "/favicon.ico"].sort(),
  );

  for (const output of manifest.outputs) {
    const bytes = await readFile(new URL(output.public_path.slice(1), publicUrl));
    assert.equal(sha256(bytes), output.sha256, `${output.public_path} hash drifted`);
    if (output.public_path.endsWith(".png")) {
      const dimensions = pngDimensions(bytes);
      assert.deepEqual(
        [dimensions.width, dimensions.height],
        expectedPngs.get(output.public_path),
        `${output.public_path} dimensions drifted`,
      );
    }
  }

  const favicon = await readFile(new URL("favicon.ico", publicUrl));
  assert.deepEqual(icoSizes(favicon), [[16, 16], [32, 32], [48, 48]]);
});

test("public website has no legacy logo asset or emitted reference", async () => {
  const legacyName = ["logo", "mark.png"].join("-");
  await assert.rejects(access(new URL(`assets/brand/${legacyName}`, publicUrl)));

  for (const page of ["home", "story", "pricing", "gift"] as const) {
    assert.doesNotMatch(
      publicPageContent(page, { commerceState: "coming_soon", partnersEnabled: false }),
      new RegExp(legacyName.replace(".", "\\.")),
      `${page} emitted a legacy mark`,
    );
  }
});

test("home hero public output reserves image space without inline off-canvas positioning", () => {
  const html = publicPageContent("home", { commerceState: "coming_soon", partnersEnabled: false });
  assert.match(
    html,
    /welcome\.png" alt="Our Little World welcome screen" width="640" height="1386" decoding="async" fetchpriority="high"/,
  );
  assert.match(html, /class="wrap hero-grid"/);
  assert.match(html, /class="device-stage hero-device"/);
  assert.doesNotMatch(html, /style="[^"]*(?:position:\s*absolute|right:\s*-|bottom:\s*-)/);
});
