import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReleaseTag,
  createDesktopReleaseUrl,
  getDefaultFirmwareReleaseVersion,
  getFirmwareRelease,
  listFirmwareReleases,
} from "../scripts/release-info.mjs";

test("release info derives tag and desktop release URL from the root version", () => {
  assert.equal(buildReleaseTag("0.5.0"), "v0.5.0");
  assert.equal(
    createDesktopReleaseUrl("0.5.0"),
    "https://github.com/zhouxiyu1997/friendmaker/releases/tag/v0.5.0",
  );
});

test("flasher release catalog keeps 0.6.1 as default while retaining 0.5.0", () => {
  assert.equal(getDefaultFirmwareReleaseVersion(), "0.6.1");
  assert.deepEqual(
    listFirmwareReleases().map((release) => release.version),
    ["0.6.1", "0.5.0"],
  );
  assert.equal(
    getFirmwareRelease("0.6.1").desktopReleaseUrl,
    "https://github.com/zhouxiyu1997/friendmaker/releases/tag/v0.6.1",
  );
  assert.equal(
    getFirmwareRelease("0.5.0").desktopReleaseUrl,
    "https://github.com/zhouxiyu1997/friendmaker/releases/tag/v0.5.0",
  );
});
