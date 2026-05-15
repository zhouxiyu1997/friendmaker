import assert from "node:assert/strict";
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";

import {
  createFirmwareManifestForRelease,
  getDefaultFirmwareReleaseVersion,
  listFlasherReleases,
  listFirmwareVariants,
  readFirmwareFlashPlan,
  siteRoot,
} from "./firmware-site.mjs";

const pagesRoot = path.join(siteRoot, "dist", "pages");

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
  const firmwareReleases = listFlasherReleases();
  const firmwareVariants = listFirmwareVariants();
  const defaultReleaseVersion = getDefaultFirmwareReleaseVersion();

  for (const release of firmwareReleases) {
    for (const variant of firmwareVariants) {
      const manifestPath = path.join(pagesRoot, "firmware", release.version, variant.manifestFileName);
      const publishedFirmwareRoot = path.join(pagesRoot, "firmware", release.version, variant.environmentId);
      await assertFileExists(manifestPath);

      const flashPlan = await readFirmwareFlashPlan(variant.switchModelId, release.version);
      for (const part of flashPlan) {
        await assertFileExists(path.join(publishedFirmwareRoot, part.publishFileName));
      }

      const actualManifest = JSON.parse(await readFile(manifestPath, "utf8"));
      const expectedManifest = await createFirmwareManifestForRelease(variant.switchModelId, release.version);

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
      assert.equal(
        actualManifest.metadata?.switchModelId,
        variant.switchModelId,
        "manifest switch model should match variant",
      );
    }
  }

  for (const variant of firmwareVariants) {
    const manifestPath = path.join(pagesRoot, "firmware", variant.manifestFileName);
    await assertFileExists(manifestPath);

    const actualManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const expectedManifest = await createFirmwareManifestForRelease(variant.switchModelId, defaultReleaseVersion, {
      partPathPrefix: defaultReleaseVersion,
    });

    assert.equal(actualManifest.version, expectedManifest.version, "default manifest version should match");
    assert.deepEqual(
      actualManifest.builds,
      expectedManifest.builds,
      "default manifest should point at the default release firmware paths",
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
