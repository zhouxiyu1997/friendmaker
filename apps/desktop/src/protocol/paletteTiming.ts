import type { InputTiming } from "./timing.js";

const COLOR_PALETTE_SLOT_COUNT = 9;
const COLOR_PALETTE_RESET_TO_BOTTOM_STEPS = 18;
const COLOR_PALETTE_MENU_PRESS_DURATION_MS = 90;
const COLOR_PALETTE_MENU_INPUT_DELAY_MS = 500;
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
const COLOR_PALETTE_EDITOR_DARK_VALUE_FINE_STEPS = 12;
const BASIC_COLOR_GRID_ROWS = 7;
const BASIC_COLOR_GRID_COLS = 12;
const BASIC_COLOR_TAB_SETTLE_MS = 140;
const PALETTE_CONFIG_TIMEOUT_MARGIN_MS = 2_000;

interface HsvColor {
  hue: number;
  saturation: number;
  value: number;
}

interface PaletteTimingOptions {
  includeTimeoutMargin?: boolean;
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

function splitPaletteValueDropSteps(valueDropSteps: number): {
  coarseValueSteps: number;
  fineValueSteps: number;
} {
  const normalizedSteps = valueDropSteps < 0 ? 0 : valueDropSteps;
  const fineValueSteps = Math.min(normalizedSteps, COLOR_PALETTE_EDITOR_DARK_VALUE_FINE_STEPS);

  return {
    coarseValueSteps: normalizedSteps - fineValueSteps,
    fineValueSteps,
  };
}

function timeoutMargin(options: PaletteTimingOptions): number {
  return options.includeTimeoutMargin ? PALETTE_CONFIG_TIMEOUT_MARGIN_MS : 0;
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
  const { coarseValueSteps, fineValueSteps } = splitPaletteValueDropSteps(valueDropSteps);
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
    (coarseValueSteps > 0
      ? coarseValueSteps * COLOR_PALETTE_EDITOR_MOVE_STEP_MS + timing.inputDelayMs
      : 0) +
    fineValueSteps * generalPressMs +
    3 * menuPressMs +
    timing.inputDelayMs +
    timeoutMargin(options)
  );
}

export function estimateBasicPaletteConfigDurationMs(
  slotIndex: number,
  _targetRow: number,
  _targetCol: number,
  timing: InputTiming,
  options: PaletteTimingOptions = {},
): number {
  const menuPressMs = COLOR_PALETTE_MENU_PRESS_DURATION_MS + COLOR_PALETTE_MENU_INPUT_DELAY_MS;
  const maxRowSteps = BASIC_COLOR_GRID_ROWS - 1;
  const maxColSteps = BASIC_COLOR_GRID_COLS - 1;

  return (
    estimatePaletteSlotSelectionDurationMs(slotIndex) +
    menuPressMs +
    COLOR_PALETTE_EDITOR_OPEN_SETTLE_MS +
    menuPressMs +
    BASIC_COLOR_TAB_SETTLE_MS +
    (maxRowSteps + maxColSteps + 1) * menuPressMs +
    timing.inputDelayMs +
    timeoutMargin(options)
  );
}
