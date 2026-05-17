import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatMissingSelectedUploadPortMessage,
  formatSelectedUploadPortFailureMessage,
  isEspIdfPythonDependencyFailure,
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

test("summarizePlatformIoFailure surfaces ESP-IDF linker parsing failures", () => {
  const summary = summarizePlatformIoFailure(
    [
      "$ /Users/demo/.friend-maker/tooling/platformio/penv/bin/pio run -e esp32dev_wireless -t upload",
      "Linking .pio/build/esp32dev_wireless/firmware.elf",
      "linker script generation failed for /Users/demo/.friend-maker/tooling/platformio/packages/framework-espidf/components/esp_system/ld/esp32/sections.ld.in",
      "ERROR: failed to parse /Users/demo/.friend-maker/tooling/platformio/packages/framework-espidf/components/esp_phy/linker.lf",
      "Expected end of text, found 'i'  (at char 0), (line:1, col:1)",
      "*** [.pio/build/esp32dev_wireless/sections.ld] Error 1",
    ].join("\n"),
    1,
  );

  assert.equal(
    summary,
    "linker script generation failed for /Users/demo/.friend-maker/tooling/platformio/packages/framework-espidf/components/esp_system/ld/esp32/sections.ld.in",
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

test("isEspIdfPythonDependencyFailure recognizes missing modules and pyparsing linker parsing failures", () => {
  assert.equal(
    isEspIdfPythonDependencyFailure("ModuleNotFoundError: No module named 'idf_component_manager'"),
    true,
  );
  assert.equal(
    isEspIdfPythonDependencyFailure("ERROR: failed to parse /tmp/framework-espidf/components/esp_phy/linker.lf"),
    true,
  );
  assert.equal(
    isEspIdfPythonDependencyFailure("A fatal error occurred: Failed to connect to ESP32"),
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
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friend-maker-firmware-recovery-"));
  const server = await startWebServer({
    port: 0,
    firmwareRoot: initialRoot,
    refreshFirmwareRoot: async () => refreshedRoot,
    recoverySessionsRoot,
  });

  t.after(async () => {
    await server.close();
    await rm(initialRoot, { recursive: true, force: true });
    await rm(refreshedRoot, { recursive: true, force: true });
    await rm(recoverySessionsRoot, { recursive: true, force: true });
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
  assert.match(
    platformioSource,
    /\[env:esp32dev_wireless_switch2\][\s\S]*-DSWITCH_2=1/u,
  );
  assert.match(
    platformioSource,
    /\[env:esp32dev_wireless_switch_lite\][\s\S]*-DSWITCH_LITE=1/u,
  );
});

test("controller firmware keeps bluetooth identity stable while scoping Switch-specific behavior", async () => {
  const firmwareSource = await readFile(
    new URL("../../../firmware/esp32/src/classic_bt_controller_transport.cpp", import.meta.url),
    "utf8",
  );

  assert.match(
    firmwareSource,
    /deriveDeterministicBaseMac[\s\S]*source=%s/u,
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
    /beginExplicitInput\(bool waitForDrain\)[\s\S]*WARN bt explicit_input blocked connected=%s paired=%s ready=%s[\s\S]*inputReportSendEventCount_ < inputReportSubmitCount_[\s\S]*if \(waitForDrain\) \{[\s\S]*kExplicitInputDrainBudgetMs[\s\S]*inputReportSubmitCount_ = inputReportSendEventCount_/u,
  );
  assert.match(
    firmwareSource,
    /repeatCurrentInputReport\([\s\S]*bool waitForSendEvent[\s\S]*sendCurrentInputReport\(logFailure, waitForSendEvent\)/u,
  );
  assert.match(
    firmwareSource,
    /#if defined\(SWITCH_LITE\)[\s\S]*kBluetoothTimingProfile = "switch-lite"[\s\S]*kHidCongestionRetryBudgetMs = 300[\s\S]*kWaitForExplicitInputDrain = true/u,
  );
  assert.match(
    firmwareSource,
    /#elif defined\(SWITCH_2\)[\s\S]*kBluetoothTimingProfile = "switch2"[\s\S]*kHidCongestionRetryBudgetMs = 800[\s\S]*kHidCongestionRetryDelayMs = 120[\s\S]*kPostOpenReportQuietMs = 1000[\s\S]*kModeChangeReportQuietMs = 300[\s\S]*kExplicitInputRepeatIntervalMs = 40[\s\S]*kAttemptVirtualCableOnAuthComplete = true[\s\S]*kIdlePrePairingReportIntervalMs = 60[\s\S]*kIdleConnectedReportIntervalMs = 30/u,
  );
  assert.match(
    firmwareSource,
    /#else[\s\S]*kBluetoothTimingProfile = "switch"[\s\S]*kHidCongestionRetryBudgetMs = HID_REPEAT_INTERVAL_MS \* 4[\s\S]*kWaitForExplicitInputDrain = false[\s\S]*kAttemptVirtualCableOnAuthComplete = false/u,
  );
  assert.match(
    firmwareSource,
    /if \(kDisableBluetoothModemSleep\) \{[\s\S]*esp_bt_sleep_disable\(\)/u,
  );
  assert.match(
    firmwareSource,
    /output\.print\("INFO bt_timing_profile="\)[\s\S]*output\.println\(kBluetoothTimingProfile\)/u,
  );
  assert.match(
    firmwareSource,
    /sendTaskTrampoline[\s\S]*if \(kSendTaskStartupDelayMs > 0\)[\s\S]*!transport->explicitInputActive_ && !transport->shouldDelayInputReports\(\)[\s\S]*if \(kUseFixedSendInterval\) \{[\s\S]*kFixedSendTaskIntervalMs[\s\S]*transport->idleSendIntervalMs\(\)/u,
  );
  assert.match(
    firmwareSource,
    /ESP_HIDD_OPEN_EVT[\s\S]*kPostOpenReportQuietMs > 0[\s\S]*inputReportsQuietUntilMs_ = millis\(\) \+ kPostOpenReportQuietMs[\s\S]*if \(!shouldDelayInputReports\(\)\) \{[\s\S]*sendCurrentInputReport\(false\)/u,
  );
  assert.match(
    firmwareSource,
    /ESP_BT_GAP_MODE_CHG_EVT[\s\S]*param->mode_chg\.mode != ESP_BT_PM_MD_ACTIVE[\s\S]*inputReportsQuietUntilMs_ = millis\(\) \+ kModeChangeReportQuietMs/u,
  );
  assert.match(
    firmwareSource,
    /repeatCurrentInputReport[\s\S]*delay\(kHidCongestionRetryDelayMs\)[\s\S]*delay\(remaining < kExplicitInputRepeatIntervalMs \? remaining : kExplicitInputRepeatIntervalMs\)/u,
  );
  assert.match(
    firmwareSource,
    /repeatCurrentInputReport[\s\S]*uint32_t firstAcceptedAt = 0[\s\S]*if \(firstAcceptedAt == 0\) \{[\s\S]*firstAcceptedAt = millis\(\)[\s\S]*const uint32_t elapsed = millis\(\) - firstAcceptedAt/u,
  );
  assert.match(
    firmwareSource,
    /repeatCurrentInputReport[\s\S]*while \(shouldDelayInputReports\(\)\) \{[\s\S]*delay\(1\);[\s\S]*sendCurrentInputReport\(logFailure, waitForSendEvent\)/u,
  );
  assert.match(
    firmwareSource,
    /if \(data\[9\] == 3\) \{[\s\S]*sendSubcommandReply\(0x21, kReply03, sizeof\(kReply03\), "reply03"\);[\s\S]*if \(kMarkPairedOnSubcommand03\) \{[\s\S]*markControllerPaired\(\);[\s\S]*\}/u,
  );
  assert.match(
    firmwareSource,
    /const bool shouldLogSendReportWarning =[\s\S]*!kSuppressRoutineCongestionWarnings \|\| !isRoutineCongestion[\s\S]*if \(shouldLogSendReportWarning\)/u,
  );
  assert.match(
    firmwareSource,
    /if \(kAttemptVirtualCableOnAuthComplete\) \{[\s\S]*attemptVirtualCablePlug\(param->auth_cmpl\.bda, "auth-complete"\);/u,
  );
  assert.doesNotMatch(
    firmwareSource,
    /else if \(hasPeerAddress_\)[\s\S]*attemptVirtualCablePlug\(lastPeerAddress_, "register-app-last-peer"\)/u,
  );
});

test("controller firmware logs HID input reports around stick and button commands", async () => {
  const classicTransportSource = await readFile(
    new URL("../../../firmware/esp32/src/classic_bt_controller_transport.cpp", import.meta.url),
    "utf8",
  );

  assert.match(
    classicTransportSource,
    /INFO input_report command=%s phase=%s buttonsRight=0x%02X buttonsShared=0x%02X buttonsLeft=0x%02X leftStickX=%u leftStickY=%u rightStickX=%u rightStickY=%u/u,
  );
  assert.match(
    classicTransportSource,
    /pressButtons\([\s\S]*setButtonBits\(buttonsMask\);[\s\S]*updateInputReport\(\);[\s\S]*logInputReport\("button", "press"\)[\s\S]*clearInputs\(\);[\s\S]*logInputReport\("button", "release"\)/u,
  );
  assert.match(
    classicTransportSource,
    /pressButtonsReliable\([\s\S]*logInputReport\("button-reliable", "press"\)[\s\S]*clearInputs\(\);[\s\S]*logInputReport\("button-reliable", "release"\)/u,
  );
  assert.match(
    classicTransportSource,
    /moveDirection\([\s\S]*buttonsRight_ = 0;[\s\S]*buttonsShared_ = 0;[\s\S]*buttonsLeft_ = 0;[\s\S]*setLeftStickFromVector\(x, y\);[\s\S]*updateInputReport\(\);[\s\S]*logInputReport\("stick", "press"\)[\s\S]*clearInputs\(\);[\s\S]*logInputReport\("stick", "release"\)/u,
  );
  assert.match(
    classicTransportSource,
    /ControllerButton::LStick[\s\S]*buttonsShared_ \|= 1u << 3/u,
  );
});

test("controller firmware routes palette menu navigation through reliable input", async () => {
  const controllerSource = await readFile(
    new URL("../../../firmware/esp32/src/controller.cpp", import.meta.url),
    "utf8",
  );
  const transportHeaderSource = await readFile(
    new URL("../../../firmware/esp32/src/controller_transport.h", import.meta.url),
    "utf8",
  );
  const classicTransportSource = await readFile(
    new URL("../../../firmware/esp32/src/classic_bt_controller_transport.cpp", import.meta.url),
    "utf8",
  );
  const configSource = await readFile(
    new URL("../../../firmware/esp32/src/config.h", import.meta.url),
    "utf8",
  );
  const senderSource = await readFile(
    new URL("../src/serial/sender.ts", import.meta.url),
    "utf8",
  );

  assert.match(configSource, /COLOR_PALETTE_MENU_INPUT_DELAY_MS = 500/u);
  assert.match(senderSource, /from "\.\.\/protocol\/paletteTiming\.js"/u);
  assert.match(
    transportHeaderSource,
    /virtual bool pressButtonsReliable[\s\S]*return pressButtons\(buttonsMask, holdMs, settleMs\);[\s\S]*pressButtonReliable/u,
  );
  assert.match(
    classicTransportSource,
    /pressButtonsReliable[\s\S]*beginExplicitInput\(true\)[\s\S]*repeatCurrentInputReport\([\s\S]*true,\s*kReliableInputCongestionRetryBudgetMs/u,
  );
  assert.match(
    classicTransportSource,
    /pressButtons\([\s\S]*beginExplicitInput\(kWaitForExplicitInputDrain\)[\s\S]*repeatCurrentInputReport\([\s\S]*kWaitForExplicitInputSendEvent,\s*kHidCongestionRetryBudgetMs/u,
  );
  assert.match(
    controllerSource,
    /pressPaletteMenuButton[\s\S]*transport\.pressButtonReliable[\s\S]*COLOR_PALETTE_MENU_INPUT_DELAY_MS/u,
  );
  assert.match(
    controllerSource,
    /moveCursor[\s\S]*transport_\.pressButton\(horizontalButton, buttonPressMs_, inputDelayMs_\)/u,
  );
});

test("controller firmware logs and auto-accepts bluetooth pairing prompts", async () => {
  const firmwareSource = await readFile(
    new URL("../../../firmware/esp32/src/classic_bt_controller_transport.cpp", import.meta.url),
    "utf8",
  );

  assert.match(
    firmwareSource,
    /ESP_BT_GAP_PIN_REQ_EVT[\s\S]*INFO bt pin-request[\s\S]*esp_bt_gap_pin_reply[\s\S]*INFO bt pin-reply/u,
  );
  assert.match(
    firmwareSource,
    /ESP_BT_GAP_CFM_REQ_EVT[\s\S]*INFO bt confirm-request[\s\S]*esp_bt_gap_ssp_confirm_reply[\s\S]*INFO bt confirm-reply/u,
  );
  assert.match(
    firmwareSource,
    /ESP_BT_GAP_KEY_NOTIF_EVT[\s\S]*INFO bt passkey-notify/u,
  );
  assert.match(
    firmwareSource,
    /ESP_BT_GAP_KEY_REQ_EVT[\s\S]*INFO bt passkey-request/u,
  );
  assert.match(
    firmwareSource,
    /ESP_BT_GAP_AUTH_CMPL_EVT[\s\S]*INFO bt auth status=%d peer=%s device=\\"%s\\"/u,
  );
});

test("firmware flasher keeps the Switch model selector plus Switch 2 and Switch Lite upload mappings", async () => {
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
  assert.match(pageSource, /zhouxiyu1997\.github\.io\/friendmaker\//u);
  assert.match(pageSource, /前往手柄测试/u);
  assert.match(appSource, /switchModelId:\s*"switch"/u);
  assert.match(appSource, /firmwareWebFlasherHint/u);
  assert.match(appSource, /若改用网页端，请刷入与当前选择的 .* 对应的版本/u);
  assert.match(
    appSource,
    /state\.firmwareSwitchModels = Array\.isArray\(payload\.switchModels\) \? payload\.switchModels : \[\]/u,
  );
  assert.match(serverSource, /switchModels:\s*SWITCH_MODELS/u);
  assert.match(serverSource, /id:\s*"switch"[\s\S]*label:\s*"Switch"/u);
  assert.doesNotMatch(serverSource, /label:\s*"Switch \/ OLED \/ V2"/u);
  assert.match(serverSource, /id:\s*"switch2"[\s\S]*label:\s*"Switch 2"/u);
  assert.match(
    serverSource,
    /const switchModelId = body\.switchModelId[\s\S]*getSwitchModel\(body\.switchModelId\)\.id[\s\S]*: "switch"/u,
  );
  assert.match(
    serverSource,
    /case "switch2":[\s\S]*SWITCH_2_UPLOAD_ENVIRONMENT_ID[\s\S]*case "switch_lite":[\s\S]*SWITCH_LITE_UPLOAD_ENVIRONMENT_ID/u,
  );
  assert.match(
    serverSource,
    /function getFirmwareUploadEnvironmentLabel[\s\S]*SWITCH_2_UPLOAD_ENVIRONMENT_ID[\s\S]*Switch 2[\s\S]*SWITCH_LITE_UPLOAD_ENVIRONMENT_ID[\s\S]*Switch Lite/u,
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
    /clearStoredPeer\(\)[\s\S]*clearBondedPeerDevices\(\)[\s\S]*clearPersistedPeerAddress\(\)[\s\S]*hasPeerAddress_ = false/u,
  );
  assert.match(
    firmwareSource,
    /clearBondedPeerDevices\(\)[\s\S]*esp_bt_gap_get_bond_device_num\(\)[\s\S]*esp_bt_gap_get_bond_device_list[\s\S]*esp_bt_gap_remove_bond_device/u,
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
