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
  assert.equal(getVersionedManifestPath("switch", "0.6.2"), "./firmware/0.6.2/manifest.json");
  assert.deepEqual(
    listFlasherReleases().map((release) => release.version),
    ["0.6.2"],
  );
});

test("firmware site rejects unsupported switch models", () => {
  assert.throws(
    () => getFirmwareVariant("switch_unknown"),
    /Unsupported switch model for firmware site/u,
  );
});

test("firmware site page keeps the switch model wording internationalized and aligned with desktop", async () => {
  const pageSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const scriptSource = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");

  assert.match(pageSource, /data-i18n="firmware\.releaseVersion"/u);
  assert.match(pageSource, /data-i18n="firmware\.switchModel"/u);
  assert.match(scriptSource, /"firmware\.releaseVersion": "Release version"/u);
  assert.match(scriptSource, /"firmware\.releaseVersion": "发布版本"/u);
  assert.match(scriptSource, /"firmware\.switchModel": "Switch model"/u);
  assert.match(scriptSource, /"firmware\.switchModel": "Switch 型号"/u);
  assert.doesNotMatch(pageSource, /0\.5\.0/u);
  assert.doesNotMatch(pageSource, /目标机型/u);
  assert.doesNotMatch(pageSource, /连接提示/u);
  assert.match(scriptSource, /DEFAULT_RELEASE_VERSION/u);
  assert.match(scriptSource, /"firmware\.releaseRecommended": "\{\{version\}\} \(recommended\)"/u);
  assert.match(scriptSource, /"firmware\.releaseRecommended": "\{\{version\}\}（推荐）"/u);
  assert.match(scriptSource, /firmwareReleaseField\.classList\.toggle\("hidden", FIRMWARE_RELEASES\.length <= 1\)/u);
});
