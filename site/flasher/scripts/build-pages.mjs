import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  createFirmwareManifestForRelease,
  getDefaultFirmwareReleaseVersion,
  getFirmwareVariant,
  listFlasherReleases,
  listFirmwareVariants,
  readFirmwareFlashPlan,
  siteRoot,
} from "./firmware-site.mjs";

const webBuildRoot = path.join(siteRoot, "dist", "web");
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
  await assertFileExists(path.join(webBuildRoot, "index.html"));
  const firmwareReleases = listFlasherReleases();
  const firmwareVariants = listFirmwareVariants();
  const firmwarePlanByReleaseAndModel = new Map();
  const defaultReleaseVersion = getDefaultFirmwareReleaseVersion();

  for (const release of firmwareReleases) {
    for (const variant of firmwareVariants) {
      const firmwareParts = await readFirmwareFlashPlan(variant.switchModelId, release.version);
      for (const part of firmwareParts) {
        await assertFileExists(part.sourcePath);
      }
      firmwarePlanByReleaseAndModel.set(`${release.version}:${variant.switchModelId}`, firmwareParts);
    }
  }

  await rm(pagesRoot, { recursive: true, force: true });
  await cp(webBuildRoot, pagesRoot, { recursive: true });

  for (const release of firmwareReleases) {
    for (const variant of firmwareVariants) {
      const firmwareOutputRoot = path.join(pagesRoot, "firmware", release.version, variant.environmentId);
      await mkdir(firmwareOutputRoot, { recursive: true });

      for (const part of firmwarePlanByReleaseAndModel.get(`${release.version}:${variant.switchModelId}`) ?? []) {
        await cp(part.sourcePath, path.join(firmwareOutputRoot, part.publishFileName));
      }
    }
  }

  for (const release of firmwareReleases) {
    for (const variant of firmwareVariants) {
      const manifest = await createFirmwareManifestForRelease(variant.switchModelId, release.version);
      await writeFile(
        path.join(pagesRoot, "firmware", release.version, variant.manifestFileName),
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8",
      );
    }
  }

  const defaultManifestVariant = getFirmwareVariant("switch");
  for (const variant of firmwareVariants) {
    const manifest = await createFirmwareManifestForRelease(variant.switchModelId, defaultReleaseVersion, {
      partPathPrefix: defaultReleaseVersion,
    });
    await writeFile(
      path.join(pagesRoot, "firmware", variant.manifestFileName),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  }

  if (defaultManifestVariant.manifestFileName !== "manifest.json") {
    const manifest = await createFirmwareManifestForRelease("switch", defaultReleaseVersion, {
      partPathPrefix: defaultReleaseVersion,
    });
    await writeFile(path.join(pagesRoot, "firmware", "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  await writeFile(path.join(pagesRoot, ".nojekyll"), "", "utf8");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
