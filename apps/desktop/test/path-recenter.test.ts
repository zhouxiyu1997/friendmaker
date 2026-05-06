import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { buildRecoveryExecutionPlan } from "../src/app/recovery.js";
import { generateDrawPlan } from "../src/app/generateDrawPlan.js";
import { estimateRuntimeMs, generateScanlinePlan } from "../src/path/scanline.js";
import { serializeCommands } from "../src/protocol/serializer.js";
import { SimulatedAckSender } from "../src/simulator/sender.js";
import type { DrawingProfile, Pixel, PixelMap } from "../src/types.js";

function makeProfile(overrides: Partial<DrawingProfile> = {}): DrawingProfile {
  return {
    profileName: "path-recenter-test",
    baudRate: 115200,
    canvasWidth: 256,
    canvasHeight: 256,
    resizeMode: "contain",
    cellMoveDuration: 80,
    inputDelay: 100,
    homeDuration: 1800,
    buttonPressDuration: 100,
    colorChangeDuration: 450,
    ackTimeoutMs: 5_000,
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

async function makeSparsePngBuffer(
  width: number,
  height: number,
  filled: Array<{ x: number; y: number }>,
): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 4, 0);

  for (const { x, y } of filled) {
    const offset = (y * width + x) * 4;
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
    data[offset + 3] = 255;
  }

  return sharp(data, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

test("recenter option is default-off and preserves the existing command stream", () => {
  const profile = makeProfile();
  const pixelMap = makePixelMap(256, 256, [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ]);
  const defaultPlan = generateScanlinePlan(pixelMap, profile);
  const explicitOffPlan = generateScanlinePlan(pixelMap, profile, {
    recenterMode: "off",
  });

  assert.deepEqual(serializeCommands(explicitOffPlan.commands), serializeCommands(defaultPlan.commands));
  assert.equal(defaultPlan.recenterStats.shortcutCount, 0);
  assert.equal(serializeCommands(defaultPlan.commands).some((command) => command.startsWith("HOLD ")), false);
});

test("recenter macro replaces a clearly long move and updates stats/runtime", () => {
  const profile = makeProfile();
  const pixelMap = makePixelMap(256, 256, [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ]);
  const offPlan = generateScanlinePlan(pixelMap, profile);
  const recenterPlan = generateScanlinePlan(pixelMap, profile, {
    recenterMode: "left-hold",
    recenterHoldMs: 3_000,
    recenterSafetyMarginSteps: 20,
  });
  const commands = serializeCommands(recenterPlan.commands);

  assert.ok(commands.includes("HOLD DLEFT 3000"));
  assert.ok(commands.includes("X"));
  assert.ok(commands.includes("A"));
  assert.equal(recenterPlan.recenterStats.shortcutCount, 1);
  assert.ok(recenterPlan.recenterStats.moveStepsSaved > 0);
  assert.ok(recenterPlan.recenterStats.estimatedRuntimeSavedMs > 0);
  assert.ok(estimateRuntimeMs(recenterPlan.commands, profile) < estimateRuntimeMs(offPlan.commands, profile));
  assert.equal(
    recenterPlan.resumePlan.segments.every((segment) =>
      recenterPlan.commands[segment.bodyStartCommandIndex]?.type === "draw" ||
      recenterPlan.commands[segment.bodyStartCommandIndex]?.type === "line"
    ),
    true,
  );
});

test("recenter respects the safety margin for short moves", () => {
  const profile = makeProfile({ canvasWidth: 12, canvasHeight: 12 });
  const pixelMap = makePixelMap(12, 12, [
    { x: 5, y: 5 },
    { x: 6, y: 5 },
  ]);
  const plan = generateScanlinePlan(pixelMap, profile, {
    recenterMode: "left-hold",
    recenterHoldMs: 3_000,
    recenterSafetyMarginSteps: 20,
  });

  assert.equal(serializeCommands(plan.commands).some((command) => command.startsWith("HOLD ")), false);
  assert.equal(plan.recenterStats.shortcutCount, 0);
});

test("recenter-aware route scoring can beat legacy post-route substitution order", () => {
  const profile = makeProfile();
  const pixelMap = makePixelMap(256, 256, [
    { x: 220, y: 83 },
    { x: 174, y: 136 },
    { x: 55, y: 26 },
    { x: 18, y: 81 },
    { x: 33, y: 181 },
    { x: 149, y: 97 },
    { x: 67, y: 192 },
    { x: 238, y: 45 },
  ]);
  const recenterOptions = {
    recenterMode: "left-hold" as const,
    recenterHoldMs: 3_000,
    recenterSafetyMarginSteps: 20,
  };
  const legacyPostRoutePlan = generateScanlinePlan(pixelMap, profile, {
    ...recenterOptions,
    recenterAwareRouting: false,
  });
  const awarePlan = generateScanlinePlan(pixelMap, profile, {
    ...recenterOptions,
    recenterAwareRouting: true,
  });
  const legacyCommands = serializeCommands(legacyPostRoutePlan.commands);
  const awareCommands = serializeCommands(awarePlan.commands);

  assert.notDeepEqual(awareCommands, legacyCommands);
  assert.ok(awareCommands.includes("HOLD DLEFT 3000"));
  assert.equal(legacyCommands.some((command) => command.startsWith("HOLD ")), false);
  assert.ok(awarePlan.recenterStats.shortcutCount > legacyPostRoutePlan.recenterStats.shortcutCount);
  assert.ok(
    estimateRuntimeMs(awarePlan.commands, profile) <
      estimateRuntimeMs(legacyPostRoutePlan.commands, profile),
  );
});

test("generateDrawPlan keeps recenter default-off and updates stats when enabled", async () => {
  const profile = makeProfile();
  const sparsePoints = [
    { x: 220, y: 83 },
    { x: 174, y: 136 },
    { x: 55, y: 26 },
    { x: 18, y: 81 },
    { x: 33, y: 181 },
    { x: 149, y: 97 },
    { x: 67, y: 192 },
    { x: 238, y: 45 },
  ];
  const source = await makeSparsePngBuffer(256, 256, sparsePoints);
  const defaultPlan = await generateDrawPlan(source, profile, 1);
  const recenterPlan = await generateDrawPlan(source, profile, 1, {
    enableRecenterShortcut: true,
  });

  assert.equal(defaultPlan.recenterStats.enabled, false);
  assert.equal(defaultPlan.recenterStats.shortcutCount, 0);
  assert.equal(defaultPlan.commands.some((command) => command.startsWith("HOLD ")), false);
  assert.equal(recenterPlan.recenterStats.enabled, true);
  assert.ok(recenterPlan.recenterStats.shortcutCount > 0);
  assert.ok(recenterPlan.commands.some((command) => command.startsWith("HOLD DLEFT ")));
  assert.ok(recenterPlan.estimatedRuntimeMs < defaultPlan.estimatedRuntimeMs);
});

test("serialized recenter commands execute through simulator sender", async () => {
  const profile = makeProfile();
  const pixelMap = makePixelMap(256, 256, [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ]);
  const plan = generateScanlinePlan(pixelMap, profile, {
    recenterMode: "left-hold",
    recenterHoldMs: 3_000,
    recenterSafetyMarginSteps: 20,
  });
  const commands = serializeCommands(plan.commands);
  const sender = new SimulatedAckSender();

  assert.ok(commands.some((command) => command.startsWith("HOLD DLEFT ")));
  await sender.send(commands, {
    ackTimeoutMs: profile.ackTimeoutMs,
    retries: 0,
    ackDelayMs: 0,
  });
});

test("recenter segment recovery resumes at the first draw target without replaying the macro", () => {
  const profile = makeProfile();
  const pixelMap = makePixelMap(256, 256, [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ]);
  const plan = generateScanlinePlan(pixelMap, profile, {
    recenterMode: "left-hold",
    recenterHoldMs: 3_000,
    recenterSafetyMarginSteps: 20,
  });
  const commands = serializeCommands(plan.commands);
  const segment = plan.resumePlan.segments[0];

  assert.ok(segment);
  assert.equal(commands[segment.bodyStartCommandIndex], "P");

  const recoveryPlan = buildRecoveryExecutionPlan({
    commands,
    resumePlan: plan.resumePlan,
    completedCommands: 0,
  });
  const recoveryFirstDrawIndex = recoveryPlan.commands.findIndex(
    (command) => command === "P" || command.startsWith("L "),
  );

  assert.equal(
    recoveryPlan.commands
      .slice(0, recoveryFirstDrawIndex)
      .some((command) => command.startsWith("HOLD ")),
    false,
  );
  assert.equal(recoveryPlan.commands.at(-1), "E");
  assert.equal(recoveryPlan.commands[0], plan.resumePlan.inputConfigCommand);
  assert.equal(recoveryPlan.commands[recoveryFirstDrawIndex], "P");
});
