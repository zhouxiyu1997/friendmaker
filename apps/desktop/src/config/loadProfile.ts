import { readFile } from "node:fs/promises";

import type { DrawingProfile } from "../types.js";
import { DEFAULT_PALETTE, DEFAULT_PROFILE } from "./defaultProfile.js";
import { OFFICIAL_PALETTE } from "./officialPalette.js";

const VALID_DRAWING_TOOLS = new Set<DrawingProfile["startTool"]>([
  "pen",
  "eraser",
  "fill",
  "stamp",
  "text",
  "shape",
]);
const VALID_BRUSH_SIZES = new Set<DrawingProfile["brushSize"]>([1, 3, 7, 13, 19, 27]);

function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function toTool(value: unknown, fallback: DrawingProfile["startTool"]): DrawingProfile["startTool"] {
  return typeof value === "string" && VALID_DRAWING_TOOLS.has(value as DrawingProfile["startTool"])
    ? (value as DrawingProfile["startTool"])
    : fallback;
}

function toNonNegativeNumber(value: unknown, fallback: number): number {
  const normalized = toNumber(value, fallback);
  return normalized >= 0 ? normalized : fallback;
}

function toOptionalNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function toBrushSize(value: unknown, fallback: DrawingProfile["brushSize"]): DrawingProfile["brushSize"] {
  return typeof value === "number" && VALID_BRUSH_SIZES.has(value as DrawingProfile["brushSize"])
    ? (value as DrawingProfile["brushSize"])
    : fallback;
}

export async function loadProfile(profilePath?: string): Promise<DrawingProfile> {
  if (!profilePath) {
    return { ...DEFAULT_PROFILE };
  }

  const rawContent = await readFile(profilePath, "utf8");
  const parsed = JSON.parse(rawContent) as Partial<DrawingProfile>;

  const palette =
    Array.isArray(parsed.palette) && parsed.palette.length > 0
      ? parsed.palette.filter((color): color is string => typeof color === "string")
      : parsed.colorMode === "official"
        ? OFFICIAL_PALETTE.slice()
        : DEFAULT_PALETTE.slice();
  const reanchorEveryDraws = toOptionalNonNegativeNumber(parsed.reanchorEveryDraws);

  return {
    profileName: toString(parsed.profileName, DEFAULT_PROFILE.profileName),
    baudRate: toNumber(parsed.baudRate, DEFAULT_PROFILE.baudRate),
    canvasWidth: toNumber(parsed.canvasWidth, DEFAULT_PROFILE.canvasWidth),
    canvasHeight: toNumber(parsed.canvasHeight, DEFAULT_PROFILE.canvasHeight),
    resizeMode: parsed.resizeMode === "cover" ? "cover" : "contain",
    cellMoveDuration: toNumber(parsed.cellMoveDuration, DEFAULT_PROFILE.cellMoveDuration),
    inputDelay: toNumber(parsed.inputDelay, DEFAULT_PROFILE.inputDelay),
    homeDuration: toNumber(parsed.homeDuration, DEFAULT_PROFILE.homeDuration),
    buttonPressDuration: toNumber(parsed.buttonPressDuration, DEFAULT_PROFILE.buttonPressDuration),
    colorChangeDuration: toNumber(parsed.colorChangeDuration, DEFAULT_PROFILE.colorChangeDuration),
    ackTimeoutMs: toNumber(parsed.ackTimeoutMs, DEFAULT_PROFILE.ackTimeoutMs),
    commandRetryCount: toNumber(parsed.commandRetryCount, DEFAULT_PROFILE.commandRetryCount),
    ...(reanchorEveryDraws !== undefined ? { reanchorEveryDraws } : {}),
    drawButton: parsed.drawButton ?? DEFAULT_PROFILE.drawButton,
    colorMode:
      parsed.colorMode === "palette" || parsed.colorMode === "official"
        ? parsed.colorMode
        : "mono",
    colorCount: toNonNegativeNumber(parsed.colorCount, DEFAULT_PROFILE.colorCount),
    monoThreshold: toNumber(parsed.monoThreshold, DEFAULT_PROFILE.monoThreshold),
    palette,
    brushSize: toBrushSize(parsed.brushSize, DEFAULT_PROFILE.brushSize),
    startCursor: parsed.startCursor === "top-left" ? "top-left" : "center",
    startTool: toTool(parsed.startTool, DEFAULT_PROFILE.startTool),
    startColorIndex: toNonNegativeNumber(parsed.startColorIndex, DEFAULT_PROFILE.startColorIndex),
    centerToTopLeftDx: toNumber(parsed.centerToTopLeftDx, DEFAULT_PROFILE.centerToTopLeftDx),
    centerToTopLeftDy: toNumber(parsed.centerToTopLeftDy, DEFAULT_PROFILE.centerToTopLeftDy),
  };
}
