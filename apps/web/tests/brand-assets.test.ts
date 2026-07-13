import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
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

async function sourceFiles(directory: URL): Promise<URL[]> {
  const files: URL[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(entryUrl)));
    } else if (/\.(?:css|js|jsx|mjs|ts|tsx)$/.test(entry.name)) {
      files.push(entryUrl);
    }
  }
  return files;
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

test("public website has no legacy logo asset or reference", async () => {
  const legacyName = ["logo", "mark.png"].join("-");
  await assert.rejects(access(new URL(`assets/brand/${legacyName}`, publicUrl)));

  const sourceUrls = (
    await Promise.all(
      ["../app/", "../components/", "../content/", "../lib/"].map((path) =>
        sourceFiles(new URL(path, import.meta.url)),
      ),
    )
  ).flat();
  for (const sourceUrl of sourceUrls) {
    assert.doesNotMatch(
      await readFile(sourceUrl, "utf8"),
      new RegExp(legacyName.replace(".", "\\.")),
      `${sourceUrl.pathname} still references the legacy mark`,
    );
  }
});

test("home hero reserves image space and never uses the off-canvas device treatment", async () => {
  const html = publicPageContent("home", { commerceState: "coming_soon", partnersEnabled: false });
  assert.match(
    html,
    /welcome\.png" alt="Our Little World welcome screen" width="640" height="1386" decoding="async" fetchpriority="high"/,
  );

  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /main\s*\{[^}]*overflow:\s*hidden/);
  assert.doesNotMatch(css, /\.hero-home\s*\{[^}]*overflow:\s*hidden/);
  assert.match(css, /main\s*\{[^}]*overflow-x:\s*clip/);
  assert.doesNotMatch(css, /\.hero-device\s*\{[^}]*position:\s*absolute/);
  assert.doesNotMatch(css, /\.hero-device\s*\{[^}]*right:\s*-\d/);
  assert.doesNotMatch(css, /\.hero-device\s*\{[^}]*bottom:\s*-\d/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*?\.hero-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(min-width: 681px\) and \(max-height: 820px\)/);
});
