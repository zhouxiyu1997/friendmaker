import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, "..", "..", "..");
export const repositoryUrl = "https://github.com/zhouxiyu1997/friendmaker";
export const latestDesktopReleaseUrl = `${repositoryUrl}/releases/latest`;

export function buildReleaseTag(version) {
  return `v${version}`;
}

export function createDesktopReleaseUrl(version) {
  return `${repositoryUrl}/releases/tag/${buildReleaseTag(version)}`;
}

export async function readRootPackageVersion() {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  return packageJson.version;
}

export async function readReleaseInfo() {
  const version = await readRootPackageVersion();
  return {
    version,
    desktopReleaseUrl: createDesktopReleaseUrl(version),
  };
}
