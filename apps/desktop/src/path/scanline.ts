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
  holdButtonCommand,
  homeCommand,
  inputConfigCommand,
  lineCommand,
  moveCommand,
  paletteConfigCommand,
  pressButtonCommand,
  type DrawCommand,
} from "../protocol/commands.js";
import {
  calculateCommandRuntimeBreakdown,
  estimateCommandRuntimeMs,
  type CommandRuntimeBreakdown,
} from "../protocol/runtimeEstimate.js";
import { serializeCommand, serializeCommands } from "../protocol/serializer.js";
import { collectConnectedPixelComponents } from "../image/componentAnalysis.js";

export type PathStrategy = "scanline" | "nearest";
export type RecenterMode = "off" | "left-hold";

export interface RecenterStats {
  enabled: boolean;
  mode: RecenterMode;
  shortcutCount: number;
  moveStepsSaved: number;
  estimatedRuntimeSavedMs: number;
  holdMs: number;
  safetyMarginSteps: number;
}

export interface ScanlinePlanningOptions {
  pathStrategy?: PathStrategy;
  recenterMode?: RecenterMode;
  recenterHoldMs?: number;
  recenterSafetyMarginSteps?: number;
  recenterAwareRouting?: boolean;
}

export interface GeneratedScanlinePlan {
  commands: DrawCommand[];
  resumePlan: ResumePlan;
  recenterStats: RecenterStats;
}

const PALETTE_SLOT_COUNT = 9;
const EXACT_COMPONENT_ORDER_LIMIT = 6;
const EXACT_COMPONENT_PIXEL_LIMIT = 300;
const DEFAULT_RECENTER_HOLD_MS = 3_000;
const DEFAULT_RECENTER_SAFETY_MARGIN_STEPS = 30;
const NEIGHBOR_OFFSETS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

export interface RecenterTransitionOptions {
  mode: RecenterMode;
  holdMs: number;
  safetyMarginSteps: number;
}

export interface RecenterTransitionPlan {
  costMs: number;
  directCostMs: number;
  recenterCostMs: number;
  directSteps: number;
  recenterEquivalentSteps: number;
  usesRecenter: boolean;
  commands: DrawCommand[];
  resultingPosition: { x: number; y: number };
  moveStepsSaved: number;
  estimatedRuntimeSavedMs: number;
}

interface RecenterTransitionScore {
  costMs: number;
  directCostMs: number;
  recenterCostMs: number;
  directSteps: number;
  recenterEquivalentSteps: number;
  centerDx: number;
  centerDy: number;
  usesRecenter: boolean;
  moveStepsSaved: number;
  estimatedRuntimeSavedMs: number;
}

interface RouteScoringContext {
  profile: DrawingProfile;
  grid: BrushGrid;
  recenter: RecenterTransitionOptions;
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

function pixelKey(point: { x: number; y: number }): string {
  return `${point.x},${point.y}`;
}

function getCanvasCenter(profile: DrawingProfile): { x: number; y: number } {
  return {
    x: Math.floor(profile.canvasWidth / 2),
    y: Math.floor(profile.canvasHeight / 2),
  };
}

function getStepMs(profile: DrawingProfile): number {
  return profile.buttonPressDuration + profile.inputDelay;
}

function scoreTransition(
  current: { x: number; y: number },
  target: { x: number; y: number },
  profile: DrawingProfile,
  recenter: RecenterTransitionOptions,
): RecenterTransitionScore {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const directSteps = Math.abs(dx) + Math.abs(dy);
  const stepMs = getStepMs(profile);
  const directCostMs = directSteps * stepMs;
  const center = getCanvasCenter(profile);
  const centerDx = target.x - center.x;
  const centerDy = target.y - center.y;
  const centerToTargetSteps = Math.abs(centerDx) + Math.abs(centerDy);
  const holdEquivalentSteps = stepMs > 0 ? Math.ceil(recenter.holdMs / stepMs) : 0;
  const recenterEquivalentSteps = holdEquivalentSteps + 2 + centerToTargetSteps;
  const recenterCostMs =
    recenter.holdMs +
    profile.inputDelay +
    2 * stepMs +
    centerToTargetSteps * stepMs;
  const usesRecenter =
    directSteps > 0 &&
    recenter.mode === "left-hold" &&
    directSteps - recenterEquivalentSteps >= recenter.safetyMarginSteps &&
    recenterCostMs < directCostMs;

  return {
    costMs: usesRecenter ? recenterCostMs : directCostMs,
    directCostMs,
    recenterCostMs,
    directSteps,
    recenterEquivalentSteps,
    centerDx,
    centerDy,
    usesRecenter,
    moveStepsSaved: usesRecenter ? directSteps - recenterEquivalentSteps : 0,
    estimatedRuntimeSavedMs: usesRecenter
      ? Math.max(0, directCostMs - recenterCostMs)
      : 0,
  };
}

export function planTransition(
  current: { x: number; y: number },
  target: { x: number; y: number },
  profile: DrawingProfile,
  recenter: RecenterTransitionOptions,
): RecenterTransitionPlan {
  const score = scoreTransition(current, target, profile, recenter);
  const commands: DrawCommand[] = [];

  if (score.directSteps > 0) {
    if (score.usesRecenter) {
      commands.push(
        holdButtonCommand("DLEFT", recenter.holdMs),
        pressButtonCommand("X"),
        pressButtonCommand("A"),
      );

      if (score.centerDx !== 0 || score.centerDy !== 0) {
        commands.push(moveCommand(score.centerDx, score.centerDy));
      }
    } else {
      commands.push(moveCommand(target.x - current.x, target.y - current.y));
    }
  }

  return {
    costMs: score.costMs,
    directCostMs: score.directCostMs,
    recenterCostMs: score.recenterCostMs,
    directSteps: score.directSteps,
    recenterEquivalentSteps: score.recenterEquivalentSteps,
    usesRecenter: score.usesRecenter,
    commands,
    resultingPosition: { ...target },
    moveStepsSaved: score.moveStepsSaved,
    estimatedRuntimeSavedMs: score.estimatedRuntimeSavedMs,
  };
}

function transitionCostToPixel(
  current: { x: number; y: number },
  pixel: Pixel,
  scoring: RouteScoringContext,
): number {
  return scoreTransition(
    current,
    toCanvasPosition(pixel, scoring.grid),
    scoring.profile,
    scoring.recenter,
  ).costMs;
}

function estimateTravelCost(
  current: { x: number; y: number },
  pixels: Pixel[],
  scoring: RouteScoringContext,
): number {
  let total = 0;
  let currentPosition = current;

  for (const pixel of pixels) {
    const next = toCanvasPosition(pixel, scoring.grid);
    total += scoreTransition(
      currentPosition,
      next,
      scoring.profile,
      scoring.recenter,
    ).costMs;
    currentPosition = next;
  }

  return total;
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
  scoring: RouteScoringContext,
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

    const distance = estimateTravelCost(current, candidate, scoring);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestOrder = candidate;
    }
  }

  return bestOrder;
}

function collectConnectedComponents(pixels: Pixel[]): Pixel[][] {
  return collectConnectedPixelComponents(pixels);
}

function getNearestNeighborPixels(
  pixels: Pixel[],
  current: { x: number; y: number },
  scoring: RouteScoringContext,
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
        const distance = transitionCostToPixel(position, candidate, scoring);
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
    position = toCanvasPosition(next, scoring.grid);
    last = next;
  }

  return ordered;
}

function getNearestNeighborPixelsByComponents(
  pixels: Pixel[],
  current: { x: number; y: number },
  scoring: RouteScoringContext,
): Pixel[] {
  const components = collectConnectedComponents(pixels);
  if (components.length <= 1) {
    return getNearestNeighborPixels(pixels, current, scoring);
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
        const distance = transitionCostToPixel(position, pixel, scoring);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
          if (distance === 0) break;
        }
      }
    }

    const [chosen] = remaining.splice(bestIndex, 1);
    if (!chosen) break;

    const sub = getNearestNeighborPixels(chosen, position, scoring);
    if (sub.length === 0) continue;

    ordered.push(...sub);
    const lastPixel = sub[sub.length - 1]!;
    position = toCanvasPosition(lastPixel, scoring.grid);
  }

  return ordered;
}

function getOrderedPixelsForColor(
  pixelsByColor: Map<number, Pixel[]>,
  colorIndex: number,
  current: { x: number; y: number },
  scoring: RouteScoringContext,
  pathStrategy: PathStrategy,
): Pixel[] {
  const pixels = pixelsByColor.get(colorIndex);
  if (!pixels || pixels.length === 0) return [];

  if (pathStrategy === "nearest") {
    return getNearestNeighborPixelsByComponents(pixels, current, scoring);
  }

  const components = collectConnectedComponents(pixels);
  const legacyPixels = chooseBestSerpentineOrder(pixels, current, scoring);

  if (components.length <= 1) {
    return legacyPixels;
  }

  let orderedPixels: Pixel[];

  if (
    components.length <= EXACT_COMPONENT_ORDER_LIMIT &&
    pixels.length <= EXACT_COMPONENT_PIXEL_LIMIT
  ) {
    orderedPixels = findOptimalComponentOrder(components, current, scoring);
  } else {
    orderedPixels = greedyComponentOrder(components, current, scoring);
  }

  const optimizedDistance = estimateTravelCost(current, orderedPixels, scoring);
  const legacyDistance = estimateTravelCost(current, legacyPixels, scoring);

  return optimizedDistance < legacyDistance ? orderedPixels : legacyPixels;
}

function greedyComponentOrder(
  components: Pixel[][],
  current: { x: number; y: number },
  scoring: RouteScoringContext,
): Pixel[] {
  const remaining = [...components];
  const orderedPixels: Pixel[] = [];
  let currentPosition = current;

  while (remaining.length > 0) {
    let selectedIndex = 0;
    let selectedDistance = Number.POSITIVE_INFINITY;
    let selectedOrder: Pixel[] = [];

    remaining.forEach((component, index) => {
      const candidate = chooseBestSerpentineOrder(component, currentPosition, scoring);

      if (candidate.length === 0) return;

      const firstPixel = candidate[0];
      if (!firstPixel) return;

      const distance = transitionCostToPixel(currentPosition, firstPixel, scoring);

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
      currentPosition = toCanvasPosition(lastPixel, scoring.grid);
    }

    remaining.splice(selectedIndex, 1);
  }

  return orderedPixels;
}

function findOptimalComponentOrder(
  components: Pixel[][],
  current: { x: number; y: number },
  scoring: RouteScoringContext,
): Pixel[] {
  if (components.length <= 1) {
    return chooseBestSerpentineOrder(components[0] ?? [], current, scoring);
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

      const distance = estimateTravelCost(pos, candidate, scoring);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestPixels = candidate;
      }
    }

    const last = bestPixels[bestPixels.length - 1];
    return {
      pixels: bestPixels,
      endPos: last ? toCanvasPosition(last, scoring.grid) : pos,
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
        totalDist += transitionCostToPixel(pos, first, scoring);
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

function createRecenterStats(options: ScanlinePlanningOptions): RecenterStats {
  const mode = options.recenterMode ?? "off";

  return {
    enabled: mode !== "off",
    mode,
    shortcutCount: 0,
    moveStepsSaved: 0,
    estimatedRuntimeSavedMs: 0,
    holdMs: Math.max(0, Math.floor(options.recenterHoldMs ?? DEFAULT_RECENTER_HOLD_MS)),
    safetyMarginSteps: Math.max(
      0,
      Math.floor(options.recenterSafetyMarginSteps ?? DEFAULT_RECENTER_SAFETY_MARGIN_STEPS),
    ),
  };
}

function recenterOptionsFromStats(recenterStats: RecenterStats): RecenterTransitionOptions {
  return {
    mode: recenterStats.mode,
    holdMs: recenterStats.holdMs,
    safetyMarginSteps: recenterStats.safetyMarginSteps,
  };
}

function recenterOptionsFromPlanning(
  options: ScanlinePlanningOptions,
): RecenterTransitionOptions {
  return {
    mode:
      options.recenterMode !== "off" && options.recenterAwareRouting !== false
        ? options.recenterMode ?? "off"
        : "off",
    holdMs: Math.max(0, Math.floor(options.recenterHoldMs ?? DEFAULT_RECENTER_HOLD_MS)),
    safetyMarginSteps: Math.max(
      0,
      Math.floor(options.recenterSafetyMarginSteps ?? DEFAULT_RECENTER_SAFETY_MARGIN_STEPS),
    ),
  };
}

function normalizePlanningOptions(
  options: PathStrategy | ScanlinePlanningOptions | undefined,
): Required<Pick<ScanlinePlanningOptions, "pathStrategy" | "recenterMode">> &
  ScanlinePlanningOptions {
  if (typeof options === "string") {
    return {
      pathStrategy: options,
      recenterMode: "off",
      recenterHoldMs: DEFAULT_RECENTER_HOLD_MS,
      recenterSafetyMarginSteps: DEFAULT_RECENTER_SAFETY_MARGIN_STEPS,
      recenterAwareRouting: false,
    };
  }

  return {
    pathStrategy: options?.pathStrategy ?? "scanline",
    recenterMode: options?.recenterMode ?? "off",
    recenterHoldMs: options?.recenterHoldMs ?? DEFAULT_RECENTER_HOLD_MS,
    recenterSafetyMarginSteps:
      options?.recenterSafetyMarginSteps ?? DEFAULT_RECENTER_SAFETY_MARGIN_STEPS,
    recenterAwareRouting: options?.recenterAwareRouting ?? true,
  };
}

function findFirstDrawCommandIndex(commands: DrawCommand[], fromIndex: number): number {
  for (let index = fromIndex; index < commands.length; index += 1) {
    const command = commands[index];

    if (command?.type === "draw" || command?.type === "line") {
      return index;
    }
  }

  return commands.length;
}

function appendMoveTo(
  commands: DrawCommand[],
  current: { x: number; y: number },
  target: { x: number; y: number },
  profile: DrawingProfile,
  grid: BrushGrid,
  recenterStats: RecenterStats,
): { x: number; y: number } {
  const transition = planTransition(
    current,
    toCanvasPosition(target, grid),
    profile,
    recenterOptionsFromStats(recenterStats),
  );
  commands.push(...transition.commands);

  if (transition.usesRecenter) {
    recenterStats.shortcutCount += 1;
    recenterStats.moveStepsSaved += transition.moveStepsSaved;
    recenterStats.estimatedRuntimeSavedMs += transition.estimatedRuntimeSavedMs;
  }

  return transition.resultingPosition;
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
  recenterStats: RecenterStats,
): { x: number; y: number } {
  const firstPixel = run[0];
  const lastPixel = run[run.length - 1];

  if (!firstPixel || !lastPixel) {
    return current;
  }

  appendMoveTo(commands, current, firstPixel, profile, grid, recenterStats);

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
  recenterStats: RecenterStats,
): { x: number; y: number } {
  let currentPosition = current;
  let run: Pixel[] = [];

  for (const pixel of orderedPixels) {
    if (canExtendRun(run, pixel)) {
      run.push(pixel);
      continue;
    }

    currentPosition = appendPixelRun(commands, run, currentPosition, profile, grid, recenterStats);
    run = [pixel];
  }

  return appendPixelRun(commands, run, currentPosition, profile, grid, recenterStats);
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
  recenterStats: RecenterStats,
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
  const segmentStartCommandIndex = commands.length;
  const nextPosition = appendOrderedPixels(commands, orderedPixels, current, profile, grid, recenterStats);
  const bodyStartCommandIndex = findFirstDrawCommandIndex(commands, segmentStartCommandIndex);

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
  options?: PathStrategy | ScanlinePlanningOptions,
): GeneratedScanlinePlan {
  const planningOptions = normalizePlanningOptions(options);
  const recenterStats = createRecenterStats(planningOptions);
  const commands: DrawCommand[] = [];
  const grid = createBrushGrid(profile);
  const scoring: RouteScoringContext = {
    profile,
    grid,
    recenter: recenterOptionsFromPlanning(planningOptions),
  };
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

      const orderedPixels = getOrderedPixelsForColor(
        pixelsByColor,
        colorIndex,
        current,
        scoring,
        planningOptions.pathStrategy,
      );
      current = appendResumeSegment(
        commands,
        resumeSegments,
        orderedPixels,
        current,
        profile,
        grid,
        recenterStats,
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

        const orderedPixels = getOrderedPixelsForColor(
          pixelsByColor,
          color.colorIndex,
          current,
          scoring,
          planningOptions.pathStrategy,
        );
        current = appendResumeSegment(
          commands,
          resumeSegments,
          orderedPixels,
          current,
          profile,
          grid,
          recenterStats,
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

        const orderedPixels = getOrderedPixelsForColor(
          pixelsByColor,
          color.colorIndex,
          current,
          scoring,
          planningOptions.pathStrategy,
        );
        current = appendResumeSegment(
          commands,
          resumeSegments,
          orderedPixels,
          current,
          profile,
          grid,
          recenterStats,
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
    recenterStats,
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
  options?: PathStrategy | ScanlinePlanningOptions,
): DrawCommand[] {
  return generateScanlinePlan(pixelMap, profile, options).commands;
}

export function estimateRuntimeMs(commands: DrawCommand[], profile: DrawingProfile): number {
  return estimateCommandRuntimeMs(commands, profile);
}

export function calculateRuntimeBreakdown(
  commands: DrawCommand[],
  profile: DrawingProfile,
): CommandRuntimeBreakdown {
  return calculateCommandRuntimeBreakdown(commands, profile);
}
