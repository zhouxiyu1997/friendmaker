import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import firmwareReleaseConfig from "../shared/firmware-releases.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, "..", "..", "..");
export const repositoryUrl = "https://github.com/zhouxiyu1997/friendmaker";
export const latestDesktopReleaseUrl = `${repositoryUrl}/releases/latest`;
const defaultFirmwareReleaseVersion = firmwareReleaseConfig.defaultVersion;

function normalizeFirmwareBuildRoot(release) {
  if (typeof release.firmwareBuildRoot !== "string" || release.firmwareBuildRoot.trim().length === 0) {
    throw new Error(`Firmware release ${release.version} is missing firmwareBuildRoot.`);
  }

  return release.firmwareBuildRoot.replace(/[\\/]+$/u, "");
}

const firmwareReleases = firmwareReleaseConfig.versions.map((release) => {
  const firmwareBuildRoot = normalizeFirmwareBuildRoot(release);
  return {
    ...release,
    firmwareBuildRoot,
    desktopReleaseUrl: createDesktopReleaseUrl(release.version),
  };
});
const firmwareReleaseByVersion = new Map(
  firmwareReleases.map((release) => [release.version, release]),
);
const firmwareBuildRootByVersion = new Map();

if (!firmwareReleaseByVersion.has(defaultFirmwareReleaseVersion)) {
  throw new Error(`Default firmware release is not present in the flasher release catalog: ${defaultFirmwareReleaseVersion}`);
}

for (const release of firmwareReleases) {
  const existingVersion = firmwareBuildRootByVersion.get(release.firmwareBuildRoot);
  if (existingVersion && existingVersion !== release.version) {
    throw new Error(
      `Firmware releases ${existingVersion} and ${release.version} cannot share the same firmwareBuildRoot: ${release.firmwareBuildRoot}`,
    );
  }
  firmwareBuildRootByVersion.set(release.firmwareBuildRoot, release.version);
}

export function buildReleaseTag(version) {
  return `v${version}`;
}

export function createDesktopReleaseUrl(version) {
  return `${repositoryUrl}/releases/tag/${buildReleaseTag(version)}`;
}

export function listFirmwareReleases() {
  return firmwareReleases;
}

export function getDefaultFirmwareReleaseVersion() {
  return defaultFirmwareReleaseVersion;
}

export function getFirmwareRelease(version = defaultFirmwareReleaseVersion) {
  const release = firmwareReleaseByVersion.get(version);
  if (!release) {
    throw new Error(`Unsupported firmware release for flasher site: ${version}`);
  }

  return release;
}

export function getFirmwareBuildBaseRoot(version = defaultFirmwareReleaseVersion) {
  return path.join(repoRoot, getFirmwareRelease(version).firmwareBuildRoot);
}

export async function readRootPackageVersion() {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  return packageJson.version;
}

export async function readReleaseInfo(version = defaultFirmwareReleaseVersion) {
  const release = getFirmwareRelease(version);
  return {
    version: release.version,
    desktopReleaseUrl: release.desktopReleaseUrl,
  };
}
