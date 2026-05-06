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

test("controller page keeps the legacy 2000ms ACK compatibility path without changing studio defaults", async () => {
  const appSource = await readFile(
    new URL("../src/web/static/app.js", import.meta.url),
    "utf8",
  );

  assert.match(appSource, /const CONTROLLER_COMPAT_ACK_TIMEOUT_MS = 2_000;/u);
  assert.match(
    appSource,
    /commands:\s*\["I"\],[\s\S]*ackTimeoutMs:\s*CONTROLLER_COMPAT_ACK_TIMEOUT_MS,[\s\S]*enforceMinimumAckTimeout:\s*false/u,
  );
  assert.match(
    appSource,
    /runControllerCommands\([\s\S]*ackTimeoutMs:\s*CONTROLLER_COMPAT_ACK_TIMEOUT_MS,[\s\S]*enforceMinimumAckTimeout:\s*false/u,
  );
  assert.match(
    appSource,
    /async function runTimedSerialCommands\([\s\S]*ackTimeoutMs = state\.studio\.profile\.ackTimeoutMs,[\s\S]*enforceMinimumAckTimeout = true/u,
  );
});

test("/api/execute keeps ACK timeout diagnostics and allows the controller compatibility override", async () => {
  const serverSource = await readFile(
    new URL("../src/web/server.ts", import.meta.url),
    "utf8",
  );

  assert.match(serverSource, /export function resolveAckTimeoutMs\(/u);
  assert.match(serverSource, /enforceMinimumAckTimeout\?: boolean/u);
  assert.match(serverSource, /INFO ack_timeout_ms=\$\{ackTimeoutMs\}/u);
  assert.match(serverSource, /INFO ack_timeout_floor_enforced=\$\{enforceMinimumAckTimeout \? "true" : "false"\}/u);
  assert.match(
    serverSource,
    /const enforceMinimumAckTimeout = body\.enforceMinimumAckTimeout !== false;[\s\S]*resolveAckTimeoutMs\(body\.ackTimeoutMs, \{\s*enforceMinimum: enforceMinimumAckTimeout,/u,
  );
});
