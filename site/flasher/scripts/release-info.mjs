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
const firmwareReleases = firmwareReleaseConfig.versions.map((release) => ({
  ...release,
  desktopReleaseUrl: createDesktopReleaseUrl(release.version),
}));
const firmwareReleaseByVersion = new Map(
  firmwareReleases.map((release) => [release.version, release]),
);

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
