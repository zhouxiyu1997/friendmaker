import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import test from "node:test";

import sharp from "sharp";

import { buildRecoveryExecutionPlan } from "../src/app/recovery.js";
import { DEFAULT_ACK_TIMEOUT_MS } from "../src/config/defaultProfile.js";
import { loadProfile } from "../src/config/loadProfile.js";
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
    inputDelay: 45,
    homeDuration: 1800,
    buttonPressDuration: 65,
    colorChangeDuration: 450,
    ackTimeoutMs: 2_000,
    commandRetryCount: 1,
    drawButton: "A",
    colorMode: "mono",
    colorCount: 2,
    monoThreshold: 128,
    palette: ["#000000", "#ffffff"],
    brushSize: 1,
    brushShape: "square",
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
    brushSize: 3,
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
  assert.deepEqual(commands.slice(1, 8), ["BTN X", "BTN X", "M -1 1", "BTN A", "BTN A", "BTN A", "W 3000"]);
  assert.equal(scanlinePlan.resumePlan.inputConfigCommand, "CFG INPUT 65 170 2400");
  assert.equal(recoveryPlan.commands[0], "CFG INPUT 65 170 2400");
  assert.deepEqual(recoveryPlan.commands.slice(1, 8), ["BTN X", "BTN X", "M -1 1", "BTN A", "BTN A", "BTN A", "W 3000"]);
});

test("/api/generate echoes timing overrides into commands and estimated runtime", async (t) => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-timing-generate-"));
  const server = await startWebServer({ port: 0, recoverySessionsRoot });
  t.after(async () => {
    await server.close();
    await rm(recoverySessionsRoot, { recursive: true, force: true });
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
    profile: { ackTimeoutMs: number };
    stats: { estimatedRuntimeMs: number };
  };

  const overrideResponse = await fetch(`${server.url}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      imageDataUrl,
      previewScale: 1,
      inputDelay: 30,
      buttonPressDuration: 40,
    }),
  });
  assert.equal(overrideResponse.ok, true);
  const overridePayload = (await overrideResponse.json()) as {
    commands: string[];
    profile: {
      ackTimeoutMs: number;
      inputDelay: number;
      buttonPressDuration: number;
      homeDuration: number;
    };
    stats: { estimatedRuntimeMs: number };
  };

  assert.equal(defaultPayload.commands[0], "CFG INPUT 65 45 1800");
  assert.equal(defaultPayload.profile.ackTimeoutMs, DEFAULT_ACK_TIMEOUT_MS);
  assert.equal(overridePayload.commands[0], "CFG INPUT 40 30 1800");
  assert.equal(overridePayload.profile.ackTimeoutMs, DEFAULT_ACK_TIMEOUT_MS);
  assert.equal(overridePayload.profile.inputDelay, 30);
  assert.equal(overridePayload.profile.buttonPressDuration, 40);
  assert.equal(overridePayload.profile.homeDuration, 1800);
  assert.ok(
    overridePayload.stats.estimatedRuntimeMs < defaultPayload.stats.estimatedRuntimeMs,
    "expected faster timing overrides to reduce estimated runtime",
  );
});

test("/api/generate rejects unsupported round large-brush requests", async (t) => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-timing-round-"));
  const server = await startWebServer({ port: 0, recoverySessionsRoot });
  t.after(async () => {
    await server.close();
    await rm(recoverySessionsRoot, { recursive: true, force: true });
  });

  const imageDataUrl = await solidPngDataUrl(4, 4);
  const response = await fetch(`${server.url}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      imageDataUrl,
      previewScale: 1,
      brushSize: 3,
      brushShape: "round",
    }),
  });

  assert.equal(response.ok, false);
  assert.equal(response.status, 400);
  const payload = (await response.json()) as { error?: string };
  assert.match(payload.error ?? "", /圆形/u);
  assert.match(payload.error ?? "", /暂不支持/u);
});

test("loadProfile clamps legacy ack timeout values to the supported minimum", async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "friendmaker-profile-"));
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const profilePath = path.join(tempDir, "legacy-profile.json");
  await writeFile(
    profilePath,
    JSON.stringify({
      ...makeProfile(),
      profileName: "legacy-timeout-profile",
      ackTimeoutMs: 2_000,
    }),
    "utf8",
  );

  const profile = await loadProfile(profilePath);

  assert.equal(profile.ackTimeoutMs, DEFAULT_ACK_TIMEOUT_MS);
});
