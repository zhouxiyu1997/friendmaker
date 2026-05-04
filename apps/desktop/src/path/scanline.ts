import type { DrawingProfile, Pixel, PixelMap, ResumePlan, ResumeSegment } from "../types.js";
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
  type DrawCommand,
} from "../protocol/commands.js";
import { serializeCommand, serializeCommands } from "../protocol/serializer.js";

export type PathStrategy = "scanline" | "nearest";
export interface GeneratedScanlinePlan {
  commands: DrawCommand[];
  resumePlan: ResumePlan;
}

const PALETTE_SLOT_COUNT = 9;
const EXACT_COMPONENT_ORDER_LIMIT = 6;
const EXACT_COMPONENT_PIXEL_LIMIT = 300;
const NEIGHBOR_OFFSETS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

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

function rotatePixelsToNearestStart(
  pixels: Pixel[],
  current: { x: number; y: number },
  grid: BrushGrid,
): Pixel[] {
  if (pixels.length <= 1) {
    return pixels;
  }

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  pixels.forEach((pixel, index) => {
    const target = toCanvasPosition(pixel, grid);
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
  grid: BrushGrid,
): Pixel[] {
  if (pixels.length <= 1) {
    return pixels;
  }

  const topDown = rotatePixelsToNearestStart(buildSerpentineRows(pixels, false), current, grid);
  const bottomUp = rotatePixelsToNearestStart(buildSerpentineRows(pixels, true), current, grid);

  const topFirst = topDown[0];
  const bottomFirst = bottomUp[0];

  if (!topFirst) {
    return bottomUp;
  }

  if (!bottomFirst) {
    return topDown;
  }

  const topStart = toCanvasPosition(topFirst, grid);
  const bottomStart = toCanvasPosition(bottomFirst, grid);
  const topDistance = Math.abs(topStart.x - current.x) + Math.abs(topStart.y - current.y);
  const bottomDistance = Math.abs(bottomStart.x - current.x) + Math.abs(bottomStart.y - current.y);

  return topDistance <= bottomDistance ? topDown : bottomUp;
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

  if (profile.brushSize === 1) {
    return getLegacyScanlinePixels(pixels);
  }

  const components = collectConnectedComponents(pixels);
  const legacyPixels = rotatePixelsToNearestStart(
    getLegacyScanlinePixels(pixels),
    current,
    grid,
  );

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
    const td = rotatePixelsToNearestStart(pre.topDown, pos, grid);
    const bu = rotatePixelsToNearestStart(pre.bottomUp, pos, grid);

    const tdStart = td[0];
    const buStart = bu[0];

    if (!tdStart) {
      const last = bu[bu.length - 1];
      return { pixels: bu, endPos: last ? toCanvasPosition(last, grid) : pos };
    }
    if (!buStart) {
      const last = td[td.length - 1];
      return { pixels: td, endPos: last ? toCanvasPosition(last, grid) : pos };
    }

    const tdPos = toCanvasPosition(tdStart, grid);
    const buPos = toCanvasPosition(buStart, grid);
    const tdDist = Math.abs(tdPos.x - pos.x) + Math.abs(tdPos.y - pos.y);
    const buDist = Math.abs(buPos.x - pos.x) + Math.abs(buPos.y - pos.y);

    if (tdDist <= buDist) {
      const last = td[td.length - 1];
      return { pixels: td, endPos: last ? toCanvasPosition(last, grid) : pos };
    }
    const last = bu[bu.length - 1];
    return { pixels: bu, endPos: last ? toCanvasPosition(last, grid) : pos };
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

function moveTo(
  current: { x: number; y: number },
  target: { x: number; y: number },
  grid: BrushGrid,
): DrawCommand[] {
  const canvasTarget = toCanvasPosition(target, grid);
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
): { x: number; y: number } {
  const firstPixel = run[0];
  const lastPixel = run[run.length - 1];

  if (!firstPixel || !lastPixel) {
    return current;
  }

  commands.push(...moveTo(current, firstPixel, grid));

  if (run.length === 1) {
    commands.push(drawCommand(profile.drawButton));
  } else {
    const firstPosition = toCanvasPosition(firstPixel, grid);
    const lastPosition = toCanvasPosition(lastPixel, grid);
    commands.push(lineCommand(lastPosition.x - firstPosition.x, lastPosition.y - firstPosition.y));
  }

  return toCanvasPosition(lastPixel, grid);
}

function appendOrderedPixels(
  commands: DrawCommand[],
  orderedPixels: Pixel[],
  current: { x: number; y: number },
  profile: DrawingProfile,
  grid: BrushGrid,
): { x: number; y: number } {
  let currentPosition = current;
  let run: Pixel[] = [];

  for (const pixel of orderedPixels) {
    if (canExtendRun(run, pixel)) {
      run.push(pixel);
      continue;
    }

    currentPosition = appendPixelRun(commands, run, currentPosition, profile, grid);
    run = [pixel];
  }

  return appendPixelRun(commands, run, currentPosition, profile, grid);
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
  const needsInitialMove =
    firstCanvasPosition.x !== current.x || firstCanvasPosition.y !== current.y;
  const bodyStartCommandIndex = commands.length + (needsInitialMove ? 1 : 0);
  const nextPosition = appendOrderedPixels(commands, orderedPixels, current, profile, grid);

  resumeSegments.push({
    segmentIndex: meta.segmentIndex,
    label: buildResumeLabel(profile, meta.segmentIndex, meta.colorHex, meta.slotIndex),
    colorHex: meta.colorHex,
    slotIndex: meta.slotIndex,
    resumePrefixCommands: serializeCommands(meta.resumePrefixCommands),
    firstCanvasPosition,
    bodyStartCommandIndex,
    commandEndExclusive: commands.length,
  });

  return nextPosition;
}

export function generateScanlinePlan(
  pixelMap: PixelMap,
  profile: DrawingProfile,
  pathStrategy: PathStrategy = "scanline",
): GeneratedScanlinePlan {
  const commands: DrawCommand[] = [];
  const grid = createBrushGrid(profile);
  const resumeSegments: ResumeSegment[] = [];
  let current = { x: 0, y: 0 };
  let segmentIndex = 0;

  const inputConfig = inputConfigCommand(
    profile.buttonPressDuration,
    profile.inputDelay,
    profile.homeDuration,
  );
  commands.push(inputConfig);

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
        {
          segmentIndex,
          colorHex: orderedPixels[0]?.colorHex ?? null,
          slotIndex: null,
          resumePrefixCommands: profile.startColorIndex === 0 ? [] : [colorCommand(profile.startColorIndex)],
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
          {
            segmentIndex,
            colorHex: color.colorHex,
            slotIndex,
            resumePrefixCommands: [...batchPrefixCommands.slice(slotIndex), colorCommand(slotIndex)],
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
          {
            segmentIndex,
            colorHex: color.colorHex,
            slotIndex,
            resumePrefixCommands: [
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
): DrawCommand[] {
  return generateScanlinePlan(pixelMap, profile, pathStrategy).commands;
}

export function estimateRuntimeMs(commands: DrawCommand[], profile: DrawingProfile): number {
  let timing = {
    buttonPressMs: profile.buttonPressDuration,
    inputDelayMs: profile.inputDelay,
    homeMs: profile.homeDuration,
  };

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
      case "line":
        return (
          total +
          (Math.abs(command.dx) + Math.abs(command.dy) + 1) *
            (timing.buttonPressMs + timing.inputDelayMs)
        );
      case "draw":
      case "press":
        return total + timing.buttonPressMs + timing.inputDelayMs;
      case "color":
        return total + profile.colorChangeDuration;
      case "paletteConfig":
        return total + profile.colorChangeDuration * 6;
      case "basicPaletteConfig":
        return total + profile.colorChangeDuration * 4;
      case "basicPaletteReset":
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
