import type { DrawCommand } from "./commands.js";
import type { DrawingProfile } from "../types.js";
import type { InputTiming } from "./timing.js";

export const COLOR_PALETTE_SLOT_COUNT = 9;
export const COLOR_PALETTE_RESET_TO_BOTTOM_STEPS = 18;
export const COLOR_PALETTE_MENU_PRESS_DURATION_MS = 90;
export const COLOR_PALETTE_MENU_INPUT_DELAY_MS = 90;
export const COLOR_PALETTE_MENU_OPEN_SETTLE_MS = 180;
export const COLOR_PALETTE_EDITOR_OPEN_SETTLE_MS = 180;
export const COLOR_PALETTE_EDITOR_HUE_RESET_HOLD_MS = 2_500;
export const COLOR_PALETTE_EDITOR_HUE_STEP_COUNT = 200;
export const COLOR_PALETTE_EDITOR_SATURATION_STEP_COUNT = 213;
export const COLOR_PALETTE_EDITOR_VALUE_STEP_COUNT = 112;
export const COLOR_PALETTE_EDITOR_RESET_UP_HOLD_MS = 1_500;
export const COLOR_PALETTE_EDITOR_RESET_LEFT_HOLD_MS = 3_000;
export const COLOR_PALETTE_EDITOR_MOVE_STEP_MS = 20;
export const BASIC_COLOR_GRID_ROWS = 7;
export const BASIC_COLOR_GRID_COLS = 12;
export const BASIC_COLOR_TAB_SETTLE_MS = 140;
export const BASIC_COLOR_INITIAL_SLOT_ROWS = [6, 0, 3, 3, 3, 3, 3, 3, 3] as const;
export const BASIC_COLOR_INITIAL_SLOT_COLS = [0, 0, 10, 9, 8, 6, 5, 2, 1] as const;
export const PALETTE_CONFIG_TIMEOUT_MARGIN_MS = 2_000;

export interface CommandRuntimeBreakdown {
  totalMs: number;
  inputConfigMs: number;
  homeMs: number;
  canvasMoveMs: number;
  drawMs: number;
  colorSelectMs: number;
  paletteConfigMs: number;
  basicPaletteConfigMs: number;
  menuUtilityMs: number;
  holdMs: number;
  waitMs: number;
  controlMs: number;
  commandCount: number;
  moveStepCount: number;
  lineStepCount: number;
  drawPressCount: number;
  colorSelectCount: number;
  paletteConfigCount: number;
  basicPaletteConfigCount: number;
  holdCount: number;
}

interface HsvColor {
  hue: number;
  saturation: number;
  value: number;
}

interface BasicPaletteTrackingState {
  ready: boolean;
  rows: number[];
  cols: number[];
}

export function calculateCommandRuntimeBreakdown(
  commands: DrawCommand[],
  profile: DrawingProfile,
): CommandRuntimeBreakdown {
  let timing: InputTiming = {
    buttonPressMs: profile.buttonPressDuration,
    inputDelayMs: profile.inputDelay,
    homeMs: profile.homeDuration,
  };
  const breakdown: CommandRuntimeBreakdown = {
    totalMs: 0,
    inputConfigMs: 0,
    homeMs: 0,
    canvasMoveMs: 0,
    drawMs: 0,
    colorSelectMs: 0,
    paletteConfigMs: 0,
    basicPaletteConfigMs: 0,
    menuUtilityMs: 0,
    holdMs: 0,
    waitMs: 0,
    controlMs: 0,
    commandCount: commands.length,
    moveStepCount: 0,
    lineStepCount: 0,
    drawPressCount: 0,
    colorSelectCount: 0,
    paletteConfigCount: 0,
    basicPaletteConfigCount: 0,
    holdCount: 0,
  };
  const basicPaletteState = createBasicPaletteTrackingState();
  let selectedPaletteSlot: number | null = null;

  for (const command of commands) {
    switch (command.type) {
      case "inputConfig": {
        timing = {
          buttonPressMs: command.buttonPressMs,
          inputDelayMs: command.inputDelayMs,
          homeMs: command.homeMs,
        };
        break;
      }
      case "home": {
        addBreakdownTime(breakdown, "homeMs", timing.homeMs * 2 + timing.inputDelayMs);
        break;
      }
      case "move": {
        const steps = Math.abs(command.dx) + Math.abs(command.dy);
        breakdown.moveStepCount += steps;
        addBreakdownTime(breakdown, "canvasMoveMs", steps * generalPressMs(timing));
        break;
      }
      case "line": {
        const steps = Math.abs(command.dx) + Math.abs(command.dy) + 1;
        breakdown.lineStepCount += steps;
        addBreakdownTime(breakdown, "drawMs", steps * generalPressMs(timing));
        break;
      }
      case "draw": {
        breakdown.drawPressCount += 1;
        addBreakdownTime(breakdown, "drawMs", generalPressMs(timing));
        break;
      }
      case "press": {
        addBreakdownTime(breakdown, "menuUtilityMs", generalPressMs(timing));
        break;
      }
      case "hold": {
        breakdown.holdCount += 1;
        addBreakdownTime(breakdown, "holdMs", command.ms + timing.inputDelayMs);
        break;
      }
      case "color": {
        selectedPaletteSlot = clampPaletteSlotIndex(command.index);
        breakdown.colorSelectCount += 1;
        addBreakdownTime(breakdown, "colorSelectMs", estimateColorSelectDurationMs(command.index, timing));
        break;
      }
      case "colorFast": {
        const targetSlot = clampPaletteSlotIndex(command.index);
        const duration =
          selectedPaletteSlot === null
            ? estimateColorSelectDurationMs(command.index, timing)
            : estimateFastColorSelectDurationMs(selectedPaletteSlot, targetSlot, timing);

        selectedPaletteSlot = targetSlot;
        breakdown.colorSelectCount += 1;
        addBreakdownTime(breakdown, "colorSelectMs", duration);
        break;
      }
      case "paletteConfig": {
        const rgb = parsePaletteConfigColor(command.colorHex);
        breakdown.paletteConfigCount += 1;
        addBreakdownTime(
          breakdown,
          "paletteConfigMs",
          estimatePaletteConfigDurationMs(command.slot, rgb.r, rgb.g, rgb.b, timing),
        );
        selectedPaletteSlot = clampPaletteSlotIndex(command.slot);
        break;
      }
      case "basicPaletteReset": {
        basicPaletteState.ready = false;
        addBreakdownTime(breakdown, "basicPaletteConfigMs", timing.inputDelayMs);
        break;
      }
      case "basicPaletteConfig": {
        breakdown.basicPaletteConfigCount += 1;
        addBreakdownTime(
          breakdown,
          "basicPaletteConfigMs",
          estimateBasicPaletteConfigDurationMs(
            command.slot,
            command.row,
            command.col,
            timing,
            basicPaletteState,
          ),
        );
        selectedPaletteSlot = clampPaletteSlotIndex(command.slot);
        break;
      }
      case "wait": {
        addBreakdownTime(breakdown, "waitMs", command.ms);
        break;
      }
      case "pause":
      case "resume":
      case "end": {
        addBreakdownTime(breakdown, "controlMs", timing.inputDelayMs);
        break;
      }
    }
  }

  return breakdown;
}

export function estimateCommandRuntimeMs(commands: DrawCommand[], profile: DrawingProfile): number {
  return calculateCommandRuntimeBreakdown(commands, profile).totalMs;
}

export function estimateColorSelectDurationMs(index: number, timing: InputTiming): number {
  const normalizedSlot = clampPaletteSlotIndex(index);
  const menuPressMs = paletteMenuPressMs();

  return (
    generalPressMs(timing) +
    COLOR_PALETTE_MENU_OPEN_SETTLE_MS +
    COLOR_PALETTE_RESET_TO_BOTTOM_STEPS * menuPressMs +
    (COLOR_PALETTE_SLOT_COUNT - 1 - normalizedSlot) * menuPressMs +
    2 * menuPressMs +
    timing.inputDelayMs
  );
}

export function estimateFastColorSelectDurationMs(
  fromIndex: number,
  toIndex: number,
  timing: InputTiming,
): number {
  const fromSlot = clampPaletteSlotIndex(fromIndex);
  const toSlot = clampPaletteSlotIndex(toIndex);
  const menuPressMs = paletteMenuPressMs();

  return (
    generalPressMs(timing) +
    COLOR_PALETTE_MENU_OPEN_SETTLE_MS +
    Math.abs(toSlot - fromSlot) * menuPressMs +
    2 * menuPressMs +
    timing.inputDelayMs
  );
}

export function estimatePaletteConfigDurationMs(
  slotIndex: number,
  red: number,
  green: number,
  blue: number,
  timing: InputTiming,
  options: { includeTimeoutMargin?: boolean } = {},
): number {
  const normalizedSlot = clampPaletteSlotIndex(slotIndex);
  const hsv = rgbToHsv(red, green, blue);
  const hueRatio = hsv.hue <= 0 ? 0 : (360 - hsv.hue) / 360;
  const hueSteps = Math.round(hueRatio * COLOR_PALETTE_EDITOR_HUE_STEP_COUNT);
  const saturationSteps = scaleChannelToSteps(hsv.saturation, COLOR_PALETTE_EDITOR_SATURATION_STEP_COUNT);
  const valueDropSteps = scaleChannelToSteps(1 - hsv.value, COLOR_PALETTE_EDITOR_VALUE_STEP_COUNT);
  const generalMs = generalPressMs(timing);
  const menuPressMs = paletteMenuPressMs();
  const duration =
    generalMs +
    COLOR_PALETTE_MENU_OPEN_SETTLE_MS +
    COLOR_PALETTE_RESET_TO_BOTTOM_STEPS * menuPressMs +
    (COLOR_PALETTE_SLOT_COUNT - 1 - normalizedSlot) * menuPressMs +
    menuPressMs +
    COLOR_PALETTE_EDITOR_OPEN_SETTLE_MS +
    menuPressMs +
    BASIC_COLOR_TAB_SETTLE_MS +
    (COLOR_PALETTE_EDITOR_RESET_UP_HOLD_MS + timing.inputDelayMs) +
    (COLOR_PALETTE_EDITOR_RESET_LEFT_HOLD_MS + timing.inputDelayMs) +
    (COLOR_PALETTE_EDITOR_HUE_RESET_HOLD_MS + timing.inputDelayMs) +
    hueSteps * generalMs +
    (saturationSteps > 0 ? saturationSteps * COLOR_PALETTE_EDITOR_MOVE_STEP_MS + timing.inputDelayMs : 0) +
    (valueDropSteps > 0 ? valueDropSteps * COLOR_PALETTE_EDITOR_MOVE_STEP_MS + timing.inputDelayMs : 0) +
    3 * generalMs +
    timing.inputDelayMs;

  return duration + (options.includeTimeoutMargin === true ? PALETTE_CONFIG_TIMEOUT_MARGIN_MS : 0);
}

export function estimateBasicPaletteConfigDurationMs(
  slotIndex: number,
  row: number,
  col: number,
  timing: InputTiming,
  trackingState: BasicPaletteTrackingState = createBasicPaletteTrackingState(),
): number {
  const normalizedSlot = clampPaletteSlotIndex(slotIndex);
  const targetRow = clamp(row, 0, BASIC_COLOR_GRID_ROWS - 1);
  const targetCol = clamp(col, 0, BASIC_COLOR_GRID_COLS - 1);
  const currentRow = trackingState.ready
    ? trackingState.rows[normalizedSlot] ?? BASIC_COLOR_INITIAL_SLOT_ROWS[normalizedSlot] ?? 0
    : BASIC_COLOR_INITIAL_SLOT_ROWS[normalizedSlot] ?? 0;
  const currentCol = trackingState.ready
    ? trackingState.cols[normalizedSlot] ?? BASIC_COLOR_INITIAL_SLOT_COLS[normalizedSlot] ?? 0
    : BASIC_COLOR_INITIAL_SLOT_COLS[normalizedSlot] ?? 0;
  const rowDelta = targetRow - currentRow;
  const colDelta = targetCol - currentCol;
  const menuPressMs = paletteMenuPressMs();
  const duration =
    generalPressMs(timing) +
    COLOR_PALETTE_MENU_OPEN_SETTLE_MS +
    COLOR_PALETTE_RESET_TO_BOTTOM_STEPS * menuPressMs +
    (COLOR_PALETTE_SLOT_COUNT - 1 - normalizedSlot) * menuPressMs +
    menuPressMs +
    COLOR_PALETTE_EDITOR_OPEN_SETTLE_MS +
    menuPressMs +
    BASIC_COLOR_TAB_SETTLE_MS +
    Math.abs(rowDelta) * menuPressMs +
    Math.abs(colDelta) * menuPressMs +
    menuPressMs +
    timing.inputDelayMs;

  trackingState.rows[normalizedSlot] = targetRow;
  trackingState.cols[normalizedSlot] = targetCol;
  trackingState.ready = true;

  return duration;
}

function createBasicPaletteTrackingState(): BasicPaletteTrackingState {
  return {
    ready: false,
    rows: [...BASIC_COLOR_INITIAL_SLOT_ROWS],
    cols: [...BASIC_COLOR_INITIAL_SLOT_COLS],
  };
}

function addBreakdownTime(
  breakdown: CommandRuntimeBreakdown,
  field: keyof Pick<
    CommandRuntimeBreakdown,
    | "inputConfigMs"
    | "homeMs"
    | "canvasMoveMs"
    | "drawMs"
    | "colorSelectMs"
    | "paletteConfigMs"
    | "basicPaletteConfigMs"
    | "menuUtilityMs"
    | "holdMs"
    | "waitMs"
    | "controlMs"
  >,
  ms: number,
): void {
  breakdown[field] += ms;
  breakdown.totalMs += ms;
}

function parsePaletteConfigColor(colorHex: string): { r: number; g: number; b: number } {
  const normalized = colorHex.trim().replace(/^#/u, "");

  if (!/^[0-9a-f]{6}$/iu.test(normalized)) {
    return { r: 0, g: 0, b: 0 };
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
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

function scaleChannelToSteps(value: number, steps: number): number {
  if (steps <= 0) {
    return 0;
  }

  const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
  return Math.round(clamped * steps);
}

function generalPressMs(timing: InputTiming): number {
  return timing.buttonPressMs + timing.inputDelayMs;
}

function paletteMenuPressMs(): number {
  return COLOR_PALETTE_MENU_PRESS_DURATION_MS + COLOR_PALETTE_MENU_INPUT_DELAY_MS;
}

function clampPaletteSlotIndex(index: number): number {
  return clamp(index, 0, COLOR_PALETTE_SLOT_COUNT - 1);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.floor(value)));
}
