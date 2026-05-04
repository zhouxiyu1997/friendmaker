import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { buildRecoveryExecutionPlan } from "../src/app/recovery.js";
import { generateScanlinePlan } from "../src/path/scanline.js";
import { serializeCommands } from "../src/protocol/serializer.js";
import type { DrawingProfile, Pixel, PixelMap } from "../src/types.js";
import { startWebServer } from "../src/web/server.js";

function makeProfile(overrides: Partial<DrawingProfile> = {}): DrawingProfile {
  return {
    profileName: "timing-test",
    baudRate: 115200,
    canvasWidth: 5,
    canvasHeight: 1,
    resizeMode: "contain",
    cellMoveDuration: 80,
    inputDelay: 100,
    homeDuration: 1800,
    buttonPressDuration: 100,
    colorChangeDuration: 450,
    ackTimeoutMs: 2_000,
    commandRetryCount: 1,
    drawButton: "A",
    colorMode: "mono",
    colorCount: 2,
    monoThreshold: 128,
    palette: ["#000000", "#ffffff"],
    brushSize: 1,
    startCursor: "center",
    startTool: "pen",
    startColorIndex: 0,
    centerToTopLeftDx: 0,
    centerToTopLeftDy: 0,
    ...overrides,
  };
}

function makePixelMap(width: number, height: number, filled: Array<{ x: number; y: number }>): PixelMap {
  const filledKeys = new Set(filled.map((pixel) => `${pixel.x},${pixel.y}`));

  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x): Pixel => {
      const isFilled = filledKeys.has(`${x},${y}`);

      return {
        x,
        y,
        colorIndex: isFilled ? 0 : -1,
        colorHex: isFilled ? "#000000" : "#ffffff",
        alpha: isFilled ? 255 : 0,
      };
    }),
  );
}

async function solidPngDataUrl(width: number, height: number): Promise<string> {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 255 },
    },
  })
    .png()
    .toBuffer();

  return `data:image/png;base64,${buffer.toString("base64")}`;
}

test("scanline and recovery plans preserve profile timing in CFG INPUT", () => {
  const profile = makeProfile({
    inputDelay: 170,
    buttonPressDuration: 65,
    homeDuration: 2400,
  });
  const pixelMap = makePixelMap(5, 1, [{ x: 2, y: 0 }]);
  const scanlinePlan = generateScanlinePlan(pixelMap, profile);
  const commands = serializeCommands(scanlinePlan.commands);
  const recoveryPlan = buildRecoveryExecutionPlan({
    commands,
    resumePlan: scanlinePlan.resumePlan,
    completedCommands: 0,
  });

  assert.equal(commands[0], "CFG INPUT 65 170 2400");
  assert.equal(scanlinePlan.resumePlan.inputConfigCommand, "CFG INPUT 65 170 2400");
  assert.equal(recoveryPlan.commands[0], "CFG INPUT 65 170 2400");
});

test("/api/generate echoes timing overrides into commands and estimated runtime", async (t) => {
  const server = await startWebServer({ port: 0 });
  t.after(async () => {
    await server.close();
  });

  const imageDataUrl = await solidPngDataUrl(4, 4);
  const defaultResponse = await fetch(`${server.url}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      imageDataUrl,
      previewScale: 1,
    }),
  });
  assert.equal(defaultResponse.ok, true);
  const defaultPayload = (await defaultResponse.json()) as {
    commands: string[];
    stats: { estimatedRuntimeMs: number };
  };

  const overrideResponse = await fetch(`${server.url}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      imageDataUrl,
      previewScale: 1,
      inputDelay: 160,
      buttonPressDuration: 60,
    }),
  });
  assert.equal(overrideResponse.ok, true);
  const overridePayload = (await overrideResponse.json()) as {
    commands: string[];
    profile: {
      inputDelay: number;
      buttonPressDuration: number;
      homeDuration: number;
    };
    stats: { estimatedRuntimeMs: number };
  };

  assert.equal(defaultPayload.commands[0], "CFG INPUT 100 100 1800");
  assert.equal(overridePayload.commands[0], "CFG INPUT 60 160 1800");
  assert.equal(overridePayload.profile.inputDelay, 160);
  assert.equal(overridePayload.profile.buttonPressDuration, 60);
  assert.equal(overridePayload.profile.homeDuration, 1800);
  assert.ok(
    overridePayload.stats.estimatedRuntimeMs > defaultPayload.stats.estimatedRuntimeMs,
    "expected slower timing overrides to increase estimated runtime",
  );
});
