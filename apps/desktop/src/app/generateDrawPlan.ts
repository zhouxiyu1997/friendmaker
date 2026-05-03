import type { ImageSource } from "../image/loadImage.js";
import { createBrushGrid, gridCellBounds, isGridCellInBounds } from "../brushGrid.js";
import { pixelizeImage } from "../image/pixelize.js";
import { renderPreviewToBuffer } from "../image/renderPreview.js";
import { estimateRuntimeMs, generateScanlineCommands } from "../path/scanline.js";
import { serializeCommands } from "../protocol/serializer.js";
import type { DrawCommand } from "../protocol/commands.js";
import type { CanvasBounds, DrawingMask, DrawingProfile, PixelMap } from "../types.js";

export interface DrawPlanPathStats {
  lineRunCount: number;
  maxMoveSteps: number;
  longMoveOver50: number;
  longMoveOver100: number;
  longMoveOver200: number;
}

export interface DrawPlan {
  commands: string[];
  pixelMap: PixelMap;
  usedColorIndexes: number[];
  paletteHexes: string[];
  totalPixels: number;
  estimatedRuntimeMs: number;
  previewPng: Buffer;
  imageBounds: CanvasBounds | null;
  pathStats: DrawPlanPathStats;
}

export async function generateDrawPlan(
  imageSource: ImageSource,
  profile: DrawingProfile,
  previewScale = 12,
  options?: {
    imageScalePercent?: number;
    imageOffsetXPercent?: number;
    imageOffsetYPercent?: number;
    removeBackground?: boolean;
    drawingMask?: DrawingMask | null;
  },
): Promise<DrawPlan> {
  const { pixelMap, usedColorIndexes } = await pixelizeImage(imageSource, profile, options);
  const previewPng = await renderPreviewToBuffer(pixelMap, profile, previewScale);
  const drawCommands = generateScanlineCommands(pixelMap, profile);
  const imageBounds = calculateCanvasBounds(pixelMap, profile);
  const pathStats = calculatePathStats(drawCommands);
  const paletteHexes = Array.from(
    pixelMap
      .flatMap((row) =>
        row
          .filter((pixel) => pixel.alpha > 0 && pixel.colorIndex >= 0)
          .map((pixel) => [pixel.colorIndex, pixel.colorHex] as const),
      )
      .reduce((map, [colorIndex, colorHex]) => map.set(colorIndex, colorHex), new Map<number, string>())
      .entries(),
  )
    .sort((a, b) => a[0] - b[0])
    .map(([, colorHex]) => colorHex);

  return {
    commands: serializeCommands(drawCommands),
    pixelMap,
    usedColorIndexes,
    paletteHexes,
    totalPixels: countDrawablePixels(pixelMap),
    estimatedRuntimeMs: estimateRuntimeMs(drawCommands, profile),
    previewPng,
    imageBounds,
    pathStats,
  };
}

function countDrawablePixels(pixelMap: PixelMap): number {
  return pixelMap.reduce(
    (total, row) => total + row.filter((pixel) => pixel.alpha > 0 && pixel.colorIndex >= 0).length,
    0,
  );
}

export function calculateCanvasBounds(pixelMap: PixelMap, profile: DrawingProfile): CanvasBounds | null {
  const grid = createBrushGrid(profile);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;

  for (const row of pixelMap) {
    for (const pixel of row) {
      if (pixel.alpha <= 0 || pixel.colorIndex < 0) {
        continue;
      }

      if (!isGridCellInBounds(grid, pixel)) {
        continue;
      }

      const bounds = gridCellBounds(grid, pixel);

      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
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

export function calculatePathStats(commands: DrawCommand[]): DrawPlanPathStats {
  let lineRunCount = 0;
  let maxMoveSteps = 0;
  let longMoveOver50 = 0;
  let longMoveOver100 = 0;
  let longMoveOver200 = 0;

  for (const command of commands) {
    if (command.type === "line") {
      lineRunCount += 1;
      continue;
    }

    if (command.type !== "move") {
      continue;
    }

    const steps = Math.abs(command.dx) + Math.abs(command.dy);
    maxMoveSteps = Math.max(maxMoveSteps, steps);

    if (steps > 50) {
      longMoveOver50 += 1;
    }

    if (steps > 100) {
      longMoveOver100 += 1;
    }

    if (steps > 200) {
      longMoveOver200 += 1;
    }
  }

  return {
    lineRunCount,
    maxMoveSteps,
    longMoveOver50,
    longMoveOver100,
    longMoveOver200,
  };
}
