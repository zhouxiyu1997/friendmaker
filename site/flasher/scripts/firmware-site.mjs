import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readReleaseInfo, repoRoot } from "./release-info.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const siteRoot = path.resolve(__dirname, "..");
export const firmwareBuildRoot = path.join(
  repoRoot,
  "firmware",
  "esp32",
  ".pio",
  "build",
  "esp32dev_wireless",
);
export const flasherArgsPath = path.join(firmwareBuildRoot, "flasher_args.json");

const legacyPublishedFileNamesBySource = new Map([
  ["bootloader/bootloader.bin", "bootloader.bin"],
  ["partition_table/partition-table.bin", "partitions.bin"],
  ["esp32.bin", "firmware.bin"],
]);

const legacyBuildOutputNamesBySource = new Map([
  ["bootloader/bootloader.bin", "bootloader.bin"],
  ["partition_table/partition-table.bin", "partitions.bin"],
  ["esp32.bin", "firmware.bin"],
]);

function parseFlashOffset(offset) {
  const parsed = Number.parseInt(offset, 16);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid flash offset in flasher_args.json: ${offset}`);
  }

  return parsed;
}

export function normalizePublishedFileName(sourceRelativePath) {
  const legacyFileName = legacyPublishedFileNamesBySource.get(sourceRelativePath);
  if (legacyFileName) {
    return legacyFileName;
  }

  return sourceRelativePath
    .split(/[\\/]+/u)
    .filter(Boolean)
    .map((segment) => segment.toLowerCase().replace(/[^a-z0-9.]+/gu, "-").replace(/-+/gu, "-"))
    .map((segment) => segment.replace(/^-|-$/gu, ""))
    .join("--");
}

export function buildFirmwareFlashPlanFromArgs(flasherArgs) {
  return Object.entries(flasherArgs.flash_files ?? {})
    .map(([offset, sourceRelativePath]) => {
      if (typeof sourceRelativePath !== "string") {
        throw new Error(`Expected firmware path to be a string for offset ${offset}`);
      }

      return {
        offset: parseFlashOffset(offset),
        sourceRelativePath,
        publishFileName: normalizePublishedFileName(sourceRelativePath),
      };
    })
    .sort((left, right) => left.offset - right.offset);
}

function firmwareSourcePathCandidates(sourceRelativePath) {
  const candidates = [
    path.join(firmwareBuildRoot, sourceRelativePath),
    path.join(firmwareBuildRoot, path.basename(sourceRelativePath)),
  ];

  const legacyBuildOutputName = legacyBuildOutputNamesBySource.get(sourceRelativePath);
  if (legacyBuildOutputName) {
    candidates.push(path.join(firmwareBuildRoot, legacyBuildOutputName));
  }

  return [...new Set(candidates)];
}

export function resolveFirmwareSourcePath(sourceRelativePath) {
  for (const candidate of firmwareSourcePathCandidates(sourceRelativePath)) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Missing required firmware file for flash part: ${sourceRelativePath}`);
}

export async function readFirmwareFlashPlan() {
  const flasherArgs = JSON.parse(await readFile(flasherArgsPath, "utf8"));
  return buildFirmwareFlashPlanFromArgs(flasherArgs).map((part) => ({
    ...part,
    manifestPath: `esp32dev_wireless/${part.publishFileName}`,
    sourcePath: resolveFirmwareSourcePath(part.sourceRelativePath),
  }));
}

export async function sha256File(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

export async function assertFirmwareFiles() {
  for (const part of await readFirmwareFlashPlan()) {
    if (!existsSync(part.sourcePath)) {
      throw new Error(`Missing required firmware file: ${part.sourcePath}`);
    }
  }
}

export async function createFirmwareManifest() {
  await assertFirmwareFiles();
  const { version, desktopReleaseUrl } = await readReleaseInfo();
  const firmwareParts = await readFirmwareFlashPlan();
  const sha256 = [];

  for (const part of firmwareParts) {
    sha256.push({
      path: part.manifestPath,
      value: await sha256File(part.sourcePath),
    });
  }

  return {
    name: "Friend Maker",
    version,
    new_install_prompt_erase: true,
    builds: [
      {
        chipFamily: "ESP32",
        parts: firmwareParts.map((part) => ({
          path: part.manifestPath,
          offset: part.offset,
        })),
      },
    ],
    metadata: {
      boardId: "esp32dev_wireless",
      label: "ESP32-WROOM-32 / ESP-32S",
      desktopReleaseUrl,
      generatedAt: new Date().toISOString(),
      sha256,
    },
  };
}
