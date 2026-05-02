import type { DrawingProfile, PixelizationResult } from "../types.js";
import type { ImageSource } from "./loadImage.js";
import { autoRemoveBackground } from "./removeBackground.js";
import { resizeImage } from "./resizeImage.js";
import { quantizePixels } from "./quantize.js";
import { resolveBrushGrid } from "../path/brushGrid.js";

function collapsePixelMapForBrush(
  pixelMap: PixelizationResult["pixelMap"],
  profile: DrawingProfile,
): PixelizationResult["pixelMap"] {
  const grid = resolveBrushGrid(profile);
  const collapsed: PixelizationResult["pixelMap"] = [];

  for (let logicalY = 0; logicalY < grid.gridHeight; logicalY += 1) {
    const row = [];
    const originY = grid.originY + logicalY * grid.brushSize;

    for (let logicalX = 0; logicalX < grid.gridWidth; logicalX += 1) {
      const originX = grid.originX + logicalX * grid.brushSize;
      const colorCounts = new Map<
        number,
        {
          count: number;
          colorHex: string;
        }
      >();

      let fallbackPixel:
        | {
            colorIndex: number;
            colorHex: string;
          }
        | null = null;

      for (let dy = 0; dy < grid.brushSize; dy += 1) {
        const y = originY + dy;

        if (y >= pixelMap.length) {
          break;
        }

        const sourceRow = pixelMap[y];

        if (!sourceRow) {
          continue;
        }

        for (let dx = 0; dx < grid.brushSize; dx += 1) {
          const x = originX + dx;

          if (x >= sourceRow.length) {
            break;
          }

          const pixel = sourceRow[x];

          if (!pixel || pixel.alpha <= 0 || pixel.colorIndex < 0) {
            continue;
          }

          if (!fallbackPixel) {
            fallbackPixel = {
              colorIndex: pixel.colorIndex,
              colorHex: pixel.colorHex,
            };
          }

          const existing = colorCounts.get(pixel.colorIndex);

          if (existing) {
            existing.count += 1;
          } else {
            colorCounts.set(pixel.colorIndex, {
              count: 1,
              colorHex: pixel.colorHex,
            });
          }
        }
      }

      if (colorCounts.size === 0) {
        row.push({
          x: logicalX,
          y: logicalY,
          colorIndex: -1,
          colorHex: "#ffffff",
          alpha: 0,
        });
        continue;
      }

      let selectedColorIndex = fallbackPixel?.colorIndex ?? 0;
      let selectedColorHex = fallbackPixel?.colorHex ?? "#000000";
      let selectedCount = -1;

      for (const [colorIndex, info] of colorCounts.entries()) {
        if (info.count > selectedCount) {
          selectedColorIndex = colorIndex;
          selectedColorHex = info.colorHex;
          selectedCount = info.count;
        }
      }

      row.push({
        x: logicalX,
        y: logicalY,
        colorIndex: selectedColorIndex,
        colorHex: selectedColorHex,
        alpha: 255,
      });
    }

    collapsed.push(row);
  }

  return collapsed;
}

export async function pixelizeImage(
  imageSource: ImageSource,
  profile: DrawingProfile,
  options?: {
    imageScalePercent?: number;
    imageOffsetXPercent?: number;
    imageOffsetYPercent?: number;
    removeBackground?: boolean;
  },
): Promise<PixelizationResult> {
  const resizeOptions = {
    width: profile.canvasWidth,
    height: profile.canvasHeight,
    resizeMode: profile.resizeMode,
    ...(options?.imageScalePercent !== undefined
      ? { scalePercent: options.imageScalePercent }
      : {}),
    ...(options?.imageOffsetXPercent !== undefined
      ? { offsetXPercent: options.imageOffsetXPercent }
      : {}),
    ...(options?.imageOffsetYPercent !== undefined
      ? { offsetYPercent: options.imageOffsetYPercent }
      : {}),
  };
  const resizedImage = await resizeImage(imageSource, resizeOptions);
  const rawImage = options?.removeBackground ? autoRemoveBackground(resizedImage) : resizedImage;

  const fullPixelMap = quantizePixels(rawImage, {
    colorMode: profile.colorMode,
    colorCount: profile.colorCount,
    monoThreshold: profile.monoThreshold,
    palette: profile.palette,
  });
  const pixelMap = collapsePixelMapForBrush(fullPixelMap, profile);

  const usedColorIndexes = Array.from(
    new Set(
      pixelMap.flatMap((row) =>
        row.filter((pixel) => pixel.alpha > 0).map((pixel) => pixel.colorIndex),
      ),
    ),
  ).sort((a, b) => a - b);

  return {
    pixelMap,
    usedColorIndexes,
  };
}
