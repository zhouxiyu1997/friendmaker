import assert from "node:assert/strict";
import test from "node:test";

import {
  isUploadPortFailure,
  summarizePlatformIoFailure,
} from "../src/web/server.js";

test("summarizePlatformIoFailure prefers the actionable esptool line over the echoed command", () => {
  const summary = summarizePlatformIoFailure(
    [
      "$ /Users/demo/.platformio/penv/bin/pio run -e esp32dev_wireless -t upload --upload-port /dev/cu.usbserial-0001",
      "Configuring upload protocol...",
      "AVAILABLE: esptool",
      "CURRENT: upload_protocol = esptool",
      "Looking for upload port...",
      "A fatal error occurred: Failed to connect to ESP32: Timed out waiting for packet header",
    ].join("\n"),
    1,
  );

  assert.equal(
    summary,
    "A fatal error occurred: Failed to connect to ESP32: Timed out waiting for packet header",
  );
});

test("isUploadPortFailure recognizes upload-port-specific serial failures", () => {
  assert.equal(
    isUploadPortFailure("could not open port 'COM7': FileNotFoundError(2, 'The system cannot find the file specified.', None, 2)"),
    true,
  );
  assert.equal(
    isUploadPortFailure("Compiling .pio/build/esp32dev_wireless/src/main.cpp.o"),
    false,
  );
});
