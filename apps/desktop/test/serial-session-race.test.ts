import assert from "node:assert/strict";
import { setImmediate as waitForImmediate } from "node:timers/promises";
import test from "node:test";

import {
  MAX_SEQUENCED_COMMAND_LENGTH,
  formatSequencedCommand,
  validateSerialCommand,
  validateSerialCommandBatch,
} from "../src/protocol/sequencing.js";
import { writeWithPrearmedWait } from "../src/serial/sender.js";

test("writeWithPrearmedWait cannot lose a response emitted during write", async () => {
  let resolveWait!: (value: string) => void;
  let armed = false;
  const result = await writeWithPrearmedWait(
    () => {
      armed = true;
      return {
        promise: new Promise<string>((resolve) => {
          resolveWait = resolve;
        }),
        cancel: () => undefined,
      };
    },
    async () => {
      assert.equal(armed, true);
      resolveWait("OK");
    },
  );

  assert.equal(result, "OK");
});

test("writeWithPrearmedWait cancels a pending response after a failed write", async () => {
  const writeError = new Error("write failed");
  let rejectWait!: (error: Error) => void;
  let cancelError: Error | undefined;

  await assert.rejects(
    writeWithPrearmedWait(
      () => ({
        promise: new Promise<string>((_resolve, reject) => {
          rejectWait = reject;
        }),
        cancel: (error) => {
          cancelError = error;
          rejectWait(error ?? new Error("cancelled"));
        },
      }),
      async () => {
        throw writeError;
      },
    ),
    /write failed/u,
  );
  await waitForImmediate();

  assert.equal(cancelError, writeError);
});

test("validateSerialCommand rejects serial frame control characters", () => {
  for (const command of ["I\rBT RESET", "I\nBT CLEAR-PEER", "I\0BT RESET"]) {
    assert.throws(() => validateSerialCommand(command), /single line/u);
  }
});

test("validateSerialCommand enforces command type, content, and maximum length", () => {
  assert.throws(() => validateSerialCommand(42), /must be strings/u);
  assert.throws(() => validateSerialCommand("   "), /cannot be empty/u);
  assert.doesNotThrow(() => validateSerialCommand("I".repeat(MAX_SEQUENCED_COMMAND_LENGTH)));
  assert.throws(
    () => validateSerialCommand(`I${"x".repeat(MAX_SEQUENCED_COMMAND_LENGTH)}`),
    /too long/u,
  );
});

test("validateSerialCommandBatch validates the container and every command", () => {
  const sparseCommands = new Array<string>(1);

  assert.throws(() => validateSerialCommandBatch("I"), /array/u);
  assert.throws(() => validateSerialCommandBatch([]), /cannot be empty/u);
  assert.throws(() => validateSerialCommandBatch(["I", 42]), /must be strings/u);
  assert.throws(() => validateSerialCommandBatch(sparseCommands), /must be strings/u);
  assert.doesNotThrow(() => validateSerialCommandBatch(["I", "BT RESET"]));
});

test("formatSequencedCommand rejects unsafe commands before framing", () => {
  assert.throws(
    () => formatSequencedCommand("deadbeef", 1, "I\nBT CLEAR-PEER"),
    /single line/u,
  );
  assert.throws(
    () => formatSequencedCommand("deadbeef", 1, `I${"x".repeat(256)}`),
    /too long/u,
  );
});
