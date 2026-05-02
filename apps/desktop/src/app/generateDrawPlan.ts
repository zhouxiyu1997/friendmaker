import type { ImageSource } from "../image/loadImage.js";
import { pixelizeImage } from "../image/pixelize.js";
import { renderPreviewToBuffer } from "../image/renderPreview.js";
import { estimateRuntimeMs, generateScanlineCommands, getPathCommandStats } from "../path/scanline.js";
import { serializeCommands } from "../protocol/serializer.js";
import type { CanvasBounds, DrawingProfile, PathCommandStats, PixelMap } from "../types.js";

export interface DrawPlan {
  commands: string[];
  pixelMap: PixelMap;
  usedColorIndexes: number[];
  paletteHexes: string[];
  totalPixels: number;
  estimatedRuntimeMs: number;
  pathStats: PathCommandStats;
  previewPng: Buffer;
  imageBounds: CanvasBounds | null;
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
  },
): Promise<DrawPlan> {
  const { pixelMap, usedColorIndexes } = await pixelizeImage(imageSource, profile, options);
  const previewPng = await renderPreviewToBuffer(pixelMap, profile, previewScale);
  const commands = generateScanlineCommands(pixelMap, profile);
  const imageBounds = calculateCanvasBounds(pixelMap, profile);
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
    commands: serializeCommands(commands),
    pixelMap,
    usedColorIndexes,
    paletteHexes,
    totalPixels: pixelMap.length * (pixelMap[0]?.length ?? 0),
    estimatedRuntimeMs: estimateRuntimeMs(commands, profile),
    pathStats: getPathCommandStats(commands),
    previewPng,
    imageBounds,
  };
}

function calculateCanvasBounds(pixelMap: PixelMap, profile: DrawingProfile): CanvasBounds | null {
  const brushSize = Math.max(1, profile.brushSize);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;

  for (const row of pixelMap) {
    for (const pixel of row) {
      if (pixel.alpha <= 0 || pixel.colorIndex < 0) {
        continue;
      }

      const startX = pixel.x * brushSize;
      const startY = pixel.y * brushSize;
      const endX = Math.min(profile.canvasWidth, startX + brushSize) - 1;
      const endY = Math.min(profile.canvasHeight, startY + brushSize) - 1;

      minX = Math.min(minX, startX);
      minY = Math.min(minY, startY);
      maxX = Math.max(maxX, endX);
      maxY = Math.max(maxY, endY);
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
