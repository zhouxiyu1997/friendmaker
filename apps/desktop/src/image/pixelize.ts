import sharp from "sharp";

import type { DrawingMask, DrawingProfile, PixelMap, PixelizationResult, RgbColor } from "../types.js";
import { createBrushGrid } from "../brushGrid.js";
import { colorDistanceSquared, parseHexColor } from "../utils/colors.js";
import type { RawImageData } from "../types.js";
import { loadImage, type ImageSource } from "./loadImage.js";
import {
  applyDrawingMask,
  createDrawingMaskCoverageMap,
  isDrawingMaskCellEnabled,
  type DrawingMaskCoverageMap,
} from "./drawingMask.js";
import { autoRemoveBackground } from "./removeBackground.js";
import { resizeImage } from "./resizeImage.js";
import { quantizePixels } from "./quantize.js";

interface PixelColorUsage {
  colorIndex: number;
  colorHex: string;
  rgb: RgbColor;
  count: number;
}

async function readRawImage(imageSource: ImageSource): Promise<RawImageData> {
  const { data, info } = await loadImage(imageSource)
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    width: info.width,
    height: info.height,
    channels: info.channels,
    data,
  };
}

async function encodeRawImageAsPng(image: RawImageData): Promise<Buffer> {
  return sharp(image.data, {
    raw: {
      width: image.width,
      height: image.height,
      channels: image.channels as 1 | 2 | 3 | 4,
    },
  })
    .png()
    .toBuffer();
}

function collapsePixelMapForBrush(
  pixelMap: PixelizationResult["pixelMap"],
  profile: DrawingProfile,
  drawingMaskCoverageMap: DrawingMaskCoverageMap | null,
): PixelizationResult["pixelMap"] {
  const grid = createBrushGrid(profile);
  const collapsed: PixelizationResult["pixelMap"] = [];

  for (let logicalY = 0; logicalY < grid.gridHeight; logicalY += 1) {
    const row = [];
    const originY = grid.originY + logicalY * grid.brushSize;

    for (let logicalX = 0; logicalX < grid.gridWidth; logicalX += 1) {
      if (!isDrawingMaskCellEnabled(drawingMaskCoverageMap, { x: logicalX, y: logicalY })) {
        row.push({
          x: logicalX,
          y: logicalY,
          colorIndex: -1,
          colorHex: "#ffffff",
          alpha: 0,
        });
        continue;
      }

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

function findNearestPixelColorUsage(
  rgb: RgbColor,
  usages: PixelColorUsage[],
): PixelColorUsage | undefined {
  let nearestUsage = usages[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const usage of usages) {
    const distance = colorDistanceSquared(rgb, usage.rgb);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestUsage = usage;
    }
  }

  return nearestUsage;
}

function limitPixelMapColors(pixelMap: PixelMap, colorCount: number): PixelMap {
  if (colorCount <= 0) {
    return pixelMap;
  }

  const colorUsageByIndex = new Map<number, PixelColorUsage>();

  for (const row of pixelMap) {
    for (const pixel of row) {
      if (pixel.alpha <= 0 || pixel.colorIndex < 0) {
        continue;
      }

      const existing = colorUsageByIndex.get(pixel.colorIndex);

      if (existing) {
        existing.count += 1;
        continue;
      }

      colorUsageByIndex.set(pixel.colorIndex, {
        colorIndex: pixel.colorIndex,
        colorHex: pixel.colorHex,
        rgb: parseHexColor(pixel.colorHex),
        count: 1,
      });
    }
  }

  if (colorUsageByIndex.size <= colorCount) {
    return pixelMap;
  }

  const selectedUsages = Array.from(colorUsageByIndex.values())
    .sort((left, right) => right.count - left.count || left.colorIndex - right.colorIndex)
    .slice(0, colorCount);
  const selectedUsageIndexes = new Set(selectedUsages.map((usage) => usage.colorIndex));

  return pixelMap.map((row) =>
    row.map((pixel) => {
      if (pixel.alpha <= 0 || pixel.colorIndex < 0 || selectedUsageIndexes.has(pixel.colorIndex)) {
        return pixel;
      }

      const sourceUsage = colorUsageByIndex.get(pixel.colorIndex);
      const nearestUsage = findNearestPixelColorUsage(
        sourceUsage?.rgb ?? parseHexColor(pixel.colorHex),
        selectedUsages,
      );

      if (!nearestUsage) {
        return pixel;
      }

      return {
        ...pixel,
        colorIndex: nearestUsage.colorIndex,
        colorHex: nearestUsage.colorHex,
      };
    }),
  );
}

export async function pixelizeImage(
  imageSource: ImageSource,
  profile: DrawingProfile,
  options?: {
    imageScalePercent?: number;
    imageOffsetXPercent?: number;
    imageOffsetYPercent?: number;
    removeBackground?: boolean;
    drawingMask?: DrawingMask | null;
  },
): Promise<PixelizationResult> {
  const grid = createBrushGrid(profile);
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
  const resizeSource =
    options?.removeBackground === true
      ? await encodeRawImageAsPng(autoRemoveBackground(await readRawImage(imageSource)))
      : imageSource;
  const resizedImage = await resizeImage(resizeSource, resizeOptions);
  const maskedImage = applyDrawingMask(resizedImage, options?.drawingMask ?? null);
  const drawingMaskCoverageMap = createDrawingMaskCoverageMap(options?.drawingMask ?? null, grid);

  const fullPixelMap = quantizePixels(maskedImage, {
    colorMode: profile.colorMode,
    colorCount: profile.colorCount,
    monoThreshold: profile.monoThreshold,
    palette: profile.palette,
  });
  const collapsedPixelMap = collapsePixelMapForBrush(fullPixelMap, profile, drawingMaskCoverageMap);
  const pixelMap =
    profile.colorMode === "mono"
      ? collapsedPixelMap
      : limitPixelMapColors(collapsedPixelMap, profile.colorCount);

  const usedColorIndexes = Array.from(
    new Set(
      pixelMap.flatMap((row) =>
        row.filter((pixel) => pixel.alpha > 0 && pixel.colorIndex >= 0).map((pixel) => pixel.colorIndex),
      ),
    ),
  ).sort((a, b) => a - b);

  return {
    pixelMap,
    usedColorIndexes,
  };
}
