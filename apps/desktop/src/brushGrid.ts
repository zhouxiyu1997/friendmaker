import type { BrushSize, CanvasBounds } from "./types.js";

export interface BrushGrid {
  canvasWidth: number;
  canvasHeight: number;
  brushSize: BrushSize;
  gridWidth: number;
  gridHeight: number;
  originX: number;
  originY: number;
  centerOffset: number;
}

export function createBrushGrid(options: {
  canvasWidth: number;
  canvasHeight: number;
  brushSize: BrushSize;
}): BrushGrid {
  const brushSize = options.brushSize;
  const gridWidth = Math.floor(options.canvasWidth / brushSize);
  const gridHeight = Math.floor(options.canvasHeight / brushSize);
  const originX = Math.floor((options.canvasWidth - gridWidth * brushSize) / 2);
  const originY = Math.floor((options.canvasHeight - gridHeight * brushSize) / 2);

  return {
    canvasWidth: options.canvasWidth,
    canvasHeight: options.canvasHeight,
    brushSize,
    gridWidth,
    gridHeight,
    originX,
    originY,
    centerOffset: Math.floor(brushSize / 2),
  };
}

export function gridCellToCanvasCenter(
  grid: BrushGrid,
  point: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: grid.originX + point.x * grid.brushSize + grid.centerOffset,
    y: grid.originY + point.y * grid.brushSize + grid.centerOffset,
  };
}

export function gridCellBounds(grid: BrushGrid, point: { x: number; y: number }): CanvasBounds {
  const x = grid.originX + point.x * grid.brushSize;
  const y = grid.originY + point.y * grid.brushSize;

  return {
    x,
    y,
    width: grid.brushSize,
    height: grid.brushSize,
    maxX: x + grid.brushSize - 1,
    maxY: y + grid.brushSize - 1,
  };
}

export function isGridCellInBounds(grid: BrushGrid, point: { x: number; y: number }): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < grid.gridWidth && point.y < grid.gridHeight;
}
