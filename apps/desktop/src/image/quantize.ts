import * as iq from "image-q";

import type { ColorDistanceMode, ColorMode, DitherMode, Pixel, PixelMap, RgbColor } from "../types.js";
import {
  colorDistanceSquared,
  compositeOnWhite,
  luminance,
  parseHexColor,
  rgbToHex,
} from "../utils/colors.js";

const TRANSPARENCY_ALPHA_THRESHOLD = 16;
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((value) => value / 16 - 0.5));

function isTransparentAlpha(alpha: number): boolean {
  return alpha <= TRANSPARENCY_ALPHA_THRESHOLD;
}

function rgbToLab(color: RgbColor): [number, number, number] {
  const pivotRgb = (value: number) => {
    const normalized = value / 255;
    return normalized > 0.04045
      ? ((normalized + 0.055) / 1.055) ** 2.4
      : normalized / 12.92;
  };
  const r = pivotRgb(color.r);
  const g = pivotRgb(color.g);
  const b = pivotRgb(color.b);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const pivotXyz = (value: number) =>
    value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const fx = pivotXyz(x);
  const fy = pivotXyz(y);
  const fz = pivotXyz(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function distanceSquared(a: RgbColor, b: RgbColor, mode: ColorDistanceMode): number {
  if (mode === "lab") {
    const [l1, a1, b1] = rgbToLab(a);
    const [l2, a2, b2] = rgbToLab(b);
    return (l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2;
  }

  if (mode === "weighted") {
    const redMean = (a.r + b.r) / 2;
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return ((512 + redMean) * dr * dr) / 256 + 4 * dg * dg + ((767 - redMean) * db * db) / 256;
  }

  return colorDistanceSquared(a, b);
}

function nearestPaletteEntry(
  rgb: RgbColor,
  paletteEntries: Array<{
    colorHex: string;
    colorIndex: number;
    rgb: RgbColor;
  }>,
  distanceMode: ColorDistanceMode,
) {
  let nearestColor = paletteEntries[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const entry of paletteEntries) {
    const distance = distanceSquared(rgb, entry.rgb, distanceMode);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestColor = entry;
    }
  }

  return nearestColor;
}

function buildDitheredFixedPalettePixelMap(
  image: {
    width: number;
    height: number;
    channels: number;
    data: Buffer;
  },
  paletteEntries: Array<{
    colorHex: string;
    colorIndex: number;
    rgb: RgbColor;
  }>,
  options: {
    distanceMode: ColorDistanceMode;
    ditherMode: DitherMode;
    ditherAmount: number;
  },
): PixelMap {
  const pixelMap: PixelMap = [];
  const buffer = new Float32Array(image.width * image.height * 3);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const sourceOffset = (y * image.width + x) * image.channels;
      const targetOffset = (y * image.width + x) * 3;
      const alpha = image.channels >= 4 ? (image.data[sourceOffset + 3] ?? 255) : 255;
      const rgb = compositeOnWhite(
        image.data[sourceOffset] ?? 0,
        image.data[sourceOffset + 1] ?? 0,
        image.data[sourceOffset + 2] ?? 0,
        alpha,
      );
      buffer[targetOffset] = rgb.r;
      buffer[targetOffset + 1] = rgb.g;
      buffer[targetOffset + 2] = rgb.b;
    }
  }

  const addError = (x: number, y: number, er: number, eg: number, eb: number, weight: number) => {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
      return;
    }
    const offset = (y * image.width + x) * 3;
    buffer[offset] = (buffer[offset] ?? 0) + er * weight;
    buffer[offset + 1] = (buffer[offset + 1] ?? 0) + eg * weight;
    buffer[offset + 2] = (buffer[offset + 2] ?? 0) + eb * weight;
  };

  for (let y = 0; y < image.height; y += 1) {
    const row: Pixel[] = [];

    for (let x = 0; x < image.width; x += 1) {
      const imageOffset = (y * image.width + x) * image.channels;
      const alpha = image.channels >= 4 ? (image.data[imageOffset + 3] ?? 255) : 255;

      if (isTransparentAlpha(alpha)) {
        row.push({ x, y, colorIndex: -1, colorHex: "#ffffff", alpha: 0 });
        continue;
      }

      const offset = (y * image.width + x) * 3;
      const orderedOffset =
        options.ditherMode === "ordered" ? (BAYER4[y % 4]?.[x % 4] ?? 0) * 64 * options.ditherAmount : 0;
      const rgb = {
        r: (buffer[offset] ?? 0) + orderedOffset,
        g: (buffer[offset + 1] ?? 0) + orderedOffset,
        b: (buffer[offset + 2] ?? 0) + orderedOffset,
      };
      const nearest = nearestPaletteEntry(rgb, paletteEntries, options.distanceMode);
      const selected = nearest ?? paletteEntries[0];

      row.push({
        x,
        y,
        colorIndex: selected?.colorIndex ?? 0,
        colorHex: selected?.colorHex ?? "#000000",
        alpha: 255,
      });

      if (options.ditherMode === "fs" || options.ditherMode === "atkinson") {
        const er = (rgb.r - (selected?.rgb.r ?? 0)) * options.ditherAmount;
        const eg = (rgb.g - (selected?.rgb.g ?? 0)) * options.ditherAmount;
        const eb = (rgb.b - (selected?.rgb.b ?? 0)) * options.ditherAmount;

        if (options.ditherMode === "fs") {
          addError(x + 1, y, er, eg, eb, 7 / 16);
          addError(x - 1, y + 1, er, eg, eb, 3 / 16);
          addError(x, y + 1, er, eg, eb, 5 / 16);
          addError(x + 1, y + 1, er, eg, eb, 1 / 16);
        } else {
          const weight = 1 / 8;
          addError(x + 1, y, er, eg, eb, weight);
          addError(x + 2, y, er, eg, eb, weight);
          addError(x - 1, y + 1, er, eg, eb, weight);
          addError(x, y + 1, er, eg, eb, weight);
          addError(x + 1, y + 1, er, eg, eb, weight);
          addError(x, y + 2, er, eg, eb, weight);
        }
      }
    }

    pixelMap.push(row);
  }

  return pixelMap;
}

function buildMonoPixelMap(
  image: {
    width: number;
    height: number;
    channels: number;
    data: Buffer;
  },
  options: {
    monoThreshold: number;
    palette: string[];
    distanceMode: ColorDistanceMode;
    ditherMode: DitherMode;
    ditherAmount: number;
  },
): PixelMap {
  const monoPalette = options.palette.slice(0, 2);
  const monoEntries = monoPalette.map((colorHex, colorIndex) => ({
    colorHex,
    colorIndex,
    rgb: parseHexColor(colorHex),
  }));

  if (options.ditherMode !== "none" && monoEntries.length >= 2) {
    return buildDitheredFixedPalettePixelMap(image, monoEntries, options);
  }

  const pixelMap: PixelMap = [];

  for (let y = 0; y < image.height; y += 1) {
    const row: Pixel[] = [];

    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * image.channels;
      const r = image.data[offset] ?? 0;
      const g = image.data[offset + 1] ?? 0;
      const b = image.data[offset + 2] ?? 0;
      const a = image.channels >= 4 ? (image.data[offset + 3] ?? 255) : 255;

      if (isTransparentAlpha(a)) {
        row.push({
          x,
          y,
          colorIndex: -1,
          colorHex: "#ffffff",
          alpha: 0,
        });
        continue;
      }

      const rgb = compositeOnWhite(r, g, b, a);
      const colorIndex = luminance(rgb) < options.monoThreshold ? 0 : Math.min(1, monoPalette.length - 1);

      row.push({
        x,
        y,
        colorIndex,
        colorHex: monoPalette[colorIndex] ?? monoPalette[0] ?? "#000000",
        alpha: 255,
      });
    }

    pixelMap.push(row);
  }

  return pixelMap;
}

function buildPalettePixelMap(
  image: {
    width: number;
    height: number;
    channels: number;
    data: Buffer;
  },
  options: {
    palette: string[];
  },
): PixelMap {
  const source = iq.utils.PointContainer.fromBuffer(image.data, image.width, image.height);
  const palette = iq.buildPaletteSync([source], {
    colors: Math.max(2, options.palette.length),
    paletteQuantization: "wuquant",
    colorDistanceFormula: "euclidean-bt709",
  });
  const reduced = iq.applyPaletteSync(source, palette, {
    colorDistanceFormula: "euclidean-bt709",
    imageQuantization: "nearest",
  });
  const palettePoints = palette.getPointContainer().getPointArray();
  const paletteHexes = palettePoints.map((point) =>
    rgbToHex({ r: point.r, g: point.g, b: point.b }),
  );
  const paletteIndexByHex = new Map<string, number>();

  paletteHexes.forEach((hex, index) => {
    if (!paletteIndexByHex.has(hex)) {
      paletteIndexByHex.set(hex, index);
    }
  });

  const reducedPixels = reduced.toUint8Array();
  const pixelMap: PixelMap = [];

  for (let y = 0; y < image.height; y += 1) {
    const row: Pixel[] = [];

    for (let x = 0; x < image.width; x += 1) {
      const imageOffset = (y * image.width + x) * image.channels;
      const sourceAlpha = image.channels >= 4 ? (image.data[imageOffset + 3] ?? 255) : 255;

      if (isTransparentAlpha(sourceAlpha)) {
        row.push({
          x,
          y,
          colorIndex: -1,
          colorHex: "#ffffff",
          alpha: 0,
        });
        continue;
      }

      const offset = (y * image.width + x) * 4;
      const colorHex = rgbToHex({
        r: reducedPixels[offset] ?? 0,
        g: reducedPixels[offset + 1] ?? 0,
        b: reducedPixels[offset + 2] ?? 0,
      });
      const colorIndex = paletteIndexByHex.get(colorHex) ?? 0;

      row.push({
        x,
        y,
        colorIndex,
        colorHex,
        alpha: 255,
      });
    }

    pixelMap.push(row);
  }

  return pixelMap;
}

function buildFixedPalettePixelMap(
  image: {
    width: number;
    height: number;
    channels: number;
    data: Buffer;
  },
  paletteEntries: Array<{
    colorHex: string;
    colorIndex: number;
    rgb: RgbColor;
  }>,
  options: {
    distanceMode: ColorDistanceMode;
    ditherMode: DitherMode;
    ditherAmount: number;
  },
): PixelMap {
  if (options.ditherMode !== "none") {
    return buildDitheredFixedPalettePixelMap(image, paletteEntries, options);
  }

  const pixelMap: PixelMap = [];

  for (let y = 0; y < image.height; y += 1) {
    const row: Pixel[] = [];

    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * image.channels;
      const r = image.data[offset] ?? 0;
      const g = image.data[offset + 1] ?? 0;
      const b = image.data[offset + 2] ?? 0;
      const a = image.channels >= 4 ? (image.data[offset + 3] ?? 255) : 255;

      if (isTransparentAlpha(a)) {
        row.push({
          x,
          y,
          colorIndex: -1,
          colorHex: "#ffffff",
          alpha: 0,
        });
        continue;
      }

      const rgb = compositeOnWhite(r, g, b, a);

      const nearestColor = nearestPaletteEntry(rgb, paletteEntries, options.distanceMode);

      row.push({
        x,
        y,
        colorIndex: nearestColor?.colorIndex ?? 0,
        colorHex: nearestColor?.colorHex ?? "#000000",
        alpha: 255,
      });
    }

    pixelMap.push(row);
  }

  return pixelMap;
}

function findNearestPaletteEntry(
  rgb: RgbColor,
  paletteEntries: Array<{
    colorHex: string;
    colorIndex: number;
    rgb: RgbColor;
  }>,
  distanceMode: ColorDistanceMode,
) {
  return nearestPaletteEntry(rgb, paletteEntries, distanceMode);
}

function buildOfficialPalettePixelMap(
  image: {
    width: number;
    height: number;
    channels: number;
    data: Buffer;
  },
  options: {
    palette: string[];
    colorCount: number;
    distanceMode: ColorDistanceMode;
    ditherMode: DitherMode;
    ditherAmount: number;
  },
): PixelMap {
  const officialPaletteEntries = options.palette.map((colorHex, colorIndex) => ({
    colorHex,
    colorIndex,
    rgb: parseHexColor(colorHex),
  }));
  const source = iq.utils.PointContainer.fromBuffer(image.data, image.width, image.height);
  const adaptivePalette = iq.buildPaletteSync([source], {
    colors: Math.max(2, Math.min(options.colorCount, options.palette.length)),
    paletteQuantization: "wuquant",
    colorDistanceFormula: "euclidean-bt709",
  });
  const adaptivePalettePoints = adaptivePalette.getPointContainer().getPointArray();
  const selectedEntries: Array<{
    colorHex: string;
    colorIndex: number;
    rgb: RgbColor;
  }> = [];
  const seenOfficialIndexes = new Set<number>();

  for (const point of adaptivePalettePoints) {
    const nearestEntry = findNearestPaletteEntry(
      { r: point.r, g: point.g, b: point.b },
      officialPaletteEntries,
      options.distanceMode,
    );

    if (!nearestEntry || seenOfficialIndexes.has(nearestEntry.colorIndex)) {
      continue;
    }

    selectedEntries.push(nearestEntry);
    seenOfficialIndexes.add(nearestEntry.colorIndex);
  }

  if (selectedEntries.length === 0 && officialPaletteEntries[0]) {
    selectedEntries.push(officialPaletteEntries[0]);
  }

  return buildFixedPalettePixelMap(image, selectedEntries, options);
}

export function quantizePixels(
  image: {
    width: number;
    height: number;
    channels: number;
    data: Buffer;
  },
  options: {
    colorMode: ColorMode;
    colorCount: number;
    monoThreshold: number;
    palette: string[];
    distanceMode?: ColorDistanceMode;
    ditherMode?: DitherMode;
    ditherAmount?: number;
  },
): PixelMap {
  const normalizedOptions = {
    ...options,
    distanceMode: options.distanceMode ?? "weighted",
    ditherMode: options.ditherMode ?? "none",
    ditherAmount: Math.max(0, Math.min(1, options.ditherAmount ?? 1)),
  };

  if (options.colorMode === "mono") {
    return buildMonoPixelMap(image, normalizedOptions);
  }

  if (options.colorMode === "official") {
    return buildOfficialPalettePixelMap(image, normalizedOptions);
  }

  return buildPalettePixelMap(image, options);
}
