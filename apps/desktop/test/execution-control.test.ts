import assert from "node:assert/strict";
import test from "node:test";

import type {
  SerialSessionManager,
  SerialSessionSnapshot,
} from "../src/serial/sender.js";
import { ManagedSerialSessionSender } from "../src/web/server.js";

function makeDisconnectedSerialSessionSnapshot(): SerialSessionSnapshot {
  return {
    connected: false,
    portPath: null,
    baudRate: null,
    busy: false,
    idleTimeoutMs: 0,
    lastUsedAt: null,
  };
}

test("ManagedSerialSessionSender.stop interrupts a blocking ACK wait and disconnects the session", async () => {
  let disconnectCalls = 0;
  let readyToStop: (() => void) | null = null;
  let resolveInterruptReady: (() => void) | null = null;
  const interruptReady = new Promise<void>((resolve) => {
    resolveInterruptReady = resolve;
  });

  const sessionManager = {
    async send(_commands: string[], options: Parameters<SerialSessionManager["send"]>[1]): Promise<void> {
      await new Promise<void>((_resolve, reject) => {
        readyToStop = () => {
          reject(new Error("Execution stopped."));
        };
        options.onInterruptReady?.(readyToStop);
        resolveInterruptReady?.();
      });
    },
    async disconnect(options: { force?: boolean } = {}): Promise<SerialSessionSnapshot> {
      disconnectCalls += 1;
      assert.equal(options.force, true);
      return makeDisconnectedSerialSessionSnapshot();
    },
  } as unknown as SerialSessionManager;
  const sender = new ManagedSerialSessionSender(sessionManager);
  const sendPromise = sender.send(["P"], {
    path: "COM1",
    baudRate: 115200,
    ackTimeoutMs: 2_000,
    retries: 0,
  });

  await interruptReady;
  assert.ok(readyToStop);

  sender.stop();

  await assert.rejects(sendPromise, /Execution stopped/u);
  assert.equal(disconnectCalls, 1);
});
