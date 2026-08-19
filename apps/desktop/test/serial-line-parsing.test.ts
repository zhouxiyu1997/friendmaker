import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import type { ReadlineParser } from "@serialport/parser-readline";
import type { SerialPort } from "serialport";

import {
  getEmbeddedDeviceLine,
  sanitizeDeviceLine,
  waitForAck,
} from "../src/serial/sender.js";

const SESSION_ID = "a1b2c3d4";

class FakePort extends EventEmitter {
  isOpen = true;
}

function createAckWait(options?: { timeoutMs?: number; onDeviceLine?: (line: string) => void }): {
  emitLine: (line: string) => void;
  ackPromise: Promise<"OK">;
} {
  const parser = new EventEmitter();
  const port = new FakePort();
  const ackPromise = waitForAck(
    parser as unknown as ReadlineParser,
    port as unknown as SerialPort,
    options?.timeoutMs ?? 500,
    { sessionId: SESSION_ID, sequence: 7 },
    options?.onDeviceLine ? { onDeviceLine: options.onDeviceLine } : undefined,
  );

  return {
    emitLine: (line: string) => parser.emit("data", line),
    ackPromise,
  };
}

test("sanitizeDeviceLine strips ANSI colors from ESP-IDF logs", () => {
  assert.equal(
    sanitizeDeviceLine("\u001b[0;33mW (4652) BT_HCI: hci cmd send: type 0x01\u001b[0m"),
    "W (4652) BT_HCI: hci cmd send: type 0x01",
  );
});

test("sanitizeDeviceLine keeps well-formed sequenced ACK lines unchanged", () => {
  assert.equal(sanitizeDeviceLine(`OK ${SESSION_ID} 7`), `OK ${SESSION_ID} 7`);
  assert.equal(
    sanitizeDeviceLine(Buffer.from(`ERR ${SESSION_ID} 7 busy\r`)),
    `ERR ${SESSION_ID} 7 busy`,
  );
});

test("sanitizeDeviceLine recovers an ACK behind unrecognized leading garbage", () => {
  assert.equal(
    sanitizeDeviceLine(`\u0000\u0001garbageOK ${SESSION_ID} 7`),
    `OK ${SESSION_ID} 7`,
  );
});

test("sanitizeDeviceLine keeps ESP-IDF log lines with a trailing ACK intact", () => {
  // waitForAck 负责从这类混行的行尾提取 ACK，sanitize 不应截掉日志段
  assert.equal(
    sanitizeDeviceLine(`W (4652) BT_HCI: hci evt recvOK ${SESSION_ID} 7`),
    `W (4652) BT_HCI: hci evt recvOK ${SESSION_ID} 7`,
  );
});

test("sanitizeDeviceLine drops unrecognized noise", () => {
  assert.equal(sanitizeDeviceLine("ets Jul 29 2019 12:21:46"), null);
  assert.equal(sanitizeDeviceLine("\u0000\u0001\r"), null);
});

test("getEmbeddedDeviceLine finds an ESP-IDF log glued to an ACK", () => {
  assert.equal(
    getEmbeddedDeviceLine(`OK ${SESSION_ID} 7W (4652) BT_HCI: hci cmd send`),
    "W (4652) BT_HCI: hci cmd send",
  );
});

test("getEmbeddedDeviceLine finds a protocol device line embedded after an ACK", () => {
  assert.equal(
    getEmbeddedDeviceLine(`OK ${SESSION_ID} 7INFO transport=bt`),
    "INFO transport=bt",
  );
});

test("getEmbeddedDeviceLine ignores lines that start with the log itself", () => {
  assert.equal(getEmbeddedDeviceLine("W (4652) BT_HCI: hci cmd send"), null);
  assert.equal(getEmbeddedDeviceLine(`OK ${SESSION_ID} 7`), null);
});

test("waitForAck resolves when an OK ACK is mixed with an ESP-IDF log", async () => {
  const deviceLines: string[] = [];
  const { emitLine, ackPromise } = createAckWait({ onDeviceLine: (line) => deviceLines.push(line) });

  emitLine(`OK ${SESSION_ID} 7W (4652) BT_HCI: hci cmd send: type 0x01`);

  assert.equal(await ackPromise, "OK");
});

test("waitForAck resolves when an ESP-IDF log precedes the ACK on the same line", async () => {
  const deviceLines: string[] = [];
  const { emitLine, ackPromise } = createAckWait({ onDeviceLine: (line) => deviceLines.push(line) });

  emitLine(`W (4652) BT_HCI: hci evt recvOK ${SESSION_ID} 7`);

  assert.equal(await ackPromise, "OK");
  assert.deepEqual(deviceLines, ["W (4652) BT_HCI: hci evt recv"]);
});

test("waitForAck rejects with the device error when an ERR ACK is mixed with a log", async () => {
  const { emitLine, ackPromise } = createAckWait();

  emitLine(`ERR ${SESSION_ID} 7 unknown commandW (4652) BT_HCI: hci evt recv`);

  await assert.rejects(ackPromise, /Device returned ERR a1b2c3d4 7 unknown command/);
});

test("waitForAck ignores mixed ACKs for other sequences and keeps waiting", async () => {
  const deviceLines: string[] = [];
  const { emitLine, ackPromise } = createAckWait({ onDeviceLine: (line) => deviceLines.push(line) });

  emitLine(`OK ${SESSION_ID} 6W (4652) BT_HCI: hci cmd send`);
  emitLine(`OK ${SESSION_ID} 7`);

  assert.equal(await ackPromise, "OK");
  assert.ok(
    deviceLines.some((line) => line.startsWith(`WARN ignored ack session=${SESSION_ID} seq=6`)),
    `expected an ignored-ack warning, got: ${deviceLines.join(" | ")}`,
  );
});

test("waitForAck forwards standalone ESP-IDF logs without settling", async () => {
  const deviceLines: string[] = [];
  const { emitLine, ackPromise } = createAckWait({ onDeviceLine: (line) => deviceLines.push(line) });

  emitLine("\u001b[0;33mW (4652) BT_HCI: hci cmd send: type 0x01\u001b[0m");
  emitLine(`OK ${SESSION_ID} 7`);

  assert.equal(await ackPromise, "OK");
  assert.deepEqual(deviceLines, ["W (4652) BT_HCI: hci cmd send: type 0x01"]);
});

test("waitForAck still rejects malformed ACKs without an embedded log", async () => {
  const { emitLine, ackPromise } = createAckWait();

  emitLine("OK garbage");

  await assert.rejects(ackPromise, /unsequenced or malformed ACK/);
});
