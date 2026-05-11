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

test("controller firmware keeps bluetooth identity stable while scoping Switch Lite behavior", async () => {
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
    /shouldReconnectLastPeer =[\s\S]*reconnectLastPeer && hasPeerAddress_ && hasReconnectablePeer_[\s\S]*reconnectLastPeerOnRegister_ = shouldReconnectLastPeer/u,
  );
  assert.match(
    firmwareSource,
    /reconnectLastPeerOnRegister_ && hasPeerAddress_[\s\S]*attemptVirtualCablePlug\(lastPeerAddress_, "register-app-last-peer"\)/u,
  );
  assert.match(
    firmwareSource,
    /markControllerPaired\(\)[\s\S]*hasReconnectablePeer_ = hasPeerAddress_/u,
  );
  assert.match(
    firmwareSource,
    /beginExplicitInput\(\)[\s\S]*WARN bt explicit_input blocked connected=%s paired=%s ready=%s[\s\S]*inputReportSendEventCount_ < inputReportSubmitCount_[\s\S]*kExplicitInputDrainBudgetMs[\s\S]*inputReportSubmitCount_ = inputReportSendEventCount_/u,
  );
  assert.match(
    firmwareSource,
    /repeatCurrentInputReport\([\s\S]*sendCurrentInputReport\(logFailure, kWaitForExplicitInputSendEvent\)/u,
  );
  assert.match(
    firmwareSource,
    /#if !defined\(SWITCH_LITE\)[\s\S]*kHidCongestionRetryBudgetMs = HID_REPEAT_INTERVAL_MS \* 4[\s\S]*kWaitForExplicitInputSendEvent = false[\s\S]*#else[\s\S]*kHidCongestionRetryBudgetMs = 300[\s\S]*kWaitForExplicitInputSendEvent = true[\s\S]*kSuppressRoutineCongestionWarnings = true/u,
  );
  assert.match(
    firmwareSource,
    /#if defined\(SWITCH_LITE\)[\s\S]*esp_bt_sleep_disable\(\)/u,
  );
  assert.match(
    firmwareSource,
    /sendTaskTrampoline[\s\S]*if \(kSendTaskStartupDelayMs > 0\)[\s\S]*if \(kUseFixedSendInterval\) \{[\s\S]*kFixedSendTaskIntervalMs[\s\S]*transport->idleSendIntervalMs\(\)/u,
  );
  assert.match(
    firmwareSource,
    /if \(data\[9\] == 3\) \{[\s\S]*sendSubcommandReply\(0x21, kReply03, sizeof\(kReply03\), "reply03"\);[\s\S]*if \(kMarkPairedOnSubcommand03\) \{[\s\S]*markControllerPaired\(\);[\s\S]*\}/u,
  );
  assert.match(
    firmwareSource,
    /const bool shouldLogSendReportWarning =[\s\S]*!kSuppressRoutineCongestionWarnings \|\| !isRoutineCongestion[\s\S]*if \(shouldLogSendReportWarning\)/u,
  );
  assert.doesNotMatch(
    firmwareSource,
    /else if \(hasPeerAddress_\)[\s\S]*attemptVirtualCablePlug\(lastPeerAddress_, "register-app-last-peer"\)/u,
  );
});

test("firmware flasher keeps the Switch model selector and Switch Lite upload mapping", async () => {
  const pageSource = await readFile(
    new URL("../src/web/static/index.html", import.meta.url),
    "utf8",
  );
  const appSource = await readFile(
    new URL("../src/web/static/app.js", import.meta.url),
    "utf8",
  );
  const serverSource = await readFile(
    new URL("../src/web/server.ts", import.meta.url),
    "utf8",
  );

  assert.match(pageSource, /Switch 型号/u);
  assert.match(appSource, /switchModelId:\s*"switch"/u);
  assert.match(
    appSource,
    /state\.firmwareSwitchModels = Array\.isArray\(payload\.switchModels\) \? payload\.switchModels : \[\]/u,
  );
  assert.match(serverSource, /switchModels:\s*SWITCH_MODELS/u);
  assert.match(
    serverSource,
    /const switchModelId = body\.switchModelId[\s\S]*getSwitchModel\(body\.switchModelId\)\.id[\s\S]*: "switch"/u,
  );
  assert.match(
    serverSource,
    /if \(switchModelId !== "switch_lite"\) \{[\s\S]*return environmentId;[\s\S]*if \(environmentId === "esp32dev_wireless"\) \{[\s\S]*return SWITCH_LITE_UPLOAD_ENVIRONMENT_ID;/u,
  );
});

test("controller firmware can clear the stored bluetooth peer", async () => {
  const firmwareSource = await readFile(
    new URL("../../../firmware/esp32/src/classic_bt_controller_transport.cpp", import.meta.url),
    "utf8",
  );
  const protocolSource = await readFile(
    new URL("../../../firmware/esp32/src/protocol.cpp", import.meta.url),
    "utf8",
  );

  assert.match(
    firmwareSource,
    /clearStoredPeer\(\)[\s\S]*clearPersistedPeerAddress\(\)[\s\S]*hasPeerAddress_ = false/u,
  );
  assert.match(
    firmwareSource,
    /clearPersistedPeerAddress\(\)[\s\S]*nvs_erase_key\(handle, "peer_addr"\)/u,
  );
  assert.match(
    protocolSource,
    /line == "BT CLEAR-PEER"[\s\S]*controller\.clearBluetoothPeer\(\)[\s\S]*INFO action=bt-clear-peer/u,
  );
});
