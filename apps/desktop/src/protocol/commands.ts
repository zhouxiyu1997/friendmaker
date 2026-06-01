import type { ControllerButton } from "../types.js";
import type { PaletteValueCalibration } from "./paletteValueCalibration.js";

export type DrawCommand =
  | { type: "inputConfig"; buttonPressMs: number; inputDelayMs: number; homeMs: number }
  | { type: "home" }
  | { type: "move"; dx: number; dy: number }
  | { type: "stick"; x: -1 | 0 | 1; y: -1 | 0 | 1; ms: number }
  | { type: "line"; dx: number; dy: number; stride?: number }
  | { type: "draw"; button: ControllerButton }
  | { type: "press"; button: ControllerButton }
  | { type: "color"; index: number }
  | { type: "paletteValueConfig"; calibration: PaletteValueCalibration }
  | { type: "basicPaletteReset" }
  | { type: "paletteConfig"; slot: number; colorHex: string }
  | { type: "basicPaletteConfig"; slot: number; row: number; col: number }
  | { type: "wait"; ms: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "end" };

export function homeCommand(): DrawCommand {
  return { type: "home" };
}

export function inputConfigCommand(
  buttonPressMs: number,
  inputDelayMs: number,
  homeMs: number,
): DrawCommand {
  return { type: "inputConfig", buttonPressMs, inputDelayMs, homeMs };
}

export function moveCommand(dx: number, dy: number): DrawCommand {
  return { type: "move", dx, dy };
}

export function stickCommand(x: -1 | 0 | 1, y: -1 | 0 | 1, ms: number): DrawCommand {
  return { type: "stick", x, y, ms };
}

export function lineCommand(dx: number, dy: number, stride = 1): DrawCommand {
  return stride > 1 ? { type: "line", dx, dy, stride } : { type: "line", dx, dy };
}

export function drawCommand(button: ControllerButton): DrawCommand {
  return { type: "draw", button };
}

export function pressButtonCommand(button: ControllerButton): DrawCommand {
  return { type: "press", button };
}

export function colorCommand(index: number): DrawCommand {
  return { type: "color", index };
}

export function paletteValueConfigCommand(calibration: PaletteValueCalibration): DrawCommand {
  return { type: "paletteValueConfig", calibration };
}

export function basicPaletteResetCommand(): DrawCommand {
  return { type: "basicPaletteReset" };
}

export function paletteConfigCommand(slot: number, colorHex: string): DrawCommand {
  return { type: "paletteConfig", slot, colorHex };
}

export function basicPaletteConfigCommand(slot: number, row: number, col: number): DrawCommand {
  return { type: "basicPaletteConfig", slot, row, col };
}

export function waitCommand(ms: number): DrawCommand {
  return { type: "wait", ms };
}

export function pauseCommand(): DrawCommand {
  return { type: "pause" };
}

export function resumeCommand(): DrawCommand {
  return { type: "resume" };
}

export function endCommand(): DrawCommand {
  return { type: "end" };
}
