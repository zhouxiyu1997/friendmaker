import type { ColorDistanceMode, DitherMode, DrawingProfile, PixelizationResult, RawImageData } from "../types.js";
import { createBrushGrid } from "../brushGrid.js";
import type { ImageSource } from "./loadImage.js";
import { autoRemoveBackground } from "./removeBackground.js";
import { resizeImage } from "./resizeImage.js";
import { distanceSquared, quantizePixels } from "./quantize.js";
import { parseHexColor } from "../utils/colors.js";

function collapsePixelMapForBrush(
  pixelMap: PixelizationResult["pixelMap"],
  profile: DrawingProfile,
): PixelizationResult["pixelMap"] {
  const grid = createBrushGrid(profile);
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

function mergeSimilarColorsInMap(
  pixelMap: PixelizationResult["pixelMap"],
  usedColorIndexes: number[],
  paletteHexes: string[],
  distanceMode: ColorDistanceMode,
  tolerance: number,
): number[] {
  let threshold: number;
  if (distanceMode === "lab") threshold = tolerance * 4;
  else if (distanceMode === "weighted") threshold = tolerance * 30;
  else threshold = tolerance * 100;
  if (threshold <= 0 || usedColorIndexes.length <= 1) return usedColorIndexes;

  const counts = new Map<number, number>();
  for (const row of pixelMap) {
    for (const pixel of row) {
      if (pixel.colorIndex >= 0) {
        counts.set(pixel.colorIndex, (counts.get(pixel.colorIndex) || 0) + 1);
      }
    }
  }

  const paletteRgb = paletteHexes.map(parseHexColor);
  const used = usedColorIndexes
    .filter((ci) => counts.has(ci))
    .sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0));

  const mergeTo = new Map<number, number>();

  for (const ci of used) {
    if (mergeTo.has(ci)) continue;
    let rep = ci;
    let repN = counts.get(ci) || 0;
    for (const cj of used) {
      if (cj === ci || mergeTo.has(cj)) continue;
      const a = paletteRgb[ci], b = paletteRgb[cj];
      if (a && b && distanceSquared(a, b, distanceMode) < threshold) {
        const n = counts.get(cj) || 0;
        if (n > repN) { rep = cj; repN = n; }
      }
    }
    for (const cj of used) {
      if (cj === rep || mergeTo.has(cj)) continue;
      const a = paletteRgb[rep], b = paletteRgb[cj];
      if (a && b && distanceSquared(a, b, distanceMode) < threshold) {
        mergeTo.set(cj, rep);
      }
    }
  }

  for (const row of pixelMap) {
    for (const pixel of row) {
      const mapped = mergeTo.get(pixel.colorIndex);
      if (mapped !== undefined) {
        pixel.colorIndex = mapped;
        pixel.colorHex = paletteHexes[mapped] || pixel.colorHex;
      }
    }
  }

  return Array.from(
    new Set(
      pixelMap.flatMap((row) =>
        row.filter((pixel) => pixel.alpha > 0).map((pixel) => pixel.colorIndex),
      ),
    ),
  ).sort((a, b) => a - b);
}

export async function pixelizeImage(
  imageSource: ImageSource,
  profile: DrawingProfile,
  options?: {
    imageScalePercent?: number;
    imageOffsetXPercent?: number;
    imageOffsetYPercent?: number;
    removeBackground?: boolean;
    brightness?: number;
    contrast?: number;
    saturation?: number;
    ditherMode?: DitherMode;
    ditherAmount?: number;
    colorDistanceMode?: ColorDistanceMode;
    mergeSimilarColors?: boolean;
    mergeThreshold?: number;
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
  const rawImage = applyImageAdjustments(
    options?.removeBackground ? autoRemoveBackground(resizedImage) : resizedImage,
    {
      brightness: options?.brightness ?? 0,
      contrast: options?.contrast ?? 0,
      saturation: options?.saturation ?? 0,
    },
  );

  const fullPixelMap = quantizePixels(rawImage, {
    colorMode: profile.colorMode,
    colorCount: profile.colorCount,
    monoThreshold: profile.monoThreshold,
    palette: profile.palette,
    ditherMode: options?.ditherMode ?? "none",
    ditherAmount: options?.ditherAmount ?? 1,
    distanceMode: options?.colorDistanceMode ?? "weighted",
  });
  const pixelMap = collapsePixelMapForBrush(fullPixelMap, profile);

  let usedColorIndexes = Array.from(
    new Set(
      pixelMap.flatMap((row) =>
        row.filter((pixel) => pixel.alpha > 0).map((pixel) => pixel.colorIndex),
      ),
    ),
  ).sort((a, b) => a - b);

  if (options?.mergeSimilarColors) {
    usedColorIndexes = mergeSimilarColorsInMap(
      pixelMap,
      usedColorIndexes,
      profile.palette,
      options?.colorDistanceMode ?? "weighted",
      options?.mergeThreshold ?? 40,
    );
  }

  const colorCounts: Record<number, number> = {};
  for (const row of pixelMap) {
    for (const pixel of row) {
      if (pixel.alpha > 0 && pixel.colorIndex >= 0) {
        colorCounts[pixel.colorIndex] = (colorCounts[pixel.colorIndex] || 0) + 1;
      }
    }
  }

  return {
    pixelMap,
    usedColorIndexes,
    colorCounts,
  };
}

function applyImageAdjustments(
  image: RawImageData,
  options: {
    brightness: number;
    contrast: number;
    saturation: number;
  },
): RawImageData {
  if (options.brightness === 0 && options.contrast === 0 && options.saturation === 0) {
    return image;
  }

  const data = Buffer.from(image.data);
  const contrast = (options.contrast + 100) / 100;
  const saturation = (options.saturation + 100) / 100;

  for (let offset = 0; offset < data.length; offset += image.channels) {
    let r = data[offset] ?? 0;
    let g = data[offset + 1] ?? 0;
    let b = data[offset + 2] ?? 0;

    r += options.brightness;
    g += options.brightness;
    b += options.brightness;
    r = (r - 128) * contrast + 128;
    g = (g - 128) * contrast + 128;
    b = (b - 128) * contrast + 128;

    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    r = luminance + (r - luminance) * saturation;
    g = luminance + (g - luminance) * saturation;
    b = luminance + (b - luminance) * saturation;

    data[offset] = Math.max(0, Math.min(255, Math.round(r)));
    data[offset + 1] = Math.max(0, Math.min(255, Math.round(g)));
    data[offset + 2] = Math.max(0, Math.min(255, Math.round(b)));
  }

  return {
    ...image,
    data,
  };
}
