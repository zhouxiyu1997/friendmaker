import assert from "node:assert/strict";
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";

import { createFirmwareManifest, readFirmwareFlashPlan, siteRoot } from "./firmware-site.mjs";

const pagesRoot = path.join(siteRoot, "dist", "pages");
const manifestPath = path.join(pagesRoot, "firmware", "manifest.json");
const publishedFirmwareRoot = path.join(pagesRoot, "firmware", "esp32dev_wireless");

async function assertFileExists(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing required file: ${filePath}`);
  }

  const info = await stat(filePath);
  if (!info.isFile()) {
    throw new Error(`Expected a file but found something else: ${filePath}`);
  }
}

async function main() {
  await assertFileExists(path.join(pagesRoot, "index.html"));
  await assertFileExists(manifestPath);

  const flashPlan = await readFirmwareFlashPlan();
  for (const part of flashPlan) {
    await assertFileExists(path.join(publishedFirmwareRoot, part.publishFileName));
  }

  const actualManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const expectedManifest = await createFirmwareManifest();

  assert.equal(actualManifest.name, expectedManifest.name, "manifest name should match");
  assert.equal(actualManifest.version, expectedManifest.version, "manifest version should match");
  assert.equal(
    actualManifest.metadata?.desktopReleaseUrl,
    expectedManifest.metadata?.desktopReleaseUrl,
    "desktop release URL should match the derived release info",
  );
  assert.deepEqual(
    actualManifest.builds,
    expectedManifest.builds,
    "manifest firmware parts should match the normalized flash plan",
  );
  assert.deepEqual(
    actualManifest.metadata?.sha256,
    expectedManifest.metadata?.sha256,
    "manifest SHA256 metadata should match the published firmware files",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
