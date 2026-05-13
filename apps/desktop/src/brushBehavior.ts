import {
  inputConfigCommand,
  moveCommand,
  pressButtonCommand,
  waitCommand,
  type DrawCommand,
} from "./protocol/commands.js";
import { DEFAULT_SAFE_INPUT_TIMING } from "./protocol/timing.js";
import type { BrushShape, BrushSize, DrawingProfile } from "./types.js";

const BRUSH_PICKER_EXIT_SETTLE_MS = 3_000;
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

export function buildAutomaticBrushSetupCommands(
  profile: Pick<
    DrawingProfile,
    "brushSize" | "brushShape" | "buttonPressDuration" | "inputDelay" | "homeDuration"
  >,
): DrawCommand[] {
  // Assumption: after pressing X twice, the brush picker opens with the 7px
  // round brush focused at row 0 / column 2. The current UI then lays out
  // round and square brushes as two rows of the same six size presets. After
  // choosing the target brush with A, the game still needs two more A presses
  // to leave the brush picker and then about three seconds before the canvas
  // starts accepting movement input again.
  const targetColumn = BRUSH_SELECTOR_COLUMN_BY_SIZE[profile.brushSize];
  const targetRow = BRUSH_SELECTOR_ROW_BY_SHAPE[profile.brushShape];
  const dx = targetColumn - DEFAULT_BRUSH_SELECTOR_COLUMN;
  const dy = targetRow - DEFAULT_BRUSH_SELECTOR_ROW;
  const brushSetupButtonPressMs = Math.max(
    profile.buttonPressDuration,
    DEFAULT_SAFE_INPUT_TIMING.buttonPressMs,
  );
  const brushSetupInputDelayMs = Math.max(profile.inputDelay, DEFAULT_SAFE_INPUT_TIMING.inputDelayMs);
  const needsBrushSetupTimingOverride =
    brushSetupButtonPressMs !== profile.buttonPressDuration ||
    brushSetupInputDelayMs !== profile.inputDelay;
  const commands: DrawCommand[] = [];

  if (needsBrushSetupTimingOverride) {
    commands.push(
      inputConfigCommand(
        brushSetupButtonPressMs,
        brushSetupInputDelayMs,
        profile.homeDuration,
      ),
    );
  }

  commands.push(pressButtonCommand("X"), pressButtonCommand("X"));

  if (dx !== 0 || dy !== 0) {
    commands.push(moveCommand(dx, dy));
  }

  commands.push(pressButtonCommand("A"));
  commands.push(pressButtonCommand("A"));
  commands.push(pressButtonCommand("A"));
  commands.push(waitCommand(BRUSH_PICKER_EXIT_SETTLE_MS));

  if (needsBrushSetupTimingOverride) {
    commands.push(
      inputConfigCommand(
        profile.buttonPressDuration,
        profile.inputDelay,
        profile.homeDuration,
      ),
    );
  }

  return commands;
}
