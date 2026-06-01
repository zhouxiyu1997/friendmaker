export interface PaletteValueCalibrationSample {
  holdMs: number;
  actualValueSteps: number;
}

export interface PaletteValueCalibration {
  samples: PaletteValueCalibrationSample[];
}

export interface PaletteValueMovement {
  holdMs: number;
  estimatedHoldSteps: number;
  remainingTapSteps: number;
}

export interface PaletteValueCalibrationState {
  calibration: PaletteValueCalibration;
}

export const PALETTE_VALUE_MAX_STEPS = 112;
export const DEFAULT_PALETTE_VALUE_CALIBRATION: PaletteValueCalibration = {
  samples: [
    { holdMs: 80, actualValueSteps: 4 },
    { holdMs: 120, actualValueSteps: 7 },
    { holdMs: 180, actualValueSteps: 12 },
    { holdMs: 260, actualValueSteps: 20 },
    { holdMs: 380, actualValueSteps: 32 },
    { holdMs: 560, actualValueSteps: 50 },
    { holdMs: 800, actualValueSteps: 76 },
    { holdMs: 1100, actualValueSteps: 104 },
    { holdMs: 1500, actualValueSteps: 112 },
    { holdMs: 2000, actualValueSteps: 112 },
  ],
};

function cloneCalibration(calibration: PaletteValueCalibration): PaletteValueCalibration {
  return {
    samples: calibration.samples.map((sample) => ({
      holdMs: sample.holdMs,
      actualValueSteps: sample.actualValueSteps,
    })),
  };
}

function clampSteps(value: number): number {
  return Math.max(0, Math.min(PALETTE_VALUE_MAX_STEPS, Math.round(value)));
}

export function normalizePaletteValueCalibration(value: unknown): PaletteValueCalibration | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { samples?: unknown }).samples)) {
    return null;
  }

  const rawSamples = (value as { samples: unknown[] }).samples;

  if (rawSamples.length < 2 || rawSamples.length > 16) {
    return null;
  }

  const samples: PaletteValueCalibrationSample[] = [];

  for (const rawSample of rawSamples) {
    if (!rawSample || typeof rawSample !== "object") {
      return null;
    }

    const holdMs = (rawSample as { holdMs?: unknown }).holdMs;
    const actualValueSteps = (rawSample as { actualValueSteps?: unknown }).actualValueSteps;

    if (
      typeof holdMs !== "number" ||
      typeof actualValueSteps !== "number" ||
      !Number.isFinite(holdMs) ||
      !Number.isFinite(actualValueSteps)
    ) {
      return null;
    }

    const normalized = {
      holdMs: Math.round(holdMs),
      actualValueSteps: clampSteps(actualValueSteps),
    };
    const previous = samples.at(-1);

    if (
      normalized.holdMs <= 0 ||
      normalized.holdMs > 60_000 ||
      (previous && normalized.holdMs <= previous.holdMs) ||
      (previous && normalized.actualValueSteps < previous.actualValueSteps)
    ) {
      return null;
    }

    samples.push(normalized);
  }

  return { samples };
}

export function formatPaletteValueCalibrationConfig(calibration: PaletteValueCalibration): string {
  return `CFG PALVALUE ${calibration.samples
    .map((sample) => `${sample.holdMs}:${sample.actualValueSteps}`)
    .join(",")}`;
}

export function parsePaletteValueCalibrationConfig(command: string): PaletteValueCalibration | null {
  const trimmed = command.trim();

  if (!trimmed.startsWith("CFG PALVALUE ")) {
    return null;
  }

  const samples = trimmed
    .slice("CFG PALVALUE ".length)
    .split(",")
    .map((token) => {
      const match = /^(\d+):(\d+)$/u.exec(token.trim());

      if (!match?.[1] || !match[2]) {
        return null;
      }

      return {
        holdMs: Number.parseInt(match[1], 10),
        actualValueSteps: Number.parseInt(match[2], 10),
      };
    });

  if (samples.some((sample) => sample === null)) {
    return null;
  }

  return normalizePaletteValueCalibration({ samples });
}

function interpolateStepsForHold(holdMs: number, calibration: PaletteValueCalibration): number {
  const samples = calibration.samples;
  const first = samples[0];

  if (!first) {
    return 0;
  }

  if (holdMs <= first.holdMs) {
    return first.holdMs <= 0 ? 0 : (holdMs / first.holdMs) * first.actualValueSteps;
  }

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];

    if (!previous || !current || holdMs > current.holdMs) {
      continue;
    }

    const stepSpan = current.actualValueSteps - previous.actualValueSteps;
    const holdSpan = current.holdMs - previous.holdMs;

    if (holdSpan <= 0 || stepSpan <= 0) {
      return previous.actualValueSteps;
    }

    return previous.actualValueSteps + ((holdMs - previous.holdMs) / holdSpan) * stepSpan;
  }

  return samples.at(-1)?.actualValueSteps ?? 0;
}

export function estimatePaletteValueMovement(
  targetSteps: number,
  calibration: PaletteValueCalibration = DEFAULT_PALETTE_VALUE_CALIBRATION,
): PaletteValueMovement {
  const normalizedTarget = clampSteps(targetSteps);

  if (normalizedTarget <= 0) {
    return { holdMs: 0, estimatedHoldSteps: 0, remainingTapSteps: 0 };
  }

  const samples = calibration.samples;
  let previous = { holdMs: 0, actualValueSteps: 0 };

  for (const current of samples) {
    if (current.actualValueSteps < normalizedTarget) {
      previous = current;
      continue;
    }

    const stepSpan = current.actualValueSteps - previous.actualValueSteps;
    const holdSpan = current.holdMs - previous.holdMs;
    const holdMs =
      stepSpan <= 0
        ? previous.holdMs
        : Math.floor(
            previous.holdMs +
              ((normalizedTarget - previous.actualValueSteps) / stepSpan) * holdSpan,
          );
    const estimatedHoldSteps = Math.min(
      normalizedTarget,
      Math.floor(interpolateStepsForHold(holdMs, calibration)),
    );

    return {
      holdMs,
      estimatedHoldSteps,
      remainingTapSteps: normalizedTarget - estimatedHoldSteps,
    };
  }

  const last = samples.at(-1) ?? previous;
  const estimatedHoldSteps = Math.min(normalizedTarget, last.actualValueSteps);

  return {
    holdMs: last.holdMs,
    estimatedHoldSteps,
    remainingTapSteps: normalizedTarget - estimatedHoldSteps,
  };
}

export function createPaletteValueCalibrationState(): PaletteValueCalibrationState {
  return {
    calibration: cloneCalibration(DEFAULT_PALETTE_VALUE_CALIBRATION),
  };
}

export function updatePaletteValueCalibrationStateForCommand(
  command: string,
  state: PaletteValueCalibrationState,
): void {
  const calibration = parsePaletteValueCalibrationConfig(command);

  if (calibration) {
    state.calibration = calibration;
  }
}
