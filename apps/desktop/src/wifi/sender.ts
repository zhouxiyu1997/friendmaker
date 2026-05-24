import { createConnection, type Socket } from "node:net";
import { createInterface, type Interface as Readline } from "node:readline";
import { resolve4 } from "node:dns/promises";

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

export const DEFAULT_WIFI_IDLE_TIMEOUT_MS = 15 * 60 * 1_000;
const TCP_OPEN_BOOT_TIMEOUT_MS = 5_000;
const TCP_READY_PROBE_TIMEOUT_MS = 3_000;
const TCP_STABILIZE_SETTLE_MS = 500;
const PASSIVE_DEVICE_LINE_BUFFER_LIMIT = 200;

const DEVICE_LINE_PREFIXES = ["INFO ", "WARN ", "BOOT ", "[", "STATUS "] as const;

function isRecognizedDeviceLine(line: string): boolean {
  if (line === "OK" || line === "ERR") return true;
  if (line.startsWith("OK ") || line.startsWith("ERR ")) return true;
  return DEVICE_LINE_PREFIXES.some((prefix) => line.startsWith(prefix));
}

function sanitizeDeviceLine(rawLine: string): string | null {
  const cleanText = rawLine
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/\r/g, "")
    .trim();

  return cleanText.length > 0 && isRecognizedDeviceLine(cleanText) ? cleanText : null;
}

function isUnsequencedAckLine(line: string): boolean {
  return line === "OK" || line === "ERR" || line.startsWith("OK ") || line.startsWith("ERR ");
}

function isPassiveDeviceLine(line: string): boolean {
  return !parseSequencedAck(line) && !isUnsequencedAckLine(line);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeLine(socket: Socket, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.destroyed) {
      reject(new Error("TCP session closed."));
      return;
    }

    socket.write(`${line}\n`, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
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

  if (trimmed.startsWith("CFG INPUT ")) return baseTimeoutMs;
  if (trimmed === "P" || trimmed.startsWith("BTN ")) return boundedTimeout(simplePressTimeoutMs);
  if (trimmed.startsWith("HOLD ")) {
    const match = /^HOLD\s+\S+\s+(\d+)$/u.exec(trimmed);
    if (!match?.[1]) return boundedTimeout(simplePressTimeoutMs);
    const holdMs = Number.parseInt(match[1], 10);
    return boundedTimeout(1_000 + holdMs + timing.inputDelayMs);
  }
  if (trimmed.startsWith("TAP ")) {
    const match = /^TAP\s+\S+\s+(\d+)$/u.exec(trimmed);
    if (!match?.[1]) return boundedTimeout(simplePressTimeoutMs);
    const count = Number.parseInt(match[1], 10);
    return boundedTimeout(1_000 + count * (timing.buttonPressMs + timing.inputDelayMs));
  }
  if (trimmed.startsWith("STICK ")) {
    const match = /^STICK\s+(-?\d+)\s+(-?\d+)\s+(\d+)$/u.exec(trimmed);
    if (!match?.[3]) return boundedTimeout(simplePressTimeoutMs);
    const holdMs = Number.parseInt(match[3], 10);
    return boundedTimeout(1_000 + holdMs + timing.inputDelayMs);
  }
  if (trimmed.startsWith("W ")) {
    const match = /^W\s+(\d+)$/u.exec(trimmed);
    if (!match?.[1]) return baseTimeoutMs;
    return boundedTimeout(1_000 + Number.parseInt(match[1], 10));
  }
  if (trimmed === "H") return Math.max(baseTimeoutMs, 1_000 + timing.homeMs * 2 + timing.inputDelayMs);
  if (trimmed === "BT RESET") return Math.max(baseTimeoutMs, 20_000);
  if (trimmed.startsWith("M ")) {
    const match = /^M\s+(-?\d+)\s+(-?\d+)$/u.exec(trimmed);
    if (!match?.[1] || !match[2]) return baseTimeoutMs;
    const steps = Math.abs(Number.parseInt(match[1], 10)) + Math.abs(Number.parseInt(match[2], 10));
    return Math.max(baseTimeoutMs, 1_000 + steps * (timing.buttonPressMs + timing.inputDelayMs));
  }
  if (trimmed.startsWith("L ")) {
    const match = /^L\s+(-?\d+)\s+(-?\d+)(?:\s+(\d+))?$/u.exec(trimmed);
    if (!match?.[1] || !match[2]) return baseTimeoutMs;
    const dx = Number.parseInt(match[1], 10);
    const dy = Number.parseInt(match[2], 10);
    const stride = match[3] === undefined ? 1 : Number.parseInt(match[3], 10);
    const metrics = getLineCommandMetrics(dx, dy, stride);
    return Math.max(baseTimeoutMs, 1_000 + metrics.actionCount * (timing.buttonPressMs + timing.inputDelayMs));
  }
  if (trimmed === "BC RESET") return Math.max(baseTimeoutMs, 4_000);
  if (trimmed.startsWith("C ")) {
    const match = /^C\s+(-?\d+)$/u.exec(trimmed);
    if (!match?.[1]) return Math.max(baseTimeoutMs, 20_000);
    return Math.max(baseTimeoutMs, estimateColorSelectDurationMs(Number.parseInt(match[1], 10), timing, { includeTimeoutMargin: true }));
  }
  if (trimmed.startsWith("BC ")) {
    const match = /^BC\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)$/u.exec(trimmed);
    if (!match?.[1] || !match[2] || !match[3]) return Math.max(baseTimeoutMs, 20_000);
    return Math.max(baseTimeoutMs, estimateBasicPaletteConfigDurationMs(
      Number.parseInt(match[1], 10), Number.parseInt(match[2], 10), Number.parseInt(match[3], 10),
      timing, { basicPaletteState, includeTimeoutMargin: true }));
  }
  if (trimmed.startsWith("PC ")) {
    const match = /^PC\s+(-?\d+)\s+#([0-9a-f]{6})$/iu.exec(trimmed);
    if (!match?.[1] || !match[2]) return Math.max(baseTimeoutMs, 20_000);
    const slotIndex = Number.parseInt(match[1], 10);
    const hex = match[2];
    const red = Number.parseInt(hex.slice(0, 2), 16);
    const green = Number.parseInt(hex.slice(2, 4), 16);
    const blue = Number.parseInt(hex.slice(4, 6), 16);
    return Math.max(baseTimeoutMs, estimatePaletteConfigDurationMs(slotIndex, red, green, blue, timing, { includeTimeoutMargin: true }));
  }
  return baseTimeoutMs;
}

export function updateBasicPaletteStateForCommand(
  command: string,
  basicPaletteState: BasicPaletteTimingState,
): void {
  const trimmed = command.trim();
  if (trimmed === "BC RESET") { resetBasicPaletteTimingState(basicPaletteState); return; }
  const match = /^BC\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)$/u.exec(trimmed);
  if (!match?.[1] || !match[2] || !match[3]) return;
  updateBasicPaletteTimingState(basicPaletteState, Number.parseInt(match[1], 10), Number.parseInt(match[2], 10), Number.parseInt(match[3], 10));
}

interface TcpCommandSendOptions {
  ackTimeoutMs: number;
  retries: number;
  onProgress?: (progress: ProgressUpdate) => Promise<void> | void;
  onDeviceLine?: (line: string) => void;
  beforeCommand?: () => Promise<void>;
  shouldStop?: () => boolean;
  onInterruptReady?: (interrupt: (() => void) | null) => void;
}

export interface TcpSessionSnapshot {
  connected: boolean;
  host: string | null;
  port: number;
  busy: boolean;
  idleTimeoutMs: number;
  lastUsedAt: number | null;
}

function waitForAck(
  rl: Readline,
  socket: Socket,
  timeoutMs: number,
  expected: { sessionId: string; sequence: number },
  options?: {
    onDeviceLine?: (line: string) => void;
    onInterruptReady?: (interrupt: (() => void) | null) => void;
  },
): Promise<"OK"> {
  return new Promise((resolve, reject) => {
    if (socket.destroyed) {
      reject(new Error("TCP session closed."));
      return;
    }

    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const timeoutId = setTimeout(() => {
      finish(() => reject(new Error(`Timed out waiting for ACK after ${timeoutMs}ms.`)));
    }, timeoutMs);

    const onLine = (rawLine: string) => {
      const line = sanitizeDeviceLine(rawLine);
      if (!line) return;

      const ack = parseSequencedAck(line);
      if (ack) {
        if (ack.sessionId !== expected.sessionId || ack.sequence !== expected.sequence) {
          options?.onDeviceLine?.(`WARN ignored ack session=${ack.sessionId} seq=${ack.sequence} expected=${expected.sessionId}:${expected.sequence}`);
          return;
        }
        if (ack.type === "ok") { finish(() => resolve("OK")); return; }
        finish(() => reject(new Error(`Device returned ERR ${ack.sessionId} ${ack.sequence} ${ack.message}`)));
        return;
      }

      if (isUnsequencedAckLine(line)) {
        finish(() => reject(new Error(`Device returned an unsequenced ACK: ${line}.`)));
        return;
      }

      options?.onDeviceLine?.(line);
    };

    const onClose = () => { finish(() => reject(new Error("TCP session closed."))); };
    const onError = (error: Error) => { finish(() => reject(error)); };
    const onInterrupt = () => { finish(() => reject(new Error("Execution stopped."))); };

    const cleanup = () => {
      clearTimeout(timeoutId);
      rl.off("line", onLine);
      socket.off("close", onClose);
      socket.off("error", onError);
      options?.onInterruptReady?.(null);
    };

    options?.onInterruptReady?.(onInterrupt);
    rl.on("line", onLine);
    socket.on("close", onClose);
    socket.on("error", onError);
  });
}

async function stabilizeTcpSession(
  rl: Readline,
  socket: Socket,
  onDeviceLine?: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.destroyed) {
      reject(new Error("TCP session closed."));
      return;
    }

    let sawBoot = false;
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const timeoutId = setTimeout(() => {
      if (!sawBoot) {
        onDeviceLine?.(`WARN tcp_session=no_boot timeout_ms=${TCP_OPEN_BOOT_TIMEOUT_MS}`);
      }
      finish(resolve);
    }, TCP_OPEN_BOOT_TIMEOUT_MS);

    const settleTimerId = setTimeout(() => {
      finish(resolve);
    }, TCP_STABILIZE_SETTLE_MS + TCP_OPEN_BOOT_TIMEOUT_MS);

    const onLine = (rawLine: string) => {
      const line = sanitizeDeviceLine(rawLine);
      if (!line) return;
      if (line.startsWith("BOOT ")) {
        sawBoot = true;
        clearTimeout(timeoutId);
        const delayedFinishId = setTimeout(() => finish(resolve), TCP_STABILIZE_SETTLE_MS);
        settleTimerId.ref = delayedFinishId.ref;
      }
      onDeviceLine?.(line);
    };

    const onClose = () => { finish(() => reject(new Error("TCP session closed during stabilise."))); };
    const onError = (error: Error) => { finish(() => reject(error)); };

    const cleanup = () => {
      clearTimeout(timeoutId);
      clearTimeout(settleTimerId);
      rl.off("line", onLine);
      socket.off("close", onClose);
      socket.off("error", onError);
    };

    rl.on("line", onLine);
    socket.on("close", onClose);
    socket.on("error", onError);
  });
}

async function probeTcpSession(
  rl: Readline,
  socket: Socket,
  onDeviceLine?: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.destroyed) {
      reject(new Error("TCP session closed."));
      return;
    }

    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const timeoutId = setTimeout(() => {
      finish(() => reject(new Error(`TCP session did not become ready after ${TCP_READY_PROBE_TIMEOUT_MS}ms.`)));
    }, TCP_READY_PROBE_TIMEOUT_MS);

    const onLine = (rawLine: string) => {
      const line = sanitizeDeviceLine(rawLine);
      if (!line) return;

      if (line.startsWith("STATUS ")) {
        finish(resolve);
        return;
      }

      if (isUnsequencedAckLine(line)) {
        finish(resolve);
        return;
      }

      onDeviceLine?.(line);
    };

    const onClose = () => { finish(() => reject(new Error("TCP session closed."))); };
    const onError = (error: Error) => { finish(() => reject(error)); };

    const cleanup = () => {
      clearTimeout(timeoutId);
      rl.off("line", onLine);
      socket.off("close", onClose);
      socket.off("error", onError);
    };

    onDeviceLine?.("INFO tcp_session=probe command=STATUS");
    socket.write("STATUS\n");
    rl.on("line", onLine);
    socket.on("close", onClose);
    socket.on("error", onError);
  });
}

export async function discoverDevice(mdnsHost: string, fallbackIp: string): Promise<{ host: string; port: number }> {
  try {
    const addresses = await resolve4(mdnsHost);
    if (addresses.length > 0 && addresses[0]) {
      return { host: addresses[0], port: 9876 };
    }
  } catch {
    // mDNS resolve failed, fall through to static IP
  }

  return { host: fallbackIp, port: 9876 };
}

export function listDeviceHosts(): string[] {
  return ["friendmaker.local", "192.168.1.200"];
}

export class TcpCommandSession {
  readonly host: string;
  readonly port: number;

  private socket: Socket | null = null;
  private rl: Readline | null = null;
  private sessionId = createSessionId();
  private sequence = 1;
  private interruptAckWait: (() => void) | null = null;
  private lastUsedAtValue: number | null = null;
  private passiveDeviceLines: string[] = [];
  private foregroundCaptureDepth = 0;

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
  }

  get isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  get lastUsedAt(): number | null {
    return this.lastUsedAtValue;
  }

  async open(onDeviceLine?: (line: string) => void): Promise<void> {
    if (this.socket && !this.socket.destroyed && this.rl) {
      return;
    }

    const socket = createConnection({ host: this.host, port: this.port, noDelay: true });
    this.socket = socket;
    const rl = createInterface({ input: socket, crlfDelay: Infinity });
    this.rl = rl;
    this.attachPassiveLineHandler(rl);

    return new Promise((resolve, reject) => {
      const onConnect = async () => {
        onDeviceLine?.(`INFO tcp_session=open host=${this.host} port=${this.port}`);
        try {
          await stabilizeTcpSession(rl, socket, onDeviceLine);
          await probeTcpSession(rl, socket, onDeviceLine);
          this.lastUsedAtValue = Date.now();
          resolve();
        } catch (error) {
          this.closeInternal(socket, rl);
          reject(error);
        }
      };

      const onError = (error: Error) => {
        this.closeInternal(socket, rl);
        reject(error);
      };

      socket.once("connect", onConnect);
      socket.once("error", onError);
    });
  }

  async close(): Promise<void> {
    this.interruptAckWait?.();
    this.interruptAckWait = null;

    const socket = this.socket;
    const rl = this.rl;
    if (!socket || !rl) return;
    this.closeInternal(socket, rl);
  }

  private closeInternal(socket: Socket, rl: Readline): void {
    rl.close();
    if (!socket.destroyed) {
      socket.destroy();
    }
    if (this.socket === socket) {
      this.socket = null;
      this.rl = null;
    }
    this.passiveDeviceLines = [];
    this.foregroundCaptureDepth = 0;
  }

  private attachPassiveLineHandler(rl: Readline): void {
    const onLine = (rawLine: string) => {
      if (this.foregroundCaptureDepth > 0) return;
      const line = sanitizeDeviceLine(rawLine);
      if (!line || !isPassiveDeviceLine(line)) return;
      this.passiveDeviceLines.push(line);
      if (this.passiveDeviceLines.length > PASSIVE_DEVICE_LINE_BUFFER_LIMIT) {
        this.passiveDeviceLines.splice(0, this.passiveDeviceLines.length - PASSIVE_DEVICE_LINE_BUFFER_LIMIT);
      }
    };

    const onClose = () => {
      if (this.socket && this.rl === rl) {
        this.passiveDeviceLines = [];
        this.foregroundCaptureDepth = 0;
        this.socket = null;
        this.rl = null;
      }
    };

    rl.on("line", onLine);
    this.socket?.on("close", onClose);
  }

  private beginForegroundCapture(): void {
    this.foregroundCaptureDepth += 1;
  }

  private endForegroundCapture(): void {
    if (this.foregroundCaptureDepth > 0) {
      this.foregroundCaptureDepth -= 1;
    }
  }

  private flushPassiveDeviceLines(onDeviceLine?: (line: string) => void): void {
    if (!onDeviceLine || this.passiveDeviceLines.length === 0) return;
    const pending = this.passiveDeviceLines.splice(0, this.passiveDeviceLines.length);
    pending.forEach((line) => onDeviceLine(line));
  }

  async send(commands: string[], options: TcpCommandSendOptions): Promise<void> {
    await this.open(options.onDeviceLine);

    if (!this.socket || !this.rl) {
      throw new Error("TCP session is not open.");
    }

    let inputTiming = { ...DEFAULT_SAFE_INPUT_TIMING };
    const basicPaletteState = createBasicPaletteTimingState();
    this.flushPassiveDeviceLines(options.onDeviceLine);

    for (const [index, command] of commands.entries()) {
      this.flushPassiveDeviceLines(options.onDeviceLine);
      await options.beforeCommand?.();

      if (options.shouldStop?.()) break;

      let attempt = 0;
      let sent = false;
      const commandSequence = this.sequence;
      const framedCommand = formatSequencedCommand(this.sessionId, commandSequence, command);

      while (!sent) {
        try {
          this.beginForegroundCapture();
          await writeLine(this.socket!, framedCommand);
          try {
            await waitForAck(
              this.rl!,
              this.socket!,
              getAckTimeoutForCommand(command, options.ackTimeoutMs, inputTiming, basicPaletteState),
              { sessionId: this.sessionId, sequence: commandSequence },
              {
                ...(options.onDeviceLine ? { onDeviceLine: options.onDeviceLine } : {}),
                onInterruptReady: (interrupt) => {
                  this.interruptAckWait = interrupt;
                  options.onInterruptReady?.(interrupt);
                },
              },
            );
          } finally {
            this.endForegroundCapture();
          }
          sent = true;
        } catch (error) {
          this.endForegroundCapture();
          if (options.shouldStop?.()) throw new Error("Execution stopped.");
          if (isControllerInputReportFailure(error)) throw error;
          if (attempt >= options.retries) throw error;

          const message = error instanceof Error ? error.message : String(error);
          options.onDeviceLine?.(`WARN retry command=${index + 1} attempt=${attempt + 1} reason=${message}`);
          attempt += 1;
        }
      }

      await options.onProgress?.({ index: index + 1, total: commands.length, command });
      inputTiming = parseInputConfigCommand(command) ?? inputTiming;
      updateBasicPaletteStateForCommand(command, basicPaletteState);
      this.sequence += 1;
      this.lastUsedAtValue = Date.now();
    }

    this.flushPassiveDeviceLines(options.onDeviceLine);
  }
}

export class TcpSessionManager {
  private session: TcpCommandSession | null = null;
  private queue: Promise<void> = Promise.resolve();
  private pendingOperations = 0;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(private readonly idleTimeoutMs = DEFAULT_WIFI_IDLE_TIMEOUT_MS) {}

  snapshot(): TcpSessionSnapshot {
    return {
      connected: this.session?.isConnected === true,
      host: this.session?.host ?? null,
      port: this.session?.port ?? 9876,
      busy: this.pendingOperations > 0,
      idleTimeoutMs: this.idleTimeoutMs,
      lastUsedAt: this.session?.lastUsedAt ?? null,
    };
  }

  async send(
    commands: string[],
    options: { host: string; port: number } & TcpCommandSendOptions,
  ): Promise<void> {
    this.pendingOperations += 1;
    this.clearIdleTimer();

    const queuedSend = this.queue.then(async () => {
      try {
        const session = await this.getSession(options.host, options.port, options.onDeviceLine);
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
      if (this.pendingOperations === 0) this.scheduleIdleClose();
    }
  }

  async disconnect(options: { force?: boolean } = {}): Promise<TcpSessionSnapshot> {
    if (this.pendingOperations > 0 && options.force !== true) {
      throw new Error("TCP session is busy.");
    }
    this.clearIdleTimer();
    await this.closeCurrentSession();
    return this.snapshot();
  }

  private async getSession(host: string, port: number, onDeviceLine?: (line: string) => void): Promise<TcpCommandSession> {
    if (!this.session || !this.session.isConnected || this.session.host !== host || this.session.port !== port) {
      await this.closeCurrentSession();
      this.session = new TcpCommandSession(host, port);
      onDeviceLine?.(`INFO tcp_session=create host=${host} port=${port}`);
    } else {
      onDeviceLine?.(`INFO tcp_session=reuse host=${host} port=${port}`);
    }
    return this.session;
  }

  private async closeCurrentSession(): Promise<void> {
    const session = this.session;
    this.session = null;
    await session?.close();
  }

  private scheduleIdleClose(): void {
    if (!this.session?.isConnected) return;
    this.idleTimer = setTimeout(() => {
      void this.disconnect({ force: true });
    }, this.idleTimeoutMs);
  }

  private clearIdleTimer(): void {
    if (!this.idleTimer) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}

export class TcpAckSender implements SenderControls {
  private paused = false;
  private stopped = false;
  private activeSession: TcpCommandSession | null = null;
  private interruptAckWait: (() => void) | null = null;

  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }

  stop(): void {
    this.stopped = true;
    this.interruptAckWait?.();
    this.interruptAckWait = null;
    void this.activeSession?.close().catch(() => {});
  }

  private async waitWhilePaused(): Promise<void> {
    while (this.paused && !this.stopped) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async send(
    commands: string[],
    options: {
      host: string;
      port: number;
      ackTimeoutMs: number;
      retries: number;
      onProgress?: (progress: ProgressUpdate) => Promise<void> | void;
      onDeviceLine?: (line: string) => void;
    },
  ): Promise<void> {
    this.paused = false;
    this.stopped = false;

    const session = new TcpCommandSession(options.host, options.port);
    this.activeSession = session;

    try {
      await session.send(commands, {
        ackTimeoutMs: options.ackTimeoutMs,
        retries: options.retries,
        ...(options.onProgress ? { onProgress: options.onProgress } : {}),
        ...(options.onDeviceLine ? { onDeviceLine: options.onDeviceLine } : {}),
        beforeCommand: () => this.waitWhilePaused(),
        shouldStop: () => this.stopped,
        onInterruptReady: (interrupt) => { this.interruptAckWait = interrupt; },
      });
    } finally {
      this.interruptAckWait = null;
      this.activeSession = null;
      await session.close();
    }
  }
}
