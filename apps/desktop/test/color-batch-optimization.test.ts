import assert from "node:assert/strict";
import test from "node:test";

import { estimateRuntimeMs, generateScanlinePlan } from "../src/path/scanline.js";
import { serializeCommands } from "../src/protocol/serializer.js";
import type { DrawingProfile, Pixel, PixelMap } from "../src/types.js";

function makeProfile(overrides: Partial<DrawingProfile> = {}): DrawingProfile {
  return {
    profileName: "color-batch-optimization-test",
    baudRate: 115200,
    canvasWidth: 100,
    canvasHeight: 20,
    resizeMode: "contain",
    cellMoveDuration: 80,
    inputDelay: 45,
    homeDuration: 1800,
    buttonPressDuration: 65,
    colorChangeDuration: 450,
    ackTimeoutMs: 2_000,
    commandRetryCount: 1,
    drawButton: "A",
    colorMode: "official",
    colorCount: 12,
    monoThreshold: 128,
    palette: Array.from({ length: 84 }, (_, index) => `#${(index + 1).toString(16).padStart(6, "0")}`),
    brushSize: 1,
    startCursor: "center",
    startTool: "pen",
    startColorIndex: 0,
    centerToTopLeftDx: 0,
    centerToTopLeftDy: 0,
    ...overrides,
  };
}

function makePixelMap(
  width: number,
  height: number,
  pixels: Array<{ x: number; y: number; colorIndex: number; colorHex: string }>,
): PixelMap {
  const pixelByKey = new Map(pixels.map((pixel) => [`${pixel.x},${pixel.y}`, pixel]));

  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x): Pixel => {
      const pixel = pixelByKey.get(`${x},${y}`);

      return {
        x,
        y,
        colorIndex: pixel?.colorIndex ?? -1,
        colorHex: pixel?.colorHex ?? "#ffffff",
        alpha: pixel ? 255 : 0,
      };
    }),
  );
}

function getMoveSteps(plan: ReturnType<typeof generateScanlinePlan>): number {
  return plan.commands
    .filter((command) => command.type === "move")
    .reduce((total, command) => total + Math.abs(command.dx) + Math.abs(command.dy), 0);
}

test("color batch optimization groups spatially close colors instead of color-index order", () => {
  const profile = makeProfile();
  const colors = Array.from({ length: 12 }, (_, colorIndex) => {
    const leftCluster = colorIndex % 2 === 0;
    return {
      x: leftCluster ? 5 : 95,
      y: 4 + Math.floor(colorIndex / 2),
      colorIndex,
      colorHex: `#${(colorIndex + 1).toString(16).padStart(6, "0")}`,
    };
  });
  const pixelMap = makePixelMap(100, 20, colors);
  const defaultPlan = generateScanlinePlan(pixelMap, profile);
  const optimizedPlan = generateScanlinePlan(pixelMap, profile, {
    optimizeColorBatches: true,
  });

  assert.ok(
    getMoveSteps(optimizedPlan) < getMoveSteps(defaultPlan),
    "expected travel-aware color ordering to reduce canvas movement",
  );
  assert.ok(
    estimateRuntimeMs(optimizedPlan.commands, profile) < estimateRuntimeMs(defaultPlan.commands, profile),
    "expected optimized color ordering to reduce estimated runtime",
  );
});

test("color batch optimization uses bottom slots first and keeps recovery prefixes aligned", () => {
  const profile = makeProfile({
    canvasWidth: 9,
    canvasHeight: 1,
    colorMode: "palette",
    colorCount: 3,
    palette: ["#110000", "#001100", "#000011"],
  });
  const pixelMap = makePixelMap(9, 1, [
    { x: 1, y: 0, colorIndex: 0, colorHex: "#110000" },
    { x: 4, y: 0, colorIndex: 1, colorHex: "#001100" },
    { x: 7, y: 0, colorIndex: 2, colorHex: "#000011" },
  ]);
  const defaultCommands = serializeCommands(generateScanlinePlan(pixelMap, profile).commands);
  const explicitOffCommands = serializeCommands(
    generateScanlinePlan(pixelMap, profile, {
      optimizeColorBatches: false,
    }).commands,
  );
  const optimizedPlan = generateScanlinePlan(pixelMap, profile, {
    optimizeColorBatches: true,
  });
  const optimizedCommands = serializeCommands(optimizedPlan.commands);
  const secondSegment = optimizedPlan.resumePlan.segments[1];

  assert.deepEqual(explicitOffCommands, defaultCommands);
  assert.ok(defaultCommands.some((command) => /^PC 0 /u.test(command)));
  assert.equal(defaultCommands.some((command) => /^PC 8 /u.test(command)), false);
  assert.ok(optimizedCommands.some((command) => /^PC 8 /u.test(command)));
  assert.ok(optimizedCommands.includes("C 8"));
  assert.ok(optimizedCommands.includes("CF 7"));
  assert.ok(optimizedCommands.includes("CF 6"));
  assert.equal(optimizedCommands.some((command) => /^PC 0 /u.test(command)), false);

  assert.equal(optimizedPlan.resumePlan.segments[0]?.slotIndex, 8);
  assert.equal(secondSegment?.slotIndex, 7);
  assert.match(secondSegment?.resumePrefixCommands[0] ?? "", /^PC 7 /u);
  assert.equal(secondSegment?.resumePrefixCommands.some((command) => /^PC 8 /u.test(command)), false);
  assert.equal(secondSegment?.resumePrefixCommands.some((command) => /^CF /u.test(command)), false);
  assert.equal(secondSegment?.resumePrefixCommands.at(-1), "C 7");
});

test("color batch optimization interleaves nearby components across colors", () => {
  const profile = makeProfile({
    canvasWidth: 100,
    canvasHeight: 1,
    colorMode: "palette",
    colorCount: 2,
    palette: ["#110000", "#001100"],
  });
  const pixelMap = makePixelMap(100, 1, [
    { x: 1, y: 0, colorIndex: 0, colorHex: "#110000" },
    { x: 98, y: 0, colorIndex: 0, colorHex: "#110000" },
    { x: 2, y: 0, colorIndex: 1, colorHex: "#001100" },
    { x: 99, y: 0, colorIndex: 1, colorHex: "#001100" },
  ]);
  const defaultPlan = generateScanlinePlan(pixelMap, profile);
  const optimizedPlan = generateScanlinePlan(pixelMap, profile, {
    optimizeColorBatches: true,
  });
  const optimizedCommands = serializeCommands(optimizedPlan.commands);
  const segmentSlots = optimizedPlan.resumePlan.segments.map((segment) => segment.slotIndex);

  assert.ok(
    getMoveSteps(optimizedPlan) < getMoveSteps(defaultPlan),
    "expected component interleaving to reduce repeated cross-canvas travel",
  );
  assert.deepEqual(segmentSlots, [8, 7, 7, 8]);
  assert.ok(optimizedCommands.includes("CF 7"));
  assert.ok(optimizedCommands.includes("CF 8"));
  assert.ok(optimizedCommands.indexOf("CF 8") > optimizedCommands.indexOf("CF 7"));
  assert.match(optimizedPlan.resumePlan.segments[1]?.resumePrefixCommands[0] ?? "", /^PC 8 /u);
  assert.equal(optimizedPlan.resumePlan.segments[1]?.resumePrefixCommands.at(-1), "C 7");
  assert.equal(optimizedPlan.resumePlan.segments[1]?.resumePrefixCommands.some((command) => /^CF /u.test(command)), false);
});

test("color batch optimization spatially interleaves large component batches", () => {
  const profile = makeProfile({
    canvasWidth: 2200,
    canvasHeight: 1,
    colorMode: "palette",
    colorCount: 2,
    palette: ["#110000", "#001100"],
  });
  const pixels = Array.from({ length: 100 }, (_, index) => {
    const x = 10 + index * 20;
    return [
      { x, y: 0, colorIndex: 0, colorHex: "#110000" },
      { x: x + 1, y: 0, colorIndex: 1, colorHex: "#001100" },
    ];
  }).flat();
  const pixelMap = makePixelMap(2200, 1, pixels);
  const defaultPlan = generateScanlinePlan(pixelMap, profile);
  const optimizedPlan = generateScanlinePlan(pixelMap, profile, {
    optimizeColorBatches: true,
  });
  const optimizedCommands = serializeCommands(optimizedPlan.commands);

  assert.equal(defaultPlan.resumePlan.segments.length, 2);
  assert.equal(optimizedPlan.resumePlan.segments.length, 200);
  assert.ok(
    getMoveSteps(optimizedPlan) < getMoveSteps(defaultPlan),
    "expected spatial component interleaving to reduce canvas movement",
  );
  assert.ok(
    estimateRuntimeMs(optimizedPlan.commands, profile) < estimateRuntimeMs(defaultPlan.commands, profile),
    "expected spatial component interleaving to reduce estimated runtime after color-switch cost",
  );
  assert.ok(optimizedCommands.some((command) => /^CF /u.test(command)));
});
