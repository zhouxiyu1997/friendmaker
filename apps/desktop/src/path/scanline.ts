import type { DrawingProfile, Pixel, PixelMap } from "../types.js";
import { officialPaletteCellFromIndex } from "../config/officialPalette.js";
import {
  basicPaletteConfigCommand,
  basicPaletteResetCommand,
  colorCommand,
  drawCommand,
  endCommand,
  homeCommand,
  inputConfigCommand,
  moveCommand,
  paletteConfigCommand,
  type DrawCommand,
} from "../protocol/commands.js";

const PALETTE_SLOT_COUNT = 9;
const DEFAULT_SMALL_BRUSH_REANCHOR_DRAWS = 500;
const SMALL_BRUSH_BUTTON_PRESS_MS = 90;
const SMALL_BRUSH_INPUT_DELAY_MS = 90;
const SMALL_BRUSH_HOME_MS = 1800;
const NEIGHBOR_OFFSETS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

function getPixelsByColor(pixelMap: PixelMap, colorIndex: number): Pixel[] {
  return pixelMap.flatMap((row) =>
    row.filter((pixel) => pixel.alpha > 0 && pixel.colorIndex === colorIndex),
  );
}

function getLegacyScanlinePixels(pixelMap: PixelMap, colorIndex: number): Pixel[] {
  const rows = pixelMap.map((row) =>
    row.filter((pixel) => pixel.alpha > 0 && pixel.colorIndex === colorIndex),
  );

  return rows.flatMap((row, rowIndex) => {
    if (rowIndex % 2 === 0) {
      return row;
    }

    return [...row].reverse();
  });
}

function pixelKey(point: { x: number; y: number }): string {
  return `${point.x},${point.y}`;
}

function buildSerpentineRows(pixels: Pixel[], fromBottom = false): Pixel[] {
  const rows = new Map<number, Pixel[]>();

  for (const pixel of pixels) {
    const row = rows.get(pixel.y);
    if (row) {
      row.push(pixel);
    } else {
      rows.set(pixel.y, [pixel]);
    }
  }

  const sortedRows = Array.from(rows.entries()).sort((left, right) => left[0] - right[0]);

  if (fromBottom) {
    sortedRows.reverse();
  }

  return sortedRows.flatMap(([rowNumber, row]) => {
    const sorted = [...row].sort((left, right) => left.x - right.x);

    if (rowNumber % 2 === 0) {
      return sorted;
    }

    return sorted.reverse();
  });
}

function rotatePixelsToNearestStart(
  pixels: Pixel[],
  current: { x: number; y: number },
  profile: DrawingProfile,
): Pixel[] {
  if (pixels.length <= 1) {
    return pixels;
  }

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  pixels.forEach((pixel, index) => {
    const target = toCanvasPosition(pixel, profile);
    const distance = Math.abs(target.x - current.x) + Math.abs(target.y - current.y);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  if (nearestIndex === 0) {
    return pixels;
  }

  return [...pixels.slice(nearestIndex), ...pixels.slice(0, nearestIndex)];
}

function chooseBestSerpentineOrder(
  pixels: Pixel[],
  current: { x: number; y: number },
  profile: DrawingProfile,
): Pixel[] {
  if (pixels.length <= 1) {
    return pixels;
  }

  const topDown = rotatePixelsToNearestStart(buildSerpentineRows(pixels, false), current, profile);
  const bottomUp = rotatePixelsToNearestStart(buildSerpentineRows(pixels, true), current, profile);

  const topFirst = topDown[0];
  const bottomFirst = bottomUp[0];

  if (!topFirst) {
    return bottomUp;
  }

  if (!bottomFirst) {
    return topDown;
  }

  const topStart = toCanvasPosition(topFirst, profile);
  const bottomStart = toCanvasPosition(bottomFirst, profile);
  const topDistance = Math.abs(topStart.x - current.x) + Math.abs(topStart.y - current.y);
  const bottomDistance = Math.abs(bottomStart.x - current.x) + Math.abs(bottomStart.y - current.y);

  return topDistance <= bottomDistance ? topDown : bottomUp;
}

function collectConnectedComponents(pixelMap: PixelMap, colorIndex: number): Pixel[][] {
  const pixels = getPixelsByColor(pixelMap, colorIndex);

  if (pixels.length === 0) {
    return [];
  }

  const pixelByKey = new Map<string, Pixel>(pixels.map((pixel) => [pixelKey(pixel), pixel]));
  const visited = new Set<string>();
  const components: Pixel[][] = [];

  for (const pixel of pixels) {
    const startKey = pixelKey(pixel);
    if (visited.has(startKey)) {
      continue;
    }

    const stack = [pixel];
    const component: Pixel[] = [];
    visited.add(startKey);

    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);

      for (const offset of NEIGHBOR_OFFSETS) {
        const neighbor = pixelByKey.get(
          pixelKey({ x: current.x + offset.dx, y: current.y + offset.dy }),
        );

        if (!neighbor) {
          continue;
        }

        const neighborKey = pixelKey(neighbor);

        if (visited.has(neighborKey)) {
          continue;
        }

        visited.add(neighborKey);
        stack.push(neighbor);
      }
    }

    components.push(component);
  }

  return components;
}

function getOrderedPixelsForColor(
  pixelMap: PixelMap,
  colorIndex: number,
  current: { x: number; y: number },
  profile: DrawingProfile,
): Pixel[] {
  const components = collectConnectedComponents(pixelMap, colorIndex);
  const legacyPixels = rotatePixelsToNearestStart(
    getLegacyScanlinePixels(pixelMap, colorIndex),
    current,
    profile,
  );

  if (components.length <= 1) {
    return legacyPixels;
  }

  const remaining = [...components];
  const orderedPixels: Pixel[] = [];
  let currentPosition = current;

  while (remaining.length > 0) {
    let selectedIndex = 0;
    let selectedDistance = Number.POSITIVE_INFINITY;
    let selectedOrder: Pixel[] = [];

    remaining.forEach((component, index) => {
      const candidate = chooseBestSerpentineOrder(component, currentPosition, profile);

      if (candidate.length === 0) {
        return;
      }

      const firstPixel = candidate[0];

      if (!firstPixel) {
        return;
      }

      const start = toCanvasPosition(firstPixel, profile);
      const distance = Math.abs(start.x - currentPosition.x) + Math.abs(start.y - currentPosition.y);

      if (distance < selectedDistance) {
        selectedDistance = distance;
        selectedIndex = index;
        selectedOrder = candidate;
      }
    });

    const lastPixel = selectedOrder[selectedOrder.length - 1];

    if (selectedOrder.length > 0) {
      orderedPixels.push(...selectedOrder);
    }

    if (lastPixel) {
      currentPosition = toCanvasPosition(lastPixel, profile);
    }

    remaining.splice(selectedIndex, 1);
  }

  const optimizedDistance = estimateTravelDistance(current, orderedPixels, profile);
  const legacyDistance = estimateTravelDistance(current, legacyPixels, profile);

  return optimizedDistance < legacyDistance ? orderedPixels : legacyPixels;
}

function toCanvasPosition(
  point: { x: number; y: number },
  profile: DrawingProfile,
): { x: number; y: number } {
  const step = Math.max(1, profile.brushSize);
  const brushCenterOffset = Math.floor(step / 2);

  return {
    x: Math.min(point.x * step + brushCenterOffset, profile.canvasWidth - 1),
    y: Math.min(point.y * step + brushCenterOffset, profile.canvasHeight - 1),
  };
}

function moveTo(
  current: { x: number; y: number },
  target: { x: number; y: number },
  profile: DrawingProfile,
): DrawCommand[] {
  const canvasTarget = toCanvasPosition(target, profile);
  const dx = canvasTarget.x - current.x;
  const dy = canvasTarget.y - current.y;

  if (dx === 0 && dy === 0) {
    return [];
  }

  return [moveCommand(dx, dy)];
}

function estimateTravelDistance(
  current: { x: number; y: number },
  pixels: Pixel[],
  profile: DrawingProfile,
): number {
  let total = 0;
  let currentPosition = current;

  for (const pixel of pixels) {
    const next = toCanvasPosition(pixel, profile);
    total += Math.abs(next.x - currentPosition.x) + Math.abs(next.y - currentPosition.y);
    currentPosition = next;
  }

  return total;
}

function resolveStartOffset(profile: DrawingProfile): { dx: number; dy: number } | null {
  if (profile.startCursor === "top-left") {
    return null;
  }

  const dx =
    profile.centerToTopLeftDx !== 0 ? profile.centerToTopLeftDx : -Math.floor(profile.canvasWidth / 2);
  const dy =
    profile.centerToTopLeftDy !== 0 ? profile.centerToTopLeftDy : -Math.floor(profile.canvasHeight / 2);

  if (dx === 0 && dy === 0) {
    return null;
  }

  return { dx, dy };
}

function shouldStartFromCanvasCenter(profile: DrawingProfile): boolean {
  return profile.startCursor === "center";
}

function resolveReanchorEveryDraws(profile: DrawingProfile): number {
  if (profile.reanchorEveryDraws !== undefined) {
    return Math.floor(Math.max(0, profile.reanchorEveryDraws));
  }

  return profile.brushSize === 1 ? DEFAULT_SMALL_BRUSH_REANCHOR_DRAWS : 0;
}

function resolveInputTiming(profile: DrawingProfile): {
  buttonPressMs: number;
  inputDelayMs: number;
  homeMs: number;
} {
  if (profile.brushSize !== 1) {
    return {
      buttonPressMs: profile.buttonPressDuration,
      inputDelayMs: profile.inputDelay,
      homeMs: profile.homeDuration,
    };
  }

  return {
    buttonPressMs: Math.max(profile.buttonPressDuration, SMALL_BRUSH_BUTTON_PRESS_MS),
    inputDelayMs: Math.max(profile.inputDelay, SMALL_BRUSH_INPUT_DELAY_MS),
    homeMs: Math.max(profile.homeDuration, SMALL_BRUSH_HOME_MS),
  };
}

function appendPeriodicReanchor(
  commands: DrawCommand[],
  current: { x: number; y: number },
  drawCount: number,
  reanchorEveryDraws: number,
): void {
  if (reanchorEveryDraws <= 0 || drawCount <= 0 || drawCount % reanchorEveryDraws !== 0) {
    return;
  }

  commands.push(homeCommand());

  if (current.x !== 0 || current.y !== 0) {
    commands.push(moveCommand(current.x, current.y));
  }
}

function getUsedPaletteColors(pixelMap: PixelMap): Array<{ colorIndex: number; colorHex: string }> {
  const colorByIndex = new Map<number, string>();

  for (const row of pixelMap) {
    for (const pixel of row) {
      if (pixel.alpha <= 0 || pixel.colorIndex < 0) {
        continue;
      }

      if (!colorByIndex.has(pixel.colorIndex)) {
        colorByIndex.set(pixel.colorIndex, pixel.colorHex);
      }
    }
  }

  return Array.from(colorByIndex.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([colorIndex, colorHex]) => ({ colorIndex, colorHex }));
}

export function generateScanlineCommands(
  pixelMap: PixelMap,
  profile: DrawingProfile,
): DrawCommand[] {
  const inputTiming = resolveInputTiming(profile);
  const commands: DrawCommand[] = [
    inputConfigCommand(inputTiming.buttonPressMs, inputTiming.inputDelayMs, inputTiming.homeMs),
  ];
  let current = { x: 0, y: 0 };
  let drawCount = 0;
  const reanchorEveryDraws = resolveReanchorEveryDraws(profile);

  if (shouldStartFromCanvasCenter(profile)) {
    // The in-game canvas opens with the cursor centered, so the fixed canvas
    // workflow can start directly from the middle instead of re-homing first.
    current = {
      x: Math.floor(profile.canvasWidth / 2),
      y: Math.floor(profile.canvasHeight / 2),
    };
  } else {
    const startOffset = resolveStartOffset(profile);
    if (startOffset) {
      commands.push(moveCommand(startOffset.dx, startOffset.dy));
    } else {
      commands.push(homeCommand());
    }
  }

  if (profile.colorMode === "mono") {
    const usedColorIndexes = [profile.startColorIndex];
    let selectedColor: number | null = profile.startColorIndex;

    for (const colorIndex of usedColorIndexes) {
      if (selectedColor !== colorIndex) {
        commands.push(colorCommand(colorIndex));
        selectedColor = colorIndex;
      }

      const orderedPixels = getOrderedPixelsForColor(pixelMap, colorIndex, current, profile);

      for (const pixel of orderedPixels) {
        commands.push(...moveTo(current, pixel, profile));
        commands.push(drawCommand(profile.drawButton));
        current = toCanvasPosition(pixel, profile);
        drawCount += 1;
        appendPeriodicReanchor(commands, current, drawCount, reanchorEveryDraws);
      }
    }
  } else if (profile.colorMode === "palette") {
    const usedColors = getUsedPaletteColors(pixelMap);

    for (let batchStart = 0; batchStart < usedColors.length; batchStart += PALETTE_SLOT_COUNT) {
      const batch = usedColors.slice(batchStart, batchStart + PALETTE_SLOT_COUNT);
      let selectedSlot: number | null = null;

      batch.forEach((color, slotIndex) => {
        commands.push(paletteConfigCommand(slotIndex, color.colorHex));
      });

      for (const [slotIndex, color] of batch.entries()) {
        if (selectedSlot !== slotIndex) {
          commands.push(colorCommand(slotIndex));
          selectedSlot = slotIndex;
        }

        const orderedPixels = getOrderedPixelsForColor(pixelMap, color.colorIndex, current, profile);

        for (const pixel of orderedPixels) {
          commands.push(...moveTo(current, pixel, profile));
          commands.push(drawCommand(profile.drawButton));
          current = toCanvasPosition(pixel, profile);
          drawCount += 1;
          appendPeriodicReanchor(commands, current, drawCount, reanchorEveryDraws);
        }
      }
    }
  } else {
    const usedColors = getUsedPaletteColors(pixelMap);
    let didResetOfficialPaletteState = false;

    for (let batchStart = 0; batchStart < usedColors.length; batchStart += PALETTE_SLOT_COUNT) {
      const batch = usedColors.slice(batchStart, batchStart + PALETTE_SLOT_COUNT);
      let selectedSlot: number | null = null;

      if (!didResetOfficialPaletteState) {
        commands.push(basicPaletteResetCommand());
        didResetOfficialPaletteState = true;
      }

      batch.forEach((color, slotIndex) => {
        const cell = officialPaletteCellFromIndex(color.colorIndex);
        commands.push(basicPaletteConfigCommand(slotIndex, cell.row, cell.col));
      });

      for (const [slotIndex, color] of batch.entries()) {
        if (selectedSlot !== slotIndex) {
          commands.push(colorCommand(slotIndex));
          selectedSlot = slotIndex;
        }

        const orderedPixels = getOrderedPixelsForColor(pixelMap, color.colorIndex, current, profile);

        for (const pixel of orderedPixels) {
          commands.push(...moveTo(current, pixel, profile));
          commands.push(drawCommand(profile.drawButton));
          current = toCanvasPosition(pixel, profile);
          drawCount += 1;
          appendPeriodicReanchor(commands, current, drawCount, reanchorEveryDraws);
        }
      }
    }
  }

  commands.push(endCommand());
  return commands;
}

export function estimateRuntimeMs(commands: DrawCommand[], profile: DrawingProfile): number {
  const inputTiming = resolveInputTiming(profile);

  return commands.reduce((total, command) => {
    switch (command.type) {
      case "home":
        return total + inputTiming.homeMs * 2 + inputTiming.inputDelayMs;
      case "move":
        return (
          total +
          (Math.abs(command.dx) + Math.abs(command.dy)) *
            (inputTiming.buttonPressMs + inputTiming.inputDelayMs)
        );
      case "draw":
      case "press":
        return total + inputTiming.buttonPressMs + inputTiming.inputDelayMs;
      case "color":
        return total + profile.colorChangeDuration;
      case "paletteConfig":
        return total + profile.colorChangeDuration * 6;
      case "basicPaletteConfig":
        return total + profile.colorChangeDuration * 4;
      case "basicPaletteReset":
        return total + inputTiming.inputDelayMs;
      case "inputConfig":
        return total + inputTiming.inputDelayMs;
      case "wait":
        return total + command.ms;
      case "pause":
      case "resume":
      case "end":
        return total + inputTiming.inputDelayMs;
      default:
        return total;
    }
  }, 0);
}
