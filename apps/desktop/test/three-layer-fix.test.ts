import assert from "node:assert/strict";
import { test } from "node:test";

import sharp from "sharp";

import { calculateCanvasBounds } from "../src/app/generateDrawPlan.js";
import { createBrushGrid, gridCellBounds, gridCellToCanvasCenter } from "../src/brushGrid.js";
import { pixelizeImage } from "../src/image/pixelize.js";
import { renderPreviewToBuffer } from "../src/image/renderPreview.js";
import { generateScanlineCommands } from "../src/path/scanline.js";
import { serializeCommands } from "../src/protocol/serializer.js";
import { getAckTimeoutForCommand } from "../src/serial/sender.js";
import { SimulatedAckSender } from "../src/simulator/sender.js";
import type { BrushSize, DrawingProfile, Pixel, PixelMap } from "../src/types.js";

function makeProfile(overrides: Partial<DrawingProfile> = {}): DrawingProfile {
  return {
    profileName: "test",
    baudRate: 115200,
    canvasWidth: 256,
    canvasHeight: 256,
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

async function alphaBoundsFromPreview(previewPng: Buffer) {
  const { data, info } = await sharp(previewPng).raw().toBuffer({ resolveWithObject: true });
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3] ?? 0;

      if (alpha <= 0) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    maxX,
    maxY,
  };
}

async function transparentPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
}

test("BrushGrid keeps pixelize, preview, bounds, and centers aligned", async () => {
  const brushSizes: BrushSize[] = [1, 3, 7, 13, 19, 27];
  const blankImage = await transparentPng(256, 256);

  for (const brushSize of brushSizes) {
    const profile = makeProfile({ brushSize });
    const grid = createBrushGrid(profile);
    const expectedCellBounds = gridCellBounds(grid, { x: 0, y: 0 });
    const pixelMap = makePixelMap(grid.gridWidth, grid.gridHeight, [{ x: 0, y: 0 }]);
    const previewBounds = await alphaBoundsFromPreview(await renderPreviewToBuffer(pixelMap, profile, 1));
    const pixelized = await pixelizeImage(blankImage, profile);

    assert.equal(grid.gridWidth, Math.floor(profile.canvasWidth / brushSize));
    assert.equal(grid.gridHeight, Math.floor(profile.canvasHeight / brushSize));
    assert.equal(grid.originX, Math.floor((profile.canvasWidth - grid.gridWidth * brushSize) / 2));
    assert.equal(grid.originY, Math.floor((profile.canvasHeight - grid.gridHeight * brushSize) / 2));
    assert.deepEqual(gridCellToCanvasCenter(grid, { x: 0, y: 0 }), {
      x: grid.originX + Math.floor(brushSize / 2),
      y: grid.originY + Math.floor(brushSize / 2),
    });
    assert.equal(pixelized.pixelMap.length, grid.gridHeight);
    assert.equal(pixelized.pixelMap[0]?.length ?? 0, grid.gridWidth);
    assert.deepEqual(calculateCanvasBounds(pixelMap, profile), expectedCellBounds);
    assert.deepEqual(previewBounds, expectedCellBounds);
  }
});

test("transparent cells split horizontal L runs", () => {
  const profile = makeProfile({ canvasWidth: 5, canvasHeight: 1, brushSize: 1 });
  const pixelMap = makePixelMap(5, 1, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 3, y: 0 },
    { x: 4, y: 0 },
  ]);
  const commands = serializeCommands(generateScanlineCommands(pixelMap, profile));

  assert.equal(commands.filter((command) => command === "L 1 0").length, 2);
  assert.equal(commands.includes("L 4 0"), false);
});

test("a 200 pixel horizontal line becomes one L run", () => {
  const profile = makeProfile({ canvasWidth: 200, canvasHeight: 1, brushSize: 1 });
  const pixelMap = makePixelMap(
    200,
    1,
    Array.from({ length: 200 }, (_, x) => ({ x, y: 0 })),
  );
  const commands = serializeCommands(generateScanlineCommands(pixelMap, profile));

  assert.equal(commands.filter((command) => command.startsWith("L ")).length, 1);
  assert.equal(commands.includes("L 199 0"), true);
});

test("large brush centered blocks use grid origin instead of top-left bias", async () => {
  const profile = makeProfile({ brushSize: 27 });
  const grid = createBrushGrid(profile);
  const pixels = [
    { x: 3, y: 3 },
    { x: 4, y: 3 },
    { x: 5, y: 3 },
    { x: 3, y: 4 },
    { x: 4, y: 4 },
    { x: 5, y: 4 },
    { x: 3, y: 5 },
    { x: 4, y: 5 },
    { x: 5, y: 5 },
  ];
  const pixelMap = makePixelMap(grid.gridWidth, grid.gridHeight, pixels);
  const expected = {
    x: grid.originX + 3 * grid.brushSize,
    y: grid.originY + 3 * grid.brushSize,
    width: grid.brushSize * 3,
    height: grid.brushSize * 3,
    maxX: grid.originX + 6 * grid.brushSize - 1,
    maxY: grid.originY + 6 * grid.brushSize - 1,
  };

  assert.deepEqual(calculateCanvasBounds(pixelMap, profile), expected);
  assert.deepEqual(await alphaBoundsFromPreview(await renderPreviewToBuffer(pixelMap, profile, 1)), expected);
});

test("dynamic timeouts follow CFG INPUT timing", () => {
  const timing = { buttonPressMs: 100, inputDelayMs: 100, homeMs: 1800 };

  assert.equal(getAckTimeoutForCommand("CFG INPUT 100 100 1800", 500, timing), 500);
  assert.equal(getAckTimeoutForCommand("M 3 0", 500, timing), 1600);
  assert.equal(getAckTimeoutForCommand("L 3 0", 500, timing), 1800);
  assert.equal(getAckTimeoutForCommand("H", 500, timing), 4700);
});

test("palette-config commands get enough timeout for calibrated custom colors", () => {
  const timing = { buttonPressMs: 100, inputDelayMs: 100, homeMs: 1800 };

  assert.equal(getAckTimeoutForCommand("PC 1 #4E3239", 20_000, timing), 20_440);
  assert.equal(getAckTimeoutForCommand("PC 2 #00FF00", 20_000, timing), 46_340);
  assert.equal(getAckTimeoutForCommand("PC 6 #000000", 20_000, timing), 20_000);
});

test("controller input report failures are not retried", async () => {
  const lines: string[] = [];
  const sender = new SimulatedAckSender();

  await assert.rejects(
    () =>
      sender.send(["P"], {
        ackTimeoutMs: 1_000,
        retries: 3,
        ackDelayMs: 0,
        inputReportFailureAtCommand: 1,
        onDeviceLine: (line) => lines.push(line),
      }),
    /controller input report failed/u,
  );

  assert.equal(lines.some((line) => line.startsWith("WARN retry")), false);
});
