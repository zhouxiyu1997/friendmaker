import type { InputTiming } from "./timing.js";
import {
  DEFAULT_PALETTE_VALUE_CALIBRATION,
  estimatePaletteValueMovement,
  type PaletteValueCalibration,
} from "./paletteValueCalibration.js";

const COLOR_PALETTE_SLOT_COUNT = 9;
const COLOR_PALETTE_RESET_TO_BOTTOM_STEPS = 18;
const COLOR_PALETTE_MENU_PRESS_DURATION_MS = 90;
const COLOR_PALETTE_MENU_INPUT_DELAY_MS = 150;
const COLOR_PALETTE_MENU_OPEN_SETTLE_MS = 180;
const COLOR_PALETTE_EDITOR_OPEN_SETTLE_MS = 180;
const COLOR_PALETTE_EDITOR_HUE_RESET_HOLD_MS = 2_500;
const COLOR_PALETTE_EDITOR_HUE_STEP_COUNT = 200;
const COLOR_PALETTE_EDITOR_SATURATION_STEP_COUNT = 213;
const COLOR_PALETTE_EDITOR_VALUE_STEP_COUNT = 112;
const COLOR_PALETTE_EDITOR_RESET_UP_HOLD_MS = 1_500;
const COLOR_PALETTE_EDITOR_RESET_LEFT_HOLD_MS = 3_000;
const COLOR_PALETTE_EDITOR_MOVE_STEP_MS = 20;
const COLOR_PALETTE_EDITOR_HUE_RESET_SETTLE_MS = 500;
const BASIC_COLOR_GRID_ROWS = 7;
const BASIC_COLOR_GRID_COLS = 12;
const BASIC_COLOR_TAB_SETTLE_MS = 140;
const BASIC_COLOR_INITIAL_SLOT_ROWS = [6, 0, 3, 3, 3, 3, 3, 3, 3] as const;
const BASIC_COLOR_INITIAL_SLOT_COLS = [0, 0, 10, 9, 8, 6, 5, 2, 1] as const;
const PALETTE_CONFIG_TIMEOUT_MARGIN_MS = 5_000;

interface HsvColor {
  hue: number;
  saturation: number;
  value: number;
}

interface PaletteTimingOptions {
  includeTimeoutMargin?: boolean;
  basicPaletteState?: BasicPaletteTimingState;
  paletteValueCalibration?: PaletteValueCalibration;
}

export interface BasicPaletteTimingState {
  slotRows: number[];
  slotCols: number[];
}

function clampPaletteSlotIndex(index: number): number {
  if (index < 0) {
    return 0;
  }

  if (index >= COLOR_PALETTE_SLOT_COUNT) {
    return COLOR_PALETTE_SLOT_COUNT - 1;
  }

  return index;
}

function clampBasicColorRow(row: number): number {
  if (row < 0) {
    return 0;
  }

  if (row >= BASIC_COLOR_GRID_ROWS) {
    return BASIC_COLOR_GRID_ROWS - 1;
  }

  return row;
}

function clampBasicColorCol(col: number): number {
  if (col < 0) {
    return 0;
  }

  if (col >= BASIC_COLOR_GRID_COLS) {
    return BASIC_COLOR_GRID_COLS - 1;
  }

  return col;
}

function scaleChannelToSteps(value: number, steps: number): number {
  if (steps <= 0) {
    return 0;
  }

  const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
  return Math.round(clamped * steps);
}

function rgbToHsv(red: number, green: number, blue: number): HsvColor {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maxChannel = Math.max(r, g, b);
  const minChannel = Math.min(r, g, b);
  const delta = maxChannel - minChannel;
  let hue = 0;

  if (delta > 0) {
    if (maxChannel === r) {
      hue = 60 * (((g - b) / delta) % 6);
    } else if (maxChannel === g) {
      hue = 60 * ((b - r) / delta + 2);
    } else {
      hue = 60 * ((r - g) / delta + 4);
    }
  }

  if (hue < 0) {
    hue += 360;
  }

  return {
    hue,
    saturation: maxChannel <= 0 ? 0 : delta / maxChannel,
    value: maxChannel,
  };
}

function timeoutMargin(options: PaletteTimingOptions): number {
  return options.includeTimeoutMargin ? PALETTE_CONFIG_TIMEOUT_MARGIN_MS : 0;
}

export function createBasicPaletteTimingState(): BasicPaletteTimingState {
  return {
    slotRows: [...BASIC_COLOR_INITIAL_SLOT_ROWS],
    slotCols: [...BASIC_COLOR_INITIAL_SLOT_COLS],
  };
}

export function resetBasicPaletteTimingState(state: BasicPaletteTimingState): void {
  state.slotRows = [...BASIC_COLOR_INITIAL_SLOT_ROWS];
  state.slotCols = [...BASIC_COLOR_INITIAL_SLOT_COLS];
}

export function updateBasicPaletteTimingState(
  state: BasicPaletteTimingState,
  slotIndex: number,
  targetRow: number,
  targetCol: number,
): void {
  const normalizedSlot = clampPaletteSlotIndex(slotIndex);

  state.slotRows[normalizedSlot] = clampBasicColorRow(targetRow);
  state.slotCols[normalizedSlot] = clampBasicColorCol(targetCol);
}

export function estimatePaletteSlotSelectionDurationMs(slotIndex: number): number {
  const normalizedSlot = clampPaletteSlotIndex(slotIndex);
  const menuPressMs = COLOR_PALETTE_MENU_PRESS_DURATION_MS + COLOR_PALETTE_MENU_INPUT_DELAY_MS;

  return (
    menuPressMs +
    COLOR_PALETTE_MENU_OPEN_SETTLE_MS +
    COLOR_PALETTE_RESET_TO_BOTTOM_STEPS * menuPressMs +
    (COLOR_PALETTE_SLOT_COUNT - 1 - normalizedSlot) * menuPressMs
  );
}

export function estimateColorSelectDurationMs(
  slotIndex: number,
  timing: InputTiming,
  options: PaletteTimingOptions = {},
): number {
  const menuPressMs = COLOR_PALETTE_MENU_PRESS_DURATION_MS + COLOR_PALETTE_MENU_INPUT_DELAY_MS;

  return (
    estimatePaletteSlotSelectionDurationMs(slotIndex) +
    2 * menuPressMs +
    timing.inputDelayMs +
    timeoutMargin(options)
  );
}

export function estimatePaletteConfigDurationMs(
  slotIndex: number,
  red: number,
  green: number,
  blue: number,
  timing: InputTiming,
  options: PaletteTimingOptions = {},
): number {
  const normalizedSlot = clampPaletteSlotIndex(slotIndex);
  const hsv = rgbToHsv(red, green, blue);
  const hueRatio = hsv.hue <= 0 ? 0 : (360 - hsv.hue) / 360;
  const hueSteps = Math.round(hueRatio * COLOR_PALETTE_EDITOR_HUE_STEP_COUNT);
  const saturationSteps = scaleChannelToSteps(hsv.saturation, COLOR_PALETTE_EDITOR_SATURATION_STEP_COUNT);
  const valueDropSteps = scaleChannelToSteps(1 - hsv.value, COLOR_PALETTE_EDITOR_VALUE_STEP_COUNT);
  const valueMovement = estimatePaletteValueMovement(
    valueDropSteps,
    options.paletteValueCalibration ?? DEFAULT_PALETTE_VALUE_CALIBRATION,
  );
  const generalPressMs = timing.buttonPressMs + timing.inputDelayMs;
  const menuPressMs = COLOR_PALETTE_MENU_PRESS_DURATION_MS + COLOR_PALETTE_MENU_INPUT_DELAY_MS;

  return (
    estimatePaletteSlotSelectionDurationMs(normalizedSlot) +
    menuPressMs +
    COLOR_PALETTE_EDITOR_OPEN_SETTLE_MS +
    menuPressMs +
    BASIC_COLOR_TAB_SETTLE_MS +
    (COLOR_PALETTE_EDITOR_RESET_UP_HOLD_MS + timing.inputDelayMs) +
    (COLOR_PALETTE_EDITOR_RESET_LEFT_HOLD_MS + timing.inputDelayMs) +
    (COLOR_PALETTE_EDITOR_HUE_RESET_HOLD_MS + timing.inputDelayMs) +
    COLOR_PALETTE_EDITOR_HUE_RESET_SETTLE_MS +
    hueSteps * generalPressMs +
    (saturationSteps > 0
      ? saturationSteps * COLOR_PALETTE_EDITOR_MOVE_STEP_MS + timing.inputDelayMs
      : 0) +
    (valueMovement.holdMs > 0 ? valueMovement.holdMs + timing.inputDelayMs : 0) +
    valueMovement.remainingTapSteps * generalPressMs +
    3 * menuPressMs +
    timing.inputDelayMs +
    timeoutMargin(options)
  );
}

export function estimateBasicPaletteConfigDurationMs(
  slotIndex: number,
  targetRow: number,
  targetCol: number,
  timing: InputTiming,
  options: PaletteTimingOptions = {},
): number {
  const normalizedSlot = clampPaletteSlotIndex(slotIndex);
  const normalizedTargetRow = clampBasicColorRow(targetRow);
  const normalizedTargetCol = clampBasicColorCol(targetCol);
  const menuPressMs = COLOR_PALETTE_MENU_PRESS_DURATION_MS + COLOR_PALETTE_MENU_INPUT_DELAY_MS;
  const currentRows = options.basicPaletteState?.slotRows ?? BASIC_COLOR_INITIAL_SLOT_ROWS;
  const currentCols = options.basicPaletteState?.slotCols ?? BASIC_COLOR_INITIAL_SLOT_COLS;
  const currentRow = clampBasicColorRow(currentRows[normalizedSlot] ?? BASIC_COLOR_INITIAL_SLOT_ROWS[normalizedSlot] ?? 0);
  const currentCol = clampBasicColorCol(currentCols[normalizedSlot] ?? BASIC_COLOR_INITIAL_SLOT_COLS[normalizedSlot] ?? 0);
  const gridMoveSteps =
    Math.abs(normalizedTargetRow - currentRow) + Math.abs(normalizedTargetCol - currentCol);

  return (
    estimatePaletteSlotSelectionDurationMs(normalizedSlot) +
    menuPressMs +
    COLOR_PALETTE_EDITOR_OPEN_SETTLE_MS +
    menuPressMs +
    BASIC_COLOR_TAB_SETTLE_MS +
    (gridMoveSteps + 1) * menuPressMs +
    timing.inputDelayMs +
    timeoutMargin(options)
  );
}
