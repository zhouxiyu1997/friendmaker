import assert from "node:assert/strict";
import test from "node:test";

import { estimateRuntimeMs, generateScanlinePlan } from "../src/path/scanline.js";
import { toolFastCommand } from "../src/protocol/commands.js";
import { calculateCommandRuntimeBreakdown } from "../src/protocol/runtimeEstimate.js";
import { serializeCommand, serializeCommands } from "../src/protocol/serializer.js";
import { formatSequencedCommand } from "../src/protocol/sequencing.js";
import { SimulatedDevice } from "../src/simulator/device.js";
import type { DrawingProfile, Pixel, PixelMap } from "../src/types.js";

function makeProfile(overrides: Partial<DrawingProfile> = {}): DrawingProfile {
  return {
    profileName: "fill-optimization-test",
    baudRate: 115200,
    canvasWidth: 80,
    canvasHeight: 80,
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

function makeFilledRectPixels(input: {
  x: number;
  y: number;
  width: number;
  height: number;
  colorIndex?: number;
  colorHex?: string;
}): Array<{ x: number; y: number; colorIndex: number; colorHex: string }> {
  const pixels: Array<{ x: number; y: number; colorIndex: number; colorHex: string }> = [];
  const colorIndex = input.colorIndex ?? 0;
  const colorHex = input.colorHex ?? "#000000";

  for (let y = input.y; y < input.y + input.height; y += 1) {
    for (let x = input.x; x < input.x + input.width; x += 1) {
      pixels.push({ x, y, colorIndex, colorHex });
    }
  }

  return pixels;
}

test("tool-fast commands serialize, estimate, and simulate as stateful tool changes", async () => {
  const profile = makeProfile();
  const commands = [toolFastCommand("fill"), toolFastCommand("fill"), toolFastCommand("brush")];
  const serialized = commands.map(serializeCommand);
  const breakdown = calculateCommandRuntimeBreakdown(commands, profile);
  const device = new SimulatedDevice();
  const sessionId = "abcdef12";

  assert.deepEqual(serialized, ["TF FILL", "TF FILL", "TF BRUSH"]);
  assert.equal(breakdown.toolSelectCount, 3);
  assert.ok(breakdown.toolSelectMs > 0);
  assert.equal(breakdown.toolSelectMs, breakdown.totalMs);

  const fillResponse = await device.executeCommand(formatSequencedCommand(sessionId, 1, "TF FILL"), {
    commandIndex: 1,
    ackDelayMs: 0,
  });
  const infoResponse = await device.executeCommand(formatSequencedCommand(sessionId, 2, "I"), {
    commandIndex: 2,
    ackDelayMs: 0,
  });
  const invalidResponse = await device.executeCommand(formatSequencedCommand(sessionId, 3, "TF SPRAY"), {
    commandIndex: 3,
    ackDelayMs: 0,
  });

  assert.equal(fillResponse.ack, `OK ${sessionId} 1`);
  assert.match(infoResponse.lines.join("\n"), /tool=fill/u);
  assert.equal(invalidResponse.ack, `ERR ${sessionId} 3 invalid fast tool`);
});

test("fill optimization is gated off by default and emits tool swaps only for high-return enclosed regions", () => {
  const profile = makeProfile();
  const pixelMap = makePixelMap(
    80,
    80,
    makeFilledRectPixels({ x: 20, y: 20, width: 40, height: 40 }),
  );
  const defaultPlan = generateScanlinePlan(pixelMap, profile);
  const fillPlan = generateScanlinePlan(pixelMap, profile, {
    optimizeFillRegions: true,
    fillMinReturnRatio: 4,
  });
  const defaultCommands = serializeCommands(defaultPlan.commands);
  const fillCommands = serializeCommands(fillPlan.commands);

  assert.equal(defaultPlan.fillStats.enabled, false);
  assert.equal(defaultCommands.some((command) => command.startsWith("TF ")), false);
  assert.equal(fillPlan.fillStats.enabled, true);
  assert.equal(fillPlan.fillStats.appliedRegionCount, 1);
  assert.equal(fillPlan.fillStats.candidateRegionCount, 1);
  assert.ok(fillPlan.fillStats.filledPixelCount > fillPlan.fillStats.outlinePixelCount);
  assert.ok(fillPlan.fillStats.maxReturnRatio >= 4);
  assert.ok(fillCommands.includes("TF FILL"));
  assert.ok(fillCommands.includes("TF BRUSH"));
  assert.ok(
    estimateRuntimeMs(fillPlan.commands, profile) < estimateRuntimeMs(defaultPlan.commands, profile),
    "expected fill outline plus seed presses to beat pixel-by-pixel drawing",
  );
});

test("fill optimization rejects small or edge-touching regions", () => {
  const profile = makeProfile();
  const smallMap = makePixelMap(
    80,
    80,
    makeFilledRectPixels({ x: 20, y: 20, width: 6, height: 6 }),
  );
  const edgeMap = makePixelMap(
    80,
    80,
    makeFilledRectPixels({ x: 0, y: 20, width: 40, height: 40 }),
  );
  const smallPlan = generateScanlinePlan(smallMap, profile, { optimizeFillRegions: true });
  const edgePlan = generateScanlinePlan(edgeMap, profile, { optimizeFillRegions: true });

  assert.equal(smallPlan.fillStats.appliedRegionCount, 0);
  assert.equal(edgePlan.fillStats.appliedRegionCount, 0);
  assert.equal(serializeCommands(smallPlan.commands).some((command) => command.startsWith("TF ")), false);
  assert.equal(serializeCommands(edgePlan.commands).some((command) => command.startsWith("TF ")), false);
});

test("fill optimization pulls high-return colors into the first 9-slot palette batch", () => {
  const profile = makeProfile({
    colorMode: "palette",
    colorCount: 10,
    palette: Array.from({ length: 10 }, (_, index) => `#${index.toString(16).repeat(6)}`),
  });
  const sparsePixels = Array.from({ length: 9 }, (_, colorIndex) => ({
    x: 2 + colorIndex,
    y: 2,
    colorIndex,
    colorHex: profile.palette[colorIndex]!,
  }));
  const fillColorHex = profile.palette[9]!;
  const pixelMap = makePixelMap(80, 80, [
    ...sparsePixels,
    ...makeFilledRectPixels({
      x: 20,
      y: 20,
      width: 40,
      height: 40,
      colorIndex: 9,
      colorHex: fillColorHex,
    }),
  ]);
  const defaultPlan = generateScanlinePlan(pixelMap, profile, { optimizeColorBatches: true });
  const fillPlan = generateScanlinePlan(pixelMap, profile, {
    optimizeColorBatches: true,
    optimizeFillRegions: true,
  });
  const defaultFirstBatchConfigs = serializeCommands(defaultPlan.commands)
    .filter((command) => command.startsWith("PC "))
    .slice(0, 9);
  const fillFirstBatchConfigs = serializeCommands(fillPlan.commands)
    .filter((command) => command.startsWith("PC "))
    .slice(0, 9);

  assert.equal(defaultFirstBatchConfigs.some((command) => command.endsWith(fillColorHex)), false);
  assert.ok(fillFirstBatchConfigs.some((command) => command.endsWith(fillColorHex)));
  assert.equal(fillPlan.fillStats.appliedRegionCount, 1);
});
