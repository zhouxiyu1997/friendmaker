import assert from "node:assert/strict";
import test from "node:test";

import { calculatePathStats } from "../src/app/generateDrawPlan.js";
import { estimateRuntimeMs, generateScanlinePlan } from "../src/path/scanline.js";
import type { DrawingProfile, Pixel, PixelMap } from "../src/types.js";

function makeProfile(overrides: Partial<DrawingProfile> = {}): DrawingProfile {
  return {
    profileName: "path-optimization-test",
    baudRate: 115200,
    canvasWidth: 256,
    canvasHeight: 256,
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

function getMoveSteps(plan: ReturnType<typeof generateScanlinePlan>): number {
  return plan.commands
    .filter((command) => command.type === "move")
    .reduce((total, command) => total + Math.abs(command.dx) + Math.abs(command.dy), 0);
}

test("scanline reduces travel for sparse single-pixel islands with brush size 1", () => {
  const filled: Array<{ x: number; y: number }> = [];

  for (let y = 10; y <= 130; y += 24) {
    for (let x = 12; x <= 220; x += 35) {
      filled.push({ x, y });
    }
  }

  const profile = makeProfile();
  const pixelMap = makePixelMap(256, 256, filled);
  const plan = generateScanlinePlan(pixelMap, profile, "scanline");
  const pathStats = calculatePathStats(plan.commands);

  assert.ok(getMoveSteps(plan) < 1_500, "expected sparse islands to avoid large scanline detours");
  assert.ok(pathStats.maxMoveSteps < 200, "expected the longest empty hop to shrink materially");
  assert.ok(
    estimateRuntimeMs(plan.commands, profile) < 150_000,
    "expected sparse islands runtime to stay well below the legacy row-scan path",
  );
});

test("scanline keeps brush size 1 clustered blocks compact while shortening inter-block travel", () => {
  const filled: Array<{ x: number; y: number }> = [];
  const blocks = [
    { ox: 20, oy: 20 },
    { ox: 150, oy: 28 },
    { ox: 60, oy: 120 },
    { ox: 190, oy: 170 },
  ];

  for (const { ox, oy } of blocks) {
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 12; x += 1) {
        filled.push({ x: ox + x, y: oy + y });
      }
    }
  }

  const profile = makeProfile();
  const pixelMap = makePixelMap(256, 256, filled);
  const plan = generateScanlinePlan(pixelMap, profile, "scanline");
  const pathStats = calculatePathStats(plan.commands);

  assert.ok(getMoveSteps(plan) < 600, "expected inter-block empty travel to be reduced");
  assert.ok(pathStats.lineRunCount <= 40, "expected clustered regions to stay compressed into line runs");
  assert.ok(plan.commands.length <= 80, "expected the optimized path to avoid exploding command count");
});

test("scanline avoids row-by-row waste on dashed long rows with brush size 1", () => {
  const filled: Array<{ x: number; y: number }> = [];

  for (let row = 0; row < 6; row += 1) {
    const y = 80 + row;

    for (let x = 8; x < 248; x += 3) {
      filled.push({ x, y });
    }
  }

  const profile = makeProfile();
  const pixelMap = makePixelMap(256, 256, filled);
  const plan = generateScanlinePlan(pixelMap, profile, "scanline");

  assert.ok(getMoveSteps(plan) < 900, "expected dashed rows to avoid huge return jumps");
  assert.ok(plan.commands.length < 400, "expected dashed rows to stay far below the legacy command count");
  assert.ok(
    estimateRuntimeMs(plan.commands, profile) < 150_000,
    "expected dashed rows runtime to remain much lower than a naive row scan",
  );
});
