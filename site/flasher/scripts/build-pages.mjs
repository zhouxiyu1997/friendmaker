import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  createFirmwareManifest,
  readFirmwareFlashPlan,
  siteRoot,
} from "./firmware-site.mjs";

const webBuildRoot = path.join(siteRoot, "dist", "web");
const pagesRoot = path.join(siteRoot, "dist", "pages");
const firmwareOutputRoot = path.join(pagesRoot, "firmware", "esp32dev_wireless");

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
  const firmwareParts = await readFirmwareFlashPlan();

  for (const part of firmwareParts) {
    await assertFileExists(part.sourcePath);
  }

  await rm(pagesRoot, { recursive: true, force: true });
  await mkdir(firmwareOutputRoot, { recursive: true });
  await cp(webBuildRoot, pagesRoot, { recursive: true });

  for (const part of firmwareParts) {
    await cp(part.sourcePath, path.join(firmwareOutputRoot, part.publishFileName));
  }

  const manifest = await createFirmwareManifest();
  await writeFile(
    path.join(pagesRoot, "firmware", "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await writeFile(path.join(pagesRoot, ".nojekyll"), "", "utf8");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
