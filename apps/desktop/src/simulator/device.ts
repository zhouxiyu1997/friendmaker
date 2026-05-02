import { parseSequencedFrame, type SequencedFrame } from "../protocol/sequencing.js";

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
      const parsed = parseTwoInts(trimmed);

      if (!parsed || (parsed.first !== 0 && parsed.second !== 0)) {
        await delay(options.ackDelayMs);
        return this.cacheAndReturn(frame, this.makeError(frame, "invalid line"), lines);
      }

      this.state.drawCount += Math.abs(parsed.first) + Math.abs(parsed.second) + 1;
      this.state.x += parsed.first;
      this.state.y += parsed.second;
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

    if (trimmed.startsWith("W ")) {
      const waitMs = parseOneInt(trimmed);

      if (waitMs === null) {
        await delay(options.ackDelayMs);
        return this.cacheAndReturn(frame, this.makeError(frame, "invalid wait"), lines);
      }

      await delay(waitMs + options.ackDelayMs);
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
