import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import test from "node:test";

import sharp from "sharp";

import {
  applyCustomColorCalibrationToHex,
  deriveCustomColorCalibration,
  getDefaultCustomColorCalibration,
  getCustomColorCalibrationSamples,
  normalizeCustomColorCalibration,
} from "../src/customColorCalibration.js";
import { startWebServer } from "../src/web/server.js";

async function solidPngDataUrl(width: number, height: number, colorHex: string): Promise<string> {
  const hex = colorHex.replace(/^#/u, "");
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
        alpha: 255,
      },
    },
  })
    .png()
    .toBuffer();

  return `data:image/png;base64,${buffer.toString("base64")}`;
}

test("deriveCustomColorCalibration returns fixed sample set and applies deltas", () => {
  const calibration = deriveCustomColorCalibration({
    brown: { saturation: 7, value: 9 },
    "warm-gray": { value: 5 },
  });

  assert.equal(calibration.version, 1);
  assert.equal(calibration.enabled, true);
  assert.equal(calibration.samples.length, 9);
  assert.equal(calibration.derivedModel.hueAnchors.length, 6);
  assert.equal(calibration.derivedModel.problemAnchors.length, 3);

  const calibratedBrown = applyCustomColorCalibrationToHex("#8a5a34", calibration);
  assert.notEqual(calibratedBrown.calibratedHex, "#8a5a34");
});

test("default custom color calibration is valid and clone-safe", () => {
  const calibration = getDefaultCustomColorCalibration();
  const normalized = normalizeCustomColorCalibration(calibration);

  assert.equal(calibration.version, 1);
  assert.equal(calibration.enabled, true);
  assert.equal(calibration.samples.length, 9);
  assert.notEqual(normalized, calibration);
  assert.deepEqual(normalized, calibration);
});

test("/api/custom-color-calibration routes expose samples and derived calibration", async (t) => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-calibration-api-"));
  const server = await startWebServer({ port: 0, recoverySessionsRoot });
  t.after(async () => {
    await server.close();
    await rm(recoverySessionsRoot, { recursive: true, force: true });
  });

  const samplesResponse = await fetch(`${server.url}/api/custom-color-calibration/samples`);
  assert.equal(samplesResponse.ok, true);
  const samplesPayload = (await samplesResponse.json()) as { samples: Array<{ id: string }> };
  assert.equal(samplesPayload.samples.length, getCustomColorCalibrationSamples().length);

  const defaultResponse = await fetch(`${server.url}/api/custom-color-calibration/default`);
  assert.equal(defaultResponse.ok, true);
  const defaultPayload = (await defaultResponse.json()) as {
    calibration: { version: number; enabled: boolean; samples: Array<{ id: string }> };
  };
  assert.equal(defaultPayload.calibration.version, 1);
  assert.equal(defaultPayload.calibration.enabled, true);
  assert.equal(defaultPayload.calibration.samples.length, 9);

  const deriveResponse = await fetch(`${server.url}/api/custom-color-calibration/derive`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      adjustmentsById: {
        brown: { saturation: 5, value: 8 },
      },
      enabled: false,
    }),
  });
  assert.equal(deriveResponse.ok, true);
  const derivePayload = (await deriveResponse.json()) as {
    calibration: { enabled: boolean; samples: Array<{ id: string }> };
  };
  assert.equal(derivePayload.calibration.enabled, false);
  assert.equal(derivePayload.calibration.samples.length, 9);

  const normalizeResponse = await fetch(`${server.url}/api/custom-color-calibration/normalize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      calibration: getDefaultCustomColorCalibration(),
    }),
  });
  assert.equal(normalizeResponse.ok, true);
  const normalizePayload = (await normalizeResponse.json()) as {
    calibration: { version: number; enabled: boolean; samples: Array<{ id: string }> };
  };
  assert.equal(normalizePayload.calibration.version, 1);
  assert.equal(normalizePayload.calibration.samples.length, 9);
});

test("/api/generate returns calibrated palette entries for palette mode", async (t) => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-calibration-generate-"));
  const server = await startWebServer({ port: 0, recoverySessionsRoot });
  t.after(async () => {
    await server.close();
    await rm(recoverySessionsRoot, { recursive: true, force: true });
  });

  const calibration = deriveCustomColorCalibration({
    brown: { saturation: 6, value: 10 },
  });
  const imageDataUrl = await solidPngDataUrl(8, 8, "#8a5a34");
  const response = await fetch(`${server.url}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      imageDataUrl,
      mode: "palette",
      colors: 8,
      previewScale: 1,
      customColorCalibration: calibration,
    }),
  });

  assert.equal(response.ok, true);
  const payload = (await response.json()) as {
    commands: string[];
    profile: {
      palette: string[];
      targetPalette: string[];
      paletteEntries: Array<{
        colorIndex: number;
        targetHex: string;
        calibratedHex: string;
        commandHex: string;
      }>;
    };
  };

  assert.equal(payload.profile.targetPalette.length, 1);
  assert.equal(payload.profile.palette.length, 1);
  assert.equal(payload.profile.paletteEntries.length, 1);
  assert.notEqual(payload.profile.paletteEntries[0]?.targetHex, payload.profile.paletteEntries[0]?.calibratedHex);
  assert.equal(payload.profile.palette[0], payload.profile.paletteEntries[0]?.targetHex);
  assert.equal(payload.profile.targetPalette[0], payload.profile.paletteEntries[0]?.targetHex);
  assert.ok(
    payload.commands.some(
      (command) =>
        command.startsWith(`PC ${payload.profile.paletteEntries[0]?.colorIndex ?? 0} `) &&
        command.endsWith(payload.profile.paletteEntries[0]?.commandHex ?? ""),
    ),
  );
});
