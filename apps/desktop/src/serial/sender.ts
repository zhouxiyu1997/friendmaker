import { once } from "node:events";

import { ReadlineParser } from "@serialport/parser-readline";
import { SerialPort } from "serialport";

import { preferSerialPath } from "./listPorts.js";
import {
  createSessionId,
  formatSequencedCommand,
  parseSequencedAck,
} from "../protocol/sequencing.js";
import type { ProgressUpdate, SenderControls } from "../types.js";

const ACK_LINE_PREFIXES = ["OK ", "ERR "] as const;
const DEVICE_LINE_PREFIXES = ["INFO ", "WARN ", "BOOT ", "rst:"] as const;

async function waitForOpen(port: SerialPort): Promise<void> {
  if (port.isOpen) {
    return;
  }

  await once(port, "open");
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

function getAckTimeoutForCommand(command: string, baseTimeoutMs: number): number {
  const trimmed = command.trim();

  if (trimmed === "H") {
    return Math.max(baseTimeoutMs, 6_000);
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
    return Math.max(baseTimeoutMs, 1_500 + steps * 150);
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
    return Math.max(baseTimeoutMs, 20_000);
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

export class SerialAckSender implements SenderControls {
  private paused = false;
  private stopped = false;
  private activePort: SerialPort | null = null;
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

    if (this.activePort?.isOpen) {
      this.activePort.close(() => {
        // Intentionally ignored: closing the port here is only used to break
        // a blocking ACK wait so the execution can transition out of
        // `stopping` immediately.
      });
    }
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

    const preferredPath = preferSerialPath(options.path);
    const port = new SerialPort({
      path: preferredPath,
      baudRate: options.baudRate,
      autoOpen: true,
    });
    this.activePort = port;

    const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));
    const sessionId = createSessionId();
    let sequence = 1;

    try {
      await waitForOpen(port);

      for (const [index, command] of commands.entries()) {
        await this.waitWhilePaused();

        if (this.stopped) {
          break;
        }

        let attempt = 0;
        let sent = false;
        const commandSequence = sequence;
        const framedCommand = formatSequencedCommand(sessionId, commandSequence, command);

        while (!sent) {
          try {
            await writeLine(port, framedCommand);
            await waitForAck(
              parser,
              port,
              getAckTimeoutForCommand(command, options.ackTimeoutMs),
              {
                sessionId,
                sequence: commandSequence,
              },
              {
                ...(options.onDeviceLine ? { onDeviceLine: options.onDeviceLine } : {}),
                onInterruptReady: (interrupt) => {
                  this.interruptAckWait = interrupt;
                },
              },
            );
            sent = true;
          } catch (error) {
            if (this.stopped) {
              throw new Error("Execution stopped.");
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
        sequence += 1;
      }

      if (this.stopped && port.isOpen) {
        await writeLine(port, formatSequencedCommand(sessionId, sequence, "E"));
      }
    } finally {
      this.interruptAckWait = null;
      this.activePort = null;

      if (port.isOpen) {
        await new Promise<void>((resolve, reject) => {
          port.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });
      }
    }
  }
}
