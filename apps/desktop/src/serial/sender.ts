import { ReadlineParser } from "@serialport/parser-readline";
import { SerialPort } from "serialport";

import { preferSerialPath } from "./listPorts.js";
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
const COLOR_PALETTE_SLOT_COUNT = 9;
const COLOR_PALETTE_RESET_TO_BOTTOM_STEPS = 18;
const COLOR_PALETTE_MENU_PRESS_DURATION_MS = 90;
const COLOR_PALETTE_MENU_INPUT_DELAY_MS = 90;
const COLOR_PALETTE_MENU_OPEN_SETTLE_MS = 180;
const COLOR_PALETTE_EDITOR_OPEN_SETTLE_MS = 180;
const COLOR_PALETTE_EDITOR_HUE_RESET_HOLD_MS = 2_500;
const COLOR_PALETTE_EDITOR_HUE_STEP_COUNT = 200;
const COLOR_PALETTE_EDITOR_SATURATION_STEP_COUNT = 213;
const COLOR_PALETTE_EDITOR_VALUE_STEP_COUNT = 112;
const COLOR_PALETTE_EDITOR_RESET_UP_HOLD_MS = 1_500;
const COLOR_PALETTE_EDITOR_RESET_LEFT_HOLD_MS = 3_000;
const COLOR_PALETTE_EDITOR_MOVE_STEP_MS = 20;
const BASIC_COLOR_TAB_SETTLE_MS = 140;
const PALETTE_CONFIG_TIMEOUT_MARGIN_MS = 2_000;

interface SerialCommandSendOptions {
  ackTimeoutMs: number;
  retries: number;
  onProgress?: (progress: ProgressUpdate) => void;
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

interface HsvColor {
  hue: number;
  saturation: number;
  value: number;
}

function clampPaletteSlotIndex(index: number): number {
  if (index < 0) {
    return 0;
  }

  if (index >= COLOR_PALETTE_SLOT_COUNT) {
    return COLOR_PALETTE_SLOT_COUNT - 1;
  }

  return index;
}

function scaleChannelToSteps(value: number, steps: number): number {
  if (steps <= 0) {
    return 0;
  }

  const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
  return Math.round(clamped * steps);
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

function estimatePaletteConfigDurationMs(
  slotIndex: number,
  red: number,
  green: number,
  blue: number,
  timing: InputTiming,
): number {
  const normalizedSlot = clampPaletteSlotIndex(slotIndex);
  const hsv = rgbToHsv(red, green, blue);
  const hueRatio = hsv.hue <= 0 ? 0 : (360 - hsv.hue) / 360;
  const hueSteps = Math.round(hueRatio * COLOR_PALETTE_EDITOR_HUE_STEP_COUNT);
  const saturationSteps = scaleChannelToSteps(hsv.saturation, COLOR_PALETTE_EDITOR_SATURATION_STEP_COUNT);
  const valueDropSteps = scaleChannelToSteps(1 - hsv.value, COLOR_PALETTE_EDITOR_VALUE_STEP_COUNT);
  const generalPressMs = timing.buttonPressMs + timing.inputDelayMs;
  const menuPressMs = COLOR_PALETTE_MENU_PRESS_DURATION_MS + COLOR_PALETTE_MENU_INPUT_DELAY_MS;

  return (
    generalPressMs + // open palette with Y
    COLOR_PALETTE_MENU_OPEN_SETTLE_MS +
    COLOR_PALETTE_RESET_TO_BOTTOM_STEPS * menuPressMs +
    (COLOR_PALETTE_SLOT_COUNT - 1 - normalizedSlot) * menuPressMs +
    menuPressMs + // enter slot with Y
    COLOR_PALETTE_EDITOR_OPEN_SETTLE_MS +
    menuPressMs + // switch to custom tab with R
    BASIC_COLOR_TAB_SETTLE_MS +
    (COLOR_PALETTE_EDITOR_RESET_UP_HOLD_MS + timing.inputDelayMs) +
    (COLOR_PALETTE_EDITOR_RESET_LEFT_HOLD_MS + timing.inputDelayMs) +
    (COLOR_PALETTE_EDITOR_HUE_RESET_HOLD_MS + timing.inputDelayMs) +
    hueSteps * generalPressMs +
    (saturationSteps > 0 ? saturationSteps * COLOR_PALETTE_EDITOR_MOVE_STEP_MS + timing.inputDelayMs : 0) +
    (valueDropSteps > 0 ? valueDropSteps * COLOR_PALETTE_EDITOR_MOVE_STEP_MS + timing.inputDelayMs : 0) +
    3 * generalPressMs + // B, A, B
    timing.inputDelayMs +
    PALETTE_CONFIG_TIMEOUT_MARGIN_MS
  );
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
): number {
  const trimmed = command.trim();

  if (trimmed.startsWith("CFG INPUT ")) {
    return baseTimeoutMs;
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
    const match = /^L\s+(-?\d+)\s+(-?\d+)$/u.exec(trimmed);

    if (!match || match[1] === undefined || match[2] === undefined) {
      return baseTimeoutMs;
    }

    const dx = Number.parseInt(match[1], 10);
    const dy = Number.parseInt(match[2], 10);
    const steps = Math.abs(dx) + Math.abs(dy);

    return Math.max(
      baseTimeoutMs,
      1_000 + (steps + 1) * (timing.buttonPressMs + timing.inputDelayMs),
    );
  }

  if (trimmed === "BC RESET") {
    return Math.max(baseTimeoutMs, 4_000);
  }

  if (trimmed.startsWith("C ")) {
    // Palette slot switching walks through the in-game color menu before
    // returning to the canvas, so it needs substantially more time than a
    // simple button press.
    return Math.max(baseTimeoutMs, 7_000);
  }

  if (trimmed.startsWith("BC ")) {
    // Official/basic color configuration traverses multiple menu layers and a
    // wrapped 7x12 grid before returning to the canvas.
    return Math.max(baseTimeoutMs, 15_000);
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
      estimatePaletteConfigDurationMs(slotIndex, red, green, blue, timing),
    );
  }

  return baseTimeoutMs;
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

function flushPort(port: SerialPort): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!port.isOpen) {
      resolve();
      return;
    }

    port.flush((error) => {
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

      try {
        await flushPort(port);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onDeviceLine?.(`WARN serial_flush_failed reason=${message}`);
      }

      if (this.port !== port || !port.isOpen) {
        throw new Error("Serial session is not open.");
      }

      this.parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));
      this.lastUsedAtValue = Date.now();
      onDeviceLine?.(`INFO serial_session=open port=${this.portPath} baud=${this.baudRate}`);
    })();
    this.openingPromise = openingPromise;

    try {
      await openingPromise;
    } catch (error) {
      if (this.port === port) {
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

  async send(commands: string[], options: SerialCommandSendOptions): Promise<void> {
    await this.open(options.onDeviceLine);

    if (!this.port || !this.parser) {
      throw new Error("Serial session is not open.");
    }

    let inputTiming = { ...DEFAULT_SAFE_INPUT_TIMING };

    for (const [index, command] of commands.entries()) {
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
          await writeLine(this.port, framedCommand);
          await waitForAck(
            this.parser,
            this.port,
            getAckTimeoutForCommand(command, options.ackTimeoutMs, inputTiming),
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
          sent = true;
        } catch (error) {
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

      options.onProgress?.({
        index: index + 1,
        total: commands.length,
        command,
      });
      inputTiming = parseInputConfigCommand(command) ?? inputTiming;
      this.sequence += 1;
      this.lastUsedAtValue = Date.now();
    }
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
      onProgress?: (progress: ProgressUpdate) => void;
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
