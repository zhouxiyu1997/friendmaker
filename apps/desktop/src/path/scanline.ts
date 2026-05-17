import type { DrawingProfile, Pixel, PixelMap, ResumePlan, ResumeSegment } from "../types.js";
import { buildAutomaticBrushSetupCommands } from "../brushBehavior.js";
import {
  createBrushGrid,
  gridCellToCanvasCenter,
  type BrushGrid,
} from "../brushGrid.js";
import { officialPaletteCellFromIndex } from "../config/officialPalette.js";
import {
  basicPaletteConfigCommand,
  basicPaletteResetCommand,
  colorCommand,
  drawCommand,
  endCommand,
  homeCommand,
  inputConfigCommand,
  lineCommand,
  moveCommand,
  paletteConfigCommand,
  pressButtonCommand,
  type DrawCommand,
  stickCommand,
  waitCommand,
} from "../protocol/commands.js";
import { getLineCommandMetrics } from "../protocol/lineMetrics.js";
import {
  createBasicPaletteTimingState,
  estimateBasicPaletteConfigDurationMs,
  estimateColorSelectDurationMs,
  estimatePaletteConfigDurationMs,
  resetBasicPaletteTimingState,
  updateBasicPaletteTimingState,
} from "../protocol/paletteTiming.js";
import { serializeCommand, serializeCommands } from "../protocol/serializer.js";

export type PathStrategy = "scanline" | "nearest";
export type RecenterStrategy = "off" | "time-saving";

export interface RecenterStats {
  recenterCount: number;
  recenterSavedMs: number;
  recenterMacroMs: number;
  recenterThresholdSteps: number;
  recenterCandidates: number;
}

export interface GeneratedScanlinePlan {
  commands: DrawCommand[];
  resumePlan: ResumePlan;
  recenterStats: RecenterStats;
}

const PALETTE_SLOT_COUNT = 9;
const EXACT_COMPONENT_ORDER_LIMIT = 6;
const EXACT_COMPONENT_PIXEL_LIMIT = 300;
const RECENTER_STICK_HOLD_MS = 2_000;
const RECENTER_UI_SETTLE_WAIT_MS = 500;
const NEIGHBOR_OFFSETS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

interface RecenterPlanner {
  strategy: RecenterStrategy;
  center: { x: number; y: number };
  stepMs: number;
  macroMs: number;
  stats: RecenterStats;
}

function groupPixelsByColor(pixelMap: PixelMap): Map<number, Pixel[]> {
  const byColor = new Map<number, Pixel[]>();

  for (const row of pixelMap) {
    for (const pixel of row) {
      if (pixel.alpha <= 0 || pixel.colorIndex < 0) continue;

      let arr = byColor.get(pixel.colorIndex);
      if (!arr) {
        arr = [];
        byColor.set(pixel.colorIndex, arr);
      }
      arr.push(pixel);
    }
  }

  return byColor;
}

function getLegacyScanlinePixels(pixels: Pixel[]): Pixel[] {
  if (pixels.length === 0) return [];

  const rowsByY = new Map<number, Pixel[]>();
  for (const p of pixels) {
    let row = rowsByY.get(p.y);
    if (!row) {
      row = [];
      rowsByY.set(p.y, row);
    }
    row.push(p);
  }

  const sortedY = [...rowsByY.keys()].sort((a, b) => a - b);
  return sortedY.flatMap((y) => {
    const row = rowsByY.get(y)!;
    const sorted = [...row].sort((a, b) => a.x - b.x);
    return y % 2 === 0 ? sorted : sorted.reverse();
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

function chooseBestSerpentineOrder(
  pixels: Pixel[],
  current: { x: number; y: number },
  grid: BrushGrid,
): Pixel[] {
  if (pixels.length <= 1) {
    return pixels;
  }

  const topDown = buildSerpentineRows(pixels, false);
  const bottomUp = buildSerpentineRows(pixels, true);
  const candidates = [
    topDown,
    [...topDown].reverse(),
    bottomUp,
    [...bottomUp].reverse(),
  ];
  let bestOrder = candidates[0] ?? pixels;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate.length === 0) {
      continue;
    }

    const distance = estimateTravelDistance(current, candidate, grid);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestOrder = candidate;
    }
  }

  return bestOrder;
}

function collectConnectedComponents(pixels: Pixel[]): Pixel[][] {
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

function getNearestNeighborPixels(
  pixels: Pixel[],
  current: { x: number; y: number },
  grid: BrushGrid,
): Pixel[] {
  if (pixels.length === 0) return [];

  const remaining = new Map<string, Pixel>(pixels.map((pixel) => [pixelKey(pixel), pixel]));
  const ordered: Pixel[] = [];
  let lastDir: { dx: number; dy: number } | null = null;
  let last: Pixel | null = null;
  let position = current;

  while (remaining.size > 0) {
    let next: Pixel | null = null;

    if (last && lastDir) {
      const candidate = remaining.get(pixelKey({ x: last.x + lastDir.dx, y: last.y + lastDir.dy }));
      if (candidate) {
        next = candidate;
      }
    }

    if (!next && last) {
      for (const offset of NEIGHBOR_OFFSETS) {
        const candidate = remaining.get(pixelKey({ x: last.x + offset.dx, y: last.y + offset.dy }));
        if (candidate) {
          next = candidate;
          break;
        }
      }
    }

    if (!next) {
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const candidate of remaining.values()) {
        const target = toCanvasPosition(candidate, grid);
        const distance = Math.abs(target.x - position.x) + Math.abs(target.y - position.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          next = candidate;
        }
      }
    }

    if (!next) break;

    if (last) {
      const dx = next.x - last.x;
      const dy = next.y - last.y;
      const isUnitStep = Math.abs(dx) + Math.abs(dy) === 1;
      lastDir = isUnitStep ? { dx, dy } : null;
    }
    ordered.push(next);
    remaining.delete(pixelKey(next));
    position = toCanvasPosition(next, grid);
    last = next;
  }

  return ordered;
}

function getNearestNeighborPixelsByComponents(
  pixels: Pixel[],
  current: { x: number; y: number },
  grid: BrushGrid,
): Pixel[] {
  const components = collectConnectedComponents(pixels);
  if (components.length <= 1) {
    return getNearestNeighborPixels(pixels, current, grid);
  }

  const remaining = components.slice();
  const ordered: Pixel[] = [];
  let position = current;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < remaining.length; i++) {
      const component = remaining[i]!;
      for (const pixel of component) {
        const target = toCanvasPosition(pixel, grid);
        const distance = Math.abs(target.x - position.x) + Math.abs(target.y - position.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
          if (distance === 0) break;
        }
      }
    }

    const [chosen] = remaining.splice(bestIndex, 1);
    if (!chosen) break;

    const sub = getNearestNeighborPixels(chosen, position, grid);
    if (sub.length === 0) continue;

    ordered.push(...sub);
    const lastPixel = sub[sub.length - 1]!;
    position = toCanvasPosition(lastPixel, grid);
  }

  return ordered;
}

function getOrderedPixelsForColor(
  pixelsByColor: Map<number, Pixel[]>,
  colorIndex: number,
  current: { x: number; y: number },
  profile: DrawingProfile,
  grid: BrushGrid,
  pathStrategy: PathStrategy,
): Pixel[] {
  const pixels = pixelsByColor.get(colorIndex);
  if (!pixels || pixels.length === 0) return [];

  if (pathStrategy === "nearest") {
    return getNearestNeighborPixelsByComponents(pixels, current, grid);
  }

  const components = collectConnectedComponents(pixels);
  const legacyPixels = chooseBestSerpentineOrder(pixels, current, grid);

  if (components.length <= 1) {
    return legacyPixels;
  }

  let orderedPixels: Pixel[];

  if (
    components.length <= EXACT_COMPONENT_ORDER_LIMIT &&
    pixels.length <= EXACT_COMPONENT_PIXEL_LIMIT
  ) {
    orderedPixels = findOptimalComponentOrder(components, current, grid);
  } else {
    orderedPixels = greedyComponentOrder(components, current, grid);
  }

  const optimizedDistance = estimateTravelDistance(current, orderedPixels, grid);
  const legacyDistance = estimateTravelDistance(current, legacyPixels, grid);

  return optimizedDistance < legacyDistance ? orderedPixels : legacyPixels;
}

function greedyComponentOrder(
  components: Pixel[][],
  current: { x: number; y: number },
  grid: BrushGrid,
): Pixel[] {
  const remaining = [...components];
  const orderedPixels: Pixel[] = [];
  let currentPosition = current;

  while (remaining.length > 0) {
    let selectedIndex = 0;
    let selectedDistance = Number.POSITIVE_INFINITY;
    let selectedOrder: Pixel[] = [];

    remaining.forEach((component, index) => {
      const candidate = chooseBestSerpentineOrder(component, currentPosition, grid);

      if (candidate.length === 0) return;

      const firstPixel = candidate[0];
      if (!firstPixel) return;

      const start = toCanvasPosition(firstPixel, grid);
      const distance =
        Math.abs(start.x - currentPosition.x) + Math.abs(start.y - currentPosition.y);

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
      currentPosition = toCanvasPosition(lastPixel, grid);
    }

    remaining.splice(selectedIndex, 1);
  }

  return orderedPixels;
}

function findOptimalComponentOrder(
  components: Pixel[][],
  current: { x: number; y: number },
  grid: BrushGrid,
): Pixel[] {
  if (components.length <= 1) {
    return chooseBestSerpentineOrder(components[0] ?? [], current, grid);
  }

  // Pre-compute top-down and bottom-up serpentine rows for each component
  const precomputed = components.map((comp) => ({
    topDown: buildSerpentineRows(comp, false),
    bottomUp: buildSerpentineRows(comp, true),
  }));

  function bestVariant(
    pre: (typeof precomputed)[number],
    pos: { x: number; y: number },
  ): { pixels: Pixel[]; endPos: { x: number; y: number } } {
    const candidates = [
      pre.topDown,
      [...pre.topDown].reverse(),
      pre.bottomUp,
      [...pre.bottomUp].reverse(),
    ];
    let bestPixels: Pixel[] = [];
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      if (candidate.length === 0) {
        continue;
      }

      const distance = estimateTravelDistance(pos, candidate, grid);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestPixels = candidate;
      }
    }

    const last = bestPixels[bestPixels.length - 1];
    return {
      pixels: bestPixels,
      endPos: last ? toCanvasPosition(last, grid) : pos,
    };
  }

  let bestOrder: Pixel[] = [];
  let bestDistance = Number.POSITIVE_INFINITY;

  function* permute<T>(arr: T[]): Generator<T[]> {
    if (arr.length <= 1) {
      yield arr;
      return;
    }
    for (let i = 0; i < arr.length; i++) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      for (const p of permute(rest)) {
        yield [arr[i]!, ...p];
      }
    }
  }

  const indices = [...Array(components.length).keys()];

  for (const order of permute(indices)) {
    let pos = current;
    let totalDist = 0;
    const ordered: Pixel[] = [];

    for (const idx of order) {
      const pre = precomputed[idx];
      if (!pre) continue;
      const variant = bestVariant(pre, pos);

      if (variant.pixels.length === 0) continue;

      const first = variant.pixels[0];
      if (first) {
        const startPos = toCanvasPosition(first, grid);
        totalDist += Math.abs(startPos.x - pos.x) + Math.abs(startPos.y - pos.y);
      }

      ordered.push(...variant.pixels);
      pos = variant.endPos;
    }

    if (totalDist < bestDistance) {
      bestDistance = totalDist;
      bestOrder = ordered;
    }
  }

  return bestOrder;
}

function toCanvasPosition(
  point: { x: number; y: number },
  grid: BrushGrid,
): { x: number; y: number } {
  return gridCellToCanvasCenter(grid, point);
}

function manhattanDistance(
  left: { x: number; y: number },
  right: { x: number; y: number },
): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function createRecenterMacroCommands(): DrawCommand[] {
  return [
    stickCommand(-1, 0, RECENTER_STICK_HOLD_MS),
    waitCommand(RECENTER_UI_SETTLE_WAIT_MS),
    pressButtonCommand("X"),
    waitCommand(RECENTER_UI_SETTLE_WAIT_MS),
    pressButtonCommand("X"),
    waitCommand(RECENTER_UI_SETTLE_WAIT_MS),
    pressButtonCommand("A"),
  ];
}

function createRecenterPlanner(
  profile: DrawingProfile,
  strategy: RecenterStrategy,
): RecenterPlanner {
  const stepMs = profile.buttonPressDuration + profile.inputDelay;
  const macroMs = RECENTER_STICK_HOLD_MS + 3 * stepMs + 3 * RECENTER_UI_SETTLE_WAIT_MS;

  return {
    strategy,
    center: {
      x: Math.floor(profile.canvasWidth / 2),
      y: Math.floor(profile.canvasHeight / 2),
    },
    stepMs,
    macroMs,
    stats: {
      recenterCount: 0,
      recenterSavedMs: 0,
      recenterMacroMs: macroMs,
      recenterThresholdSteps: Math.floor(macroMs / stepMs) + 1,
      recenterCandidates: 0,
    },
  };
}

function moveTo(
  commands: DrawCommand[],
  current: { x: number; y: number },
  target: { x: number; y: number },
  grid: BrushGrid,
  recenterPlanner: RecenterPlanner,
): { x: number; y: number } {
  const canvasTarget = toCanvasPosition(target, grid);
  let moveOrigin = current;

  if (recenterPlanner.strategy === "time-saving") {
    const directSteps = manhattanDistance(current, canvasTarget);
    const recenteredSteps = manhattanDistance(recenterPlanner.center, canvasTarget);
    const directCost = directSteps * recenterPlanner.stepMs;
    const recenterCost = recenterPlanner.macroMs + recenteredSteps * recenterPlanner.stepMs;

    if (directCost > recenterCost) {
      recenterPlanner.stats.recenterCandidates += 1;
      recenterPlanner.stats.recenterCount += 1;
      recenterPlanner.stats.recenterSavedMs += directCost - recenterCost;
      commands.push(...createRecenterMacroCommands());
      moveOrigin = recenterPlanner.center;
    }
  }

  const dx = canvasTarget.x - moveOrigin.x;
  const dy = canvasTarget.y - moveOrigin.y;

  if (dx === 0 && dy === 0) {
    return canvasTarget;
  }

  commands.push(moveCommand(dx, dy));
  return canvasTarget;
}

function estimateTravelDistance(
  current: { x: number; y: number },
  pixels: Pixel[],
  grid: BrushGrid,
): number {
  let total = 0;
  let currentPosition = current;

  for (const pixel of pixels) {
    const next = toCanvasPosition(pixel, grid);
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

function canExtendRun(run: Pixel[], pixel: Pixel): boolean {
  const previous = run[run.length - 1];

  if (!previous) {
    return true;
  }

  if (run.length === 1) {
    return (
      (previous.y === pixel.y && Math.abs(previous.x - pixel.x) === 1) ||
      (previous.x === pixel.x && Math.abs(previous.y - pixel.y) === 1)
    );
  }

  const prevPrev = run[run.length - 2];
  if (!prevPrev) {
    return (
      previous.y === pixel.y && Math.abs(previous.x - pixel.x) === 1
    );
  }

  const isHorizontal = prevPrev.y === previous.y;

  if (isHorizontal) {
    return previous.y === pixel.y && Math.abs(previous.x - pixel.x) === 1;
  }

  return previous.x === pixel.x && Math.abs(previous.y - pixel.y) === 1;
}

function appendPixelRun(
  commands: DrawCommand[],
  run: Pixel[],
  current: { x: number; y: number },
  profile: DrawingProfile,
  grid: BrushGrid,
  recenterPlanner: RecenterPlanner,
): { position: { x: number; y: number }; paintCommandIndex: number | null } {
  const firstPixel = run[0];
  const lastPixel = run[run.length - 1];

  if (!firstPixel || !lastPixel) {
    return { position: current, paintCommandIndex: null };
  }

  moveTo(commands, current, firstPixel, grid, recenterPlanner);
  const paintCommandIndex = commands.length;

  if (run.length === 1) {
    commands.push(drawCommand(profile.drawButton));
  } else {
    const firstPosition = toCanvasPosition(firstPixel, grid);
    const lastPosition = toCanvasPosition(lastPixel, grid);
    const lineStride =
      profile.brushShape === "square" && profile.brushSize > 1 ? profile.brushSize : 1;
    commands.push(
      lineCommand(
        lastPosition.x - firstPosition.x,
        lastPosition.y - firstPosition.y,
        lineStride,
      ),
    );
  }

  return { position: toCanvasPosition(lastPixel, grid), paintCommandIndex };
}

function appendOrderedPixels(
  commands: DrawCommand[],
  orderedPixels: Pixel[],
  current: { x: number; y: number },
  profile: DrawingProfile,
  grid: BrushGrid,
  recenterPlanner: RecenterPlanner,
): { position: { x: number; y: number }; firstPaintCommandIndex: number | null } {
  let currentPosition = current;
  let run: Pixel[] = [];
  let firstPaintCommandIndex: number | null = null;

  for (const pixel of orderedPixels) {
    if (canExtendRun(run, pixel)) {
      run.push(pixel);
      continue;
    }

    const appendedRun = appendPixelRun(
      commands,
      run,
      currentPosition,
      profile,
      grid,
      recenterPlanner,
    );
    currentPosition = appendedRun.position;
    firstPaintCommandIndex ??= appendedRun.paintCommandIndex;
    run = [pixel];
  }

  const appendedRun = appendPixelRun(
    commands,
    run,
    currentPosition,
    profile,
    grid,
    recenterPlanner,
  );
  firstPaintCommandIndex ??= appendedRun.paintCommandIndex;
  return {
    position: appendedRun.position,
    firstPaintCommandIndex,
  };
}

function buildResumeLabel(
  profile: DrawingProfile,
  segmentIndex: number,
  colorHex: string | null,
  slotIndex: number | null,
): string {
  if (profile.colorMode === "mono") {
    return "单色重绘";
  }

  const normalizedColor = colorHex ? colorHex.toUpperCase() : "未知颜色";
  const slotLabel = slotIndex === null ? "" : ` · 槽位 ${slotIndex + 1}`;
  const prefix = profile.colorMode === "official" ? "官方色" : "自定义色";

  return `${prefix} ${segmentIndex + 1} · ${normalizedColor}${slotLabel}`;
}

function appendResumeSegment(
  commands: DrawCommand[],
  resumeSegments: ResumeSegment[],
  orderedPixels: Pixel[],
  current: { x: number; y: number },
  profile: DrawingProfile,
  grid: BrushGrid,
  recenterPlanner: RecenterPlanner,
  meta: {
    segmentIndex: number;
    colorHex: string | null;
    slotIndex: number | null;
    resumePrefixCommands: DrawCommand[];
  },
): { x: number; y: number } {
  const firstPixel = orderedPixels[0];

  if (!firstPixel) {
    return current;
  }

  const firstCanvasPosition = toCanvasPosition(firstPixel, grid);
  const appendedPixels = appendOrderedPixels(
    commands,
    orderedPixels,
    current,
    profile,
    grid,
    recenterPlanner,
  );

  resumeSegments.push({
    segmentIndex: meta.segmentIndex,
    label: buildResumeLabel(profile, meta.segmentIndex, meta.colorHex, meta.slotIndex),
    colorHex: meta.colorHex,
    slotIndex: meta.slotIndex,
    resumePrefixCommands: serializeCommands(meta.resumePrefixCommands),
    firstCanvasPosition,
    bodyStartCommandIndex: appendedPixels.firstPaintCommandIndex ?? commands.length,
    commandEndExclusive: commands.length,
  });

  return appendedPixels.position;
}

export function generateScanlinePlan(
  pixelMap: PixelMap,
  profile: DrawingProfile,
  pathStrategy: PathStrategy = "scanline",
  recenterStrategy: RecenterStrategy = "off",
): GeneratedScanlinePlan {
  const commands: DrawCommand[] = [];
  const grid = createBrushGrid(profile);
  const recenterPlanner = createRecenterPlanner(profile, recenterStrategy);
  const resumeSegments: ResumeSegment[] = [];
  const brushSetupCommands = buildAutomaticBrushSetupCommands(profile);
  let current = { x: 0, y: 0 };
  let segmentIndex = 0;

  const inputConfig = inputConfigCommand(
    profile.buttonPressDuration,
    profile.inputDelay,
    profile.homeDuration,
  );
  commands.push(inputConfig);
  commands.push(...brushSetupCommands);

  if (shouldStartFromCanvasCenter(profile)) {
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

  const initialCursor = { ...current };

  // Pre-group pixels by color to avoid repeated full-map scans
  const pixelsByColor = groupPixelsByColor(pixelMap);

  if (profile.colorMode === "mono") {
    const usedColorIndexes = [profile.startColorIndex];
    let selectedColor: number | null = profile.startColorIndex;

    for (const colorIndex of usedColorIndexes) {
      if (selectedColor !== colorIndex) {
        commands.push(colorCommand(colorIndex));
        selectedColor = colorIndex;
      }

      const orderedPixels = getOrderedPixelsForColor(pixelsByColor, colorIndex, current, profile, grid, pathStrategy);
      current = appendResumeSegment(
        commands,
        resumeSegments,
        orderedPixels,
        current,
        profile,
        grid,
        recenterPlanner,
        {
          segmentIndex,
          colorHex: orderedPixels[0]?.colorHex ?? null,
          slotIndex: null,
          resumePrefixCommands: [
            ...brushSetupCommands,
            ...(profile.startColorIndex === 0 ? [] : [colorCommand(profile.startColorIndex)]),
          ],
        },
      );
      segmentIndex += 1;
    }
  } else if (profile.colorMode === "palette") {
    const usedColors = getUsedPaletteColors(pixelMap);

    for (let batchStart = 0; batchStart < usedColors.length; batchStart += PALETTE_SLOT_COUNT) {
      const batch = usedColors.slice(batchStart, batchStart + PALETTE_SLOT_COUNT);
      const batchPrefixCommands = batch.map((color, slotIndex) =>
        paletteConfigCommand(slotIndex, color.colorHex),
      );
      let selectedSlot: number | null = null;

      commands.push(...batchPrefixCommands);

      for (const [slotIndex, color] of batch.entries()) {
        if (selectedSlot !== slotIndex) {
          commands.push(colorCommand(slotIndex));
          selectedSlot = slotIndex;
        }

        const orderedPixels = getOrderedPixelsForColor(pixelsByColor, color.colorIndex, current, profile, grid, pathStrategy);
        current = appendResumeSegment(
          commands,
          resumeSegments,
          orderedPixels,
          current,
          profile,
          grid,
          recenterPlanner,
          {
            segmentIndex,
            colorHex: color.colorHex,
            slotIndex,
            resumePrefixCommands: [
              ...brushSetupCommands,
              ...batchPrefixCommands.slice(slotIndex),
              colorCommand(slotIndex),
            ],
          },
        );
        segmentIndex += 1;
      }
    }
  } else {
    const usedColors = getUsedPaletteColors(pixelMap);
    let didResetOfficialPaletteState = false;

    for (let batchStart = 0; batchStart < usedColors.length; batchStart += PALETTE_SLOT_COUNT) {
      const batch = usedColors.slice(batchStart, batchStart + PALETTE_SLOT_COUNT);
      const batchConfigCommands = batch.map((color, slotIndex) => {
        const cell = officialPaletteCellFromIndex(color.colorIndex);
        return basicPaletteConfigCommand(slotIndex, cell.row, cell.col);
      });
      let selectedSlot: number | null = null;

      if (!didResetOfficialPaletteState) {
        commands.push(basicPaletteResetCommand());
        didResetOfficialPaletteState = true;
      }

      commands.push(...batchConfigCommands);

      for (const [slotIndex, color] of batch.entries()) {
        if (selectedSlot !== slotIndex) {
          commands.push(colorCommand(slotIndex));
          selectedSlot = slotIndex;
        }

        const orderedPixels = getOrderedPixelsForColor(pixelsByColor, color.colorIndex, current, profile, grid, pathStrategy);
        current = appendResumeSegment(
          commands,
          resumeSegments,
          orderedPixels,
          current,
          profile,
          grid,
          recenterPlanner,
          {
            segmentIndex,
            colorHex: color.colorHex,
            slotIndex,
            resumePrefixCommands: [
              ...brushSetupCommands,
              basicPaletteResetCommand(),
              ...batchConfigCommands.slice(slotIndex),
              colorCommand(slotIndex),
            ],
          },
        );
        segmentIndex += 1;
      }
    }
  }

  commands.push(endCommand());
  return {
    commands,
    recenterStats: recenterPlanner.stats,
    resumePlan: {
      inputConfigCommand: serializeCommand(inputConfig),
      initialCursor,
      segments: resumeSegments,
    },
  };
}

export function generateScanlineCommands(
  pixelMap: PixelMap,
  profile: DrawingProfile,
  pathStrategy: PathStrategy = "scanline",
  recenterStrategy: RecenterStrategy = "off",
): DrawCommand[] {
  return generateScanlinePlan(pixelMap, profile, pathStrategy, recenterStrategy).commands;
}

export function estimateRuntimeMs(commands: DrawCommand[], profile: DrawingProfile): number {
  let timing = {
    buttonPressMs: profile.buttonPressDuration,
    inputDelayMs: profile.inputDelay,
    homeMs: profile.homeDuration,
  };
  const basicPaletteState = createBasicPaletteTimingState();

  return commands.reduce((total, command) => {
    switch (command.type) {
      case "inputConfig":
        timing = {
          buttonPressMs: command.buttonPressMs,
          inputDelayMs: command.inputDelayMs,
          homeMs: command.homeMs,
        };
        return total;
      case "home":
        return total + timing.homeMs * 2 + timing.inputDelayMs;
      case "move":
        return (
          total +
          (Math.abs(command.dx) + Math.abs(command.dy)) *
            (timing.buttonPressMs + timing.inputDelayMs)
        );
      case "stick":
        return total + command.ms + timing.inputDelayMs;
      case "line":
        {
          const metrics = getLineCommandMetrics(command.dx, command.dy, command.stride ?? 1);

          return total + metrics.actionCount * (timing.buttonPressMs + timing.inputDelayMs);
        }
      case "draw":
      case "press":
        return total + timing.buttonPressMs + timing.inputDelayMs;
      case "color":
        return total + estimateColorSelectDurationMs(command.index, timing);
      case "paletteConfig":
        {
          const hex = command.colorHex.replace(/^#/u, "");
          const red = Number.parseInt(hex.slice(0, 2), 16);
          const green = Number.parseInt(hex.slice(2, 4), 16);
          const blue = Number.parseInt(hex.slice(4, 6), 16);

          return total + estimatePaletteConfigDurationMs(command.slot, red, green, blue, timing);
        }
      case "basicPaletteConfig":
        {
          const estimatedDuration = estimateBasicPaletteConfigDurationMs(
            command.slot,
            command.row,
            command.col,
            timing,
            { basicPaletteState },
          );
          updateBasicPaletteTimingState(
            basicPaletteState,
            command.slot,
            command.row,
            command.col,
          );
          return total + estimatedDuration;
        }
      case "basicPaletteReset":
        resetBasicPaletteTimingState(basicPaletteState);
        return total + timing.inputDelayMs;
      case "wait":
        return total + command.ms;
      case "pause":
      case "resume":
      case "end":
        return total + timing.inputDelayMs;
      default:
        return total;
    }
  }, 0);
}
