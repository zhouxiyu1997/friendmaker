import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  deriveControllerStatus,
  normalizeControllerDeviceLines,
  readInfoLineMap,
  shouldAutoReconnectLastPeer,
  shouldReuseExistingControllerConnection,
} from "../src/web/static/controllerStatus.js";

test("normalizeControllerDeviceLines splits concatenated device output", () => {
  const lines = normalizeControllerDeviceLines([
    "INFO bt_init_error=ESP_OKWARN bt hid event=send-report status=1 reason=8 report=48",
    "INFO bt_last_peer=11:22:33:44:55:66INFO bt_last_send_report_status=1",
  ]);

  assert.deepEqual(lines, [
    "INFO bt_init_error=ESP_OK",
    "WARN bt hid event=send-report status=1 reason=8 report=48",
    "INFO bt_last_peer=11:22:33:44:55:66",
    "INFO bt_last_send_report_status=1",
  ]);
});

test("readInfoLineMap keeps info fields clean when warn lines are glued on", () => {
  const info = readInfoLineMap([
    "INFO transport=classic-bt-uartswitchcon",
    "INFO bt_profile=uartswitchcon-pro-controller",
    "INFO bt_init_step=discoverable",
    "INFO bt_init_error=ESP_OKWARN bt hid event=send-report status=1 reason=8 report=48",
    "INFO bt_last_peer=11:22:33:44:55:66INFO bt_last_send_report_status=1",
    "INFO bt_local_mac=D4:F0:57:AA:BB:CCINFO bt_reply02_mac=D4:F0:57:AA:BB:CC",
  ]);

  assert.equal(info.transport, "classic-bt-uartswitchcon");
  assert.equal(info.bt_profile, "uartswitchcon-pro-controller");
  assert.equal(info.bt_init_step, "discoverable");
  assert.equal(info.bt_init_error, "ESP_OK");
  assert.equal(info.bt_last_peer, "11:22:33:44:55:66");
  assert.equal(info.bt_last_send_report_status, "1");
  assert.equal(info.bt_local_mac, "D4:F0:57:AA:BB:CC");
  assert.equal(info.bt_reply02_mac, "D4:F0:57:AA:BB:CC");
});

test("deriveControllerStatus prefers connected-ready progress over stale init error display", () => {
  const status = deriveControllerStatus([
    "INFO transport=classic-bt-uartswitchcon",
    "INFO bt_profile=uartswitchcon-pro-controller",
    "INFO bt_discoverable=false",
    "INFO bt_auth_complete=false",
    "INFO bt_connected=true",
    "INFO bt_paired=true",
    "INFO bt_ready_for_reports=false",
    "INFO bt_init_step=discoverable",
    "INFO bt_init_error=btStart_failed",
  ]);

  assert.ok(status);
  assert.equal(status?.tone, "success");
  assert.equal(status?.pill, "已就绪");
  assert.equal(status?.title, "手柄已连接");
  assert.equal(status?.ready, "可发送");
  assert.equal(status?.initError, "btStart_failed");
});

test("deriveControllerStatus marks congested inferred-ready links as unstable", () => {
  const status = deriveControllerStatus([
    "INFO transport=classic-bt-uartswitchcon",
    "INFO bt_profile=uartswitchcon-pro-controller",
    "INFO bt_discoverable=false",
    "INFO bt_auth_complete=false",
    "INFO bt_connected=true",
    "INFO bt_paired=true",
    "INFO bt_ready_for_reports=false",
    "INFO bt_send_report_failures=7236",
    "INFO bt_last_send_report_status=1",
    "INFO bt_last_send_report_reason=8",
    "INFO bt_last_acl_disconnect_reason=19",
    "INFO bt_init_step=discoverable",
    "INFO bt_init_error=ESP_OK",
  ]);

  assert.ok(status);
  assert.equal(status?.tone, "warning");
  assert.equal(status?.pill, "不稳定");
  assert.equal(status?.title, "连接容易断开");
  assert.equal(status?.ready, "未就绪");
  assert.equal(status?.readyValue, false);
  assert.equal(status?.unstableValue, true);
  assert.equal(status?.reconnectRecommendedValue, true);
  assert.equal(status?.sendReportFailureCount, 7236);
  assert.equal(status?.lastSendReportReason, 8);
  assert.equal(status?.lastAclDisconnectReason, 19);
});

test("deriveControllerStatus flags device identity mismatches before the controller is ready", () => {
  const status = deriveControllerStatus([
    "INFO transport=classic-bt-uartswitchcon",
    "INFO bt_profile=uartswitchcon-pro-controller",
    "INFO bt_discoverable=false",
    "INFO bt_auth_complete=true",
    "INFO bt_connected=false",
    "INFO bt_paired=false",
    "INFO bt_ready_for_reports=false",
    "INFO bt_report_channel_open=false",
    "INFO bt_local_mac=D4:F0:57:AA:BB:CC",
    "INFO bt_reply02_mac=D4:F0:57:11:22:33",
    "INFO bt_init_step=auth-complete",
    "INFO bt_init_error=ESP_OK",
  ]);

  assert.ok(status);
  assert.equal(status?.tone, "warning");
  assert.equal(status?.pill, "身份异常");
  assert.equal(status?.title, "控制器身份不一致");
  assert.equal(status?.localMac, "D4:F0:57:AA:BB:CC");
  assert.equal(status?.reply02Mac, "D4:F0:57:11:22:33");
  assert.equal(status?.identityMismatchValue, true);
  assert.equal(status?.reportChannelOpenValue, false);
});

test("deriveControllerStatus ignores incomplete local MAC reads before declaring an identity mismatch", () => {
  const status = deriveControllerStatus([
    "INFO transport=classic-bt-uartswitchcon",
    "INFO bt_profile=uartswitchcon-pro-controller",
    "INFO bt_discoverable=false",
    "INFO bt_auth_complete=true",
    "INFO bt_connected=true",
    "INFO bt_paired=true",
    "INFO bt_ready_for_reports=true",
    "INFO bt_report_channel_open=true",
    "INFO bt_local_mac=",
    "INFO bt_reply02_mac=D4:F0:57:52:8A:D4",
    "INFO bt_init_step=hid-open",
    "INFO bt_init_error=ESP_OK",
  ]);

  assert.ok(status);
  assert.equal(status?.tone, "success");
  assert.equal(status?.pill, "已就绪");
  assert.equal(status?.title, "手柄已连接");
  assert.equal(status?.localMac, "-");
  assert.equal(status?.reply02Mac, "D4:F0:57:52:8A:D4");
  assert.equal(status?.identityMismatchValue, false);
});

test("deriveControllerStatus shows Switch-accepted reconnects as connected before reports are ready", () => {
  const status = deriveControllerStatus([
    "INFO transport=classic-bt-uartswitchcon",
    "INFO bt_profile=uartswitchcon-pro-controller",
    "INFO bt auth status=0 device=\"Nintendo Switch\"",
    "INFO bt hid event=open status=0 conn=1 peer=unknown",
    "INFO bt_discoverable=true",
    "INFO bt_connected=false",
    "INFO bt_auth_complete=false",
    "INFO bt_paired=false",
    "INFO bt_ready_for_reports=false",
    "INFO bt_report_channel_open=false",
    "INFO bt_init_step=hid-connecting",
    "INFO bt_init_error=ESP_OK",
  ]);

  assert.ok(status);
  assert.equal(status?.tone, "success");
  assert.equal(status?.pill, "已连接");
  assert.equal(status?.title, "Switch 已接受连接");
  assert.equal(status?.authValue, true);
  assert.equal(status?.connectedValue, true);
  assert.equal(status?.readyValue, false);
  assert.equal(status?.switchAcceptedValue, true);
});

test("deriveControllerStatus warns when the board firmware still reports hid-open-failed for a connecting HID open", () => {
  const status = deriveControllerStatus([
    "INFO transport=classic-bt-uartswitchcon",
    "INFO bt_profile=uartswitchcon-pro-controller",
    "INFO bt hid event=open status=0 conn=1 peer=unknown",
    "INFO bt_discoverable=true",
    "INFO bt_connected=false",
    "INFO bt_auth_complete=false",
    "INFO bt_paired=false",
    "INFO bt_ready_for_reports=false",
    "INFO bt_report_channel_open=false",
    "INFO bt_init_step=hid-open-failed",
    "INFO bt_init_error=hid_open_failed",
  ]);

  assert.ok(status);
  assert.equal(status?.tone, "warning");
  assert.equal(status?.pill, "待刷固件");
  assert.equal(status?.title, "开发板固件需要更新");
});

test("shouldReuseExistingControllerConnection keeps active bluetooth sessions intact", () => {
  assert.equal(
    shouldReuseExistingControllerConnection({
      readyValue: true,
      connectedValue: false,
      authValue: false,
      discoverableValue: false,
    }),
    true,
  );
  assert.equal(
    shouldReuseExistingControllerConnection({
      readyValue: false,
      connectedValue: true,
      authValue: false,
      discoverableValue: false,
    }),
    true,
  );
  assert.equal(
    shouldReuseExistingControllerConnection({
      readyValue: false,
      connectedValue: false,
      authValue: true,
      discoverableValue: false,
    }),
    true,
  );
  assert.equal(
    shouldReuseExistingControllerConnection({
      readyValue: false,
      connectedValue: false,
      authValue: false,
      initStep: "hid-connecting",
    }),
    true,
  );
  assert.equal(
    shouldReuseExistingControllerConnection({
      readyValue: false,
      connectedValue: false,
      authValue: false,
      discoverableValue: true,
    }),
    false,
  );
  assert.equal(
    shouldReuseExistingControllerConnection({
      readyValue: false,
      connectedValue: false,
      authValue: false,
      discoverableValue: false,
    }),
    false,
  );
  assert.equal(
    shouldReuseExistingControllerConnection({
      readyValue: false,
      connectedValue: true,
      authValue: false,
      discoverableValue: false,
      reconnectRecommendedValue: true,
      unstableValue: true,
    }),
    false,
  );
});

test("shouldAutoReconnectLastPeer only retries the remembered host when a handshake already exists", () => {
  assert.equal(
    shouldAutoReconnectLastPeer({
      readyValue: true,
      connectedValue: false,
      authValue: false,
      pairedValue: false,
      initStep: "discoverable",
    }),
    true,
  );
  assert.equal(
    shouldAutoReconnectLastPeer({
      readyValue: false,
      connectedValue: false,
      authValue: false,
      pairedValue: false,
      initStep: "hid-connecting",
    }),
    true,
  );
  assert.equal(
    shouldAutoReconnectLastPeer({
      readyValue: false,
      connectedValue: false,
      authValue: false,
      pairedValue: false,
      initStep: "discoverable",
      peer: "78:81:8C:13:8E:D1",
    }),
    true,
  );
  assert.equal(
    shouldAutoReconnectLastPeer({
      readyValue: false,
      connectedValue: false,
      authValue: false,
      pairedValue: false,
      initStep: "discoverable",
      peer: "-",
    }),
    false,
  );
});

test("controller status updates also resync the controller action buttons", async () => {
  const appSource = await readFile(
    new URL("../src/web/static/app.js", import.meta.url),
    "utf8",
  );

  assert.match(
    appSource,
    /function setControllerStatus\(partialStatus\)\s*\{[\s\S]*renderControllerStatus\(\);[\s\S]*syncControllerUi\(\);[\s\S]*syncStudioUi\(\);[\s\S]*\}/u,
  );

  assert.match(
    appSource,
    /els\.controllerInfoButton\.addEventListener\("click", async \(\) => \{[\s\S]*await requestControllerStatus\(\)[\s\S]*shouldReuseExistingControllerConnection\(state\.controller\.status\)[\s\S]*runControllerCommands\(\["BT RESET", "I"\], "连接手柄"\)/u,
  );

  assert.match(
    appSource,
    /els\.controllerResetButton\.addEventListener\("click", async \(\) => \{[\s\S]*shouldAutoReconnectLastPeer\(state\.controller\.status\)[\s\S]*BT RESET LAST-PEER[\s\S]*BT RESET[\s\S]*重置手柄蓝牙/u,
  );

  assert.match(
    appSource,
    /state\.controller\.status\.reconnectRecommendedValue === true[\s\S]*shouldAutoReconnectLastPeer\(state\.controller\.status\)[\s\S]*BT RESET LAST-PEER[\s\S]*BT RESET[\s\S]*自动恢复手柄连接/u,
  );

  assert.match(
    appSource,
    /Date\.now\(\) > controllerStatusPollDeadlineMs[\s\S]*await handleControllerStatusPollTimeout\(\)/u,
  );

  assert.match(
    appSource,
    /status\?\.switchAcceptedValue !== true[\s\S]*status\?\.readyValue !== true/u,
  );

  assert.match(
    appSource,
    /const shouldReconnectLastPeer = shouldAutoReconnectLastPeer\(state\.controller\.status\);[\s\S]*controllerStatusTimeoutRecoveryAttempted = true[\s\S]*等待连接超过 45 秒，自动重置蓝牙并重试一次。[\s\S]*BT RESET LAST-PEER[\s\S]*BT RESET[\s\S]*自动恢复手柄连接/u,
  );

  assert.match(
    appSource,
    /if \(payload\) \{[\s\S]*startControllerStatusPolling\(\);[\s\S]*\} else \{[\s\S]*setControllerRecoveryFailedStatus\(/u,
  );
});
