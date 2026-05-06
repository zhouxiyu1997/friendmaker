import type { ImageSource } from "../image/loadImage.js";
import { createBrushGrid, gridCellBounds, isGridCellInBounds } from "../brushGrid.js";
import {
  calculatePixelMapComponentStats,
  type PixelMapComponentStats,
} from "../image/componentAnalysis.js";
import { pixelizeImage } from "../image/pixelize.js";
import { renderPreviewToBuffer } from "../image/renderPreview.js";
import {
  calculateRuntimeBreakdown,
  estimateRuntimeMs,
  generateScanlinePlan,
  type PathStrategy,
  type RecenterStats,
  type ScanlinePlanningOptions,
} from "../path/scanline.js";
import type { CommandRuntimeBreakdown } from "../protocol/runtimeEstimate.js";
import { serializeCommands } from "../protocol/serializer.js";
import type { DrawCommand } from "../protocol/commands.js";
import type {
  CanvasBounds,
  DrawingMask,
  DrawingProfile,
  NoiseCleanupMode,
  NoiseCleanupStats,
  PixelMap,
  ResumePlan,
} from "../types.js";

export interface DrawPlanPathStats {
  lineRunCount: number;
  maxMoveSteps: number;
  longMoveOver50: number;
  longMoveOver100: number;
  longMoveOver200: number;
}

export interface DrawPlanColorPixelCount {
  colorIndex: number;
  colorHex: string;
  pixelCount: number;
}

export interface DrawPlan {
  commands: string[];
  resumePlan: ResumePlan;
  pixelMap: PixelMap;
  usedColorIndexes: number[];
  colorPixelCounts: DrawPlanColorPixelCount[];
  paletteHexes: string[];
  totalPixels: number;
  estimatedRuntimeMs: number;
  runtimeBreakdown: CommandRuntimeBreakdown;
  previewPng: Buffer;
  imageBounds: CanvasBounds | null;
  pathStats: DrawPlanPathStats;
  componentStats: PixelMapComponentStats;
  recenterStats: RecenterStats;
  noiseCleanupStats: NoiseCleanupStats;
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
    pathStrategy?: PathStrategy;
    noiseCleanupMode?: NoiseCleanupMode;
    enableRecenterShortcut?: boolean;
    recenterHoldMs?: number;
    enableColorBatchOptimization?: boolean;
  },
): Promise<DrawPlan> {
  const { pixelMap, usedColorIndexes, noiseCleanupStats } = await pixelizeImage(imageSource, profile, options);
  const previewPng = await renderPreviewToBuffer(pixelMap, profile, previewScale);
  const scanlineOptions: ScanlinePlanningOptions = {
    ...(options?.pathStrategy ? { pathStrategy: options.pathStrategy } : {}),
    recenterMode: options?.enableRecenterShortcut === true ? "left-hold" : "off",
    ...(typeof options?.recenterHoldMs === "number" ? { recenterHoldMs: options.recenterHoldMs } : {}),
    optimizeColorBatches: options?.enableColorBatchOptimization === true,
  };
  const scanlinePlan = generateScanlinePlan(pixelMap, profile, scanlineOptions);
  const drawCommands = scanlinePlan.commands;
  const imageBounds = calculateCanvasBounds(pixelMap, profile);
  const pathStats = calculatePathStats(drawCommands);
  const componentStats = calculatePixelMapComponentStats(pixelMap, {
    thresholdCells: noiseCleanupStats.thresholdCells,
    includeTransparent: true,
  });
  const runtimeBreakdown = calculateRuntimeBreakdown(drawCommands, profile);
  const colorPixelCounts = countDrawablePixelsByColor(pixelMap);
  const paletteHexes = colorPixelCounts.map((color) => color.colorHex);

  return {
    commands: serializeCommands(drawCommands),
    resumePlan: scanlinePlan.resumePlan,
    pixelMap,
    usedColorIndexes,
    colorPixelCounts,
    paletteHexes,
    totalPixels: countDrawablePixels(pixelMap),
    estimatedRuntimeMs: estimateRuntimeMs(drawCommands, profile),
    runtimeBreakdown,
    previewPng,
    imageBounds,
    pathStats,
    componentStats,
    recenterStats: scanlinePlan.recenterStats,
    noiseCleanupStats,
  };
}

function countDrawablePixels(pixelMap: PixelMap): number {
  return pixelMap.reduce(
    (total, row) => total + row.filter((pixel) => pixel.alpha > 0 && pixel.colorIndex >= 0).length,
    0,
  );
}

function countDrawablePixelsByColor(pixelMap: PixelMap): DrawPlanColorPixelCount[] {
  const colorStats = new Map<number, { colorHex: string; pixelCount: number }>();

  for (const row of pixelMap) {
    for (const pixel of row) {
      if (pixel.alpha <= 0 || pixel.colorIndex < 0) {
        continue;
      }

      const existing = colorStats.get(pixel.colorIndex);

      if (existing) {
        existing.pixelCount += 1;
      } else {
        colorStats.set(pixel.colorIndex, {
          colorHex: pixel.colorHex,
          pixelCount: 1,
        });
      }
    }
  }

  return Array.from(colorStats.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([colorIndex, stats]) => ({
      colorIndex,
      colorHex: stats.colorHex,
      pixelCount: stats.pixelCount,
    }));
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
