import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { calculatePathStats, generateDrawPlan } from "../src/app/generateDrawPlan.js";
import {
  calculatePixelMapNoiseStats,
  cleanupPixelMapNoise,
} from "../src/image/noiseCleanup.js";
import { estimateRuntimeMs, generateScanlinePlan } from "../src/path/scanline.js";
import type { DrawingProfile, Pixel, PixelMap } from "../src/types.js";

const COLORS = {
  red: { colorIndex: 0, colorHex: "#cc0000" },
  blue: { colorIndex: 1, colorHex: "#0000cc" },
  cyan: { colorIndex: 2, colorHex: "#00ffff" },
  black: { colorIndex: 3, colorHex: "#000000" },
};

function makeProfile(overrides: Partial<DrawingProfile> = {}): DrawingProfile {
  return {
    profileName: "noise-cleanup-test",
    baudRate: 115200,
    canvasWidth: 32,
    canvasHeight: 32,
    resizeMode: "contain",
    cellMoveDuration: 80,
    inputDelay: 45,
    homeDuration: 1800,
    buttonPressDuration: 65,
    colorChangeDuration: 450,
    ackTimeoutMs: 2_000,
    commandRetryCount: 1,
    drawButton: "A",
    colorMode: "palette",
    colorCount: 4,
    monoThreshold: 128,
    palette: ["#cc0000", "#0000cc", "#00ffff", "#000000"],
    brushSize: 1,
    startCursor: "center",
    startTool: "pen",
    startColorIndex: 0,
    centerToTopLeftDx: 0,
    centerToTopLeftDy: 0,
    ...overrides,
  };
}

function transparentPixel(x: number, y: number): Pixel {
  return {
    x,
    y,
    colorIndex: -1,
    colorHex: "#ffffff",
    alpha: 0,
  };
}

function colorPixel(
  x: number,
  y: number,
  color: { colorIndex: number; colorHex: string },
): Pixel {
  return {
    x,
    y,
    colorIndex: color.colorIndex,
    colorHex: color.colorHex,
    alpha: 255,
  };
}

function makeFilledPixelMap(
  width: number,
  height: number,
  fill: { colorIndex: number; colorHex: string } | null,
): PixelMap {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (fill ? colorPixel(x, y, fill) : transparentPixel(x, y))),
  );
}

function setColor(
  pixelMap: PixelMap,
  points: Array<{ x: number; y: number }>,
  color: { colorIndex: number; colorHex: string },
): void {
  for (const point of points) {
    const row = pixelMap[point.y];

    if (!row) {
      continue;
    }

    row[point.x] = colorPixel(point.x, point.y, color);
  }
}

function makeNoisyFieldPixelMap(width: number, height: number): PixelMap {
  const pixelMap = makeFilledPixelMap(width, height, COLORS.red);
  const islands: Array<{ x: number; y: number }> = [];

  for (let y = 2; y < height - 2; y += 3) {
    for (let x = 2; x < width - 2; x += 4) {
      islands.push({ x, y });
    }
  }

  setColor(pixelMap, islands, COLORS.blue);
  return pixelMap;
}

test("off mode is a no-op for the logical pixel map", () => {
  const pixelMap = makeFilledPixelMap(3, 3, COLORS.red);
  pixelMap[1]![1] = colorPixel(1, 1, COLORS.blue);

  const result = cleanupPixelMapNoise(pixelMap, { mode: "off" });

  assert.deepEqual(result.pixelMap, pixelMap);
  assert.equal(result.stats.changedCellCount, 0);
  assert.equal(result.stats.thresholdCells, 0);
});

test("tiny island merges into the majority neighboring color", () => {
  const pixelMap = makeFilledPixelMap(3, 3, COLORS.red);
  pixelMap[1]![1] = colorPixel(1, 1, COLORS.blue);

  const result = cleanupPixelMapNoise(pixelMap, { mode: "light" });

  assert.equal(result.pixelMap[1]![1]!.colorIndex, COLORS.red.colorIndex);
  assert.equal(result.stats.changedCellCount, 1);
});

test("multi-color neighbor tie-break is deterministic and uses RGB distance", () => {
  const pixelMap = makeFilledPixelMap(5, 5, null);
  setColor(pixelMap, [
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 },
    { x: 2, y: 1 },
    { x: 1, y: 4 },
    { x: 2, y: 4 },
    { x: 3, y: 4 },
    { x: 2, y: 3 },
  ], COLORS.red);
  setColor(pixelMap, [
    { x: 0, y: 1 },
    { x: 0, y: 2 },
    { x: 0, y: 3 },
    { x: 1, y: 2 },
    { x: 4, y: 1 },
    { x: 4, y: 2 },
    { x: 4, y: 3 },
    { x: 3, y: 2 },
  ], COLORS.cyan);
  pixelMap[2]![2] = colorPixel(2, 2, COLORS.blue);

  const first = cleanupPixelMapNoise(pixelMap, { mode: "light" });
  const second = cleanupPixelMapNoise(pixelMap, { mode: "light" });

  assert.equal(first.pixelMap[2]![2]!.colorIndex, COLORS.cyan.colorIndex);
  assert.equal(first.pixelMap[2]![2]!.colorHex, COLORS.cyan.colorHex);
  assert.deepEqual(first.pixelMap, second.pixelMap);
});

test("transparent cells are preserved and isolated drawable islands stay unchanged", () => {
  const nearTransparent = makeFilledPixelMap(4, 4, null);
  setColor(nearTransparent, [
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 2, y: 2 },
    { x: 3, y: 2 },
  ], COLORS.red);
  nearTransparent[1]![1] = colorPixel(1, 1, COLORS.blue);

  const cleaned = cleanupPixelMapNoise(nearTransparent, { mode: "light" });

  assert.equal(cleaned.pixelMap[1]![1]!.colorIndex, COLORS.red.colorIndex);
  assert.deepEqual(cleaned.pixelMap[0]![0], transparentPixel(0, 0));
  assert.deepEqual(cleaned.pixelMap[3]![0], transparentPixel(0, 3));

  const isolated = makeFilledPixelMap(3, 3, null);
  isolated[1]![1] = colorPixel(1, 1, COLORS.blue);

  const isolatedResult = cleanupPixelMapNoise(isolated, { mode: "strong" });

  assert.deepEqual(isolatedResult.pixelMap, isolated);
  assert.equal(isolatedResult.stats.changedCellCount, 0);
});

test("components at the active threshold are preserved", () => {
  const pixelMap = makeFilledPixelMap(4, 4, COLORS.red);
  setColor(pixelMap, [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 1, y: 2 },
    { x: 2, y: 2 },
  ], COLORS.blue);

  const result = cleanupPixelMapNoise(pixelMap, { mode: "light" });

  assert.equal(result.stats.thresholdCells, 4);
  assert.equal(result.stats.changedCellCount, 0);
  assert.deepEqual(result.pixelMap, pixelMap);
});

test("standard cleanup materially reduces synthetic noise planner metrics", () => {
  const profile = makeProfile({ canvasWidth: 40, canvasHeight: 30 });
  const noisy = makeNoisyFieldPixelMap(40, 30);
  const cleaned = cleanupPixelMapNoise(noisy, { mode: "standard" });
  const beforeStats = calculatePixelMapNoiseStats(noisy, cleaned.stats.thresholdCells);
  const afterStats = calculatePixelMapNoiseStats(cleaned.pixelMap, cleaned.stats.thresholdCells);
  const beforePlan = generateScanlinePlan(noisy, profile);
  const afterPlan = generateScanlinePlan(cleaned.pixelMap, profile);
  const beforePathStats = calculatePathStats(beforePlan.commands);
  const afterPathStats = calculatePathStats(afterPlan.commands);
  const beforeRuntime = estimateRuntimeMs(beforePlan.commands, profile);
  const afterRuntime = estimateRuntimeMs(afterPlan.commands, profile);

  assert.ok(
    afterStats.connectedComponentCount <= beforeStats.connectedComponentCount * 0.5,
    `expected components to drop by at least 50%, before=${beforeStats.connectedComponentCount}, after=${afterStats.connectedComponentCount}`,
  );
  assert.ok(
    afterPathStats.lineRunCount < beforePathStats.lineRunCount,
    `expected line runs to drop, before=${beforePathStats.lineRunCount}, after=${afterPathStats.lineRunCount}`,
  );
  assert.ok(
    afterRuntime < beforeRuntime * 0.8,
    `expected runtime to improve materially, before=${beforeRuntime}, after=${afterRuntime}`,
  );
});

test("explicit off generation matches default generation outputs", async () => {
  const profile = makeProfile({
    canvasWidth: 8,
    canvasHeight: 8,
    colorMode: "mono",
    colorCount: 2,
    palette: ["#000000", "#ffffff"],
  });
  const source = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 255 },
    },
  })
    .png()
    .toBuffer();
  const defaultPlan = await generateDrawPlan(source, profile, 1);
  const offPlan = await generateDrawPlan(source, profile, 1, { noiseCleanupMode: "off" });

  assert.deepEqual(offPlan.pixelMap, defaultPlan.pixelMap);
  assert.deepEqual(offPlan.usedColorIndexes, defaultPlan.usedColorIndexes);
  assert.equal(offPlan.commands.length, defaultPlan.commands.length);
  assert.equal(Buffer.compare(offPlan.previewPng, defaultPlan.previewPng), 0);
  assert.equal(offPlan.noiseCleanupStats.changedCellCount, 0);
});
