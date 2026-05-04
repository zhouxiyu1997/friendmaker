const DEVICE_LINE_PREFIXES = ["INFO ", "WARN ", "BOOT ", "rst:"];

function splitEmbeddedDeviceLine(line) {
  const normalized = String(line ?? "")
    .replace(/\r/g, "")
    .trim();

  if (!normalized) {
    return [];
  }

  const indexes = [];

  DEVICE_LINE_PREFIXES.forEach((prefix) => {
    let searchIndex = normalized.indexOf(prefix);

    while (searchIndex >= 0) {
      indexes.push(searchIndex);
      searchIndex = normalized.indexOf(prefix, searchIndex + prefix.length);
    }
  });

  if (indexes.length === 0) {
    return [normalized];
  }

  const boundaries = [...new Set(indexes)].sort((left, right) => left - right);

  return boundaries
    .map((start, index) => normalized.slice(start, boundaries[index + 1] ?? undefined).trim())
    .filter(Boolean);
}

function hasControllerInitError(value) {
  return value !== "-" && value !== "none" && value !== "ESP_OK";
}

function numberFromInfo(value) {
  const normalized = String(value ?? "").trim();
  const match = /^-?\d+/u.exec(normalized);

  if (!match?.[0]) {
    return null;
  }

  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeControllerDeviceLines(lines) {
  return (lines ?? []).flatMap((line) => splitEmbeddedDeviceLine(line));
}

export function readInfoLineMap(lines) {
  const info = {};

  normalizeControllerDeviceLines(lines).forEach((line) => {
    const match = /^INFO\s+([^=]+)=(.*)$/u.exec(line);
    if (!match) {
      return;
    }

    const [, key, value] = match;
    info[key.trim()] = value.trim();
  });

  return info;
}

export function boolFromInfo(value) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

export function boolLabel(value, labels) {
  if (value === true) {
    return labels[0];
  }

  if (value === false) {
    return labels[1];
  }

  return "未知";
}

export function isControllerSendableStatus({ connected, paired, ready }) {
  return ready === true || (connected === true && paired === true);
}

export function shouldReuseExistingControllerConnection(status) {
  if (status?.reconnectRecommendedValue === true || status?.unstableValue === true) {
    return false;
  }

  return (
    status?.readyValue === true ||
    status?.connectedValue === true ||
    status?.authValue === true ||
    status?.discoverableValue === true
  );
}

export function deriveControllerStatus(lines) {
  const info = readInfoLineMap(lines);

  if (!info.transport && !info.bt_mode && !info.bt_profile) {
    return null;
  }

  const discoverable = boolFromInfo(info.bt_discoverable);
  const authComplete = boolFromInfo(info.bt_auth_complete);
  const connected = boolFromInfo(info.bt_connected);
  const paired = boolFromInfo(info.bt_paired);
  const rawReady = boolFromInfo(info.bt_ready_for_reports);
  const sendReportFailureCount = numberFromInfo(info.bt_send_report_failures) ?? 0;
  const lastSendReportStatus = numberFromInfo(info.bt_last_send_report_status);
  const lastSendReportReason = numberFromInfo(info.bt_last_send_report_reason);
  const lastAclDisconnectReason = numberFromInfo(info.bt_last_acl_disconnect_reason);
  const congestedSendReport =
    lastSendReportStatus !== null &&
    lastSendReportStatus > 0 &&
    lastSendReportReason === 8;
  const unstableInferredReady =
    rawReady !== true &&
    connected === true &&
    paired === true &&
    congestedSendReport &&
    sendReportFailureCount >= 10;
  const readyInferredFromPairing = rawReady !== true && connected === true && paired === true && !unstableInferredReady;
  const ready = rawReady === true || readyInferredFromPairing;
  const initError = info.bt_init_error ?? "-";

  let tone = "idle";
  let pill = "待连接";
  let title = "等待连接手柄";
  let detail = "当前还没有拿到可用的蓝牙连接状态。";

  if (ready === true) {
    tone = "success";
    pill = "已就绪";
    title = "手柄已连接";
    detail = readyInferredFromPairing
      ? "开发板已经完成 HID 连接和配对；固件报告通道字段可能滞后，但当前状态已经可以发送按钮和摇杆报告。"
      : "开发板已经完成连接并可发送按钮和摇杆报告，可以继续做手柄测试。";
  } else if (unstableInferredReady) {
    tone = "warning";
    pill = "不稳定";
    title = "连接容易断开";
    detail =
      `开发板已经连上 Switch，但 HID 报告通道仍在拥塞（最近一次 send-report status=${lastSendReportStatus ?? "-"} reason=${lastSendReportReason ?? "-"}，累计失败 ${sendReportFailureCount} 次），现在继续测试或开画都容易断联。建议先重置蓝牙后重新连接。`;
  } else if (connected === true) {
    tone = "running";
    pill = "已连接";
    title = "连接已建立";
    detail = "HID 连接已经建立，正在等待配对完成或报告通道完全就绪。";
  } else if (authComplete === true) {
    tone = "running";
    pill = "已认证";
    title = "认证已通过";
    detail = "Switch 已完成蓝牙认证，正在尝试把这块板子接成可用手柄。";
  } else if (discoverable === true) {
    tone = "running";
    pill = "广播中";
    title = "等待 Switch 发现";
    detail = "开发板正在广播。请在 Switch 的“更改握法/顺序”页面停留等待。";
  } else if (hasControllerInitError(initError)) {
    tone = "error";
    pill = "异常";
    title = "初始化异常";
    detail = `蓝牙初始化停在 ${info.bt_init_step ?? "unknown"}，返回 ${initError}。`;
  }

  return {
    tone,
    pill,
    title,
    detail,
    transport: info.transport ?? "-",
    profile: info.bt_profile ?? info.bt_mode ?? "-",
    discoverable: boolLabel(discoverable, ["可发现", "未发现"]),
    auth: boolLabel(authComplete, ["已通过", "未通过"]),
    connected: boolLabel(connected, ["已连接", "未连接"]),
    paired: boolLabel(paired, ["已配对", "未配对"]),
    ready: boolLabel(ready, ["可发送", "未就绪"]),
    discoverableValue: discoverable,
    authValue: authComplete,
    connectedValue: connected,
    pairedValue: paired,
    readyValue: ready,
    peer: info.bt_last_peer ?? "-",
    initStep: info.bt_init_step ?? "-",
    initError,
    rawReadyValue: rawReady,
    readyInferredValue: readyInferredFromPairing,
    unstableValue: unstableInferredReady,
    reconnectRecommendedValue: unstableInferredReady,
    sendReportFailureCount,
    lastSendReportStatus,
    lastSendReportReason,
    lastAclDisconnectReason,
    lastDropReason: info.bt_last_drop_reason ?? "-",
  };
}
