import assert from "node:assert/strict";
import test from "node:test";

import { getAckTimeoutForCommand } from "../src/serial/sender.js";

test("issue 74 gives Switch 2 palette configuration a transport-safe ACK window", () => {
  const timing = { buttonPressMs: 65, inputDelayMs: 45, homeMs: 1_800 };
  assert.equal(getAckTimeoutForCommand("PC 1 #910924", 5_000, timing), 90_000);
});

test("issue 74 floor is scoped to valid custom-palette commands", () => {
  const timing = { buttonPressMs: 65, inputDelayMs: 45, homeMs: 1_800 };
  assert.equal(getAckTimeoutForCommand("P", 5_000, timing), 5_000);
  assert.equal(getAckTimeoutForCommand("PC invalid", 5_000, timing), 20_000);
});
