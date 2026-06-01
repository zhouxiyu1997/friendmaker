import { parseSequencedFrame, type SequencedFrame } from "../protocol/sequencing.js";
import { getLineCommandMetrics } from "../protocol/lineMetrics.js";
import { DEFAULT_SAFE_INPUT_TIMING, parseInputConfigCommand, type InputTiming } from "../protocol/timing.js";

function parseTwoInts(line: string): { first: number; second: number } | null {
  const parts = line.trim().split(/\s+/u);

  if (parts.length !== 3) {
    return null;
  }

  const first = Number.parseInt(parts[1] ?? "", 10);
  const second = Number.parseInt(parts[2] ?? "", 10);

  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return null;
  }

  return { first, second };
}

function parseLineCommand(line: string): { dx: number; dy: number; stride: number } | null {
  const parts = line.trim().split(/\s+/u);

  if (parts.length !== 3 && parts.length !== 4) {
    return null;
  }

  const dx = Number.parseInt(parts[1] ?? "", 10);
  const dy = Number.parseInt(parts[2] ?? "", 10);
  const stride = parts.length === 4 ? Number.parseInt(parts[3] ?? "", 10) : 1;

  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(stride) || stride <= 0) {
    return null;
  }

  return { dx, dy, stride };
}

function parseStickCommand(line: string): { x: number; y: number; ms: number } | null {
  const parts = line.trim().split(/\s+/u);

  if (parts.length !== 4 || parts[0] !== "STICK") {
    return null;
  }

  const x = Number.parseInt(parts[1] ?? "", 10);
  const y = Number.parseInt(parts[2] ?? "", 10);
  const ms = Number.parseInt(parts[3] ?? "", 10);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(ms) ||
    x < -1 ||
    x > 1 ||
    y < -1 ||
    y > 1 ||
    (x === 0 && y === 0) ||
    ms <= 0
  ) {
    return null;
  }

  return { x, y, ms };
}

function parseButtonCommand(line: string): string | null {
  const parts = line.trim().split(/\s+/u);

  if (parts.length !== 2 || parts[0] !== "BTN") {
    return null;
  }

  const token = parts[1] ?? "";
  return token.length > 0 ? token : null;
}

function parseOneInt(line: string): number | null {
  const parts = line.trim().split(/\s+/u);

  if (parts.length !== 2) {
    return null;
  }

  const value = Number.parseInt(parts[1] ?? "", 10);
  return Number.isFinite(value) ? value : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SimulatedDeviceResponse {
  ack: string;
  lines: string[];
}

interface SimulatedDeviceState {
  x: number;
  y: number;
  colorIndex: number;
  drawCount: number;
  paused: boolean;
  ended: boolean;
  timing: InputTiming;
}

interface SequencedDeviceState {
  sessionId: string | null;
  lastSequence: number;
  lastCommand: string;
  lastAck: string;
}

export class SimulatedDevice {
  private readonly transportName = "simulated-device";
  private readonly injectedFailures = new Set<number>();
  private state: SimulatedDeviceState = {
    x: 0,
    y: 0,
    colorIndex: 0,
    drawCount: 0,
    paused: false,
    ended: false,
    timing: { ...DEFAULT_SAFE_INPUT_TIMING },
  };
  private sequenceState: SequencedDeviceState = {
    sessionId: null,
    lastSequence: 0,
    lastCommand: "",
    lastAck: "",
  };

  private makeAck(frame: SequencedFrame): string {
    return `OK ${frame.sessionId} ${frame.sequence}`;
  }

  private makeError(frame: SequencedFrame, message: string): string {
    return `ERR ${frame.sessionId} ${frame.sequence} ${message}`;
  }

  private cacheAndReturn(
    frame: SequencedFrame,
    ack: string,
    lines: string[],
  ): SimulatedDeviceResponse {
    this.sequenceState.lastSequence = frame.sequence;
    this.sequenceState.lastCommand = frame.command;
    this.sequenceState.lastAck = ack;

    return {
      ack,
      lines,
    };
  }

  private validateFrame(frame: SequencedFrame): SimulatedDeviceResponse | null {
    if (this.sequenceState.sessionId !== frame.sessionId) {
      if (frame.sequence !== 1) {
        return {
          ack: this.makeError(frame, "sequence expected 1 for new session"),
          lines: [],
        };
      }

      this.sequenceState = {
        sessionId: frame.sessionId,
        lastSequence: 0,
        lastCommand: "",
        lastAck: "",
      };
      return null;
    }

    if (frame.sequence === this.sequenceState.lastSequence) {
      if (frame.command === this.sequenceState.lastCommand && this.sequenceState.lastAck) {
        return {
          ack: this.sequenceState.lastAck,
          lines: [],
        };
      }

      return {
        ack: this.makeError(frame, "duplicate sequence command mismatch"),
        lines: [],
      };
    }

    if (frame.sequence !== this.sequenceState.lastSequence + 1) {
      return {
        ack: this.makeError(
          frame,
          `sequence expected ${this.sequenceState.lastSequence + 1}`,
        ),
        lines: [],
      };
    }

    return null;
  }

  async executeCommand(
    line: string,
    options: {
      commandIndex: number;
      ackDelayMs: number;
      errorAtCommand?: number;
      inputReportFailureAtCommand?: number;
    },
  ): Promise<SimulatedDeviceResponse> {
    const frame = parseSequencedFrame(line);

    if (!frame) {
      await delay(options.ackDelayMs);
      return {
        ack: "ERR protocol frame required",
        lines: [],
      };
    }

    const sequenceResult = this.validateFrame(frame);

    if (sequenceResult) {
      await delay(options.ackDelayMs);
      return sequenceResult;
    }

    const trimmed = frame.command;
    const lines: string[] = [];

    if (
      options.errorAtCommand !== undefined &&
      options.commandIndex === options.errorAtCommand &&
      !this.injectedFailures.has(options.commandIndex)
    ) {
      this.injectedFailures.add(options.commandIndex);
      await delay(options.ackDelayMs);
      return {
        ack: this.makeError(frame, `injected failure at command ${options.commandIndex}`),
        lines,
      };
    }

    if (options.inputReportFailureAtCommand === options.commandIndex) {
      await delay(options.ackDelayMs);
      return {
        ack: this.makeError(frame, "controller input report failed"),
        lines,
      };
    }

    if (trimmed.length === 0) {
      await delay(options.ackDelayMs);
      return this.cacheAndReturn(frame, this.makeAck(frame), lines);
    }

    if (trimmed === "I") {
      lines.push(
        `INFO transport=${this.transportName} x=${this.state.x} y=${this.state.y} color=${this.state.colorIndex} draws=${this.state.drawCount}`,
      );
      await delay(options.ackDelayMs);
      return this.cacheAndReturn(frame, this.makeAck(frame), lines);
    }

    if (trimmed === "H") {
      this.state.x = 0;
      this.state.y = 0;
      await delay(options.ackDelayMs);
      return this.cacheAndReturn(frame, this.makeAck(frame), lines);
    }

    const inputTiming = parseInputConfigCommand(trimmed);

    if (inputTiming) {
      this.state.timing = inputTiming;
      lines.push(
        `INFO input-timing button=${inputTiming.buttonPressMs} delay=${inputTiming.inputDelayMs} home=${inputTiming.homeMs}`,
      );
      await delay(options.ackDelayMs);
      return this.cacheAndReturn(frame, this.makeAck(frame), lines);
    }

    if (trimmed.startsWith("CFG PALVALUE ")) {
      lines.push("INFO palette-value-calibration=updated");
      await delay(options.ackDelayMs);
      return this.cacheAndReturn(frame, this.makeAck(frame), lines);
    }

    if (trimmed === "P") {
      this.state.drawCount += 1;
      await delay(options.ackDelayMs);
      return this.cacheAndReturn(frame, this.makeAck(frame), lines);
    }

    if (trimmed === "S") {
      this.state.paused = true;
      lines.push("INFO paused=true");
      await delay(options.ackDelayMs);
      return this.cacheAndReturn(frame, this.makeAck(frame), lines);
    }

    if (trimmed === "R") {
      this.state.paused = false;
      lines.push("INFO paused=false");
      await delay(options.ackDelayMs);
      return this.cacheAndReturn(frame, this.makeAck(frame), lines);
    }

    if (trimmed === "E") {
      this.state.ended = true;
      lines.push(
        `INFO end x=${this.state.x} y=${this.state.y} color=${this.state.colorIndex} draws=${this.state.drawCount}`,
      );
      await delay(options.ackDelayMs);
      return this.cacheAndReturn(frame, this.makeAck(frame), lines);
    }

    if (trimmed.startsWith("M ")) {
      const parsed = parseTwoInts(trimmed);

      if (!parsed) {
        await delay(options.ackDelayMs);
        return this.cacheAndReturn(frame, this.makeError(frame, "invalid move"), lines);
      }

      this.state.x += parsed.first;
      this.state.y += parsed.second;
      await delay(options.ackDelayMs);
      return this.cacheAndReturn(frame, this.makeAck(frame), lines);
    }

    if (trimmed.startsWith("L ")) {
      const parsed = parseLineCommand(trimmed);

      if (!parsed || (parsed.dx === 0 && parsed.dy === 0) || (parsed.dx !== 0 && parsed.dy !== 0)) {
        await delay(options.ackDelayMs);
        return this.cacheAndReturn(frame, this.makeError(frame, "invalid line"), lines);
      }

      const metrics = getLineCommandMetrics(parsed.dx, parsed.dy, parsed.stride);
      this.state.x += parsed.dx;
      this.state.y += parsed.dy;
      this.state.drawCount += metrics.drawCount;
      await delay(options.ackDelayMs);
      return this.cacheAndReturn(frame, this.makeAck(frame), lines);
    }

    if (trimmed.startsWith("STICK ")) {
      const parsed = parseStickCommand(trimmed);

      if (!parsed) {
        await delay(options.ackDelayMs);
        return this.cacheAndReturn(frame, this.makeError(frame, "invalid stick"), lines);
      }

      await delay(options.ackDelayMs);
      return this.cacheAndReturn(frame, this.makeAck(frame), lines);
    }

    if (trimmed.startsWith("C ")) {
      const colorIndex = parseOneInt(trimmed);

      if (colorIndex === null) {
        await delay(options.ackDelayMs);
        return this.cacheAndReturn(frame, this.makeError(frame, "invalid color"), lines);
      }

      this.state.colorIndex = colorIndex;
      await delay(options.ackDelayMs);
      return this.cacheAndReturn(frame, this.makeAck(frame), lines);
    }

    if (trimmed.startsWith("PC ") || trimmed.startsWith("BC ") || trimmed === "BC RESET") {
      await delay(options.ackDelayMs);
      return this.cacheAndReturn(frame, this.makeAck(frame), lines);
    }

    if (trimmed.startsWith("W ")) {
      const waitMs = parseOneInt(trimmed);

      if (waitMs === null) {
        await delay(options.ackDelayMs);
        return this.cacheAndReturn(frame, this.makeError(frame, "invalid wait"), lines);
      }

      await delay(waitMs + options.ackDelayMs);
      return this.cacheAndReturn(frame, this.makeAck(frame), lines);
    }

    if (trimmed.startsWith("BTN ")) {
      const button = parseButtonCommand(trimmed);

      if (!button) {
        await delay(options.ackDelayMs);
        return this.cacheAndReturn(frame, this.makeError(frame, "invalid button"), lines);
      }

      await delay(options.ackDelayMs);
      return this.cacheAndReturn(frame, this.makeAck(frame), lines);
    }

    if (trimmed === "A" || trimmed === "B" || trimmed === "X" || trimmed === "Y") {
      await delay(options.ackDelayMs);
      return this.cacheAndReturn(frame, this.makeAck(frame), lines);
    }

    await delay(options.ackDelayMs);
    return this.cacheAndReturn(frame, this.makeError(frame, "unknown command"), lines);
  }
}
