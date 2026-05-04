import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("esp32 wireless firmware keeps a 2MB-compatible upload header for generic boards", async () => {
  const platformioSource = await readFile(
    new URL("../../../firmware/esp32/platformio.ini", import.meta.url),
    "utf8",
  );

  assert.match(
    platformioSource,
    /\[env:esp32dev_wireless\][\s\S]*board_build\.esp-idf\.sdkconfig_path\s*=\s*sdkconfig\.esp32dev_wireless[\s\S]*board_upload\.flash_size\s*=\s*2MB/u,
  );
});

test("controller firmware keeps bluetooth identity stable and waits for host HID open after auth", async () => {
  const firmwareSource = await readFile(
    new URL("../../../firmware/esp32/src/classic_bt_controller_transport.cpp", import.meta.url),
    "utf8",
  );

  assert.match(
    firmwareSource,
    /deriveDeterministicBaseMac[\s\S]*source=%s/u,
  );
  assert.doesNotMatch(
    firmwareSource,
    /ESP_BT_GAP_AUTH_CMPL_EVT[\s\S]*attemptVirtualCablePlug\(lastPeerAddress_, "auth-complete"\)/u,
  );
});
