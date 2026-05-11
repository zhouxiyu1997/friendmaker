import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import sharp from "sharp";

import { calculateCanvasBounds, generateDrawPlan } from "../src/app/generateDrawPlan.js";
import { createBrushGrid, gridCellBounds, gridCellToCanvasCenter } from "../src/brushGrid.js";
import { applyDrawingMask, createDrawingMaskCoverageMap } from "../src/image/drawingMask.js";
import { autoRemoveBackground } from "../src/image/removeBackground.js";
import { pixelizeImage } from "../src/image/pixelize.js";
import { renderPreviewToBuffer } from "../src/image/renderPreview.js";
import { resizeImage } from "../src/image/resizeImage.js";
import { generateScanlineCommands } from "../src/path/scanline.js";
import { serializeCommands } from "../src/protocol/serializer.js";
import {
  SERIAL_OPEN_BOOT_TIMEOUT_MS,
  SERIAL_OPEN_CONTROL_LINE_SETTLE_MS,
  SERIAL_OPEN_POST_BOOT_SETTLE_MS,
  SERIAL_OPEN_READY_PROBE_TIMEOUT_MS,
  SERIAL_OPEN_RESET_DETECT_WINDOW_MS,
  SERIAL_OPEN_RESET_PULSE_MS,
  getAckTimeoutForCommand,
  isCongestedControllerSendReportLine,
  isDirectControllerInputReportFailureLine,
} from "../src/serial/sender.js";
import { SimulatedAckSender } from "../src/simulator/sender.js";
import type { BrushSize, DrawingMask, DrawingProfile, Pixel, PixelMap, RawImageData } from "../src/types.js";

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

async function solidPng(
  width: number,
  height: number,
  color: { r: number; g: number; b: number; alpha: number } = { r: 0, g: 0, b: 0, alpha: 255 },
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

function makeDrawingMask(
  width: number,
  height: number,
  isFilled: (x: number, y: number) => boolean,
): DrawingMask {
  const alpha = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      alpha[y * width + x] = isFilled(x, y) ? 255 : 0;
    }
  }

  return {
    width,
    height,
    alpha,
  };
}

function rawAlphaAt(image: RawImageData, x: number, y: number): number {
  return image.data[(y * image.width + x) * image.channels + 3] ?? 0;
}

function getSerializedLineVectors(commands: string[]): Array<{ dx: number; dy: number }> {
  return commands.flatMap((command) => {
    const match = /^L\s+(-?\d+)\s+(-?\d+)$/u.exec(command);

    if (!match?.[1] || !match[2]) {
      return [];
    }

    return [
      {
        dx: Number.parseInt(match[1], 10),
        dy: Number.parseInt(match[2], 10),
      },
    ];
  });
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

test("transparent cells still split into two short horizontal L runs from center start", () => {
  const profile = makeProfile({ canvasWidth: 5, canvasHeight: 1, brushSize: 1 });
  const pixelMap = makePixelMap(5, 1, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 3, y: 0 },
    { x: 4, y: 0 },
  ]);
  const commands = serializeCommands(generateScanlineCommands(pixelMap, profile));
  const lineCommands = getSerializedLineVectors(commands);

  assert.equal(lineCommands.length, 2);
  assert.equal(lineCommands.every((command) => Math.abs(command.dx) === 1 && command.dy === 0), true);
});

test("a 200 pixel horizontal line stays one L run from center start", () => {
  const profile = makeProfile({ canvasWidth: 200, canvasHeight: 1, brushSize: 1 });
  const pixelMap = makePixelMap(
    200,
    1,
    Array.from({ length: 200 }, (_, x) => ({ x, y: 0 })),
  );
  const commands = serializeCommands(generateScanlineCommands(pixelMap, profile));
  const lineCommands = getSerializedLineVectors(commands);

  assert.equal(lineCommands.length, 1);
  assert.deepEqual(lineCommands[0], { dx: -199, dy: 0 });
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

test("auto background removal still works when the placed image does not touch the canvas edge", async () => {
  const profile = makeProfile({ canvasWidth: 10, canvasHeight: 10, brushSize: 1 });
  const foreground = await solidPng(1, 1, { r: 0, g: 0, b: 0, alpha: 255 });
  const source = await sharp({
    create: {
      width: 5,
      height: 5,
      channels: 4,
      background: { r: 240, g: 240, b: 240, alpha: 255 },
    },
  })
    .composite([{ input: foreground, left: 2, top: 2 }])
    .png()
    .toBuffer();
  const pixelized = await pixelizeImage(source, profile, {
    imageScalePercent: 50,
    removeBackground: true,
  });

  assert.equal(pixelized.pixelMap[3]?.[3]?.alpha, 0);
  assert.equal(pixelized.pixelMap[5]?.[5]?.alpha, 255);
  assert.equal(
    pixelized.pixelMap.flatMap((row) => row).filter((pixel) => pixel.alpha > 0 && pixel.colorIndex >= 0).length,
    1,
  );
});

test("auto background removal keeps already transparent assets intact", async () => {
  const foreground = await solidPng(3, 3, { r: 255, g: 255, b: 255, alpha: 255 });
  const source = await sharp({
    create: {
      width: 5,
      height: 5,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: foreground, left: 1, top: 1 }])
    .png()
    .toBuffer();
  const loaded = await resizeImage(source, {
    width: 5,
    height: 5,
    resizeMode: "contain",
  });
  const cutout = autoRemoveBackground(loaded);

  assert.equal(rawAlphaAt(cutout, 1, 1), 255);
  assert.equal(rawAlphaAt(cutout, 2, 2), 255);
  assert.equal(rawAlphaAt(cutout, 3, 3), 255);
  assert.equal(rawAlphaAt(cutout, 0, 0), 0);
});

test("drawing mask clears pixels outside the template and bounds follow the masked shape", async () => {
  const profile = makeProfile({ canvasWidth: 6, canvasHeight: 6, brushSize: 1 });
  const source = await solidPng(6, 6);
  const drawingMask = makeDrawingMask(6, 6, (x, y) => x >= 1 && x <= 2 && y >= 1 && y <= 2);
  const pixelized = await pixelizeImage(source, profile, { drawingMask });

  assert.equal(
    pixelized.pixelMap.flatMap((row) => row).filter((pixel) => pixel.alpha > 0 && pixel.colorIndex >= 0).length,
    4,
  );
  assert.deepEqual(calculateCanvasBounds(pixelized.pixelMap, profile), {
    x: 1,
    y: 1,
    width: 2,
    height: 2,
    maxX: 2,
    maxY: 2,
  });
});

test("large brush cells stay drawable when they overlap the template edge", async () => {
  const profile = makeProfile({ canvasWidth: 6, canvasHeight: 6, brushSize: 3 });
  const source = await solidPng(6, 6);
  const drawingMask = makeDrawingMask(6, 6, (x, y) => {
    if (y >= 3) {
      return false;
    }

    if (x <= 1) {
      return true;
    }

    return x === 3;
  });
  const grid = createBrushGrid(profile);
  const coverageMap = createDrawingMaskCoverageMap(drawingMask, grid);
  const pixelized = await pixelizeImage(source, profile, { drawingMask });

  assert.equal(coverageMap?.[0]?.[0], 6 / 9);
  assert.equal(coverageMap?.[0]?.[1], 3 / 9);
  assert.equal(pixelized.pixelMap[0]?.[0]?.alpha, 255);
  assert.equal(pixelized.pixelMap[0]?.[1]?.alpha, 255);
  assert.equal(pixelized.pixelMap[1]?.[0]?.alpha, 0);
  assert.equal(pixelized.pixelMap[1]?.[1]?.alpha, 0);
  assert.equal(
    pixelized.pixelMap.flatMap((row) => row).filter((pixel) => pixel.alpha > 0 && pixel.colorIndex >= 0).length,
    2,
  );
});

test("multi-island masks preserve separated drawable regions", async () => {
  const profile = makeProfile({ canvasWidth: 8, canvasHeight: 8, brushSize: 1 });
  const source = await solidPng(8, 8);
  const drawingMask = makeDrawingMask(
    8,
    8,
    (x, y) =>
      (x <= 1 && y <= 1) ||
      (x >= 6 && y >= 6),
  );
  const pixelized = await pixelizeImage(source, profile, { drawingMask });

  assert.equal(pixelized.pixelMap[0]?.[0]?.alpha, 255);
  assert.equal(pixelized.pixelMap[1]?.[1]?.alpha, 255);
  assert.equal(pixelized.pixelMap[4]?.[4]?.alpha, 0);
  assert.equal(pixelized.pixelMap[6]?.[6]?.alpha, 255);
  assert.equal(pixelized.pixelMap[7]?.[7]?.alpha, 255);
});

test("applyDrawingMask zeroes alpha outside the template", () => {
  const raw: RawImageData = {
    width: 2,
    height: 2,
    channels: 4,
    data: Buffer.from([
      0, 0, 0, 255,
      0, 0, 0, 255,
      0, 0, 0, 255,
      0, 0, 0, 255,
    ]),
  };
  const drawingMask = makeDrawingMask(2, 2, (x, y) => x === 0 && y === 0);
  const masked = applyDrawingMask(raw, drawingMask);

  assert.equal(masked.data[3], 255);
  assert.equal(masked.data[7], 0);
  assert.equal(masked.data[11], 0);
  assert.equal(masked.data[15], 0);
});

test("draw plan pixel stats count only drawable cells after masking", async () => {
  const profile = makeProfile({ canvasWidth: 4, canvasHeight: 4, brushSize: 1 });
  const source = await solidPng(4, 4);
  const drawingMask = makeDrawingMask(4, 4, (x, y) => x <= 1 && y <= 1);
  const plan = await generateDrawPlan(source, profile, 1, { drawingMask });

  assert.equal(plan.totalPixels, 4);
  assert.equal(plan.commands.length > 0, true);
});

test("dynamic timeouts follow CFG INPUT timing", () => {
  const timing = { buttonPressMs: 100, inputDelayMs: 100, homeMs: 1800 };

  assert.equal(getAckTimeoutForCommand("CFG INPUT 100 100 1800", 500, timing), 500);
  assert.equal(getAckTimeoutForCommand("M 3 0", 500, timing), 1600);
  assert.equal(getAckTimeoutForCommand("L 3 0", 500, timing), 1800);
  assert.equal(getAckTimeoutForCommand("L 6 0 3", 500, timing), 2800);
  assert.equal(getAckTimeoutForCommand("W 3000", 500, timing), 4000);
  assert.equal(getAckTimeoutForCommand("H", 500, timing), 4700);
});

test("stride line timeouts account for discrete movement instead of long-hold jumps", () => {
  const timing = { buttonPressMs: 65, inputDelayMs: 45, homeMs: 1800 };

  assert.equal(getAckTimeoutForCommand("L -38 0 19", 500, timing), 5_510);
});

test("serial sender probes fresh ESP32 serial sessions before first sequenced command", async () => {
  const senderSource = await readFile(
    new URL("../src/serial/sender.ts", import.meta.url),
    "utf8",
  );

  assert.equal(SERIAL_OPEN_RESET_DETECT_WINDOW_MS, 400);
  assert.equal(SERIAL_OPEN_BOOT_TIMEOUT_MS, 10_000);
  assert.equal(SERIAL_OPEN_POST_BOOT_SETTLE_MS, 250);
  assert.equal(SERIAL_OPEN_CONTROL_LINE_SETTLE_MS, 150);
  assert.equal(SERIAL_OPEN_READY_PROBE_TIMEOUT_MS, 3_000);
  assert.equal(SERIAL_OPEN_RESET_PULSE_MS, 120);
  assert.match(
    senderSource,
    /const parser = port\.pipe\(new ReadlineParser\(\{ delimiter: "\\n" \}\)\)[\s\S]*await setPortSignals\(port, \{ dtr: false, rts: false, brk: false \}\)[\s\S]*INFO serial_session=signals dtr=false rts=false wait_ms=\$\{SERIAL_OPEN_CONTROL_LINE_SETTLE_MS\}[\s\S]*INFO serial_session=stabilizing detect_ms=\$\{SERIAL_OPEN_RESET_DETECT_WINDOW_MS\} boot_timeout_ms=\$\{SERIAL_OPEN_BOOT_TIMEOUT_MS\}[\s\S]*await stabilizeFreshSerialSession\(parser, port, onDeviceLine\)[\s\S]*await probeFreshSerialSession\(parser, port, onDeviceLine\)/u,
  );
  assert.match(
    senderSource,
    /INFO serial_session=probe phase=\$\{phase\} command=I timeout_ms=\$\{SERIAL_OPEN_READY_PROBE_TIMEOUT_MS\}[\s\S]*await writeLine\(port, "I"\)[\s\S]*WARN serial_session=probe_timeout phase=\$\{phase\} timeout_ms=\$\{SERIAL_OPEN_READY_PROBE_TIMEOUT_MS\}[\s\S]*INFO serial_session=probe_ready phase=\$\{phase\}/u,
  );
  assert.match(
    senderSource,
    /if \(!sawActivity && elapsedMs >= SERIAL_OPEN_RESET_DETECT_WINDOW_MS\)[\s\S]*if \(sawBoot && idleMs >= SERIAL_OPEN_POST_BOOT_SETTLE_MS\)[\s\S]*WARN serial_session=stabilize_timeout boot_seen=false wait_ms=\$\{SERIAL_OPEN_BOOT_TIMEOUT_MS\}/u,
  );
  assert.match(
    senderSource,
    /async function pulseRunModeReset\(port: SerialPort, onDeviceLine\?: \(line: string\) => void\): Promise<void> \{[\s\S]*await setPortSignals\(port, \{ dtr: false, rts: true, brk: false \}\)[\s\S]*INFO serial_session=reset_pulse dtr=false rts=true wait_ms=\$\{SERIAL_OPEN_RESET_PULSE_MS\}[\s\S]*INFO serial_session=reset_release dtr=false rts=false wait_ms=\$\{SERIAL_OPEN_CONTROL_LINE_SETTLE_MS\}/u,
  );
  assert.equal(
    senderSource.includes('private parserDataHandler: ((rawLine: string | Buffer) => void) | null = null;'),
    true,
  );
  assert.equal(senderSource.includes("private passiveDeviceLines: string[] = [];"), true);
  assert.equal(
    senderSource.includes("private flushPassiveDeviceLines(onDeviceLine?: (line: string) => void): void {"),
    true,
  );
  assert.equal(senderSource.includes("pendingLines.forEach((line) => onDeviceLine(line));"), true);
  assert.equal(senderSource.includes("this.attachParserDataHandler(parser);"), true);
  assert.equal(senderSource.includes("this.flushPassiveDeviceLines(options.onDeviceLine);"), true);
  assert.equal(senderSource.includes("this.beginForegroundDeviceLineCapture();"), true);
});

test("palette-config commands get enough timeout for calibrated custom colors", () => {
  const timing = { buttonPressMs: 100, inputDelayMs: 100, homeMs: 1800 };

  assert.equal(getAckTimeoutForCommand("PC 1 #4E3239", 20_000, timing), 45_380);
  assert.equal(getAckTimeoutForCommand("PC 2 #00FF00", 20_000, timing), 80_820);
  assert.equal(getAckTimeoutForCommand("PC 6 #000000", 20_000, timing), 35_320);
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

test("simulated stride lines keep the endpoint but only add one draw per stride chunk", async () => {
  const lines: string[] = [];
  const sender = new SimulatedAckSender();

  await sender.send(["L 6 0 3", "I"], {
    ackTimeoutMs: 5_000,
    retries: 0,
    ackDelayMs: 0,
    onDeviceLine: (line) => lines.push(line),
  });

  assert.match(lines.at(-1) ?? "", /INFO transport=simulated-device x=6 y=0 color=0 draws=3$/u);
});

test("congested controller send-report warnings are recognized as execution-fatal", () => {
  assert.equal(
    isCongestedControllerSendReportLine(
      "WARN bt hid event=send-report status=1 reason=8 report=48",
    ),
    true,
  );
  assert.equal(
    isCongestedControllerSendReportLine(
      "WARN bt hid event=send-report status=1 reason=8 report=33",
    ),
    false,
  );
  assert.equal(
    isCongestedControllerSendReportLine(
      "INFO bt hid event=send-report status=1 reason=8 report=48",
    ),
    false,
  );
});

test("direct controller input failure lines are recognized without congestion spam", () => {
  assert.equal(
    isDirectControllerInputReportFailureLine(
      "WARN bt send_report timeout report=48 waited_ms=250 expected=12",
    ),
    true,
  );
  assert.equal(
    isDirectControllerInputReportFailureLine(
      "WARN bt send_report rejected status=1 reason=8 report=48",
    ),
    true,
  );
  assert.equal(
    isDirectControllerInputReportFailureLine(
      "WARN bt explicit_input blocked connected=true paired=true ready=false",
    ),
    true,
  );
  assert.equal(
    isDirectControllerInputReportFailureLine(
      "WARN bt send_report rejected status=1 reason=8 report=33",
    ),
    false,
  );
});
