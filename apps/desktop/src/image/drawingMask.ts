import type { BrushGrid } from "../brushGrid.js";
import type { DrawingMask, RawImageData } from "../types.js";

export const MIN_DRAWING_MASK_CELL_COVERAGE = 0.5;

export type DrawingMaskCoverageMap = number[][];

export function applyDrawingMask(image: RawImageData, drawingMask: DrawingMask | null): RawImageData {
  if (!drawingMask) {
    return image;
  }

  if (drawingMask.width !== image.width || drawingMask.height !== image.height) {
    throw new Error(
      `Drawing mask size ${drawingMask.width}x${drawingMask.height} does not match image size ${image.width}x${image.height}.`,
    );
  }

  const data = Buffer.from(image.data);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = y * image.width + x;

      if ((drawingMask.alpha[index] ?? 0) > 0) {
        continue;
      }

      const alphaOffset = index * image.channels + Math.min(3, image.channels - 1);
      data[alphaOffset] = 0;
    }
  }

  return {
    width: image.width,
    height: image.height,
    channels: image.channels,
    data,
  };
}

export function createDrawingMaskCoverageMap(
  drawingMask: DrawingMask | null,
  grid: BrushGrid,
): DrawingMaskCoverageMap | null {
  if (!drawingMask) {
    return null;
  }

  const coverageMap: DrawingMaskCoverageMap = [];

  for (let logicalY = 0; logicalY < grid.gridHeight; logicalY += 1) {
    const row: number[] = [];
    const originY = grid.originY + logicalY * grid.brushSize;

    for (let logicalX = 0; logicalX < grid.gridWidth; logicalX += 1) {
      const originX = grid.originX + logicalX * grid.brushSize;
      let coveredPixels = 0;

      for (let dy = 0; dy < grid.brushSize; dy += 1) {
        const y = originY + dy;

        if (y < 0 || y >= drawingMask.height) {
          continue;
        }

        for (let dx = 0; dx < grid.brushSize; dx += 1) {
          const x = originX + dx;

          if (x < 0 || x >= drawingMask.width) {
            continue;
          }

          if ((drawingMask.alpha[y * drawingMask.width + x] ?? 0) > 0) {
            coveredPixels += 1;
          }
        }
      }

      row.push(coveredPixels / (grid.brushSize * grid.brushSize));
    }

    coverageMap.push(row);
  }

  return coverageMap;
}

export function isDrawingMaskCellEnabled(
  coverageMap: DrawingMaskCoverageMap | null,
  point: { x: number; y: number },
): boolean {
  if (!coverageMap) {
    return true;
  }

  return (coverageMap[point.y]?.[point.x] ?? 0) >= MIN_DRAWING_MASK_CELL_COVERAGE;
}
