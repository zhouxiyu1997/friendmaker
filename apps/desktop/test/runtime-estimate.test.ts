import assert from "node:assert/strict";
import test from "node:test";

import {
  colorCommand,
  holdButtonCommand,
  inputConfigCommand,
  moveCommand,
  paletteConfigCommand,
  pressButtonCommand,
} from "../src/protocol/commands.js";
import {
  calculateCommandRuntimeBreakdown,
  estimatePaletteConfigDurationMs,
} from "../src/protocol/runtimeEstimate.js";
import type { DrawingProfile } from "../src/types.js";

function makeProfile(overrides: Partial<DrawingProfile> = {}): DrawingProfile {
  return {
    profileName: "runtime-estimate-test",
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
    colorMode: "palette",
    colorCount: 8,
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

test("runtime breakdown separates canvas movement, menu utility, hold, and color select time", () => {
  const profile = makeProfile();
  const commands = [
    inputConfigCommand(100, 100, 1800),
    moveCommand(3, 2),
    holdButtonCommand("DLEFT", 3000),
    pressButtonCommand("X"),
    pressButtonCommand("A"),
    colorCommand(8),
  ];
  const breakdown = calculateCommandRuntimeBreakdown(commands, profile);

  assert.equal(breakdown.moveStepCount, 5);
  assert.equal(breakdown.holdCount, 1);
  assert.equal(breakdown.colorSelectCount, 1);
  assert.equal(breakdown.canvasMoveMs, 1_000);
  assert.equal(breakdown.holdMs, 3_100);
  assert.equal(breakdown.menuUtilityMs, 400);
  assert.ok(breakdown.colorSelectMs > profile.colorChangeDuration);
  assert.equal(
    breakdown.totalMs,
    breakdown.canvasMoveMs +
      breakdown.holdMs +
      breakdown.menuUtilityMs +
      breakdown.colorSelectMs,
  );
});

test("custom palette config runtime uses calibrated color tuning cost", () => {
  const profile = makeProfile();
  const timing = {
    buttonPressMs: profile.buttonPressDuration,
    inputDelayMs: profile.inputDelay,
    homeMs: profile.homeDuration,
  };
  const white = estimatePaletteConfigDurationMs(8, 255, 255, 255, timing);
  const green = estimatePaletteConfigDurationMs(8, 0, 255, 0, timing);
  const breakdown = calculateCommandRuntimeBreakdown(
    [inputConfigCommand(100, 100, 1800), paletteConfigCommand(8, "#00ff00")],
    profile,
  );

  assert.ok(white > profile.colorChangeDuration * 6);
  assert.ok(green > white, "green should require hue/saturation tuning beyond white");
  assert.equal(breakdown.paletteConfigCount, 1);
  assert.equal(breakdown.paletteConfigMs, green);
});
