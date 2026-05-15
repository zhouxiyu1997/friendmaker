import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getFirmwareVariant,
  getVersionedManifestPath,
  listFlasherReleases,
  listFirmwareVariants,
} from "../scripts/firmware-site.mjs";

test("firmware site variants cover all supported web flasher models", () => {
  assert.deepEqual(
    listFirmwareVariants().map((variant) => variant.switchModelId),
    ["switch", "switch2", "switch_lite"],
  );
});

test("firmware site keeps the default switch manifest stable and maps Switch 2 explicitly", () => {
  assert.equal(getFirmwareVariant().manifestFileName, "manifest.json");
  assert.equal(getFirmwareVariant().switchModelLabel, "Switch");
  assert.equal(getFirmwareVariant("switch2").environmentId, "esp32dev_wireless_switch2");
  assert.equal(getFirmwareVariant("switch_lite").boardId, "esp32dev_wireless");
  assert.equal(getVersionedManifestPath("switch", "0.6.1"), "./firmware/0.6.1/manifest.json");
  assert.deepEqual(
    listFlasherReleases().map((release) => release.version),
    ["0.6.1"],
  );
});

test("firmware site rejects unsupported switch models", () => {
  assert.throws(
    () => getFirmwareVariant("switch_unknown"),
    /Unsupported switch model for firmware site/u,
  );
});

test("firmware site page keeps the switch model wording aligned with desktop", async () => {
  const pageSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");

  assert.match(pageSource, /Switch 型号/u);
  assert.match(pageSource, /发布版本/u);
  assert.doesNotMatch(pageSource, /0\.5\.0/u);
  assert.doesNotMatch(pageSource, /目标机型/u);
  assert.doesNotMatch(pageSource, /连接提示/u);
  assert.match(appSource, /DEFAULT_RELEASE_VERSION/u);
  assert.match(appSource, /release\.recommended \? `\$\{release\.version\}（推荐）` : release\.version/u);
  assert.match(appSource, /firmwareReleaseField\.classList\.toggle\("hidden", FIRMWARE_RELEASES\.length <= 1\)/u);
});
