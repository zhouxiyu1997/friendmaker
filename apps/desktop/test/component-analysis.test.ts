import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePixelMapComponentStats,
  collectConnectedPixelComponents,
  collectPixelMapComponents,
} from "../src/image/componentAnalysis.js";
import type { Pixel, PixelMap } from "../src/types.js";

const RED = { colorIndex: 0, colorHex: "#ff0000" };
const BLUE = { colorIndex: 1, colorHex: "#0000ff" };

function transparentPixel(x: number, y: number): Pixel {
  return {
    x,
    y,
    colorIndex: -1,
    colorHex: "#ffffff",
    alpha: 0,
  };
}

function colorPixel(x: number, y: number, color: typeof RED): Pixel {
  return {
    x,
    y,
    colorIndex: color.colorIndex,
    colorHex: color.colorHex,
    alpha: 255,
  };
}

function makeMap(): PixelMap {
  const pixelMap = Array.from({ length: 4 }, (_, y) =>
    Array.from({ length: 5 }, (_, x) => transparentPixel(x, y)),
  );

  pixelMap[0]![0] = colorPixel(0, 0, RED);
  pixelMap[0]![1] = colorPixel(1, 0, RED);
  pixelMap[1]![0] = colorPixel(0, 1, RED);
  pixelMap[3]![4] = colorPixel(4, 3, BLUE);

  return pixelMap;
}

test("collectConnectedPixelComponents groups adjacent pixels with 4-connectivity", () => {
  const pixelMap = makeMap();
  const components = collectConnectedPixelComponents([
    pixelMap[0]![0]!,
    pixelMap[0]![1]!,
    pixelMap[1]![0]!,
    pixelMap[3]![4]!,
  ]);

  assert.equal(components.length, 2);
  assert.deepEqual(components.map((component) => component.length).sort((a, b) => a - b), [1, 3]);
});

test("pixel map component stats include drawable, transparent, perimeter, and edge metrics", () => {
  const pixelMap = makeMap();
  const components = collectPixelMapComponents(pixelMap, { includeTransparent: true });
  const stats = calculatePixelMapComponentStats(pixelMap, {
    includeTransparent: true,
    thresholdCells: 2,
  });

  assert.equal(components.length, 3);
  assert.equal(stats.usedColorCount, 2);
  assert.equal(stats.drawableCellCount, 4);
  assert.equal(stats.transparentCellCount, 16);
  assert.equal(stats.drawableComponentCount, 2);
  assert.equal(stats.transparentComponentCount, 1);
  assert.equal(stats.tinyDrawableComponentCount, 1);
  assert.equal(stats.largestDrawableComponentArea, 3);
  assert.equal(stats.edgeTouchingDrawableComponentCount, 2);
  assert.ok(stats.totalDrawablePerimeter > 0);
  assert.ok(stats.totalTransparentPerimeter > 0);
});
