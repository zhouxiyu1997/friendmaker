import assert from "node:assert/strict";
import { test } from "node:test";

import sharp from "sharp";

import { generateDrawPlan } from "../src/app/generateDrawPlan.js";
import {
  DEFAULT_PALETTE_VALUE_CALIBRATION,
  estimatePaletteValueMovement,
  formatPaletteValueCalibrationConfig,
  normalizePaletteValueCalibration,
  parsePaletteValueCalibrationConfig,
} from "../src/protocol/paletteValueCalibration.js";
import type { DrawingProfile } from "../src/types.js";

function makeProfile(overrides: Partial<DrawingProfile> = {}): DrawingProfile {
  return {
    profileName: "palette-value-test",
    baudRate: 115200,
    canvasWidth: 8,
    canvasHeight: 8,
    resizeMode: "contain",
    cellMoveDuration: 80,
    inputDelay: 100,
    homeDuration: 1800,
    buttonPressDuration: 100,
    colorChangeDuration: 450,
    ackTimeoutMs: 20_000,
    commandRetryCount: 1,
    drawButton: "A",
    colorMode: "palette",
    colorCount: 8,
    monoThreshold: 128,
    palette: ["#000000", "#ffffff", "#202020", "#4e3239"],
    brushSize: 1,
    brushShape: "square",
    startCursor: "top-left",
    startTool: "pen",
    startColorIndex: 0,
    centerToTopLeftDx: 0,
    centerToTopLeftDy: 0,
    ...overrides,
  };
}

async function solidPng(colorHex: string): Promise<Buffer> {
  return sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: {
        r: Number.parseInt(colorHex.slice(1, 3), 16),
        g: Number.parseInt(colorHex.slice(3, 5), 16),
        b: Number.parseInt(colorHex.slice(5, 7), 16),
        alpha: 255,
      },
    },
  })
    .png()
    .toBuffer();
}

test("palette value calibration normalizes monotonic samples and rejects malformed curves", () => {
  const calibration = normalizePaletteValueCalibration({
    samples: [
      { holdMs: 80, actualValueSteps: 4 },
      { holdMs: 120, actualValueSteps: 7 },
      { holdMs: 180, actualValueSteps: 12 },
    ],
  });

  assert.deepEqual(calibration?.samples, [
    { holdMs: 80, actualValueSteps: 4 },
    { holdMs: 120, actualValueSteps: 7 },
    { holdMs: 180, actualValueSteps: 12 },
  ]);
  assert.equal(
    normalizePaletteValueCalibration({
      samples: [
        { holdMs: 120, actualValueSteps: 7 },
        { holdMs: 80, actualValueSteps: 8 },
      ],
    }),
    null,
  );
  assert.equal(
    normalizePaletteValueCalibration({
      samples: [
        { holdMs: 80, actualValueSteps: 7 },
        { holdMs: 120, actualValueSteps: 6 },
      ],
    }),
    null,
  );
});

test("palette value movement uses the calibrated curve without exceeding the target", () => {
  const calibration = normalizePaletteValueCalibration({
    samples: [
      { holdMs: 560, actualValueSteps: 45 },
      { holdMs: 800, actualValueSteps: 72 },
      { holdMs: 1100, actualValueSteps: 100 },
    ],
  });

  assert.ok(calibration);

  const movement = estimatePaletteValueMovement(78, calibration);
  assert.equal(movement.holdMs, 864);
  assert.equal(movement.estimatedHoldSteps, 77);
  assert.equal(movement.remainingTapSteps, 1);

  const beyondCurve = estimatePaletteValueMovement(112, calibration);
  assert.equal(beyondCurve.holdMs, 1100);
  assert.equal(beyondCurve.estimatedHoldSteps, 100);
  assert.equal(beyondCurve.remainingTapSteps, 12);
});

test("palette value calibration command round-trips compact samples", () => {
  const command = formatPaletteValueCalibrationConfig(DEFAULT_PALETTE_VALUE_CALIBRATION);

  assert.match(command, /^CFG PALVALUE 80:\d+,120:\d+/u);
  assert.deepEqual(
    parsePaletteValueCalibrationConfig(command),
    DEFAULT_PALETTE_VALUE_CALIBRATION,
  );
  assert.equal(parsePaletteValueCalibrationConfig("CFG PALVALUE 120:8,80:4"), null);
});

test("palette draw generation can prepend palette value calibration before custom colors", async () => {
  const calibration = normalizePaletteValueCalibration({
    samples: [
      { holdMs: 80, actualValueSteps: 6 },
      { holdMs: 120, actualValueSteps: 12 },
      { holdMs: 180, actualValueSteps: 22 },
    ],
  });

  assert.ok(calibration);

  const plan = await generateDrawPlan(await solidPng("#202020"), makeProfile(), 1, {
    paletteValueCalibration: calibration,
  });

  assert.equal(plan.paletteHexes[0], "#202020");
  assert.equal(plan.commands[1], formatPaletteValueCalibrationConfig(calibration));
  assert.equal(plan.commands.some((command) => command === "PC 0 #202020"), true);
});
