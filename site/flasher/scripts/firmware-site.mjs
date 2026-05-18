import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import firmwareVariantConfig from "../shared/firmware-variants.json" with { type: "json" };
import {
  getDefaultFirmwareReleaseVersion as readDefaultFirmwareReleaseVersion,
  getFirmwareBuildBaseRoot,
  getFirmwareRelease,
  listFirmwareReleases,
  readReleaseInfo,
} from "./release-info.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const siteRoot = path.resolve(__dirname, "..");
const defaultSwitchModelId = firmwareVariantConfig.defaultSwitchModelId;
const defaultFirmwareReleaseVersion = readDefaultFirmwareReleaseVersion();
const firmwareVariants = [...firmwareVariantConfig.variants];
const visibleFirmwareVariants = firmwareVariants.filter((variant) => variant.hidden !== true);
const firmwareVariantByModelId = new Map(
  firmwareVariants.map((variant) => [variant.switchModelId, variant]),
);

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

export function listFirmwareVariants() {
  return visibleFirmwareVariants;
}

export function listAllFirmwareVariants() {
  return firmwareVariants;
}

export function getFirmwareVariant(switchModelId = defaultSwitchModelId) {
  const variant = firmwareVariantByModelId.get(switchModelId);
  if (!variant) {
    throw new Error(`Unsupported switch model for firmware site: ${switchModelId}`);
  }

  return variant;
}

export function listFlasherReleases() {
  return listFirmwareReleases();
}

export function getDefaultFirmwareReleaseVersion() {
  return defaultFirmwareReleaseVersion;
}

export function getFlasherRelease(version = defaultFirmwareReleaseVersion) {
  return getFirmwareRelease(version);
}

export function getVersionedManifestPath(switchModelId = defaultSwitchModelId, version = defaultFirmwareReleaseVersion) {
  const variant = getFirmwareVariant(switchModelId);
  const release = getFlasherRelease(version);
  return `./firmware/${release.version}/${variant.manifestFileName}`;
}

export function getFirmwareBuildRoot(environmentId, version = defaultFirmwareReleaseVersion) {
  return path.join(getFirmwareBuildBaseRoot(version), environmentId);
}

export function getFlasherArgsPath(environmentId, version = defaultFirmwareReleaseVersion) {
  return path.join(getFirmwareBuildRoot(environmentId, version), "flasher_args.json");
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

function firmwareSourcePathCandidates(firmwareBuildRoot, sourceRelativePath) {
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
  const defaultVariant = getFirmwareVariant(defaultSwitchModelId);
  return resolveFirmwareSourcePathForBuildRoot(
    getFirmwareBuildRoot(defaultVariant.environmentId, defaultFirmwareReleaseVersion),
    sourceRelativePath,
  );
}

export function resolveFirmwareSourcePathForBuildRoot(firmwareBuildRoot, sourceRelativePath) {
  for (const candidate of firmwareSourcePathCandidates(firmwareBuildRoot, sourceRelativePath)) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Missing required firmware file for flash part: ${sourceRelativePath}`);
}

export async function readFirmwareFlashPlanFromBuildRoot(
  firmwareBuildBaseRoot,
  switchModelId = defaultSwitchModelId,
) {
  const variant = getFirmwareVariant(switchModelId);
  const firmwareBuildRoot = path.join(firmwareBuildBaseRoot, variant.environmentId);
  const flasherArgsPath = path.join(firmwareBuildRoot, "flasher_args.json");
  const flasherArgs = JSON.parse(await readFile(flasherArgsPath, "utf8"));

  return buildFirmwareFlashPlanFromArgs(flasherArgs).map((part) => ({
    ...part,
    manifestPath: `${variant.environmentId}/${part.publishFileName}`,
    sourcePath: resolveFirmwareSourcePathForBuildRoot(firmwareBuildRoot, part.sourceRelativePath),
  }));
}

export async function readFirmwareFlashPlan(
  switchModelId = defaultSwitchModelId,
  version = defaultFirmwareReleaseVersion,
) {
  return readFirmwareFlashPlanFromBuildRoot(getFirmwareBuildBaseRoot(version), switchModelId);
}

export async function sha256File(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

export async function assertFirmwareFiles(
  switchModelId = defaultSwitchModelId,
  version = defaultFirmwareReleaseVersion,
) {
  for (const part of await readFirmwareFlashPlan(switchModelId, version)) {
    if (!existsSync(part.sourcePath)) {
      throw new Error(`Missing required firmware file: ${part.sourcePath}`);
    }
  }
}

export async function createFirmwareManifest(switchModelId = defaultSwitchModelId) {
  return createFirmwareManifestForRelease(switchModelId, defaultFirmwareReleaseVersion);
}

export async function createFirmwareManifestForRelease(
  switchModelId = defaultSwitchModelId,
  version = defaultFirmwareReleaseVersion,
  options = {},
) {
  const variant = getFirmwareVariant(switchModelId);
  await assertFirmwareFiles(switchModelId, version);
  const release = getFlasherRelease(version);
  const { desktopReleaseUrl } = await readReleaseInfo(release.version);
  const firmwareParts = await readFirmwareFlashPlan(switchModelId, version);
  const sha256 = [];
  const partPathPrefix =
    typeof options.partPathPrefix === "string" && options.partPathPrefix.length > 0
      ? options.partPathPrefix.replace(/\/+$/u, "")
      : "";

  for (const part of firmwareParts) {
    const partPath = partPathPrefix ? `${partPathPrefix}/${part.manifestPath}` : part.manifestPath;
    sha256.push({
      path: partPath,
      value: await sha256File(part.sourcePath),
    });
  }

  return {
    name: "Friend Maker",
    version: release.version,
    new_install_prompt_erase: true,
    builds: [
      {
        chipFamily: "ESP32",
        parts: firmwareParts.map((part) => ({
          path: partPathPrefix ? `${partPathPrefix}/${part.manifestPath}` : part.manifestPath,
          offset: part.offset,
        })),
      },
    ],
    metadata: {
      boardId: variant.boardId,
      label: variant.boardLabel,
      switchModelId: variant.switchModelId,
      switchModelLabel: variant.switchModelLabel,
      switchModelDescription: variant.switchModelDescription,
      desktopReleaseUrl,
      generatedAt: new Date().toISOString(),
      sha256,
    },
  };
}
