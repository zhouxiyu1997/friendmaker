import { moveCommand, pressButtonCommand, type DrawCommand } from "./protocol/commands.js";
import type { BrushShape, BrushSize, DrawingProfile } from "./types.js";

const HOME_CALIBRATION_PIXELS = 128;
const DEFAULT_BRUSH_SELECTOR_COLUMN = 2;
const DEFAULT_BRUSH_SELECTOR_ROW = 0;
const BRUSH_SELECTOR_ROW_BY_SHAPE: Record<BrushShape, number> = {
  round: 0,
  square: 1,
};
const BRUSH_SELECTOR_COLUMN_BY_SIZE: Record<BrushSize, number> = {
  1: 0,
  3: 1,
  7: 2,
  13: 3,
  19: 4,
  27: 5,
};

export function normalizeBrushShape(
  value: unknown,
  fallback: BrushShape = "square",
): BrushShape {
  if (value === "round" || value === "square") {
    return value;
  }

  return fallback;
}

export function isUnsupportedBrushShapeSelection(
  brushShape: BrushShape,
  brushSize: BrushSize,
): boolean {
  return brushShape === "round" && brushSize > 1;
}

export function getUnsupportedBrushShapeMessage(
  brushShape: BrushShape,
  brushSize: BrushSize,
): string | null {
  if (!isUnsupportedBrushShapeSelection(brushShape, brushSize)) {
    return null;
  }

  return `当前仅支持 1 号圆形笔刷；圆形 ${brushSize} 号大笔刷暂不支持，请切回方形笔刷或使用 1 号笔。`;
}

export function getUnsupportedBrushShapeMessageForProfile(
  profile: Pick<DrawingProfile, "brushShape" | "brushSize">,
): string | null {
  return getUnsupportedBrushShapeMessage(profile.brushShape, profile.brushSize);
}

export function estimateSquareBrushStrideMoveHoldMs(
  stride: number,
  timing: {
    buttonPressMs: number;
    homeMs: number;
  },
): number {
  if (!Number.isFinite(stride) || stride <= 1) {
    return Math.max(1, Math.round(timing.buttonPressMs));
  }

  const normalizedStride = Math.max(1, Math.round(stride));
  const buttonPressMs = Math.max(1, Math.round(timing.buttonPressMs));
  const perPixelHomeMs = Math.max(1, Math.floor(Math.max(1, timing.homeMs) / HOME_CALIBRATION_PIXELS));

  return buttonPressMs + perPixelHomeMs * (normalizedStride - 1);
}

export function buildAutomaticBrushSetupCommands(
  profile: Pick<DrawingProfile, "brushSize" | "brushShape">,
): DrawCommand[] {
  // Assumption: after pressing X twice, the brush picker opens with the 7px
  // round brush focused at row 0 / column 2. The current UI then lays out
  // round and square brushes as two rows of the same six size presets. After
  // choosing the target brush with A, the game still needs two more A presses
  // to leave the brush picker and return to the canvas.
  const targetColumn = BRUSH_SELECTOR_COLUMN_BY_SIZE[profile.brushSize];
  const targetRow = BRUSH_SELECTOR_ROW_BY_SHAPE[profile.brushShape];
  const dx = targetColumn - DEFAULT_BRUSH_SELECTOR_COLUMN;
  const dy = targetRow - DEFAULT_BRUSH_SELECTOR_ROW;
  const commands: DrawCommand[] = [pressButtonCommand("X"), pressButtonCommand("X")];

  if (dx !== 0 || dy !== 0) {
    commands.push(moveCommand(dx, dy));
  }

  commands.push(pressButtonCommand("A"));
  commands.push(pressButtonCommand("A"));
  commands.push(pressButtonCommand("A"));
  return commands;
}
