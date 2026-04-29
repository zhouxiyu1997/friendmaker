import type { ProgressUpdate, SenderControls } from "../types.js";
import {
  createSessionId,
  formatSequencedCommand,
  parseSequencedAck,
} from "../protocol/sequencing.js";
import { SimulatedDevice } from "./device.js";

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
      ackDelayMs: number;
      errorAtCommand?: number;
      onProgress?: (progress: ProgressUpdate) => void;
      onDeviceLine?: (line: string) => void;
    },
  ): Promise<void> {
    const sessionId = createSessionId();
    let sequence = 1;

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
        const response = await withTimeout(
          this.device.executeCommand(framedCommand, {
            commandIndex: index + 1,
            ackDelayMs: options.ackDelayMs,
            ...(options.errorAtCommand !== undefined
              ? { errorAtCommand: options.errorAtCommand }
              : {}),
          }),
          options.ackTimeoutMs,
        );

        for (const line of response.lines) {
          options.onDeviceLine?.(line);
        }

        const ack = parseSequencedAck(response.ack);

        if (!ack || ack.sessionId !== sessionId || ack.sequence !== commandSequence) {
          throw new Error(`Device returned an invalid ACK: ${response.ack}`);
        }

        if (ack.type !== "ok") {
          if (attempt >= options.retries) {
            throw new Error(`Device returned ${response.ack}`);
          }

          options.onDeviceLine?.(
            `WARN retry command=${index + 1} attempt=${attempt + 1} reason=${response.ack}`,
          );
          attempt += 1;
          continue;
        }

        sent = true;
      }

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
