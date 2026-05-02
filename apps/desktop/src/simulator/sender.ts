import type { ProgressUpdate, SenderControls } from "../types.js";
import {
  createSessionId,
  formatSequencedCommand,
  parseSequencedAck,
} from "../protocol/sequencing.js";
import { SimulatedDevice } from "./device.js";

interface InputTiming {
  buttonPressMs: number;
  inputDelayMs: number;
  homeMs: number;
}

const DEFAULT_INPUT_TIMING: InputTiming = {
  buttonPressMs: 60,
  inputDelayMs: 40,
  homeMs: 1500,
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timed out waiting for ACK after ${timeoutMs}ms.`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function toPositiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseInputTimingConfig(command: string): InputTiming | null {
  const match = /^CFG\s+INPUT\s+(\d+)\s+(\d+)\s+(\d+)$/u.exec(command.trim());

  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  const buttonPressMs = Number.parseInt(match[1], 10);
  const inputDelayMs = Number.parseInt(match[2], 10);
  const homeMs = Number.parseInt(match[3], 10);

  if (buttonPressMs <= 0 || inputDelayMs <= 0 || homeMs <= 0) {
    return null;
  }

  return { buttonPressMs, inputDelayMs, homeMs };
}

function getAckTimeoutForCommand(
  command: string,
  baseTimeoutMs: number,
  inputTiming: InputTiming,
): number {
  const trimmed = command.trim();

  if (trimmed === "H") {
    return Math.max(baseTimeoutMs, 2_000 + inputTiming.homeMs * 2 + inputTiming.inputDelayMs);
  }

  const moveMatch = /^M\s+(-?\d+)\s+(-?\d+)$/u.exec(trimmed);

  if (moveMatch?.[1] && moveMatch[2]) {
    const steps =
      Math.abs(Number.parseInt(moveMatch[1], 10)) + Math.abs(Number.parseInt(moveMatch[2], 10));

    return Math.max(
      baseTimeoutMs,
      2_000 + steps * (inputTiming.buttonPressMs + inputTiming.inputDelayMs + 100),
    );
  }

  return baseTimeoutMs;
}

export class SimulatedAckSender implements SenderControls {
  private readonly device = new SimulatedDevice();
  private paused = false;
  private stopped = false;

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  stop(): void {
    this.stopped = true;
  }

  private async waitWhilePaused(): Promise<void> {
    while (this.paused && !this.stopped) {
      await delay(50);
    }
  }

  async send(
    commands: string[],
    options: {
      ackTimeoutMs: number;
      retries: number;
      buttonPressMs?: number | undefined;
      inputDelayMs?: number | undefined;
      homeMs?: number | undefined;
      ackDelayMs: number;
      errorAtCommand?: number;
      onProgress?: (progress: ProgressUpdate) => void;
      onDeviceLine?: (line: string) => void;
    },
  ): Promise<void> {
    const sessionId = createSessionId();
    let sequence = 1;
    let inputTiming = {
      buttonPressMs: toPositiveNumber(options.buttonPressMs, DEFAULT_INPUT_TIMING.buttonPressMs),
      inputDelayMs: toPositiveNumber(options.inputDelayMs, DEFAULT_INPUT_TIMING.inputDelayMs),
      homeMs: toPositiveNumber(options.homeMs, DEFAULT_INPUT_TIMING.homeMs),
    };

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
        let response;
        try {
          const ackTimeoutMs = getAckTimeoutForCommand(command, options.ackTimeoutMs, inputTiming);
          response = await withTimeout(
            this.device.executeCommand(framedCommand, {
              commandIndex: index + 1,
              ackDelayMs: options.ackDelayMs,
              ...(options.errorAtCommand !== undefined
                ? { errorAtCommand: options.errorAtCommand }
                : {}),
            }),
            ackTimeoutMs,
          );
        } catch (error) {
          if (attempt >= options.retries) {
            throw error;
          }

          const message = error instanceof Error ? error.message : String(error);
          const ackTimeoutMs = getAckTimeoutForCommand(command, options.ackTimeoutMs, inputTiming);
          options.onDeviceLine?.(
            `WARN retry command=${index + 1} attempt=${attempt + 1} command="${command}" timeoutMs=${ackTimeoutMs} reason=${message}`,
          );
          attempt += 1;
          continue;
        }

        for (const line of response.lines) {
          options.onDeviceLine?.(line);
        }

        const ack = parseSequencedAck(response.ack);

        if (!ack || ack.sessionId !== sessionId || ack.sequence !== commandSequence) {
          throw new Error(`Device returned an invalid ACK: ${response.ack}`);
        }

        if (ack.type !== "ok") {
          options.onDeviceLine?.(
            `ERR fatal command=${index + 1} sequence=${commandSequence} command="${command}" reason=${response.ack}`,
          );
          throw new Error(`Device returned ${response.ack}`);
        }

        sent = true;
      }

      inputTiming = parseInputTimingConfig(command) ?? inputTiming;
      options.onProgress?.({
        index: index + 1,
        total: commands.length,
        command,
      });
      sequence += 1;
    }

    if (this.stopped) {
      const response = await this.device.executeCommand(
        formatSequencedCommand(sessionId, sequence, "E"),
        {
          commandIndex: commands.length + 1,
          ackDelayMs: options.ackDelayMs,
        },
      );

      for (const line of response.lines) {
        options.onDeviceLine?.(line);
      }
    }
  }
}
