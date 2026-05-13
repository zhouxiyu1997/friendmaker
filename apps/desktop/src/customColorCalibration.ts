import type {
  CustomColorCalibration,
  CustomColorCalibrationSample,
  CustomColorCalibrationSampleDefinition,
  PaletteCalibrationEntry,
  PaletteCalibrationSteps,
  PixelMap,
  RgbColor,
} from "./types.js";
import { normalizeHexColor, parseHexColor, rgbToHex } from "./utils/colors.js";

const HUE_STEP_COUNT = 200;
const SATURATION_STEP_COUNT = 213;
const VALUE_STEP_COUNT = 112;
const ACHROMATIC_SATURATION_THRESHOLD = 0.04;
const LOW_SATURATION_THRESHOLD = 0.28;
const PROBLEM_BLEND_RADIUS = 0.42;
const HUE_BIAS_WEIGHT = 0.65;
const CHROMATIC_HUE_DELTA_WEIGHT = 0.85;
const CHROMATIC_SATURATION_DELTA_WEIGHT = 0.7;
const CHROMATIC_VALUE_DELTA_WEIGHT = 0.42;
const PROBLEM_HUE_DELTA_WEIGHT = 0.85;
const PROBLEM_SATURATION_DELTA_WEIGHT = 0.72;
const PROBLEM_VALUE_DELTA_WEIGHT = 0.5;
const LOW_SATURATION_HUE_DELTA_WEIGHT = 0.7;
const LOW_SATURATION_SATURATION_DELTA_WEIGHT = 0.58;
const LOW_SATURATION_VALUE_DELTA_WEIGHT = 0.38;

interface HsvColor {
  hue: number;
  saturation: number;
  value: number;
}

interface ProblemSeed {
  id: string;
  label: string;
  targetHex: string;
}

interface HueSeed {
  id: string;
  label: string;
  hue: number;
}

interface CalibrationProblemAnchorInfo {
  id: string;
  label: string;
  targetHex: string;
}

const HUE_SAMPLE_SEEDS: HueSeed[] = [
  { id: "hue-0", label: "色相锚点 0°", hue: 0 },
  { id: "hue-35", label: "色相锚点 35°", hue: 35 },
  { id: "hue-75", label: "色相锚点 75°", hue: 75 },
  { id: "hue-145", label: "色相锚点 145°", hue: 145 },
  { id: "hue-220", label: "色相锚点 220°", hue: 220 },
  { id: "hue-310", label: "色相锚点 310°", hue: 310 },
];

const HUE_SAMPLE_SATURATION = 0.55;
const HUE_SAMPLE_VALUE = 0.6;

const PROBLEM_SAMPLE_SEEDS: ProblemSeed[] = [
  { id: "skin", label: "问题色 · 肤色", targetHex: "#d5a184" },
  { id: "brown", label: "问题色 · 棕色", targetHex: "#8a5a34" },
  { id: "warm-gray", label: "问题色 · 暖灰", targetHex: "#82756c" },
];

const DEFAULT_CUSTOM_COLOR_CALIBRATION: CustomColorCalibration = {
  version: 1,
  enabled: true,
  updatedAt: "2026-05-13T09:29:21.664Z",
  samples: [
    {
      id: "hue-0",
      kind: "hue-anchor",
      label: "色相锚点 0°",
      targetHex: "#994545",
      baseSteps: { hue: 0, saturation: 117, value: 45 },
      adjustments: { hue: 0, saturation: 75, value: 15 },
      finalSteps: { hue: 0, saturation: 192, value: 60 },
      predictedHex: "#760c0c",
    },
    {
      id: "hue-35",
      kind: "hue-anchor",
      label: "色相锚点 35°",
      targetHex: "#997645",
      baseSteps: { hue: 181, saturation: 117, value: 45 },
      adjustments: { hue: 0, saturation: 40, value: 25 },
      finalSteps: { hue: 181, saturation: 157, value: 70 },
      predictedHex: "#604119",
    },
    {
      id: "hue-75",
      kind: "hue-anchor",
      label: "色相锚点 75°",
      targetHex: "#849945",
      baseSteps: { hue: 158, saturation: 117, value: 45 },
      adjustments: { hue: 0, saturation: 35, value: 15 },
      finalSteps: { hue: 158, saturation: 152, value: 60 },
      predictedHex: "#607622",
    },
    {
      id: "hue-145",
      kind: "hue-anchor",
      label: "色相锚点 145°",
      targetHex: "#459968",
      baseSteps: { hue: 119, saturation: 117, value: 45 },
      adjustments: { hue: 10, saturation: 40, value: 20 },
      finalSteps: { hue: 129, saturation: 157, value: 65 },
      predictedHex: "#1c6b26",
    },
    {
      id: "hue-220",
      kind: "hue-anchor",
      label: "色相锚点 220°",
      targetHex: "#456199",
      baseSteps: { hue: 78, saturation: 117, value: 45 },
      adjustments: { hue: 0, saturation: 35, value: 25 },
      finalSteps: { hue: 78, saturation: 152, value: 70 },
      predictedHex: "#1b3360",
    },
    {
      id: "hue-310",
      kind: "hue-anchor",
      label: "色相锚点 310°",
      targetHex: "#99458b",
      baseSteps: { hue: 28, saturation: 117, value: 45 },
      adjustments: { hue: 0, saturation: 25, value: 10 },
      finalSteps: { hue: 28, saturation: 142, value: 55 },
      predictedHex: "#822b74",
    },
    {
      id: "skin",
      kind: "problem-anchor",
      label: "问题色 · 肤色",
      targetHex: "#d5a184",
      baseSteps: { hue: 188, saturation: 81, value: 18 },
      adjustments: { hue: 0, saturation: 30, value: 20 },
      finalSteps: { hue: 188, saturation: 111, value: 38 },
      predictedHex: "#a87051",
    },
    {
      id: "brown",
      kind: "problem-anchor",
      label: "问题色 · 棕色",
      targetHex: "#8a5a34",
      baseSteps: { hue: 185, saturation: 133, value: 51 },
      adjustments: { hue: 0, saturation: 35, value: 25 },
      finalSteps: { hue: 185, saturation: 168, value: 76 },
      predictedHex: "#522e11",
    },
    {
      id: "warm-gray",
      kind: "problem-anchor",
      label: "问题色 · 暖灰",
      targetHex: "#82756c",
      baseSteps: { hue: 186, saturation: 36, value: 55 },
      adjustments: { hue: 0, saturation: 50, value: 20 },
      finalSteps: { hue: 186, saturation: 86, value: 75 },
      predictedHex: "#544132",
    },
  ],
  derivedModel: {
    hueAnchors: [
      { sampleId: "hue-0", hue: 0, delta: { hue: 0, saturation: 75, value: 15 } },
      { sampleId: "hue-35", hue: 35, delta: { hue: 0, saturation: 40, value: 25 } },
      { sampleId: "hue-75", hue: 75, delta: { hue: 0, saturation: 35, value: 15 } },
      { sampleId: "hue-145", hue: 145, delta: { hue: 10, saturation: 40, value: 20 } },
      { sampleId: "hue-220", hue: 220, delta: { hue: 0, saturation: 35, value: 25 } },
      { sampleId: "hue-310", hue: 310, delta: { hue: 0, saturation: 25, value: 10 } },
    ],
    problemAnchors: [
      {
        sampleId: "skin",
        targetHex: "#d5a184",
        hsv: { hue: 21.48148148148147, saturation: 0.380281690140845, value: 0.8352941176470589 },
        delta: { hue: 0, saturation: 30, value: 20 },
      },
      {
        sampleId: "brown",
        targetHex: "#8a5a34",
        hsv: { hue: 26.511627906976752, saturation: 0.6231884057971014, value: 0.5411764705882353 },
        delta: { hue: 0, saturation: 35, value: 25 },
      },
      {
        sampleId: "warm-gray",
        targetHex: "#82756c",
        hsv: { hue: 24.545454545454543, saturation: 0.16923076923076918, value: 0.5098039215686274 },
        delta: { hue: 0, saturation: 50, value: 20 },
      },
    ],
    lowSaturationThreshold: LOW_SATURATION_THRESHOLD,
    problemBlendRadius: PROBLEM_BLEND_RADIUS,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampStepCounts(steps: PaletteCalibrationSteps): PaletteCalibrationSteps {
  return {
    hue: clamp(Math.round(steps.hue), 0, HUE_STEP_COUNT),
    saturation: clamp(Math.round(steps.saturation), 0, SATURATION_STEP_COUNT),
    value: clamp(Math.round(steps.value), 0, VALUE_STEP_COUNT),
  };
}

function addSteps(left: PaletteCalibrationSteps, right: PaletteCalibrationSteps): PaletteCalibrationSteps {
  return {
    hue: left.hue + right.hue,
    saturation: left.saturation + right.saturation,
    value: left.value + right.value,
  };
}

function cloneSteps(steps: PaletteCalibrationSteps): PaletteCalibrationSteps {
  return {
    hue: steps.hue,
    saturation: steps.saturation,
    value: steps.value,
  };
}

function cloneCustomColorCalibration(
  calibration: CustomColorCalibration,
): CustomColorCalibration {
  return {
    version: 1,
    enabled: calibration.enabled,
    updatedAt: calibration.updatedAt,
    samples: calibration.samples.map((sample) => ({
      id: sample.id,
      kind: sample.kind,
      label: sample.label,
      targetHex: sample.targetHex,
      baseSteps: cloneSteps(sample.baseSteps),
      adjustments: cloneSteps(sample.adjustments),
      finalSteps: cloneSteps(sample.finalSteps),
      predictedHex: sample.predictedHex,
    })),
    derivedModel: {
      hueAnchors: calibration.derivedModel.hueAnchors.map((anchor) => ({
        sampleId: anchor.sampleId,
        hue: anchor.hue,
        delta: cloneSteps(anchor.delta),
      })),
      problemAnchors: calibration.derivedModel.problemAnchors.map((anchor) => ({
        sampleId: anchor.sampleId,
        targetHex: anchor.targetHex,
        hsv: {
          hue: anchor.hsv.hue,
          saturation: anchor.hsv.saturation,
          value: anchor.hsv.value,
        },
        delta: cloneSteps(anchor.delta),
      })),
      lowSaturationThreshold: calibration.derivedModel.lowSaturationThreshold,
      problemBlendRadius: calibration.derivedModel.problemBlendRadius,
    },
  };
}

function subtractSteps(left: PaletteCalibrationSteps, right: PaletteCalibrationSteps): PaletteCalibrationSteps {
  return {
    hue: left.hue - right.hue,
    saturation: left.saturation - right.saturation,
    value: left.value - right.value,
  };
}

function scaleSteps(steps: PaletteCalibrationSteps, factor: number): PaletteCalibrationSteps {
  return {
    hue: steps.hue * factor,
    saturation: steps.saturation * factor,
    value: steps.value * factor,
  };
}

function weightSteps(
  steps: PaletteCalibrationSteps,
  weights: { hue: number; saturation: number; value: number },
): PaletteCalibrationSteps {
  return {
    hue: steps.hue * weights.hue,
    saturation: steps.saturation * weights.saturation,
    value: steps.value * weights.value,
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
      hue = 60 * (((b - r) / delta) + 2);
    } else {
      hue = 60 * (((r - g) / delta) + 4);
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

function hsvToRgb(hue: number, saturation: number, value: number): RgbColor {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const clampedSaturation = clamp(saturation, 0, 1);
  const clampedValue = clamp(value, 0, 1);
  const chroma = clampedValue * clampedSaturation;
  const segment = normalizedHue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;

  if (segment >= 0 && segment < 1) {
    r = chroma;
    g = x;
  } else if (segment < 2) {
    r = x;
    g = chroma;
  } else if (segment < 3) {
    g = chroma;
    b = x;
  } else if (segment < 4) {
    g = x;
    b = chroma;
  } else if (segment < 5) {
    r = x;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }

  const match = clampedValue - chroma;
  return {
    r: Math.round((r + match) * 255),
    g: Math.round((g + match) * 255),
    b: Math.round((b + match) * 255),
  };
}

export function hexToPaletteSteps(colorHex: string): PaletteCalibrationSteps {
  const { r, g, b } = parseHexColor(colorHex);
  const hsv = rgbToHsv(r, g, b);
  const hueRatio = hsv.hue <= 0 ? 0 : (360 - hsv.hue) / 360;
  return {
    hue: Math.round(hueRatio * HUE_STEP_COUNT),
    saturation: Math.round(clamp(hsv.saturation, 0, 1) * SATURATION_STEP_COUNT),
    value: Math.round(clamp(1 - hsv.value, 0, 1) * VALUE_STEP_COUNT),
  };
}

export function paletteStepsToHex(steps: PaletteCalibrationSteps): string {
  const clampedSteps = clampStepCounts(steps);
  const hue =
    clampedSteps.hue <= 0
      ? 0
      : (360 - (clampedSteps.hue / HUE_STEP_COUNT) * 360 + 360) % 360;
  const saturation = clampedSteps.saturation / SATURATION_STEP_COUNT;
  const value = 1 - clampedSteps.value / VALUE_STEP_COUNT;
  return normalizeHexColor(rgbToHex(hsvToRgb(hue, saturation, value)));
}

function buildHueSampleHex(hue: number): string {
  return normalizeHexColor(rgbToHex(hsvToRgb(hue, HUE_SAMPLE_SATURATION, HUE_SAMPLE_VALUE)));
}

function buildSampleDefinition(seed: HueSeed | ProblemSeed): CustomColorCalibrationSampleDefinition {
  if ("hue" in seed) {
    const targetHex = buildHueSampleHex(seed.hue);
    return {
      id: seed.id,
      kind: "hue-anchor",
      label: seed.label,
      targetHex,
      baseSteps: hexToPaletteSteps(targetHex),
    };
  }

  return {
    id: seed.id,
    kind: "problem-anchor",
    label: seed.label,
    targetHex: normalizeHexColor(seed.targetHex),
    baseSteps: hexToPaletteSteps(seed.targetHex),
  };
}

const SAMPLE_DEFINITIONS: CustomColorCalibrationSampleDefinition[] = [
  ...HUE_SAMPLE_SEEDS.map((seed) => buildSampleDefinition(seed)),
  ...PROBLEM_SAMPLE_SEEDS.map((seed) => buildSampleDefinition(seed)),
];

const PROBLEM_SAMPLE_LOOKUP = new Map<string, CalibrationProblemAnchorInfo>(
  PROBLEM_SAMPLE_SEEDS.map((seed) => [
    seed.id,
    {
      id: seed.id,
      label: seed.label,
      targetHex: normalizeHexColor(seed.targetHex),
    },
  ]),
);

export function getCustomColorCalibrationSamples(): CustomColorCalibrationSampleDefinition[] {
  return SAMPLE_DEFINITIONS.map((sample) => ({
    ...sample,
    baseSteps: { ...sample.baseSteps },
  }));
}

export function getDefaultCustomColorCalibration(): CustomColorCalibration {
  return cloneCustomColorCalibration(DEFAULT_CUSTOM_COLOR_CALIBRATION);
}

function findSampleDefinition(id: string): CustomColorCalibrationSampleDefinition | undefined {
  return SAMPLE_DEFINITIONS.find((sample) => sample.id === id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCalibrationAdjustments(value: unknown): PaletteCalibrationSteps | null {
  if (!isRecord(value)) {
    return null;
  }

  const hue = value.hue;
  const saturation = value.saturation;
  const brightness = value.value;

  if (
    typeof hue !== "number" ||
    typeof saturation !== "number" ||
    typeof brightness !== "number" ||
    !Number.isFinite(hue) ||
    !Number.isFinite(saturation) ||
    !Number.isFinite(brightness)
  ) {
    return null;
  }

  return {
    hue: Math.round(hue),
    saturation: Math.round(saturation),
    value: Math.round(brightness),
  };
}

function normalizeCalibrationUpdatedAt(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function normalizeImportedCalibrationAdjustments(
  value: unknown,
): Record<string, PaletteCalibrationSteps> | null {
  if (!Array.isArray(value) || value.length !== SAMPLE_DEFINITIONS.length) {
    return null;
  }

  const adjustmentsById: Record<string, PaletteCalibrationSteps> = {};
  const seenSampleIds = new Set<string>();

  for (const sample of value) {
    if (!isRecord(sample) || typeof sample.id !== "string") {
      return null;
    }

    const definition = findSampleDefinition(sample.id);

    if (!definition || seenSampleIds.has(sample.id)) {
      return null;
    }

    const adjustments = normalizeCalibrationAdjustments(sample.adjustments);

    if (!adjustments) {
      return null;
    }

    adjustmentsById[sample.id] = adjustments;
    seenSampleIds.add(sample.id);
  }

  return seenSampleIds.size === SAMPLE_DEFINITIONS.length ? adjustmentsById : null;
}

function wrapHueDistance(a: number, b: number): number {
  const distance = Math.abs(a - b) % 360;
  return distance > 180 ? 360 - distance : distance;
}

function interpolateCircularHueAnchors(
  hue: number,
  anchors: CustomColorCalibration["derivedModel"]["hueAnchors"],
): PaletteCalibrationSteps {
  if (anchors.length === 0) {
    return { hue: 0, saturation: 0, value: 0 };
  }

  const sortedAnchors = [...anchors].sort((left, right) => left.hue - right.hue);
  const normalizedHue = ((hue % 360) + 360) % 360;

  for (let index = 0; index < sortedAnchors.length; index += 1) {
    const current = sortedAnchors[index];
    const next = sortedAnchors[(index + 1) % sortedAnchors.length];

    if (!current || !next) {
      continue;
    }

    const startHue = current.hue;
    const endHue = index === sortedAnchors.length - 1 ? next.hue + 360 : next.hue;
    const probeHue = normalizedHue < startHue ? normalizedHue + 360 : normalizedHue;

    if (probeHue < startHue || probeHue > endHue) {
      continue;
    }

    const span = Math.max(1, endHue - startHue);
    const t = clamp((probeHue - startHue) / span, 0, 1);
    return addSteps(scaleSteps(current.delta, 1 - t), scaleSteps(next.delta, t));
  }

  const firstAnchor = sortedAnchors[0];
  return firstAnchor ? { ...firstAnchor.delta } : { hue: 0, saturation: 0, value: 0 };
}

function deriveProblemDelta(
  hsv: HsvColor,
  calibration: CustomColorCalibration,
): PaletteCalibrationSteps {
  const anchors = calibration.derivedModel.problemAnchors;

  if (anchors.length === 0) {
    return { hue: 0, saturation: 0, value: 0 };
  }

  let totalWeight = 0;
  let weightedDelta: PaletteCalibrationSteps = { hue: 0, saturation: 0, value: 0 };

  for (const anchor of anchors) {
    const hueDistance = wrapHueDistance(hsv.hue, anchor.hsv.hue) / 180;
    const saturationDistance = Math.abs(hsv.saturation - anchor.hsv.saturation);
    const valueDistance = Math.abs(hsv.value - anchor.hsv.value);
    const distance = Math.sqrt(
      (hueDistance * HUE_BIAS_WEIGHT) ** 2 + saturationDistance ** 2 + valueDistance ** 2,
    );

    if (distance > calibration.derivedModel.problemBlendRadius) {
      continue;
    }

    const weight = 1 - distance / calibration.derivedModel.problemBlendRadius;
    totalWeight += weight;
    weightedDelta = addSteps(weightedDelta, scaleSteps(anchor.delta, weight));
  }

  if (totalWeight <= 0) {
    return { hue: 0, saturation: 0, value: 0 };
  }

  return scaleSteps(weightedDelta, 1 / totalWeight);
}

function deriveLowSaturationWarmGrayDelta(
  hsv: HsvColor,
  calibration: CustomColorCalibration,
): PaletteCalibrationSteps {
  const warmGrayAnchor = calibration.derivedModel.problemAnchors.find((anchor) => anchor.sampleId === "warm-gray");

  if (!warmGrayAnchor || hsv.saturation >= calibration.derivedModel.lowSaturationThreshold) {
    return { hue: 0, saturation: 0, value: 0 };
  }

  const factor = clamp(
    (calibration.derivedModel.lowSaturationThreshold - hsv.saturation) /
      calibration.derivedModel.lowSaturationThreshold,
    0,
    1,
  );
  return scaleSteps(
    {
      hue: warmGrayAnchor.delta.hue,
      saturation: warmGrayAnchor.delta.saturation,
      value: warmGrayAnchor.delta.value,
    },
    factor,
  );
}

function getCalibrationDeltasForHex(
  targetHex: string,
  calibration: CustomColorCalibration,
): PaletteCalibrationSteps {
  const { r, g, b } = parseHexColor(targetHex);
  const hsv = rgbToHsv(r, g, b);

  // Pure whites/grays do not have a meaningful hue in the in-game editor.
  // Treat them as neutral so the warm-color calibration anchors do not tint
  // them pink or brown.
  if (hsv.saturation <= ACHROMATIC_SATURATION_THRESHOLD) {
    return { hue: 0, saturation: 0, value: 0 };
  }

  const chromaticDelta = weightSteps(
    interpolateCircularHueAnchors(hsv.hue, calibration.derivedModel.hueAnchors),
    {
      hue: CHROMATIC_HUE_DELTA_WEIGHT,
      saturation: CHROMATIC_SATURATION_DELTA_WEIGHT,
      value: CHROMATIC_VALUE_DELTA_WEIGHT,
    },
  );
  const problemDelta = weightSteps(deriveProblemDelta(hsv, calibration), {
    hue: PROBLEM_HUE_DELTA_WEIGHT,
    saturation: PROBLEM_SATURATION_DELTA_WEIGHT,
    value: PROBLEM_VALUE_DELTA_WEIGHT,
  });
  const lowSaturationDelta = weightSteps(deriveLowSaturationWarmGrayDelta(hsv, calibration), {
    hue: LOW_SATURATION_HUE_DELTA_WEIGHT,
    saturation: LOW_SATURATION_SATURATION_DELTA_WEIGHT,
    value: LOW_SATURATION_VALUE_DELTA_WEIGHT,
  });
  return addSteps(addSteps(chromaticDelta, problemDelta), lowSaturationDelta);
}

export function createDisabledCustomColorCalibration(): CustomColorCalibration {
  return {
    version: 1,
    enabled: false,
    updatedAt: new Date(0).toISOString(),
    samples: [],
    derivedModel: {
      hueAnchors: [],
      problemAnchors: [],
      lowSaturationThreshold: LOW_SATURATION_THRESHOLD,
      problemBlendRadius: PROBLEM_BLEND_RADIUS,
    },
  };
}

export function deriveCustomColorCalibration(
  adjustmentsById: Record<string, Partial<PaletteCalibrationSteps> | undefined>,
): CustomColorCalibration {
  const samples: CustomColorCalibrationSample[] = SAMPLE_DEFINITIONS.map((definition) => {
    const rawAdjustments = adjustmentsById[definition.id] ?? {};
    const adjustments = {
      hue: Math.round(rawAdjustments.hue ?? 0),
      saturation: Math.round(rawAdjustments.saturation ?? 0),
      value: Math.round(rawAdjustments.value ?? 0),
    };
    const finalSteps = clampStepCounts(addSteps(definition.baseSteps, adjustments));
    return {
      id: definition.id,
      kind: definition.kind,
      label: definition.label,
      targetHex: definition.targetHex,
      baseSteps: { ...definition.baseSteps },
      adjustments,
      finalSteps,
      predictedHex: paletteStepsToHex(finalSteps),
    };
  });

  const hueAnchors = samples
    .filter((sample) => sample.kind === "hue-anchor")
    .map((sample) => {
      const hueInfo = HUE_SAMPLE_SEEDS.find((seed) => seed.id === sample.id);
      return {
        sampleId: sample.id,
        hue: hueInfo?.hue ?? 0,
        delta: subtractSteps(sample.finalSteps, sample.baseSteps),
      };
    });

  const problemAnchors = samples
    .filter((sample) => sample.kind === "problem-anchor")
    .map((sample) => {
      const problem = PROBLEM_SAMPLE_LOOKUP.get(sample.id);
      const { r, g, b } = parseHexColor(sample.targetHex);
      const hsv = rgbToHsv(r, g, b);
      return {
        sampleId: sample.id,
        targetHex: problem?.targetHex ?? sample.targetHex,
        hsv,
        delta: subtractSteps(sample.finalSteps, sample.baseSteps),
      };
    });

  return {
    version: 1,
    enabled: true,
    updatedAt: new Date().toISOString(),
    samples,
    derivedModel: {
      hueAnchors,
      problemAnchors,
      lowSaturationThreshold: LOW_SATURATION_THRESHOLD,
      problemBlendRadius: PROBLEM_BLEND_RADIUS,
    },
  };
}

export function normalizeCustomColorCalibration(
  value: unknown,
): CustomColorCalibration | null {
  if (!isRecord(value)) {
    return null;
  }

  const candidate = value as Partial<CustomColorCalibration>;
  const updatedAt = normalizeCalibrationUpdatedAt(candidate.updatedAt);
  const adjustmentsById = normalizeImportedCalibrationAdjustments(candidate.samples);

  if (candidate.version !== 1 || typeof candidate.enabled !== "boolean" || !updatedAt || !adjustmentsById) {
    return null;
  }

  const calibration = deriveCustomColorCalibration(adjustmentsById);
  calibration.enabled = candidate.enabled;
  calibration.updatedAt = updatedAt;
  return calibration;
}

export function applyCustomColorCalibrationToHex(
  targetHex: string,
  calibration: CustomColorCalibration | null | undefined,
): {
  targetHex: string;
  calibratedHex: string;
  commandHex: string;
  targetSteps: PaletteCalibrationSteps;
  finalSteps: PaletteCalibrationSteps;
} {
  const normalizedTargetHex = normalizeHexColor(targetHex);
  const targetSteps = hexToPaletteSteps(normalizedTargetHex);

  if (!calibration || calibration.enabled !== true) {
    return {
      targetHex: normalizedTargetHex,
      calibratedHex: normalizedTargetHex,
      commandHex: normalizedTargetHex,
      targetSteps: { ...targetSteps },
      finalSteps: { ...targetSteps },
    };
  }

  const deltas = getCalibrationDeltasForHex(normalizedTargetHex, calibration);
  const finalSteps = clampStepCounts(addSteps(targetSteps, deltas));
  const calibratedHex = paletteStepsToHex(finalSteps);
  return {
    targetHex: normalizedTargetHex,
    calibratedHex,
    commandHex: calibratedHex,
    targetSteps,
    finalSteps,
  };
}

export function buildPaletteCalibrationEntries(
  pixelMap: PixelMap,
  calibration: CustomColorCalibration | null | undefined,
): PaletteCalibrationEntry[] {
  const colorByIndex = new Map<number, string>();

  for (const row of pixelMap) {
    for (const pixel of row) {
      if (pixel.alpha <= 0 || pixel.colorIndex < 0 || colorByIndex.has(pixel.colorIndex)) {
        continue;
      }

      colorByIndex.set(pixel.colorIndex, pixel.colorHex);
    }
  }

  return Array.from(colorByIndex.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([colorIndex, targetHex]) => {
      const calibrated = applyCustomColorCalibrationToHex(targetHex, calibration);
      return {
        colorIndex,
        targetHex: calibrated.targetHex,
        calibratedHex: calibrated.calibratedHex,
        commandHex: calibrated.commandHex,
      };
    });
}

export function applyPaletteCalibrationToPixelMap(
  pixelMap: PixelMap,
  entries: PaletteCalibrationEntry[],
): PixelMap {
  if (entries.length === 0) {
    return pixelMap;
  }

  const entryByColorIndex = new Map(entries.map((entry) => [entry.colorIndex, entry]));
  return pixelMap.map((row) =>
    row.map((pixel) => {
      if (pixel.alpha <= 0 || pixel.colorIndex < 0) {
        return pixel;
      }

      const entry = entryByColorIndex.get(pixel.colorIndex);

      if (!entry) {
        return pixel;
      }

      return {
        ...pixel,
        colorHex: entry.commandHex,
      };
    }),
  );
}
