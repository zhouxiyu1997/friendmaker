import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  deriveControllerStatus,
  normalizeControllerDeviceLines,
  readInfoLineMap,
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
  ]);

  assert.equal(info.transport, "classic-bt-uartswitchcon");
  assert.equal(info.bt_profile, "uartswitchcon-pro-controller");
  assert.equal(info.bt_init_step, "discoverable");
  assert.equal(info.bt_init_error, "ESP_OK");
  assert.equal(info.bt_last_peer, "11:22:33:44:55:66");
  assert.equal(info.bt_last_send_report_status, "1");
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
      discoverableValue: true,
    }),
    true,
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
    /state\.controller\.status\.reconnectRecommendedValue === true[\s\S]*runControllerCommands\(\["BT RESET", "I"\], "自动恢复手柄连接"\)/u,
  );
});
