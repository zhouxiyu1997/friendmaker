import { ReadlineParser } from "@serialport/parser-readline";
import { SerialPort } from "serialport";

import { preferSerialPath } from "./listPorts.js";
import { getLineCommandMetrics } from "../protocol/lineMetrics.js";
import {
  createBasicPaletteTimingState,
  estimateBasicPaletteConfigDurationMs,
  estimateColorSelectDurationMs,
  estimatePaletteConfigDurationMs,
  resetBasicPaletteTimingState,
  updateBasicPaletteTimingState,
  type BasicPaletteTimingState,
} from "../protocol/paletteTiming.js";
import {
  createSessionId,
  formatSequencedCommand,
  parseSequencedAck,
} from "../protocol/sequencing.js";
import {
  DEFAULT_SAFE_INPUT_TIMING,
  isControllerInputReportFailure,
  parseInputConfigCommand,
  type InputTiming,
} from "../protocol/timing.js";
import type { ProgressUpdate, SenderControls } from "../types.js";

const ACK_LINE_PREFIXES = ["OK ", "ERR "] as const;
const DEVICE_LINE_PREFIXES = ["INFO ", "WARN ", "BOOT ", "rst:"] as const;
export const DEFAULT_SERIAL_SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1_000;
export const SERIAL_OPEN_RESET_DETECT_WINDOW_MS = 400;
export const SERIAL_OPEN_BOOT_TIMEOUT_MS = 10_000;
export const SERIAL_OPEN_POST_BOOT_SETTLE_MS = 250;
export const SERIAL_OPEN_CONTROL_LINE_SETTLE_MS = 150;
export const SERIAL_OPEN_READY_PROBE_TIMEOUT_MS = 3_000;
export const SERIAL_OPEN_RESET_PULSE_MS = 120;
const PASSIVE_DEVICE_LINE_BUFFER_LIMIT = 200;
const CONTROLLER_SEND_REPORT_FAILURE_THRESHOLD = 10;

interface SerialCommandSendOptions {
  ackTimeoutMs: number;
  retries: number;
  onProgress?: (progress: ProgressUpdate) => Promise<void> | void;
  onDeviceLine?: (line: string) => void;
  beforeCommand?: () => Promise<void>;
  shouldStop?: () => boolean;
  onInterruptReady?: (interrupt: (() => void) | null) => void;
}

export interface SerialSessionSnapshot {
  connected: boolean;
  portPath: string | null;
  baudRate: number | null;
  busy: boolean;
  idleTimeoutMs: number;
  lastUsedAt: number | null;
}

function isRecognizedDeviceLine(line: string): boolean {
  if (line === "OK" || line === "ERR" || ACK_LINE_PREFIXES.some((prefix) => line.startsWith(prefix))) {
    return true;
  }

  return DEVICE_LINE_PREFIXES.some((prefix) => line.startsWith(prefix));
}

function sanitizeDeviceLine(rawLine: string | Buffer): string | null {
  const rawText = Buffer.isBuffer(rawLine) ? rawLine.toString("utf8") : rawLine;
  const cleanText = rawText
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/\r/g, "")
    .trim();

  if (cleanText.length === 0) {
    return null;
  }

  if (isRecognizedDeviceLine(cleanText)) {
    return cleanText;
  }

  const candidateIndexes = [...ACK_LINE_PREFIXES, ...DEVICE_LINE_PREFIXES]
    .map((prefix) => cleanText.lastIndexOf(prefix))
    .filter((index) => index >= 0);

  if (candidateIndexes.length === 0) {
    return null;
  }

  const candidate = cleanText.slice(Math.max(...candidateIndexes)).trim();
  return isRecognizedDeviceLine(candidate) ? candidate : null;
}

function getEmbeddedDeviceLine(line: string): string | null {
  const candidateIndexes = DEVICE_LINE_PREFIXES.map((prefix) => line.indexOf(prefix)).filter(
    (index) => index > 0,
  );

  if (candidateIndexes.length === 0) {
    return null;
  }

  const candidate = line.slice(Math.min(...candidateIndexes)).trim();
  return DEVICE_LINE_PREFIXES.some((prefix) => candidate.startsWith(prefix)) ? candidate : null;
}

export function isCongestedControllerSendReportLine(line: string): boolean {
  const match =
    /^WARN bt hid event=send-report status=(\d+) reason=(\d+) report=(\d+)$/u.exec(line.trim());

  if (!match?.[1] || !match[2] || !match[3]) {
    return false;
  }

  return match[1] !== "0" && match[2] === "8" && match[3] === "48";
}

export function isDirectControllerInputReportFailureLine(line: string): boolean {
  const trimmed = line.trim();

  return (
    /^WARN bt send_report timeout report=48(?:\s|$)/u.test(trimmed) ||
    /^WARN bt send_report rejected status=\d+ reason=\d+ report=48(?:\s|$)/u.test(trimmed) ||
    /^WARN bt explicit_input blocked connected=(true|false) paired=(true|false) ready=(true|false)(?:\s|$)/u.test(
      trimmed,
    )
  );
}

function waitForAck(
  parser: ReadlineParser,
  port: SerialPort,
  timeoutMs: number,
  expected: {
    sessionId: string;
    sequence: number;
  },
  options?: {
    onDeviceLine?: (line: string) => void;
    onInterruptReady?: (interrupt: (() => void) | null) => void;
  },
): Promise<"OK"> {
  return new Promise((resolve, reject) => {
    if (!port.isOpen) {
      reject(new Error("Execution stopped."));
      return;
    }

    let settled = false;
    let congestedControllerSendReportCount = 0;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };

    const timeoutId = setTimeout(() => {
      finish(() => reject(new Error(`Timed out waiting for ACK after ${timeoutMs}ms.`)));
    }, timeoutMs);

    const onData = (rawLine: string | Buffer) => {
      const line = sanitizeDeviceLine(rawLine);

      if (!line) {
        return;
      }

      const ack = parseSequencedAck(line);

      if (ack) {
        if (ack.sessionId !== expected.sessionId || ack.sequence !== expected.sequence) {
          options?.onDeviceLine?.(
            `WARN ignored ack session=${ack.sessionId} seq=${ack.sequence} expected=${expected.sessionId}:${expected.sequence}`,
          );
          return;
        }

        if (ack.type === "ok") {
          finish(() => resolve("OK"));
          return;
        }

        finish(() => reject(new Error(`Device returned ERR ${ack.sessionId} ${ack.sequence} ${ack.message}`)));
        return;
      }

      if (line === "OK" || line === "ERR" || line.startsWith("OK ") || line.startsWith("ERR ")) {
        const embeddedDeviceLine = getEmbeddedDeviceLine(line);

        if (embeddedDeviceLine) {
          options?.onDeviceLine?.(`WARN ignored malformed serial line=${line}`);
          options?.onDeviceLine?.(embeddedDeviceLine);
          return;
        }

        finish(() =>
          reject(
            new Error(
              `Device returned an unsequenced or malformed ACK: ${line}. Reflash the ESP32 firmware for the SEQ protocol.`,
            ),
          ),
        );
        return;
      }

      if (isDirectControllerInputReportFailureLine(line)) {
        finish(() => reject(new Error("controller input report failed")));
        return;
      }

      if (isCongestedControllerSendReportLine(line)) {
        congestedControllerSendReportCount += 1;

        if (congestedControllerSendReportCount >= CONTROLLER_SEND_REPORT_FAILURE_THRESHOLD) {
          finish(() => reject(new Error("controller input report failed")));
          return;
        }
      }

      options?.onDeviceLine?.(line);
    };

    const onClose = () => {
      finish(() => reject(new Error("Execution stopped.")));
    };

    const onError = (error: Error) => {
      finish(() => reject(error));
    };

    const onInterrupt = () => {
      finish(() => reject(new Error("Execution stopped.")));
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      parser.off("data", onData);
      port.off("close", onClose);
      port.off("error", onError);
      options?.onInterruptReady?.(null);
    };

    options?.onInterruptReady?.(onInterrupt);
    parser.on("data", onData);
    port.on("close", onClose);
    port.on("error", onError);
  });
}

export function getAckTimeoutForCommand(
  command: string,
  baseTimeoutMs: number,
  timing: InputTiming = DEFAULT_SAFE_INPUT_TIMING,
  basicPaletteState: BasicPaletteTimingState = createBasicPaletteTimingState(),
): number {
  const trimmed = command.trim();
  const simplePressTimeoutMs = 1_000 + timing.buttonPressMs + timing.inputDelayMs;
  const boundedTimeout = (computedTimeoutMs: number) => Math.max(baseTimeoutMs, computedTimeoutMs);

  if (trimmed.startsWith("CFG INPUT ")) {
    return baseTimeoutMs;
  }

  if (trimmed === "P" || trimmed.startsWith("BTN ")) {
    return boundedTimeout(simplePressTimeoutMs);
  }

  if (trimmed.startsWith("HOLD ")) {
    const match = /^HOLD\s+\S+\s+(\d+)$/u.exec(trimmed);

    if (!match?.[1]) {
      return boundedTimeout(simplePressTimeoutMs);
    }

    const holdMs = Number.parseInt(match[1], 10);
    return boundedTimeout(1_000 + holdMs + timing.inputDelayMs);
  }

  if (trimmed.startsWith("TAP ")) {
    const match = /^TAP\s+\S+\s+(\d+)$/u.exec(trimmed);

    if (!match?.[1]) {
      return boundedTimeout(simplePressTimeoutMs);
    }

    const count = Number.parseInt(match[1], 10);
    return boundedTimeout(1_000 + count * (timing.buttonPressMs + timing.inputDelayMs));
  }

  if (trimmed.startsWith("STICK ")) {
    const match = /^STICK\s+(-?\d+)\s+(-?\d+)\s+(\d+)$/u.exec(trimmed);

    if (!match?.[3]) {
      return boundedTimeout(simplePressTimeoutMs);
    }

    const holdMs = Number.parseInt(match[3], 10);
    return boundedTimeout(1_000 + holdMs + timing.inputDelayMs);
  }

  if (trimmed.startsWith("W ")) {
    const match = /^W\s+(\d+)$/u.exec(trimmed);

    if (!match?.[1]) {
      return baseTimeoutMs;
    }

    const waitMs = Number.parseInt(match[1], 10);
    return boundedTimeout(1_000 + waitMs);
  }

  if (trimmed === "H") {
    return Math.max(baseTimeoutMs, 1_000 + timing.homeMs * 2 + timing.inputDelayMs);
  }

  if (trimmed === "BT RESET") {
    return Math.max(baseTimeoutMs, 20_000);
  }

  if (trimmed.startsWith("M ")) {
    const match = /^M\s+(-?\d+)\s+(-?\d+)$/u.exec(trimmed);

    if (!match || match[1] === undefined || match[2] === undefined) {
      return baseTimeoutMs;
    }

    const dx = Number.parseInt(match[1], 10);
    const dy = Number.parseInt(match[2], 10);
    const steps = Math.abs(dx) + Math.abs(dy);

    // Each move step becomes one D-pad press on the ESP32 side. Give the board
    // enough room to finish long center-to-target moves before we expect `OK`.
    return Math.max(baseTimeoutMs, 1_000 + steps * (timing.buttonPressMs + timing.inputDelayMs));
  }

  if (trimmed.startsWith("L ")) {
    const match = /^L\s+(-?\d+)\s+(-?\d+)(?:\s+(\d+))?$/u.exec(trimmed);

    if (!match || match[1] === undefined || match[2] === undefined) {
      return baseTimeoutMs;
    }

    const dx = Number.parseInt(match[1], 10);
    const dy = Number.parseInt(match[2], 10);
    const stride = match[3] === undefined ? 1 : Number.parseInt(match[3], 10);
    const metrics = getLineCommandMetrics(dx, dy, stride);

    return Math.max(
      baseTimeoutMs,
      1_000 + metrics.actionCount * (timing.buttonPressMs + timing.inputDelayMs),
    );
  }

  if (trimmed === "BC RESET") {
    return Math.max(baseTimeoutMs, 4_000);
  }

  if (trimmed.startsWith("C ")) {
    const match = /^C\s+(-?\d+)$/u.exec(trimmed);

    if (!match?.[1]) {
      return Math.max(baseTimeoutMs, 20_000);
    }

    return Math.max(
      baseTimeoutMs,
      estimateColorSelectDurationMs(Number.parseInt(match[1], 10), timing, {
        includeTimeoutMargin: true,
      }),
    );
  }

  if (trimmed.startsWith("BC ")) {
    const match = /^BC\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)$/u.exec(trimmed);

    if (!match?.[1] || !match[2] || !match[3]) {
      return Math.max(baseTimeoutMs, 20_000);
    }

    return Math.max(
      baseTimeoutMs,
      estimateBasicPaletteConfigDurationMs(
        Number.parseInt(match[1], 10),
        Number.parseInt(match[2], 10),
        Number.parseInt(match[3], 10),
        timing,
        {
          basicPaletteState,
          includeTimeoutMargin: true,
        },
      ),
    );
  }

  if (trimmed.startsWith("PC ")) {
    const match = /^PC\s+(-?\d+)\s+#([0-9a-f]{6})$/iu.exec(trimmed);

    if (!match?.[1] || !match[2]) {
      return Math.max(baseTimeoutMs, 20_000);
    }

    const slotIndex = Number.parseInt(match[1], 10);
    const hex = match[2];
    const red = Number.parseInt(hex.slice(0, 2), 16);
    const green = Number.parseInt(hex.slice(2, 4), 16);
    const blue = Number.parseInt(hex.slice(4, 6), 16);

    return Math.max(
      baseTimeoutMs,
      estimatePaletteConfigDurationMs(slotIndex, red, green, blue, timing, {
        includeTimeoutMargin: true,
      }),
    );
  }

  return baseTimeoutMs;
}

export function updateBasicPaletteStateForCommand(
  command: string,
  basicPaletteState: BasicPaletteTimingState,
): void {
  const trimmed = command.trim();

  if (trimmed === "BC RESET") {
    resetBasicPaletteTimingState(basicPaletteState);
    return;
  }

  const match = /^BC\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)$/u.exec(trimmed);

  if (!match?.[1] || !match[2] || !match[3]) {
    return;
  }

  updateBasicPaletteTimingState(
    basicPaletteState,
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
    Number.parseInt(match[3], 10),
  );
}

function writeLine(port: SerialPort, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    port.write(`${line}\n`, (error) => {
      if (error) {
        reject(error);
        return;
      }

      port.drain((drainError) => {
        if (drainError) {
          reject(drainError);
          return;
        }

        resolve();
      });
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUnsequencedAckLine(line: string): boolean {
  return line === "OK" || line === "ERR" || line.startsWith("OK ") || line.startsWith("ERR ");
}

function isPassiveDeviceLine(line: string): boolean {
  return !parseSequencedAck(line) && !isUnsequencedAckLine(line);
}

async function stabilizeFreshSerialSession(
  parser: ReadlineParser,
  port: SerialPort,
  onDeviceLine?: (line: string) => void,
): Promise<void> {
  const startedAt = Date.now();
  let sawActivity = false;
  let sawBoot = false;
  let lastActivityAt = startedAt;

  const onData = (rawLine: string | Buffer) => {
    const line = sanitizeDeviceLine(rawLine);

    if (!line) {
      return;
    }

    sawActivity = true;
    lastActivityAt = Date.now();
    if (line.startsWith("BOOT ")) {
      sawBoot = true;
    }
    onDeviceLine?.(line);
  };

  parser.on("data", onData);

  try {
    while (port.isOpen) {
      const elapsedMs = Date.now() - startedAt;
      const idleMs = Date.now() - lastActivityAt;

      if (!sawActivity && elapsedMs >= SERIAL_OPEN_RESET_DETECT_WINDOW_MS) {
        return;
      }

      if (sawBoot && idleMs >= SERIAL_OPEN_POST_BOOT_SETTLE_MS) {
        return;
      }

      if (sawActivity && !sawBoot && elapsedMs >= SERIAL_OPEN_BOOT_TIMEOUT_MS) {
        onDeviceLine?.(
          `WARN serial_session=stabilize_timeout boot_seen=false wait_ms=${SERIAL_OPEN_BOOT_TIMEOUT_MS}`,
        );
        return;
      }

      await delay(25);
    }

    throw new Error("Serial session is not open.");
  } finally {
    parser.off("data", onData);
  }
}

async function waitForReadinessProbeAck(
  parser: ReadlineParser,
  port: SerialPort,
  timeoutMs: number,
  onDeviceLine?: (line: string) => void,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!port.isOpen) {
      reject(new Error("Serial session is not open."));
      return;
    }

    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };

    const timeoutId = setTimeout(() => {
      finish(() => resolve(false));
    }, timeoutMs);

    const onData = (rawLine: string | Buffer) => {
      const line = sanitizeDeviceLine(rawLine);

      if (!line) {
        return;
      }

      const ack = parseSequencedAck(line);

      if (ack) {
        onDeviceLine?.(`WARN ignored readiness ack session=${ack.sessionId} seq=${ack.sequence}`);
        finish(() => resolve(true));
        return;
      }

      if (isUnsequencedAckLine(line)) {
        finish(() => resolve(true));
        return;
      }

      onDeviceLine?.(line);
    };

    const onClose = () => {
      finish(() => reject(new Error("Serial session is not open.")));
    };

    const onError = (error: Error) => {
      finish(() => reject(error));
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      parser.off("data", onData);
      port.off("close", onClose);
      port.off("error", onError);
    };

    parser.on("data", onData);
    port.on("close", onClose);
    port.on("error", onError);
  });
}

async function pulseRunModeReset(port: SerialPort, onDeviceLine?: (line: string) => void): Promise<void> {
  await setPortSignals(port, { dtr: false, rts: true, brk: false });
  onDeviceLine?.(`INFO serial_session=reset_pulse dtr=false rts=true wait_ms=${SERIAL_OPEN_RESET_PULSE_MS}`);
  await delay(SERIAL_OPEN_RESET_PULSE_MS);
  await setPortSignals(port, { dtr: false, rts: false, brk: false });
  onDeviceLine?.(
    `INFO serial_session=reset_release dtr=false rts=false wait_ms=${SERIAL_OPEN_CONTROL_LINE_SETTLE_MS}`,
  );
  await delay(SERIAL_OPEN_CONTROL_LINE_SETTLE_MS);
}

async function probeFreshSerialSession(
  parser: ReadlineParser,
  port: SerialPort,
  onDeviceLine?: (line: string) => void,
): Promise<void> {
  const attemptProbe = async (phase: "initial" | "post-reset"): Promise<boolean> => {
    onDeviceLine?.(
      `INFO serial_session=probe phase=${phase} command=I timeout_ms=${SERIAL_OPEN_READY_PROBE_TIMEOUT_MS}`,
    );
    await writeLine(port, "I");
    const ready = await waitForReadinessProbeAck(
      parser,
      port,
      SERIAL_OPEN_READY_PROBE_TIMEOUT_MS,
      onDeviceLine,
    );

    if (!ready) {
      onDeviceLine?.(
        `WARN serial_session=probe_timeout phase=${phase} timeout_ms=${SERIAL_OPEN_READY_PROBE_TIMEOUT_MS}`,
      );
      return false;
    }

    onDeviceLine?.(`INFO serial_session=probe_ready phase=${phase}`);
    return true;
  };

  if (await attemptProbe("initial")) {
    return;
  }

  await pulseRunModeReset(port, onDeviceLine);
  onDeviceLine?.(
    `INFO serial_session=stabilizing detect_ms=${SERIAL_OPEN_RESET_DETECT_WINDOW_MS} boot_timeout_ms=${SERIAL_OPEN_BOOT_TIMEOUT_MS}`,
  );
  await stabilizeFreshSerialSession(parser, port, onDeviceLine);

  if (await attemptProbe("post-reset")) {
    return;
  }

  throw new Error(
    `Serial session did not become ready after ${SERIAL_OPEN_READY_PROBE_TIMEOUT_MS * 2}ms.`,
  );
}

function setPortSignals(
  port: SerialPort,
  options: {
    dtr?: boolean;
    rts?: boolean;
    brk?: boolean;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    port.set(options, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function openPort(port: SerialPort): Promise<void> {
  return new Promise((resolve, reject) => {
    if (port.isOpen) {
      resolve();
      return;
    }

    port.open((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function closePort(port: SerialPort): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!port.isOpen) {
      resolve();
      return;
    }

    port.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export class SerialCommandSession {
  readonly portPath: string;
  readonly baudRate: number;

  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private sessionId = createSessionId();
  private sequence = 1;
  private interruptAckWait: (() => void) | null = null;
  private lastUsedAtValue: number | null = null;
  private openingPromise: Promise<void> | null = null;
  private closingPromise: Promise<void> | null = null;
  private portErrorHandler: ((error: Error) => void) | null = null;
  private portCloseHandler: (() => void) | null = null;
  private parserDataHandler: ((rawLine: string | Buffer) => void) | null = null;
  private foregroundDeviceLineCaptureDepth = 0;
  private passiveDeviceLines: string[] = [];

  constructor(path: string, baudRate: number) {
    this.portPath = preferSerialPath(path);
    this.baudRate = baudRate;
  }

  get isConnected(): boolean {
    return this.port?.isOpen === true;
  }

  get lastUsedAt(): number | null {
    return this.lastUsedAtValue;
  }

  async open(onDeviceLine?: (line: string) => void): Promise<void> {
    if (this.port?.isOpen && this.parser) {
      return;
    }

    if (this.openingPromise) {
      await this.openingPromise;
      return;
    }

    const port = new SerialPort({
      path: this.portPath,
      baudRate: this.baudRate,
      autoOpen: false,
      hupcl: false,
    });
    this.port = port;
    this.attachPortLifecycleHandlers(port);

    const openingPromise = (async () => {
      await openPort(port);

      if (this.port !== port || !port.isOpen) {
        throw new Error("Serial session is not open.");
      }

      const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));
      this.parser = parser;
      this.attachParserDataHandler(parser);
      onDeviceLine?.(`INFO serial_session=open port=${this.portPath} baud=${this.baudRate}`);
      try {
        await setPortSignals(port, { dtr: false, rts: false, brk: false });
        onDeviceLine?.(
          `INFO serial_session=signals dtr=false rts=false wait_ms=${SERIAL_OPEN_CONTROL_LINE_SETTLE_MS}`,
        );
        await delay(SERIAL_OPEN_CONTROL_LINE_SETTLE_MS);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onDeviceLine?.(`WARN serial_session=signals_failed reason=${message}`);
      }
      onDeviceLine?.(
        `INFO serial_session=stabilizing detect_ms=${SERIAL_OPEN_RESET_DETECT_WINDOW_MS} boot_timeout_ms=${SERIAL_OPEN_BOOT_TIMEOUT_MS}`,
      );
      this.beginForegroundDeviceLineCapture();
      try {
        await stabilizeFreshSerialSession(parser, port, onDeviceLine);
        await probeFreshSerialSession(parser, port, onDeviceLine);
      } finally {
        this.endForegroundDeviceLineCapture();
      }

      if (this.port !== port || !port.isOpen) {
        throw new Error("Serial session is not open.");
      }
      this.lastUsedAtValue = Date.now();
    })();
    this.openingPromise = openingPromise;

    try {
      await openingPromise;
    } catch (error) {
      if (port.isOpen) {
        await closePort(port).catch(() => {
          // Preserve the original open/probe error; the session is already
          // considered unusable and will be discarded below.
        });
      }

      if (this.port === port) {
        if (this.parser) {
          this.detachParserDataHandler(this.parser);
        }
        this.passiveDeviceLines = [];
        this.foregroundDeviceLineCaptureDepth = 0;
        this.port = null;
        this.parser = null;
      }

      this.detachPortLifecycleHandlers(port);
      throw error;
    } finally {
      if (this.openingPromise === openingPromise) {
        this.openingPromise = null;
      }
    }
  }

  async close(): Promise<void> {
    this.interruptAckWait?.();
    this.interruptAckWait = null;

    const port = this.port;

    if (!port) {
      return;
    }

    if (this.closingPromise) {
      await this.closingPromise;
      return;
    }

    const openingPromise = this.openingPromise;
    this.closingPromise = (async () => {
      try {
        try {
          await openingPromise;
        } catch {
          // Opening failed, so there is no open descriptor left to close.
        }

        if (port.isOpen) {
          await closePort(port);
        }
      } finally {
        this.detachPortLifecycleHandlers(port);
        if (this.parser) {
          this.detachParserDataHandler(this.parser);
        }
        this.passiveDeviceLines = [];
        this.foregroundDeviceLineCaptureDepth = 0;

        if (this.port === port) {
          this.port = null;
          this.parser = null;
        }

        if (this.openingPromise === openingPromise) {
          this.openingPromise = null;
        }

        this.closingPromise = null;
      }
    })();

    await this.closingPromise;
  }

  private attachPortLifecycleHandlers(port: SerialPort): void {
    this.portErrorHandler = () => {
      // Persistent sessions can be idle when a USB device is unplugged. Keep
      // those EventEmitter errors handled, then invalidate the session.
      queueMicrotask(() => {
        if (this.port === port) {
          void this.close().catch(() => {
            // The error event already tells us this descriptor is not healthy.
          });
        }
      });
    };
    this.portCloseHandler = () => {
      if (this.port === port) {
        if (this.parser) {
          this.detachParserDataHandler(this.parser);
        }
        this.passiveDeviceLines = [];
        this.foregroundDeviceLineCaptureDepth = 0;
        this.port = null;
        this.parser = null;
        this.openingPromise = null;
      }

      this.detachPortLifecycleHandlers(port);
    };

    port.on("error", this.portErrorHandler);
    port.on("close", this.portCloseHandler);
  }

  private detachPortLifecycleHandlers(port: SerialPort): void {
    if (this.portErrorHandler) {
      port.off("error", this.portErrorHandler);
      this.portErrorHandler = null;
    }

    if (this.portCloseHandler) {
      port.off("close", this.portCloseHandler);
      this.portCloseHandler = null;
    }
  }

  private attachParserDataHandler(parser: ReadlineParser): void {
    this.parserDataHandler = (rawLine: string | Buffer) => {
      if (this.foregroundDeviceLineCaptureDepth > 0) {
        return;
      }

      const line = sanitizeDeviceLine(rawLine);

      if (!line || !isPassiveDeviceLine(line)) {
        return;
      }

      this.passiveDeviceLines.push(line);

      if (this.passiveDeviceLines.length > PASSIVE_DEVICE_LINE_BUFFER_LIMIT) {
        this.passiveDeviceLines.splice(0, this.passiveDeviceLines.length - PASSIVE_DEVICE_LINE_BUFFER_LIMIT);
      }
    };

    parser.on("data", this.parserDataHandler);
  }

  private detachParserDataHandler(parser: ReadlineParser): void {
    if (this.parserDataHandler) {
      parser.off("data", this.parserDataHandler);
      this.parserDataHandler = null;
    }
  }

  private beginForegroundDeviceLineCapture(): void {
    this.foregroundDeviceLineCaptureDepth += 1;
  }

  private endForegroundDeviceLineCapture(): void {
    if (this.foregroundDeviceLineCaptureDepth > 0) {
      this.foregroundDeviceLineCaptureDepth -= 1;
    }
  }

  private flushPassiveDeviceLines(onDeviceLine?: (line: string) => void): void {
    if (!onDeviceLine || this.passiveDeviceLines.length === 0) {
      return;
    }

    const pendingLines = this.passiveDeviceLines.splice(0, this.passiveDeviceLines.length);
    pendingLines.forEach((line) => onDeviceLine(line));
  }

  async send(commands: string[], options: SerialCommandSendOptions): Promise<void> {
    await this.open(options.onDeviceLine);

    if (!this.port || !this.parser) {
      throw new Error("Serial session is not open.");
    }

    let inputTiming = { ...DEFAULT_SAFE_INPUT_TIMING };
    const basicPaletteState = createBasicPaletteTimingState();
    this.flushPassiveDeviceLines(options.onDeviceLine);

    for (const [index, command] of commands.entries()) {
      this.flushPassiveDeviceLines(options.onDeviceLine);
      await options.beforeCommand?.();

      if (options.shouldStop?.()) {
        break;
      }

      let attempt = 0;
      let sent = false;
      const commandSequence = this.sequence;
      const framedCommand = formatSequencedCommand(this.sessionId, commandSequence, command);

      while (!sent) {
        try {
          this.beginForegroundDeviceLineCapture();
          await writeLine(this.port, framedCommand);
          try {
            await waitForAck(
              this.parser,
              this.port,
              getAckTimeoutForCommand(
                command,
                options.ackTimeoutMs,
                inputTiming,
                basicPaletteState,
              ),
              {
                sessionId: this.sessionId,
                sequence: commandSequence,
              },
              {
                ...(options.onDeviceLine ? { onDeviceLine: options.onDeviceLine } : {}),
                onInterruptReady: (interrupt) => {
                  this.interruptAckWait = interrupt;
                  options.onInterruptReady?.(interrupt);
                },
              },
            );
          } finally {
            this.endForegroundDeviceLineCapture();
          }
          sent = true;
        } catch (error) {
          this.endForegroundDeviceLineCapture();
          if (options.shouldStop?.()) {
            throw new Error("Execution stopped.");
          }

          if (isControllerInputReportFailure(error)) {
            throw error;
          }

          if (attempt >= options.retries) {
            throw error;
          }

          const message = error instanceof Error ? error.message : String(error);
          options.onDeviceLine?.(
            `WARN retry command=${index + 1} attempt=${attempt + 1} reason=${message}`,
          );
          attempt += 1;
        }
      }

      await options.onProgress?.({
        index: index + 1,
        total: commands.length,
        command,
      });
      inputTiming = parseInputConfigCommand(command) ?? inputTiming;
      updateBasicPaletteStateForCommand(command, basicPaletteState);
      this.sequence += 1;
      this.lastUsedAtValue = Date.now();
    }

    this.flushPassiveDeviceLines(options.onDeviceLine);
  }
}

export class SerialSessionManager {
  private session: SerialCommandSession | null = null;
  private queue: Promise<void> = Promise.resolve();
  private pendingOperations = 0;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(private readonly idleTimeoutMs = DEFAULT_SERIAL_SESSION_IDLE_TIMEOUT_MS) {}

  snapshot(): SerialSessionSnapshot {
    return {
      connected: this.session?.isConnected === true,
      portPath: this.session?.portPath ?? null,
      baudRate: this.session?.baudRate ?? null,
      busy: this.pendingOperations > 0,
      idleTimeoutMs: this.idleTimeoutMs,
      lastUsedAt: this.session?.lastUsedAt ?? null,
    };
  }

  async send(
    commands: string[],
    options: {
      path: string;
      baudRate: number;
    } & SerialCommandSendOptions,
  ): Promise<void> {
    this.pendingOperations += 1;
    this.clearIdleTimer();

    const queuedSend = this.queue.then(async () => {
      try {
        const session = await this.getSession(options.path, options.baudRate, options.onDeviceLine);
        await session.send(commands, options);
      } catch (error) {
        await this.closeCurrentSession();
        throw error;
      }
    });

    this.queue = queuedSend.catch(() => undefined);

    try {
      await queuedSend;
    } finally {
      this.pendingOperations -= 1;
      if (this.pendingOperations === 0) {
        this.scheduleIdleClose();
      }
    }
  }

  async disconnect(options: { force?: boolean } = {}): Promise<SerialSessionSnapshot> {
    if (this.pendingOperations > 0 && options.force !== true) {
      throw new Error("Serial session is busy.");
    }

    this.clearIdleTimer();
    await this.closeCurrentSession();
    return this.snapshot();
  }

  private async getSession(
    path: string,
    baudRate: number,
    onDeviceLine?: (line: string) => void,
  ): Promise<SerialCommandSession> {
    const preferredPath = preferSerialPath(path);

    if (
      !this.session ||
      !this.session.isConnected ||
      this.session.portPath !== preferredPath ||
      this.session.baudRate !== baudRate
    ) {
      await this.closeCurrentSession();
      this.session = new SerialCommandSession(preferredPath, baudRate);
      onDeviceLine?.(`INFO serial_session=create port=${preferredPath} baud=${baudRate}`);
    } else {
      onDeviceLine?.(`INFO serial_session=reuse port=${preferredPath} baud=${baudRate}`);
    }

    return this.session;
  }

  private async closeCurrentSession(): Promise<void> {
    const session = this.session;
    this.session = null;
    await session?.close();
  }

  private scheduleIdleClose(): void {
    if (!this.session?.isConnected) {
      return;
    }

    this.idleTimer = setTimeout(() => {
      void this.disconnect({ force: true });
    }, this.idleTimeoutMs);
  }

  private clearIdleTimer(): void {
    if (!this.idleTimer) {
      return;
    }

    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}

export class SerialAckSender implements SenderControls {
  private paused = false;
  private stopped = false;
  private activeSession: SerialCommandSession | null = null;
  private interruptAckWait: (() => void) | null = null;

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  stop(): void {
    this.stopped = true;
    this.interruptAckWait?.();
    this.interruptAckWait = null;

    void this.activeSession?.close().catch(() => {
      // Intentionally ignored: closing the session here is only used to break
      // a blocking ACK wait so the execution can transition out of
      // `stopping` immediately.
    });
  }

  private async waitWhilePaused(): Promise<void> {
    while (this.paused && !this.stopped) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async send(
    commands: string[],
    options: {
      path: string;
      baudRate: number;
      ackTimeoutMs: number;
      retries: number;
      onProgress?: (progress: ProgressUpdate) => Promise<void> | void;
      onDeviceLine?: (line: string) => void;
    },
  ): Promise<void> {
    this.paused = false;
    this.stopped = false;

    const session = new SerialCommandSession(options.path, options.baudRate);
    this.activeSession = session;

    try {
      await session.send(commands, {
        ackTimeoutMs: options.ackTimeoutMs,
        retries: options.retries,
        ...(options.onProgress ? { onProgress: options.onProgress } : {}),
        ...(options.onDeviceLine ? { onDeviceLine: options.onDeviceLine } : {}),
        beforeCommand: () => this.waitWhilePaused(),
        shouldStop: () => this.stopped,
        onInterruptReady: (interrupt) => {
          this.interruptAckWait = interrupt;
        },
      });
    } finally {
      this.interruptAckWait = null;
      this.activeSession = null;
      await session.close();
    }
  }
}
