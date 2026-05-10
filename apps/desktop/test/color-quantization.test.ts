import assert from "node:assert/strict";
import { test } from "node:test";

import sharp from "sharp";

import { generateDrawPlan } from "../src/app/generateDrawPlan.js";
import { DEFAULT_PALETTE } from "../src/config/defaultProfile.js";
import { OFFICIAL_PALETTE } from "../src/config/officialPalette.js";
import { pixelizeImage } from "../src/image/pixelize.js";
import { colorDistanceSquared, compositeOnWhite, parseHexColor } from "../src/utils/colors.js";
import type { DrawingProfile } from "../src/types.js";

const OFFICIAL_REGRESSION_TARGETS = [
  2, 5, 6, 7, 8, 9, 16, 17, 22, 24, 27, 28, 29, 31, 33, 34, 36, 38, 40, 41, 42, 43,
  44, 45, 46, 48, 51, 52, 54, 55, 56, 59, 60, 61, 62, 70, 71, 72, 73, 75, 76, 79, 81, 83,
];

interface RawRgbaImage {
  width: number;
  height: number;
  channels: 4;
  data: Buffer;
}

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

function buildNoisyOfficialRegressionSource(seed: number): RawRgbaImage {
  let value = seed >>> 0;
  const rand = () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
  const blockSize = 6;
  const columns = 4;
  const rows = Math.ceil(OFFICIAL_REGRESSION_TARGETS.length / columns);
  const width = columns * blockSize;
  const height = rows * blockSize;
  const data = Buffer.alloc(width * height * 4);
  const palette = OFFICIAL_PALETTE.map((colorHex) => parseHexColor(colorHex));

  for (const [index, targetIndex] of OFFICIAL_REGRESSION_TARGETS.entries()) {
    const baseColor = palette[targetIndex];

    if (!baseColor) {
      continue;
    }

    const originX = (index % columns) * blockSize;
    const originY = Math.floor(index / columns) * blockSize;

    for (let y = 0; y < blockSize; y += 1) {
      for (let x = 0; x < blockSize; x += 1) {
        const offset = ((originY + y) * width + (originX + x)) * 4;
        const deltaR = Math.round((rand() - 0.5) * 24);
        const deltaG = Math.round((rand() - 0.5) * 24);
        const deltaB = Math.round((rand() - 0.5) * 24);

        data[offset] = Math.max(0, Math.min(255, baseColor.r + deltaR));
        data[offset + 1] = Math.max(0, Math.min(255, baseColor.g + deltaG));
        data[offset + 2] = Math.max(0, Math.min(255, baseColor.b + deltaB));
        data[offset + 3] = 255;
      }
    }
  }

  return { width, height, channels: 4, data };
}

async function rawImageToPng(image: RawRgbaImage): Promise<Buffer> {
  return sharp(image.data, {
    raw: {
      width: image.width,
      height: image.height,
      channels: image.channels,
    },
  })
    .png()
    .toBuffer();
}

function getDirectNearestOfficialColorIndexes(image: RawRgbaImage): number[] {
  const paletteEntries = OFFICIAL_PALETTE.map((colorHex, colorIndex) => ({
    colorIndex,
    rgb: parseHexColor(colorHex),
  }));
  const usedIndexes = new Set<number>();

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * image.channels;
      const alpha = image.channels >= 4 ? (image.data[offset + 3] ?? 255) : 255;

      if (alpha <= 16) {
        continue;
      }

      const rgb = compositeOnWhite(
        image.data[offset] ?? 0,
        image.data[offset + 1] ?? 0,
        image.data[offset + 2] ?? 0,
        alpha,
      );
      let nearestEntry = paletteEntries[0];
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (const entry of paletteEntries) {
        const distance = colorDistanceSquared(rgb, entry.rgb);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestEntry = entry;
        }
      }

      if (nearestEntry) {
        usedIndexes.add(nearestEntry.colorIndex);
      }
    }
  }

  return Array.from(usedIndexes).sort((left, right) => left - right);
}

test("official 84-color previews keep direct nearest official palette matches for noisy close colors", async () => {
  const source = buildNoisyOfficialRegressionSource(1);
  const profile = makeProfile({
    canvasWidth: source.width,
    canvasHeight: source.height,
    brushSize: 1,
    colorMode: "official",
    colorCount: 84,
    palette: OFFICIAL_PALETTE.slice(),
  });
  const pixelized = await pixelizeImage(await rawImageToPng(source), profile);
  const expectedIndexes = getDirectNearestOfficialColorIndexes(source);

  assert.deepEqual(pixelized.usedColorIndexes, expectedIndexes);
  assert.equal(pixelized.usedColorIndexes.includes(0), true);
  assert.equal(pixelized.usedColorIndexes.includes(2), true);
  assert.equal(pixelized.usedColorIndexes.includes(18), true);
  assert.equal(pixelized.usedColorIndexes.includes(68), true);
  assert.equal(pixelized.usedColorIndexes.includes(80), true);
});

test("official color limiting keeps the final drawable cell map within the requested count and deterministic", async () => {
  const source = buildNoisyOfficialRegressionSource(1);
  const input = await rawImageToPng(source);
  const profile = makeProfile({
    canvasWidth: source.width,
    canvasHeight: source.height,
    brushSize: 3,
    colorMode: "official",
    colorCount: 32,
    palette: OFFICIAL_PALETTE.slice(),
  });
  const first = await pixelizeImage(input, profile);
  const second = await pixelizeImage(input, profile);

  assert.equal(first.usedColorIndexes.length <= 32, true);
  assert.deepEqual(second.usedColorIndexes, first.usedColorIndexes);
  assert.deepEqual(second.pixelMap, first.pixelMap);
});

test("palette previews never report more colors than the user selected", async () => {
  const source = buildNoisyOfficialRegressionSource(7);
  const input = await rawImageToPng(source);

  for (const colorCount of [8, 32, 84]) {
    const profile = makeProfile({
      canvasWidth: source.width,
      canvasHeight: source.height,
      brushSize: 1,
      colorMode: "palette",
      colorCount,
      palette: DEFAULT_PALETTE.slice(0, colorCount),
    });
    const plan = await generateDrawPlan(input, profile, 1);

    assert.equal(plan.usedColorIndexes.length <= colorCount, true);
    assert.equal(plan.paletteHexes.length <= colorCount, true);
    assert.equal(plan.paletteHexes.length, plan.usedColorIndexes.length);
  }
});
