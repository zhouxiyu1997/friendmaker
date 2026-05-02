import type { DrawingProfile } from "../types.js";

export interface BrushGrid {
  brushSize: number;
  gridWidth: number;
  gridHeight: number;
  originX: number;
  originY: number;
  centerOffset: number;
}

export function resolveBrushGrid(profile: DrawingProfile): BrushGrid {
  const brushSize = Math.max(1, profile.brushSize);
  const gridWidth = Math.floor(Math.max(0, profile.canvasWidth) / brushSize);
  const gridHeight = Math.floor(Math.max(0, profile.canvasHeight) / brushSize);

  return {
    brushSize,
    gridWidth,
    gridHeight,
    originX: Math.floor((profile.canvasWidth - gridWidth * brushSize) / 2),
    originY: Math.floor((profile.canvasHeight - gridHeight * brushSize) / 2),
    centerOffset: Math.floor(brushSize / 2),
  };
}

export function gridCellToCanvasCenter(
  point: { x: number; y: number },
  grid: BrushGrid,
): { x: number; y: number } {
  return {
    x: grid.originX + point.x * grid.brushSize + grid.centerOffset,
    y: grid.originY + point.y * grid.brushSize + grid.centerOffset,
  };
}

export function gridCellToCanvasRect(
  point: { x: number; y: number },
  grid: BrushGrid,
): { x: number; y: number; width: number; height: number; maxX: number; maxY: number } {
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
