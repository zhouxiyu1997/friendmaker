import type { Pixel, PixelMap } from "../types.js";

export interface PixelComponentBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface PixelComponent {
  colorIndex: number;
  colorHex: string;
  alpha: number;
  transparent: boolean;
  pixels: Pixel[];
  keys: Set<string>;
  area: number;
  perimeter: number;
  bounds: PixelComponentBounds;
  touchesEdge: boolean;
}

export interface PixelMapComponentStats {
  thresholdCells: number;
  usedColorCount: number;
  drawableCellCount: number;
  transparentCellCount: number;
  totalComponentCount: number;
  drawableComponentCount: number;
  transparentComponentCount: number;
  tinyDrawableComponentCount: number;
  tinyTransparentComponentCount: number;
  largestDrawableComponentArea: number;
  largestTransparentComponentArea: number;
  totalDrawablePerimeter: number;
  totalTransparentPerimeter: number;
  edgeTouchingDrawableComponentCount: number;
  edgeTouchingTransparentComponentCount: number;
}

const NEIGHBOR_OFFSETS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
] as const;

export function collectConnectedPixelComponents(pixels: Pixel[]): Pixel[][] {
  if (pixels.length === 0) {
    return [];
  }

  const pixelByKey = new Map<string, Pixel>(pixels.map((pixel) => [pixelKey(pixel), pixel]));
  const visited = new Set<string>();
  const components: Pixel[][] = [];

  for (const pixel of pixels) {
    const startKey = pixelKey(pixel);

    if (visited.has(startKey)) {
      continue;
    }

    const stack = [pixel];
    const component: Pixel[] = [];
    visited.add(startKey);

    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);

      for (const offset of NEIGHBOR_OFFSETS) {
        const neighbor = pixelByKey.get(
          pixelKey({ x: current.x + offset.dx, y: current.y + offset.dy }),
        );

        if (!neighbor) {
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

    components.push(component);
  }

  return components;
}

export function collectPixelMapComponents(
  pixelMap: PixelMap,
  options: { includeTransparent?: boolean } = {},
): PixelComponent[] {
  const includeTransparent = options.includeTransparent === true;
  const visited = new Set<string>();
  const components: PixelComponent[] = [];
  const height = pixelMap.length;
  const width = Math.max(0, ...pixelMap.map((row) => row.length));

  for (let y = 0; y < pixelMap.length; y += 1) {
    const row = pixelMap[y] ?? [];

    for (let x = 0; x < row.length; x += 1) {
      const pixel = row[x];

      if (!pixel) {
        continue;
      }

      const transparent = isTransparent(pixel);

      if (transparent && !includeTransparent) {
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

          if (!neighbor || !sameComponentColor(pixel, neighbor)) {
            continue;
          }

          const neighborTransparent = isTransparent(neighbor);

          if (neighborTransparent && !includeTransparent) {
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

      components.push(buildComponent(pixelMap, pixels, keys, transparent, width, height));
    }
  }

  return components;
}

export function calculatePixelMapComponentStats(
  pixelMap: PixelMap,
  options: { thresholdCells?: number; includeTransparent?: boolean } = {},
): PixelMapComponentStats {
  const thresholdCells = Math.max(0, Math.floor(options.thresholdCells ?? 0));
  const components = collectPixelMapComponents(pixelMap, {
    includeTransparent: options.includeTransparent ?? true,
  });
  const usedColorIndexes = new Set<number>();
  let drawableCellCount = 0;
  let transparentCellCount = 0;
  let drawableComponentCount = 0;
  let transparentComponentCount = 0;
  let tinyDrawableComponentCount = 0;
  let tinyTransparentComponentCount = 0;
  let largestDrawableComponentArea = 0;
  let largestTransparentComponentArea = 0;
  let totalDrawablePerimeter = 0;
  let totalTransparentPerimeter = 0;
  let edgeTouchingDrawableComponentCount = 0;
  let edgeTouchingTransparentComponentCount = 0;

  for (const component of components) {
    if (component.transparent) {
      transparentCellCount += component.area;
      transparentComponentCount += 1;
      totalTransparentPerimeter += component.perimeter;
      largestTransparentComponentArea = Math.max(largestTransparentComponentArea, component.area);

      if (thresholdCells > 0 && component.area < thresholdCells) {
        tinyTransparentComponentCount += 1;
      }

      if (component.touchesEdge) {
        edgeTouchingTransparentComponentCount += 1;
      }
      continue;
    }

    usedColorIndexes.add(component.colorIndex);
    drawableCellCount += component.area;
    drawableComponentCount += 1;
    totalDrawablePerimeter += component.perimeter;
    largestDrawableComponentArea = Math.max(largestDrawableComponentArea, component.area);

    if (thresholdCells > 0 && component.area < thresholdCells) {
      tinyDrawableComponentCount += 1;
    }

    if (component.touchesEdge) {
      edgeTouchingDrawableComponentCount += 1;
    }
  }

  return {
    thresholdCells,
    usedColorCount: usedColorIndexes.size,
    drawableCellCount,
    transparentCellCount,
    totalComponentCount: components.length,
    drawableComponentCount,
    transparentComponentCount,
    tinyDrawableComponentCount,
    tinyTransparentComponentCount,
    largestDrawableComponentArea,
    largestTransparentComponentArea,
    totalDrawablePerimeter,
    totalTransparentPerimeter,
    edgeTouchingDrawableComponentCount,
    edgeTouchingTransparentComponentCount,
  };
}

function buildComponent(
  pixelMap: PixelMap,
  pixels: Pixel[],
  keys: Set<string>,
  transparent: boolean,
  width: number,
  height: number,
): PixelComponent {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;
  let perimeter = 0;

  for (const pixel of pixels) {
    minX = Math.min(minX, pixel.x);
    minY = Math.min(minY, pixel.y);
    maxX = Math.max(maxX, pixel.x);
    maxY = Math.max(maxY, pixel.y);

    for (const offset of NEIGHBOR_OFFSETS) {
      const neighbor = getPixel(pixelMap, pixel.x + offset.dx, pixel.y + offset.dy);

      if (!neighbor || !keys.has(pixelKey(neighbor))) {
        perimeter += 1;
      }
    }
  }

  return {
    colorIndex: transparent ? -1 : pixels[0]?.colorIndex ?? -1,
    colorHex: transparent ? "#ffffff" : pixels[0]?.colorHex ?? "#ffffff",
    alpha: transparent ? 0 : pixels[0]?.alpha ?? 0,
    transparent,
    pixels,
    keys,
    area: pixels.length,
    perimeter,
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX >= minX ? maxX - minX + 1 : 0,
      height: maxY >= minY ? maxY - minY + 1 : 0,
    },
    touchesEdge: minX <= 0 || minY <= 0 || maxX >= width - 1 || maxY >= height - 1,
  };
}

function sameComponentColor(left: Pixel, right: Pixel): boolean {
  const leftTransparent = isTransparent(left);
  const rightTransparent = isTransparent(right);

  if (leftTransparent || rightTransparent) {
    return leftTransparent && rightTransparent;
  }

  return left.colorIndex === right.colorIndex;
}

function isTransparent(pixel: Pixel): boolean {
  return pixel.alpha <= 0 || pixel.colorIndex < 0;
}

function getPixel(pixelMap: PixelMap, x: number, y: number): Pixel | null {
  return pixelMap[y]?.[x] ?? null;
}

function pixelKey(point: { x: number; y: number }): string {
  return `${point.x},${point.y}`;
}
