import type { DrawingProfile } from "../types.js";
import { rgbToHex } from "../utils/colors.js";
import { OFFICIAL_PALETTE } from "./officialPalette.js";

function hslToRgb(hue: number, saturation: number, lightness: number) {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = Math.max(0, Math.min(1, saturation / 100));
  const l = Math.max(0, Math.min(1, lightness / 100));

  if (s === 0) {
    const value = Math.round(l * 255);
    return { r: value, g: value, b: value };
  }

  const hueToRgb = (p: number, q: number, t: number) => {
    let normalized = t;

    if (normalized < 0) {
      normalized += 1;
    }

    if (normalized > 1) {
      normalized -= 1;
    }

    if (normalized < 1 / 6) {
      return p + (q - p) * 6 * normalized;
    }

    if (normalized < 1 / 2) {
      return q;
    }

    if (normalized < 2 / 3) {
      return p + (q - p) * (2 / 3 - normalized) * 6;
    }

    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, h) * 255),
    b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  };
}

function buildReferencePalette(): string[] {
  const corePalette = [
    "#000000",
    "#ffffff",
    "#d92d20",
    "#f79009",
    "#facc15",
    "#84cc16",
    "#16a34a",
    "#0ea5e9",
    "#1d4ed8",
    "#7c3aed",
    "#db2777",
    "#8b5e34",
    "#d6a77a",
    "#98a2b3",
    "#475467",
    "#f2f4f7",
  ];

  const grayscale = Array.from({ length: 16 }, (_, index) => {
    const channel = Math.round((255 / 15) * index);
    return rgbToHex({ r: channel, g: channel, b: channel });
  });

  const hues = [0, 18, 32, 48, 62, 84, 110, 140, 168, 192, 215, 238, 268, 308];
  const lightnessStops = [20, 28, 36, 44, 52, 60, 68, 76];

  const generatedPalette = hues.flatMap((hue) =>
    lightnessStops.map((lightness) => rgbToHex(hslToRgb(hue, 72, lightness))),
  );

  return [...new Set([...corePalette, ...grayscale, ...generatedPalette])].slice(0, 128);
}

export const DEFAULT_PALETTE = buildReferencePalette();
export const DEFAULT_OFFICIAL_PALETTE = OFFICIAL_PALETTE;

export const DEFAULT_PROFILE: DrawingProfile = {
  profileName: "switch-mono-256",
  baudRate: 115200,
  canvasWidth: 256,
  canvasHeight: 256,
  resizeMode: "cover",
  cellMoveDuration: 80,
  inputDelay: 100,
  homeDuration: 1800,
  buttonPressDuration: 100,
  colorChangeDuration: 450,
  ackTimeoutMs: 2_000,
  commandRetryCount: 1,
  drawButton: "A",
  colorMode: "mono",
  colorCount: 32,
  monoThreshold: 128,
  palette: DEFAULT_PALETTE.slice(0, 2),
  brushSize: 3,
  startCursor: "center",
  startTool: "pen",
  startColorIndex: 0,
  centerToTopLeftDx: 0,
  centerToTopLeftDy: 0,
};
