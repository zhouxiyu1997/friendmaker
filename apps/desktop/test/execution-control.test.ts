import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("SerialCommandSession waits for the port to stabilize before sending commands", async () => {
  const senderSource = await readFile(
    new URL("../src/serial/sender.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    senderSource,
    /SERIAL_OPEN_STABILIZE_DELAY_MS = 500[\s\S]*SERIAL_OPEN_BOOT_TIMEOUT_MS = 12_000/u,
  );
  assert.match(
    senderSource,
    /setPortSignals\(port, \{ dtr: false, rts: false, brk: false \}\)[\s\S]*serial_session=stabilizing/u,
  );
  assert.match(
    senderSource,
    /waitForDeviceBoot\(this\.parser, port[\s\S]*serial_session=boot_ready[\s\S]*serial_session=boot_wait_skipped/u,
  );
});
