import type {
  NoiseCleanupMode,
  NoiseCleanupStats,
  Pixel,
  PixelMap,
  PixelMapNoiseStats,
  RgbColor,
} from "../types.js";
import { colorDistanceSquared, parseHexColor } from "../utils/colors.js";

export const NOISE_CLEANUP_THRESHOLDS: Record<NoiseCleanupMode, number> = {
  off: 0,
  light: 4,
  standard: 12,
  strong: 24,
};

const NEIGHBOR_OFFSETS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
] as const;

interface NoiseComponent {
  colorIndex: number;
  colorHex: string;
  pixels: Pixel[];
  keys: Set<string>;
}

interface NeighborCandidate {
  colorIndex: number;
  colorHex: string;
  count: number;
  distance: number;
}

export interface CleanupPixelMapNoiseOptions {
  mode?: NoiseCleanupMode;
  thresholdCells?: number;
}

export interface CleanupPixelMapNoiseResult {
  pixelMap: PixelMap;
  stats: NoiseCleanupStats;
}

export function cleanupPixelMapNoise(
  pixelMap: PixelMap,
  options: CleanupPixelMapNoiseOptions = {},
): CleanupPixelMapNoiseResult {
  const mode = options.mode ?? "off";
  const thresholdCells = mode === "off"
    ? 0
    : Math.max(0, Math.floor(options.thresholdCells ?? NOISE_CLEANUP_THRESHOLDS[mode]));
  const before = calculatePixelMapNoiseStats(pixelMap, thresholdCells);

  if (thresholdCells <= 0) {
    const cloned = clonePixelMap(pixelMap);

    return {
      pixelMap: cloned,
      stats: {
        mode,
        thresholdCells,
        changedCellCount: 0,
        before,
        after: before,
      },
    };
  }

  const components = collectNoiseComponents(pixelMap);
  const output = clonePixelMap(pixelMap);

  for (const component of components) {
    if (component.pixels.length >= thresholdCells) {
      continue;
    }

    const target = chooseNeighborMergeTarget(pixelMap, component);

    if (!target) {
      continue;
    }

    for (const pixel of component.pixels) {
      const outputPixel = output[pixel.y]?.[pixel.x];

      if (!outputPixel) {
        continue;
      }

      outputPixel.colorIndex = target.colorIndex;
      outputPixel.colorHex = target.colorHex;
    }
  }

  const after = calculatePixelMapNoiseStats(output, thresholdCells);

  return {
    pixelMap: output,
    stats: {
      mode,
      thresholdCells,
      changedCellCount: countChangedCells(pixelMap, output),
      before,
      after,
    },
  };
}

export function calculatePixelMapNoiseStats(
  pixelMap: PixelMap,
  thresholdCells: number,
): PixelMapNoiseStats {
  const usedColorIndexes = new Set<number>();
  let drawableCellCount = 0;
  let tinyComponentCount = 0;
  const components = collectNoiseComponents(pixelMap);

  for (const component of components) {
    usedColorIndexes.add(component.colorIndex);
    drawableCellCount += component.pixels.length;

    if (thresholdCells > 0 && component.pixels.length < thresholdCells) {
      tinyComponentCount += 1;
    }
  }

  return {
    thresholdCells,
    usedColorCount: usedColorIndexes.size,
    drawableCellCount,
    connectedComponentCount: components.length,
    tinyComponentCount,
  };
}

export function getNoiseCleanupThresholdCells(mode: NoiseCleanupMode): number {
  return NOISE_CLEANUP_THRESHOLDS[mode];
}

function clonePixelMap(pixelMap: PixelMap): PixelMap {
  return pixelMap.map((row) => row.map((pixel) => ({ ...pixel })));
}

function countChangedCells(before: PixelMap, after: PixelMap): number {
  let changed = 0;

  for (let y = 0; y < before.length; y += 1) {
    const beforeRow = before[y] ?? [];
    const afterRow = after[y] ?? [];

    for (let x = 0; x < beforeRow.length; x += 1) {
      const beforePixel = beforeRow[x];
      const afterPixel = afterRow[x];

      if (!beforePixel || !afterPixel) {
        continue;
      }

      if (
        beforePixel.colorIndex !== afterPixel.colorIndex ||
        beforePixel.colorHex !== afterPixel.colorHex ||
        beforePixel.alpha !== afterPixel.alpha
      ) {
        changed += 1;
      }
    }
  }

  return changed;
}

function collectNoiseComponents(pixelMap: PixelMap): NoiseComponent[] {
  const visited = new Set<string>();
  const components: NoiseComponent[] = [];

  for (let y = 0; y < pixelMap.length; y += 1) {
    const row = pixelMap[y] ?? [];

    for (let x = 0; x < row.length; x += 1) {
      const pixel = row[x];

      if (!pixel || !isDrawable(pixel)) {
        continue;
      }

      const startKey = pixelKey(pixel);

      if (visited.has(startKey)) {
        continue;
      }

      const stack = [pixel];
      const pixels: Pixel[] = [];
      const keys = new Set<string>();
      visited.add(startKey);

      while (stack.length > 0) {
        const current = stack.pop()!;
        const currentKey = pixelKey(current);
        pixels.push(current);
        keys.add(currentKey);

        for (const offset of NEIGHBOR_OFFSETS) {
          const neighbor = getPixel(pixelMap, current.x + offset.dx, current.y + offset.dy);

          if (!neighbor || !isDrawable(neighbor) || neighbor.colorIndex !== pixel.colorIndex) {
            continue;
          }

          const neighborKey = pixelKey(neighbor);

          if (visited.has(neighborKey)) {
            continue;
          }

          visited.add(neighborKey);
          stack.push(neighbor);
        }
      }

      components.push({
        colorIndex: pixel.colorIndex,
        colorHex: pixel.colorHex,
        pixels,
        keys,
      });
    }
  }

  return components;
}

function chooseNeighborMergeTarget(
  pixelMap: PixelMap,
  component: NoiseComponent,
): { colorIndex: number; colorHex: string } | null {
  const componentRgb = parseRgb(component.colorHex);
  const borderPixels = new Map<string, Pixel>();

  for (const pixel of component.pixels) {
    for (const offset of NEIGHBOR_OFFSETS) {
      const neighbor = getPixel(pixelMap, pixel.x + offset.dx, pixel.y + offset.dy);

      if (!neighbor || !isDrawable(neighbor) || component.keys.has(pixelKey(neighbor))) {
        continue;
      }

      borderPixels.set(pixelKey(neighbor), neighbor);
    }
  }

  const candidatesByColor = new Map<number, NeighborCandidate>();

  for (const neighbor of Array.from(borderPixels.values()).sort(comparePixelPosition)) {
    const rgb = parseRgb(neighbor.colorHex);
    const existing = candidatesByColor.get(neighbor.colorIndex);

    if (existing) {
      existing.count += 1;
      continue;
    }

    candidatesByColor.set(neighbor.colorIndex, {
      colorIndex: neighbor.colorIndex,
      colorHex: neighbor.colorHex,
      count: 1,
      distance: colorDistanceSquared(componentRgb, rgb),
    });
  }

  const candidates = Array.from(candidatesByColor.values());

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    if (left.count !== right.count) {
      return right.count - left.count;
    }

    if (left.distance !== right.distance) {
      return left.distance - right.distance;
    }

    if (left.colorIndex !== right.colorIndex) {
      return left.colorIndex - right.colorIndex;
    }

    return left.colorHex.localeCompare(right.colorHex);
  });

  const target = candidates[0];

  return target
    ? {
        colorIndex: target.colorIndex,
        colorHex: target.colorHex,
      }
    : null;
}

function isDrawable(pixel: Pixel): boolean {
  return pixel.alpha > 0 && pixel.colorIndex >= 0;
}

function getPixel(pixelMap: PixelMap, x: number, y: number): Pixel | null {
  return pixelMap[y]?.[x] ?? null;
}

function pixelKey(point: { x: number; y: number }): string {
  return `${point.x},${point.y}`;
}

function comparePixelPosition(left: Pixel, right: Pixel): number {
  if (left.y !== right.y) {
    return left.y - right.y;
  }

  return left.x - right.x;
}

function parseRgb(hex: string): RgbColor {
  try {
    return parseHexColor(hex);
  } catch {
    return { r: 0, g: 0, b: 0 };
  }
}
