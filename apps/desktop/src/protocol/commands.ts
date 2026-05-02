import type { ControllerButton } from "../types.js";

export type DrawCommand =
  | { type: "home" }
  | { type: "move"; dx: number; dy: number }
  | { type: "draw"; button: ControllerButton }
  | { type: "press"; button: ControllerButton }
  | { type: "color"; index: number }
  | { type: "basicPaletteReset" }
  | { type: "paletteConfig"; slot: number; colorHex: string }
  | { type: "basicPaletteConfig"; slot: number; row: number; col: number }
  | { type: "inputConfig"; buttonPressMs: number; inputDelayMs: number; homeMs: number }
  | { type: "wait"; ms: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "end" };

export function homeCommand(): DrawCommand {
  return { type: "home" };
}

export function moveCommand(dx: number, dy: number): DrawCommand {
  return { type: "move", dx, dy };
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

export function basicPaletteResetCommand(): DrawCommand {
  return { type: "basicPaletteReset" };
}

export function paletteConfigCommand(slot: number, colorHex: string): DrawCommand {
  return { type: "paletteConfig", slot, colorHex };
}

export function basicPaletteConfigCommand(slot: number, row: number, col: number): DrawCommand {
  return { type: "basicPaletteConfig", slot, row, col };
}

export function inputConfigCommand(
  buttonPressMs: number,
  inputDelayMs: number,
  homeMs: number,
): DrawCommand {
  return { type: "inputConfig", buttonPressMs, inputDelayMs, homeMs };
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
