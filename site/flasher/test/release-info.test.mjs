import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  buildReleaseTag,
  createDesktopReleaseUrl,
  getDefaultFirmwareReleaseVersion,
  getFirmwareBuildBaseRoot,
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

test("flasher release catalog only exposes versions backed by a declared firmware build root", () => {
  assert.equal(getDefaultFirmwareReleaseVersion(), "0.6.2");
  assert.deepEqual(
    listFirmwareReleases().map((release) => release.version),
    ["0.6.2"],
  );
  assert.equal(
    getFirmwareRelease("0.6.2").desktopReleaseUrl,
    "https://github.com/zhouxiyu1997/friendmaker/releases/tag/v0.6.2",
  );
  assert.equal(
    getFirmwareRelease("0.6.2").firmwareBuildRoot,
    "firmware/esp32/.pio/build",
  );
  assert.ok(
    getFirmwareBuildBaseRoot("0.6.2").endsWith(path.join("firmware", "esp32", ".pio", "build")),
  );
});
