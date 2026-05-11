import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatMissingSelectedUploadPortMessage,
  formatSelectedUploadPortFailureMessage,
  isUploadPortFailure,
  refreshFirmwareRootForFlash,
  startWebServer,
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

test("firmware flash keeps the user on the selected upload port when that port disappears", () => {
  assert.equal(
    formatMissingSelectedUploadPortMessage("COM7"),
    "Selected port COM7 is no longer detected. Reconnect the board or choose a different port and retry.",
  );
});

test("firmware flash reports port-specific upload failures without switching to auto-detect", () => {
  assert.equal(
    formatSelectedUploadPortFailureMessage(
      "COM7",
      "could not open port 'COM7': Permission denied",
    ),
    "Upload failed on the selected port COM7. could not open port 'COM7': Permission denied Reconnect the board, make sure no other app is using the port, or choose a different port and retry.",
  );
});

test("firmware flash refreshes the writable firmware root before compiling", async (t) => {
  const initialRoot = await mkdtemp(path.join(os.tmpdir(), "friend-maker-firmware-initial-"));
  const refreshedRoot = await mkdtemp(path.join(os.tmpdir(), "friend-maker-firmware-refreshed-"));
  const server = await startWebServer({
    port: 0,
    firmwareRoot: initialRoot,
    refreshFirmwareRoot: async () => refreshedRoot,
  });

  t.after(async () => {
    await server.close();
    await rm(initialRoot, { recursive: true, force: true });
    await rm(refreshedRoot, { recursive: true, force: true });
  });

  assert.equal(await refreshFirmwareRootForFlash(), refreshedRoot);
});

test("esp32 wireless firmware keeps a 2MB-compatible upload header for generic boards", async () => {
  const platformioSource = await readFile(
    new URL("../../../firmware/esp32/platformio.ini", import.meta.url),
    "utf8",
  );

  const hasDirectSettingsInWirelessEnv =
    /\[env:esp32dev_wireless\][\s\S]*board_build\.esp-idf\.sdkconfig_path\s*=\s*sdkconfig\.esp32dev_wireless[\s\S]*board_upload\.flash_size\s*=\s*2MB/u.test(
      platformioSource,
    );
  const hasInherited2MbSettings =
    /\[env:esp32dev_wireless_base\][\s\S]*board_build\.esp-idf\.sdkconfig_path\s*=\s*sdkconfig\.esp32dev_wireless[\s\S]*board_upload\.flash_size\s*=\s*2MB[\s\S]*\[env:esp32dev_wireless\][\s\S]*extends\s*=\s*env:esp32dev_wireless_base/u.test(
      platformioSource,
    );

  assert.equal(
    hasDirectSettingsInWirelessEnv || hasInherited2MbSettings,
    true,
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
  assert.match(
    firmwareSource,
    /shouldReconnectLastPeer = reconnectLastPeer && hasPeerAddress_[\s\S]*reconnectLastPeerOnRegister_ = shouldReconnectLastPeer/u,
  );
  assert.match(
    firmwareSource,
    /reconnectLastPeerOnRegister_ && hasPeerAddress_[\s\S]*attemptVirtualCablePlug\(lastPeerAddress_, "register-app-last-peer"\)/u,
  );
  assert.doesNotMatch(
    firmwareSource,
    /else if \(hasPeerAddress_\)[\s\S]*attemptVirtualCablePlug\(lastPeerAddress_, "register-app-last-peer"\)/u,
  );
});
