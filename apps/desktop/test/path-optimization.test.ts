import assert from "node:assert/strict";
import test from "node:test";

import { calculatePathStats } from "../src/app/generateDrawPlan.js";
import { estimateRuntimeMs, generateScanlinePlan } from "../src/path/scanline.js";
import type { DrawCommand } from "../src/protocol/commands.js";
import { serializeCommands } from "../src/protocol/serializer.js";
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

function makeColorPixelMap(
  width: number,
  height: number,
  filled: Array<{ x: number; y: number; colorIndex: number; colorHex: string }>,
): PixelMap {
  const filledByKey = new Map(filled.map((pixel) => [`${pixel.x},${pixel.y}`, pixel]));

  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x): Pixel => {
      const filledPixel = filledByKey.get(`${x},${y}`);

      return {
        x,
        y,
        colorIndex: filledPixel?.colorIndex ?? -1,
        colorHex: filledPixel?.colorHex ?? "#ffffff",
        alpha: filledPixel ? 255 : 0,
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

test("square large brushes emit stride-aware line runs for contiguous rows", () => {
  const profile = makeProfile({
    canvasWidth: 9,
    canvasHeight: 3,
    brushSize: 3,
    brushShape: "square",
  });
  const pixelMap = makePixelMap(3, 1, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
  ]);

  const plan = generateScanlinePlan(pixelMap, profile, "scanline");
  const serialized = serializeCommands(plan.commands);
  const strideLine = plan.commands.find((command) => command.type === "line");
  const equivalentDiscreteSequence: DrawCommand[] = [
    { type: "draw", button: "A" },
    { type: "move", dx: 3, dy: 0 },
    { type: "draw", button: "A" },
    { type: "move", dx: 3, dy: 0 },
    { type: "draw", button: "A" },
  ];

  assert.ok(serialized.includes("L 6 0 3"));
  assert.ok(strideLine && strideLine.type === "line");
  assert.equal(estimateRuntimeMs([strideLine], profile), estimateRuntimeMs(equivalentDiscreteSequence, profile));
});

test("time-saving recenter strategy inserts recenter macro before costly hops", () => {
  const profile = makeProfile({
    canvasWidth: 256,
    canvasHeight: 1,
    inputDelay: 45,
    buttonPressDuration: 65,
  });
  const pixelMap = makePixelMap(256, 1, [
    { x: 255, y: 0 },
    { x: 0, y: 0 },
  ]);

  const offPlan = generateScanlinePlan(pixelMap, profile, "scanline", "off");
  const recenterPlan = generateScanlinePlan(pixelMap, profile, "scanline", "time-saving");
  const serialized = serializeCommands(recenterPlan.commands);
  const macroStart = serialized.indexOf("STICK -1 0 2000");

  assert.ok(macroStart >= 0, "expected recenter macro to be inserted");
  assert.deepEqual(serialized.slice(macroStart, macroStart + 9), [
    "STICK -1 0 2000",
    "W 1000",
    "STICK 0 -1 2000",
    "W 1000",
    "BTN X",
    "W 500",
    "BTN X",
    "W 500",
    "BTN A",
  ]);
  assert.ok(serialized.includes("M -128 0"), "expected movement from center after recenter");
  assert.equal(recenterPlan.recenterStats.recenterCount, 1);
  assert.equal(recenterPlan.recenterStats.recenterCandidates, 1);
  assert.ok(recenterPlan.recenterStats.recenterSavedMs > 0);
  assert.ok(estimateRuntimeMs(recenterPlan.commands, profile) < estimateRuntimeMs(offPlan.commands, profile));
});

test("time-saving recenter macro never emits left-stick click commands", () => {
  const profile = makeProfile({
    canvasWidth: 256,
    canvasHeight: 1,
    inputDelay: 45,
    buttonPressDuration: 65,
  });
  const pixelMap = makePixelMap(256, 1, [
    { x: 255, y: 0 },
    { x: 0, y: 0 },
  ]);

  const recenterPlan = generateScanlinePlan(pixelMap, profile, "scanline", "time-saving");
  const serialized = serializeCommands(recenterPlan.commands);

  assert.equal(serialized.includes("BTN LS"), false);
  assert.equal(serialized.includes("BTN L3"), false);
});

test("time-saving recenter waits until after the first post-color-select move", () => {
  const profile = makeProfile({
    canvasWidth: 512,
    canvasHeight: 1,
    colorMode: "palette",
    colorCount: 2,
    palette: ["#000000", "#ffffff"],
    inputDelay: 45,
    buttonPressDuration: 65,
  });
  const pixelMap = makeColorPixelMap(512, 1, [
    { x: 256, y: 0, colorIndex: 0, colorHex: "#000000" },
    { x: 0, y: 0, colorIndex: 1, colorHex: "#ffffff" },
    { x: 511, y: 0, colorIndex: 1, colorHex: "#ffffff" },
  ]);

  const plan = generateScanlinePlan(pixelMap, profile, "scanline", "time-saving");
  const serialized = serializeCommands(plan.commands);
  const colorSelectIndex = serialized.indexOf("C 1");
  const firstRecenterAfterColorSelect = serialized.indexOf("STICK -1 0 2000", colorSelectIndex);

  assert.ok(colorSelectIndex >= 0, "expected second palette slot selection");
  assert.equal(serialized[colorSelectIndex + 1], "W 500");
  assert.notEqual(serialized[colorSelectIndex + 2], "STICK -1 0 2000");
  assert.match(serialized[colorSelectIndex + 2] ?? "", /^M /u);
  assert.ok(
    firstRecenterAfterColorSelect > colorSelectIndex + 3,
    "expected recenter to remain available after the first post-color-select paint",
  );
  assert.equal(plan.recenterStats.recenterCount, 1);
});

test("official color recenter waits until after returning to the canvas", () => {
  const profile = makeProfile({
    canvasWidth: 256,
    canvasHeight: 1,
    colorMode: "official",
    colorCount: 2,
    inputDelay: 45,
    buttonPressDuration: 65,
  });
  const pixelMap = makeColorPixelMap(256, 1, [
    { x: 128, y: 0, colorIndex: 0, colorHex: "#000000" },
    { x: 0, y: 0, colorIndex: 10, colorHex: "#ffffff" },
  ]);

  const plan = generateScanlinePlan(pixelMap, profile, "scanline", "time-saving");
  const serialized = serializeCommands(plan.commands);
  const colorSelectIndex = serialized.indexOf("C 1");

  assert.ok(colorSelectIndex >= 0, "expected second official slot selection");
  assert.ok(serialized.some((command) => /^BC 1 /u.test(command)));
  assert.equal(serialized[colorSelectIndex + 1], "W 500");
  assert.notEqual(serialized[colorSelectIndex + 2], "STICK -1 0 2000");
  assert.match(serialized[colorSelectIndex + 2] ?? "", /^M /u);
});

test("time-saving recenter strategy skips nearby hops", () => {
  const profile = makeProfile({
    canvasWidth: 256,
    canvasHeight: 1,
    inputDelay: 45,
    buttonPressDuration: 65,
  });
  const pixelMap = makePixelMap(256, 1, [
    { x: 160, y: 0 },
    { x: 170, y: 0 },
  ]);

  const recenterPlan = generateScanlinePlan(pixelMap, profile, "scanline", "time-saving");
  const serialized = serializeCommands(recenterPlan.commands);

  assert.equal(serialized.some((command) => command.startsWith("STICK ")), false);
  assert.equal(recenterPlan.recenterStats.recenterCount, 0);
  assert.equal(recenterPlan.recenterStats.recenterCandidates, 0);
});

test("recenter thresholds follow the active input timing", () => {
  const fastProfile = makeProfile({
    inputDelay: 45,
    buttonPressDuration: 65,
  });
  const slowProfile = makeProfile({
    inputDelay: 100,
    buttonPressDuration: 100,
  });
  const pixelMap = makePixelMap(256, 1, [{ x: 128, y: 0 }]);

  const fastPlan = generateScanlinePlan(pixelMap, fastProfile, "scanline", "time-saving");
  const slowPlan = generateScanlinePlan(pixelMap, slowProfile, "scanline", "time-saving");

  assert.equal(fastPlan.recenterStats.recenterThresholdSteps, 67);
  assert.equal(slowPlan.recenterStats.recenterThresholdSteps, 39);
  assert.equal(fastPlan.recenterStats.recenterMacroMs, 7330);
  assert.equal(slowPlan.recenterStats.recenterMacroMs, 7600);
});

test("recenter strategy stays disabled by default", () => {
  const profile = makeProfile({ canvasWidth: 256, canvasHeight: 1 });
  const pixelMap = makePixelMap(256, 1, [
    { x: 255, y: 0 },
    { x: 0, y: 0 },
  ]);

  const defaultPlan = generateScanlinePlan(pixelMap, profile, "scanline");
  const offPlan = generateScanlinePlan(pixelMap, profile, "scanline", "off");

  assert.deepEqual(serializeCommands(defaultPlan.commands), serializeCommands(offPlan.commands));
  assert.equal(defaultPlan.recenterStats.recenterCount, 0);
});
