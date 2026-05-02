const state = {
  activePage: "studio",
  imageDataUrl: null,
  commands: [],
  ports: [],
  selectedPortPath: "",
  serialSession: {
    connected: false,
    portPath: null,
    baudRate: null,
    busy: false,
    idleTimeoutMs: 15 * 60 * 1000,
    lastUsedAt: null,
  },
  firmwareEnvironments: [],
  firmwareTooling: {
    available: false,
    path: null,
    firmwareRoot: null,
    source: null,
    python: {
      available: false,
      path: null,
      source: null,
      runtimeSupported: false,
      runtimeSystem: null,
    },
    install: {
      status: "idle",
      lines: [],
      error: null,
      platformIoExe: null,
      lineOffset: 0,
      totalLineCount: 0,
    },
    installLineCount: 0,
  },
  windowsSerialDrivers: {
    supported: false,
    platform: null,
    arch: null,
    reason: null,
    drivers: [],
    install: {
      status: "idle",
      driverId: null,
      lines: [],
      error: null,
      lineOffset: 0,
      totalLineCount: 0,
    },
    installLineCount: 0,
  },
  studio: {
    busy: false,
    target: "serial",
    canvasSize: 256,
    brushSize: 3,
    imageScalePercent: 100,
    imageOffsetXPercent: 0,
    imageOffsetYPercent: 0,
    previewGuideMode: "none",
    colorMode: "mono",
    colorCount: 32,
    removeBackground: false,
    usedColorIndexes: [],
    officialPalette: {
      rows: 0,
      cols: 0,
      grid: [],
    },
    profile: {
      baudRate: 115200,
      ackTimeoutMs: 5000,
      commandRetryCount: 1,
    },
    execution: {
      id: null,
      status: "idle",
      totalCommands: 0,
      completedCommands: 0,
      currentCommand: null,
      startedAt: null,
      finishedAt: null,
      error: null,
      lineCount: 0,
    },
  },
  firmware: {
    busy: false,
    environmentId: "esp32dev_wireless",
    result: {
      status: "idle",
      title: "等待刷入固件",
      detail: "点击“编译并刷入固件”后，这里会显示成功或失败。",
      environmentLabel: "-",
      portPath: "-",
      updatedAt: null,
    },
  },
  controller: {
    busy: false,
    target: "serial",
    status: {
      tone: "idle",
      pill: "待连接",
      title: "等待连接手柄",
      detail: "点击“连接手柄”后，这里会显示当前蓝牙发现、认证、连接和报告发送状态。",
      transport: "-",
      profile: "-",
      discoverable: "未知",
      auth: "未知",
      connected: "未知",
      paired: "未知",
      ready: "未知",
      peer: "-",
      initStep: "-",
      initError: "-",
      discoverableValue: null,
      authValue: null,
      connectedValue: null,
      pairedValue: null,
      readyValue: null,
      updatedAt: null,
    },
  },
};

const els = {
  pageTabs: [...document.querySelectorAll(".page-tab")],
  pages: [...document.querySelectorAll(".page")],
  imageInput: document.getElementById("image-input"),
  fileLabel: document.getElementById("file-label"),
  studioConnectionCard: document.getElementById("studio-connection-card"),
  studioConnectionPill: document.getElementById("studio-connection-pill"),
  studioConnectionTitle: document.getElementById("studio-connection-title"),
  studioConnectionDetail: document.getElementById("studio-connection-detail"),
  studioOpenControllerButton: document.getElementById("studio-open-controller-button"),
  studioModeHint: document.getElementById("studio-mode-hint"),
  sizeSelect: document.getElementById("size-select"),
  brushSizeSelect: document.getElementById("brush-size-select"),
  colorModeSelect: document.getElementById("color-mode-select"),
  colorCountSelect: document.getElementById("color-count-select"),
  thresholdLabel: document.getElementById("threshold-label"),
  thresholdRange: document.getElementById("threshold-range"),
  thresholdValue: document.getElementById("threshold-value"),
  scaleRange: document.getElementById("scale-range"),
  scaleInput: document.getElementById("scale-input"),
  offsetXRange: document.getElementById("offset-x-range"),
  offsetXInput: document.getElementById("offset-x-input"),
  offsetYRange: document.getElementById("offset-y-range"),
  offsetYInput: document.getElementById("offset-y-input"),
  studioPortSelect: document.getElementById("studio-port-select"),
  refreshPortsButton: document.getElementById("refresh-ports-button"),
  executionHint: document.getElementById("execution-hint"),
  quickStartButton: document.getElementById("quick-start-button"),
  generateButton: document.getElementById("generate-button"),
  executeButton: document.getElementById("execute-button"),
  pauseExecutionButton: document.getElementById("pause-execution-button"),
  resumeExecutionButton: document.getElementById("resume-execution-button"),
  stopExecutionButton: document.getElementById("stop-execution-button"),
  resetExecutionButton: document.getElementById("reset-execution-button"),
  studioExecutionStatus: document.getElementById("studio-execution-status"),
  autoRemoveBackgroundCheckbox: document.getElementById("auto-remove-background-checkbox"),
  previewGuideSelect: document.getElementById("preview-guide-select"),
  previewCanvas: document.getElementById("preview-canvas"),
  previewImage: document.getElementById("preview-image"),
  previewEmpty: document.getElementById("preview-empty"),
  officialPalettePanel: document.getElementById("official-palette-panel"),
  officialPaletteSummary: document.getElementById("official-palette-summary"),
  officialPaletteGrid: document.getElementById("official-palette-grid"),
  commandsOutput: document.getElementById("commands-output"),
  copyButton: document.getElementById("copy-button"),
  downloadButton: document.getElementById("download-button"),
  studioLogOutput: document.getElementById("log-output"),
  studioClearLogButton: document.getElementById("studio-clear-log-button"),
  statColors: document.getElementById("stat-colors"),
  statPixels: document.getElementById("stat-pixels"),
  statCommands: document.getElementById("stat-commands"),
  statRuntime: document.getElementById("stat-runtime"),
  statCanvasSize: document.getElementById("stat-canvas-size"),
  statCanvasRange: document.getElementById("stat-canvas-range"),
  statImageSize: document.getElementById("stat-image-size"),
  statImageScale: document.getElementById("stat-image-scale"),
  statImageOrigin: document.getElementById("stat-image-origin"),
  statImageRange: document.getElementById("stat-image-range"),
  firmwareEnvSelect: document.getElementById("firmware-env-select"),
  firmwarePortSelect: document.getElementById("firmware-port-select"),
  firmwareRefreshButton: document.getElementById("firmware-refresh-button"),
  firmwareInstallToolingButton: document.getElementById("firmware-install-tooling-button"),
  firmwareFlashButton: document.getElementById("firmware-flash-button"),
  firmwarePlatformIoHint: document.getElementById("firmware-platformio-hint"),
  firmwareEnvHint: document.getElementById("firmware-env-hint"),
  windowsDriverPanel: document.getElementById("windows-driver-panel"),
  windowsDriverHint: document.getElementById("windows-driver-hint"),
  installCp210xDriverButton: document.getElementById("install-cp210x-driver-button"),
  installCh341DriverButton: document.getElementById("install-ch341-driver-button"),
  firmwareStatusCard: document.getElementById("firmware-status-card"),
  firmwareStatusPill: document.getElementById("firmware-status-pill"),
  firmwareStatusTitle: document.getElementById("firmware-status-title"),
  firmwareStatusDetail: document.getElementById("firmware-status-detail"),
  firmwareStatusEnv: document.getElementById("firmware-status-env"),
  firmwareStatusPort: document.getElementById("firmware-status-port"),
  firmwareStatusTooling: document.getElementById("firmware-status-tooling"),
  firmwareStatusTime: document.getElementById("firmware-status-time"),
  firmwareLogOutput: document.getElementById("firmware-log-output"),
  firmwareClearLogButton: document.getElementById("firmware-clear-log-button"),
  controllerPortSelect: document.getElementById("controller-port-select"),
  controllerStepSelect: document.getElementById("controller-step-select"),
  controllerRefreshButton: document.getElementById("controller-refresh-button"),
  controllerInfoButton: document.getElementById("controller-info-button"),
  controllerResetButton: document.getElementById("controller-reset-button"),
  controllerDisconnectButton: document.getElementById("controller-disconnect-button"),
  controllerSerialSessionStatus: document.getElementById("controller-serial-session-status"),
  controllerActionButtons: [...document.querySelectorAll("[data-controller-action]")],
  controllerCustomCommands: document.getElementById("controller-custom-commands"),
  controllerSendCustomButton: document.getElementById("controller-send-custom-button"),
  controllerStatusCard: document.getElementById("controller-status-card"),
  controllerStatusPill: document.getElementById("controller-status-pill"),
  controllerStatusTitle: document.getElementById("controller-status-title"),
  controllerStatusDetail: document.getElementById("controller-status-detail"),
  controllerHealthDiscoverable: document.getElementById("controller-health-discoverable"),
  controllerHealthAuth: document.getElementById("controller-health-auth"),
  controllerHealthConnected: document.getElementById("controller-health-connected"),
  controllerHealthPaired: document.getElementById("controller-health-paired"),
  controllerHealthReady: document.getElementById("controller-health-ready"),
  controllerStatusTransport: document.getElementById("controller-status-transport"),
  controllerStatusProfile: document.getElementById("controller-status-profile"),
  controllerStatusPeer: document.getElementById("controller-status-peer"),
  controllerStatusInitStep: document.getElementById("controller-status-init-step"),
  controllerStatusInitError: document.getElementById("controller-status-init-error"),
  controllerStatusTime: document.getElementById("controller-status-time"),
  controllerLogOutput: document.getElementById("controller-log-output"),
  controllerClearLogButton: document.getElementById("controller-clear-log-button"),
};

let studioExecutionPollTimer = null;
let firmwareToolingPollTimer = null;
let windowsSerialDriverPollTimer = null;
let studioPreviewRefreshTimer = null;
let studioGenerateRequestSerial = 0;
let studioPreviewBoundsRequestSerial = 0;

const COLOR_COUNT_OPTIONS_BY_MODE = {
  mono: [2],
  official: [8, 16, 32, 64, 84],
};

const STUDIO_IMAGE_SCALE_LIMITS = {
  min: 25,
  max: 200,
};

const STUDIO_IMAGE_OFFSET_LIMITS = {
  min: -100,
  max: 100,
};

const VALID_PAGE_NAMES = new Set(["studio", "firmware", "controller"]);

els.pageTabs.forEach((button) => {
  button.addEventListener("click", () => {
    switchPage(button.dataset.pageTarget ?? "studio");
  });
});

els.sizeSelect.addEventListener("change", () => {
  state.studio.canvasSize = Number(els.sizeSelect.value);
  syncStudioUi();
  scheduleStudioPreviewRefresh();
});

els.brushSizeSelect.addEventListener("change", () => {
  state.studio.brushSize = Number(els.brushSizeSelect.value);
  syncStudioUi();
  scheduleStudioPreviewRefresh();
});

els.scaleRange.addEventListener("input", () => {
  setStudioImageScalePercent(els.scaleRange.value);
});

els.offsetXRange.addEventListener("input", () => {
  setStudioImageOffsetXPercent(els.offsetXRange.value);
});

els.offsetYRange.addEventListener("input", () => {
  setStudioImageOffsetYPercent(els.offsetYRange.value);
});

els.scaleInput.addEventListener("change", () => {
  setStudioImageScalePercent(els.scaleInput.value);
});

els.scaleInput.addEventListener("blur", () => {
  syncStudioUi();
});

els.offsetXInput.addEventListener("change", () => {
  setStudioImageOffsetXPercent(els.offsetXInput.value);
});

els.offsetXInput.addEventListener("blur", () => {
  syncStudioUi();
});

els.offsetYInput.addEventListener("change", () => {
  setStudioImageOffsetYPercent(els.offsetYInput.value);
});

els.offsetYInput.addEventListener("blur", () => {
  syncStudioUi();
});

els.colorModeSelect.addEventListener("change", () => {
  const nextMode = els.colorModeSelect.value;
  state.studio.colorMode = nextMode === "official" ? "official" : "mono";
  syncStudioColorCountOptions();
  syncStudioUi();
  scheduleStudioPreviewRefresh();
});

els.colorCountSelect.addEventListener("change", () => {
  state.studio.colorCount = Number(els.colorCountSelect.value || state.studio.colorCount);
  syncStudioUi();
  scheduleStudioPreviewRefresh();
});

els.autoRemoveBackgroundCheckbox.addEventListener("change", () => {
  state.studio.removeBackground = els.autoRemoveBackgroundCheckbox.checked;
  syncStudioUi();
  scheduleStudioPreviewRefresh();
});

els.previewGuideSelect.addEventListener("change", () => {
  const nextMode = els.previewGuideSelect.value;
  state.studio.previewGuideMode =
    nextMode === "quad" || nextMode === "quarter" || nextMode === "eighth" ? nextMode : "none";
  syncStudioUi();
});

els.thresholdRange.addEventListener("input", () => {
  els.thresholdValue.textContent = els.thresholdRange.value;
  scheduleStudioPreviewRefresh();
});

[els.studioPortSelect, els.firmwarePortSelect, els.controllerPortSelect].forEach((select) => {
  select.addEventListener("change", () => {
    state.selectedPortPath = select.value;
    renderPortSelects();
    syncStudioUi();
    syncFirmwareUi();
    syncControllerUi();
  });
});

els.firmwareEnvSelect.addEventListener("change", () => {
  state.firmware.environmentId = els.firmwareEnvSelect.value;
  syncFirmwareUi();
});

els.refreshPortsButton.addEventListener("click", async () => {
  await refreshPorts({
    log: (message) => appendLog(els.studioLogOutput, message),
  });
});

els.studioOpenControllerButton.addEventListener("click", () => {
  switchPage("controller");
});

els.firmwareRefreshButton.addEventListener("click", async () => {
  await refreshPorts({
    log: (message) => appendLog(els.firmwareLogOutput, message),
  });
});

els.firmwareInstallToolingButton.addEventListener("click", async () => {
  await startFirmwareToolingInstall();
});

els.installCp210xDriverButton.addEventListener("click", async () => {
  await startWindowsSerialDriverInstall("cp210x");
});

els.installCh341DriverButton.addEventListener("click", async () => {
  await startWindowsSerialDriverInstall("ch341");
});

els.controllerRefreshButton.addEventListener("click", async () => {
  await refreshPorts({
    log: (message) => appendLog(els.controllerLogOutput, message),
  });
});

els.imageInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  state.imageDataUrl = await readFileAsDataUrl(file);
  els.fileLabel.textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
  appendLog(els.studioLogOutput, `已载入图片：${file.name}`);
  syncStudioUi();
  scheduleStudioPreviewRefresh({ immediate: true });
});

els.quickStartButton.addEventListener("click", async () => {
  const generated = await generateStudioCommands({
    logPrefix: "开始一键生成并绘制...",
  });

  if (!generated) {
    return;
  }

  await executeStudioCommands({
    logPrefix: `开始发送到设备：${state.selectedPortPath}`,
  });
});

els.generateButton.addEventListener("click", async () => {
  await generateStudioCommands({
    logPrefix: "开始生成预览和命令...",
  });
});

els.executeButton.addEventListener("click", async () => {
  await executeStudioCommands({
    logPrefix: `开始发送到设备：${state.selectedPortPath}`,
  });
});

els.pauseExecutionButton.addEventListener("click", async () => {
  await sendStudioExecutionControl("pause", "暂停绘制");
});

els.resumeExecutionButton.addEventListener("click", async () => {
  await sendStudioExecutionControl("resume", "继续绘制");
});

els.stopExecutionButton.addEventListener("click", async () => {
  await sendStudioExecutionControl("stop", "中断绘制");
});

els.resetExecutionButton.addEventListener("click", async () => {
  await sendStudioExecutionControl("reset", "强制恢复绘制状态");
});

async function generateStudioCommands({ logPrefix }) {
  if (!state.imageDataUrl) {
    appendLog(els.studioLogOutput, "请先选择图片。");
    return false;
  }

  cancelStudioPreviewRefresh();
  setStudioBusy(true);
  appendLog(els.studioLogOutput, logPrefix);

  try {
    const payload = await requestStudioGeneration();

    if (!payload) {
      return false;
    }

    applyGeneratedStudioPayload(payload);
    appendLog(
      els.studioLogOutput,
      `生成完成：${payload.stats.commandCount} 条命令，预计耗时 ${payload.stats.estimatedRuntimeLabel}`,
    );
    return true;
  } catch (error) {
    appendLog(els.studioLogOutput, `生成失败：${getErrorMessage(error)}`);
    return false;
  } finally {
    setStudioBusy(false);
  }
}

function buildStudioGeneratePayload() {
  return {
    imageDataUrl: state.imageDataUrl,
    size: state.studio.canvasSize,
    brushSize: state.studio.brushSize,
    imageScalePercent: state.studio.imageScalePercent,
    imageOffsetXPercent: state.studio.imageOffsetXPercent,
    imageOffsetYPercent: state.studio.imageOffsetYPercent,
    mode: state.studio.colorMode,
    colors: state.studio.colorCount,
    resizeMode: "contain",
    threshold: Number(els.thresholdRange.value),
    previewScale: 12,
    removeBackground: state.studio.removeBackground,
  };
}

async function requestStudioGeneration() {
  const requestSerial = ++studioGenerateRequestSerial;
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildStudioGeneratePayload()),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "生成失败");
  }

  if (requestSerial !== studioGenerateRequestSerial) {
    return null;
  }

  return payload;
}

function applyGeneratedStudioPayload(payload) {
  state.commands = payload.commands;
  state.studio.usedColorIndexes = Array.isArray(payload.stats.usedColorIndexes)
    ? payload.stats.usedColorIndexes
    : [];
  state.studio.profile = {
    baudRate: payload.profile.baudRate ?? 115200,
    ackTimeoutMs: payload.profile.ackTimeoutMs ?? 5000,
    commandRetryCount: payload.profile.commandRetryCount ?? 1,
  };
  state.studio.brushSize = payload.profile.brushSize ?? state.studio.brushSize;
  state.studio.imageScalePercent =
    payload.profile.imageScalePercent ?? state.studio.imageScalePercent;
  state.studio.imageOffsetXPercent =
    payload.profile.imageOffsetXPercent ?? state.studio.imageOffsetXPercent;
  state.studio.imageOffsetYPercent =
    payload.profile.imageOffsetYPercent ?? state.studio.imageOffsetYPercent;
  state.studio.colorMode =
    payload.profile.colorMode === "official" ? "official" : "mono";
  state.studio.colorCount = payload.profile.colorCount ?? state.studio.colorCount;
  state.studio.removeBackground = payload.profile.removeBackground === true;

  els.commandsOutput.value = payload.commands.join("\n");
  els.previewImage.src = payload.previewDataUrl;
  els.previewImage.classList.add("visible");
  els.previewEmpty.classList.add("hidden");
  els.statColors.textContent =
    payload.profile.colorMode === "mono"
      ? "黑 / 白"
      : `${payload.stats.usedColorIndexes.length} / ${state.studio.colorCount} 官方色`;
  els.statPixels.textContent = String(payload.stats.totalPixels);
  els.statCommands.textContent = String(payload.stats.commandCount);
  els.statRuntime.textContent = payload.stats.estimatedRuntimeLabel;
  void updatePreviewBounds(payload);
  renderOfficialPalettePreview();
}

function renderPreviewBounds(profile, imageBounds) {
  const canvasWidth = profile?.canvasWidth ?? state.studio.canvasSize;
  const canvasHeight = profile?.canvasHeight ?? state.studio.canvasSize;

  els.statCanvasSize.textContent = `${canvasWidth}x${canvasHeight}`;
  els.statCanvasRange.textContent = `x: 0-${canvasWidth - 1} · y: 0-${canvasHeight - 1}`;

  if (!imageBounds) {
    els.statImageSize.textContent = "空白";
    els.statImageScale.textContent = `缩放 ${state.studio.imageScalePercent}%`;
    els.statImageOrigin.textContent = "-";
    els.statImageRange.textContent = "当前没有落在画布内的有效像素";
    return;
  }

  els.statImageSize.textContent = `${imageBounds.width}x${imageBounds.height}`;
  els.statImageScale.textContent = `缩放 ${profile?.imageScalePercent ?? state.studio.imageScalePercent}%`;
  els.statImageOrigin.textContent = `(${imageBounds.x}, ${imageBounds.y})`;
  els.statImageRange.textContent =
    `x: ${imageBounds.x}-${imageBounds.maxX} · y: ${imageBounds.y}-${imageBounds.maxY}`;
}

async function updatePreviewBounds(payload) {
  const requestSerial = ++studioPreviewBoundsRequestSerial;
  const canvasWidth = payload?.profile?.canvasWidth ?? state.studio.canvasSize;
  const canvasHeight = payload?.profile?.canvasHeight ?? state.studio.canvasSize;
  const bounds =
    payload?.stats?.imageBounds ??
    (await computeImageBoundsFromPreview(payload?.previewDataUrl, canvasWidth, canvasHeight));

  if (requestSerial !== studioPreviewBoundsRequestSerial) {
    return;
  }

  renderPreviewBounds(payload?.profile, bounds);
}

async function computeImageBoundsFromPreview(previewDataUrl, canvasWidth, canvasHeight) {
  if (!previewDataUrl) {
    return null;
  }

  const image = await loadImageElement(previewDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return null;
  }

  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const alpha = data[(y * canvas.width + x) * 4 + 3];

      if (alpha <= 0) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  const scaleX = canvas.width / canvasWidth;
  const scaleY = canvas.height / canvasHeight;
  const normalizedMinX = Math.max(0, Math.floor(minX / scaleX));
  const normalizedMinY = Math.max(0, Math.floor(minY / scaleY));
  const normalizedMaxX = Math.min(canvasWidth - 1, Math.floor(maxX / scaleX));
  const normalizedMaxY = Math.min(canvasHeight - 1, Math.floor(maxY / scaleY));

  return {
    x: normalizedMinX,
    y: normalizedMinY,
    width: normalizedMaxX - normalizedMinX + 1,
    height: normalizedMaxY - normalizedMinY + 1,
    maxX: normalizedMaxX,
    maxY: normalizedMaxY,
  };
}

function cancelStudioPreviewRefresh() {
  if (studioPreviewRefreshTimer !== null) {
    window.clearTimeout(studioPreviewRefreshTimer);
    studioPreviewRefreshTimer = null;
  }
}

function scheduleStudioPreviewRefresh(options = {}) {
  if (!state.imageDataUrl || state.studio.busy || isStudioExecutionActive()) {
    return;
  }

  cancelStudioPreviewRefresh();

  const delayMs = options.immediate === true ? 0 : 180;
  studioPreviewRefreshTimer = window.setTimeout(() => {
    studioPreviewRefreshTimer = null;
    void refreshStudioPreview();
  }, delayMs);
}

async function refreshStudioPreview() {
  if (!state.imageDataUrl || state.studio.busy || isStudioExecutionActive()) {
    return false;
  }

  try {
    const payload = await requestStudioGeneration();

    if (!payload) {
      return false;
    }

    applyGeneratedStudioPayload(payload);
    syncStudioUi();
    return true;
  } catch {
    return false;
  }
}

async function executeStudioCommands({ logPrefix }) {
  if (!state.commands.length) {
    appendLog(els.studioLogOutput, "没有可执行的命令。");
    return false;
  }

  if (!state.selectedPortPath) {
    appendLog(els.studioLogOutput, "请先选择一个串口设备。");
    return false;
  }

  if (!isControllerReadyForStudio()) {
    appendLog(els.studioLogOutput, "开始绘制前，请先到“手柄测试”页把手柄连接状态跑到“已就绪”。");
    switchPage("controller");
    return false;
  }

  appendLog(els.studioLogOutput, logPrefix);

  setStudioBusy(true);

  try {
    const response = await fetch("/api/execution/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: "serial",
        commands: state.commands,
        portPath: state.selectedPortPath,
        baudRate: state.studio.profile.baudRate,
        ackTimeoutMs: state.studio.profile.ackTimeoutMs,
        retries: state.studio.profile.commandRetryCount,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      applySerialSessionSnapshot(payload.session);
      throw new Error(payload.error ?? "执行失败");
    }

    applySerialSessionSnapshot(payload.session);
    applyStudioExecutionSnapshot(payload.execution);
    startStudioExecutionPolling();
    return true;
  } catch (error) {
    appendLog(els.studioLogOutput, `执行失败：${getErrorMessage(error)}`);
    return false;
  } finally {
    setStudioBusy(false);
  }
}

els.copyButton.addEventListener("click", async () => {
  if (!state.commands.length) {
    return;
  }

  await navigator.clipboard.writeText(state.commands.join("\n"));
  appendLog(els.studioLogOutput, "脚本已复制到剪贴板。");
});

els.downloadButton.addEventListener("click", () => {
  if (!state.commands.length) {
    return;
  }

  const blob = new Blob([`${state.commands.join("\n")}\n`], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "switch-auto-draw-commands.txt";
  link.click();
  URL.revokeObjectURL(url);
  appendLog(els.studioLogOutput, "脚本文件已下载。");
});

els.studioClearLogButton.addEventListener("click", () => {
  clearLog(els.studioLogOutput);
});

els.firmwareFlashButton.addEventListener("click", async () => {
  if (!state.selectedPortPath) {
    appendLog(els.firmwareLogOutput, "请先选择要刷入的串口设备。");
    return;
  }

  const environment = state.firmwareEnvironments.find(
    (item) => item.id === state.firmware.environmentId,
  );

  setFirmwareBusy(true);
  setFirmwareResult({
    status: "running",
    title: "正在刷入固件",
    detail: "PlatformIO 正在编译并上传固件，请稍等片刻。",
    environmentLabel: environment?.label ?? state.firmware.environmentId,
    portPath: state.selectedPortPath,
  });
  appendLog(
    els.firmwareLogOutput,
    `开始刷入固件：${state.firmware.environmentId} -> ${state.selectedPortPath}`,
  );
  appendLog(els.firmwareLogOutput, "刷入前会自动释放串口会话，避免端口占用。");

  try {
    const response = await fetch("/api/firmware/flash", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        environmentId: state.firmware.environmentId,
        portPath: state.selectedPortPath,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      applySerialSessionSnapshot(payload.session);
      throw new Error(payload.error ?? "刷入固件失败");
    }

    setFirmwareResult({
      status: "success",
      title: "固件刷入成功",
      detail: "设备已经写入完成，可以继续去手柄测试页读取设备信息。",
      environmentLabel: payload.environment.label,
      portPath: state.selectedPortPath,
    });
    applySerialSessionSnapshot(payload.session);
    appendLog(els.firmwareLogOutput, "刷入前已释放串口会话。");
    appendLog(els.firmwareLogOutput, `刷入完成：${payload.environment.label}`);
    appendLog(els.firmwareLogOutput, payload.output.trim());
  } catch (error) {
    setFirmwareResult({
      status: "error",
      title: "固件刷入失败",
      detail: summarizeFirmwareError(getErrorMessage(error)),
      environmentLabel: environment?.label ?? state.firmware.environmentId,
      portPath: state.selectedPortPath,
    });
    appendLog(els.firmwareLogOutput, `刷入失败：${getErrorMessage(error)}`);
  } finally {
    setFirmwareBusy(false);
  }
});

els.firmwareClearLogButton.addEventListener("click", () => {
  clearLog(els.firmwareLogOutput);
});

async function startFirmwareToolingInstall() {
  if (state.firmwareTooling.available) {
    appendLog(els.firmwareLogOutput, "PlatformIO 已经可用。");
    return;
  }

  const shouldInstall = window.confirm("刷入固件需要 PlatformIO，未检测到。是否现在安装？");
  if (!shouldInstall) {
    appendLog(els.firmwareLogOutput, "已取消准备 PlatformIO。");
    return;
  }

  let allowPythonDownload = false;
  if (!state.firmwareTooling.python?.available) {
    if (!state.firmwareTooling.python?.runtimeSupported) {
      appendLog(els.firmwareLogOutput, "当前系统暂不支持自动下载 app-local Python。");
      return;
    }

    allowPythonDownload = window.confirm(
      "安装 PlatformIO 需要 Python。未检测到可用 Python，是否下载一个仅供 Friend Maker 使用的 Python 运行环境？",
    );

    if (!allowPythonDownload) {
      appendLog(els.firmwareLogOutput, "已取消下载 app-local Python。");
      return;
    }
  }

  try {
    state.firmwareTooling.installLineCount = 0;
    const response = await fetch("/api/firmware/tooling/install", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allowPythonDownload }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "准备 PlatformIO 失败");
    }

    applyFirmwareToolingInstallSnapshot(payload.install);
    pollFirmwareToolingInstall();
  } catch (error) {
    appendLog(els.firmwareLogOutput, `准备 PlatformIO 失败：${getErrorMessage(error)}`);
  } finally {
    syncFirmwareUi();
  }
}

function applyFirmwareToolingInstallSnapshot(install) {
  const nextInstall = install ?? {
    status: "idle",
    lines: [],
    error: null,
    platformIoExe: null,
    lineOffset: 0,
    totalLineCount: 0,
  };
  const lines = Array.isArray(nextInstall.lines) ? nextInstall.lines : [];
  const fallbackTotalLineCount = lines.length;
  const totalLineCount = Number.isFinite(nextInstall.totalLineCount)
    ? nextInstall.totalLineCount
    : fallbackTotalLineCount;
  const lineOffset = Number.isFinite(nextInstall.lineOffset)
    ? nextInstall.lineOffset
    : Math.max(0, totalLineCount - lines.length);
  const previousLineCount = state.firmwareTooling.installLineCount ?? 0;
  const firstUnreadLine = previousLineCount > totalLineCount
    ? lineOffset
    : Math.max(previousLineCount, lineOffset);
  const newLines = lines.slice(firstUnreadLine - lineOffset);

  newLines.forEach((line) => appendLog(els.firmwareLogOutput, `[tooling] ${line}`));
  state.firmwareTooling.install = {
    ...nextInstall,
    lineOffset,
    totalLineCount,
    lines,
  };
  state.firmwareTooling.installLineCount = totalLineCount;
}

function pollFirmwareToolingInstall() {
  if (firmwareToolingPollTimer) {
    return;
  }

  firmwareToolingPollTimer = window.setInterval(async () => {
    try {
      const response = await fetch("/api/firmware/tooling/install/status");
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "读取 PlatformIO 准备状态失败");
      }

      applyFirmwareToolingInstallSnapshot(payload.install);

      if (payload.install?.status === "completed" || payload.install?.status === "failed") {
        stopFirmwareToolingPolling();
        await loadFirmwareInfo();
      }
    } catch (error) {
      stopFirmwareToolingPolling();
      appendLog(els.firmwareLogOutput, `读取 PlatformIO 准备状态失败：${getErrorMessage(error)}`);
    } finally {
      syncFirmwareUi();
    }
  }, 1_000);
}

function stopFirmwareToolingPolling() {
  if (!firmwareToolingPollTimer) {
    return;
  }

  window.clearInterval(firmwareToolingPollTimer);
  firmwareToolingPollTimer = null;
}

async function startWindowsSerialDriverInstall(driverId) {
  const driver = getWindowsSerialDriver(driverId);
  const driverLabel = driver?.label ?? driverId;

  if (!state.windowsSerialDrivers.supported) {
    appendLog(
      els.firmwareLogOutput,
      `当前环境不支持一键安装 Windows 串口驱动：${state.windowsSerialDrivers.reason ?? "仅支持 Windows x64"}`,
    );
    return;
  }

  if (!driver?.available) {
    appendLog(els.firmwareLogOutput, `${driverLabel} 驱动资源缺失，无法安装。`);
    return;
  }

  const installerNote = driverId === "ch341"
    ? "打开 WCH 安装器后请点击 INSTALL。"
    : "应用会调用 pnputil 安装 CP210x 驱动。";
  const shouldInstall = window.confirm(
    `即将安装 ${driverLabel} 串口驱动。Windows 会弹出管理员权限确认。${installerNote} 安装完成后请重新插拔 ESP32，再点击“刷新串口”。是否继续？`,
  );
  if (!shouldInstall) {
    appendLog(els.firmwareLogOutput, `已取消安装 ${driverLabel} 驱动。`);
    return;
  }

  try {
    state.windowsSerialDrivers.installLineCount = 0;
    const response = await fetch("/api/windows-serial-drivers/install", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ driverId }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "驱动安装启动失败");
    }

    applyWindowsSerialDriverInstallSnapshot(payload.install);
    pollWindowsSerialDriverInstall();
  } catch (error) {
    appendLog(els.firmwareLogOutput, `驱动安装启动失败：${getErrorMessage(error)}`);
  } finally {
    syncFirmwareUi();
  }
}

function applyWindowsSerialDriverInstallSnapshot(install) {
  const nextInstall = install ?? {
    status: "idle",
    driverId: null,
    lines: [],
    error: null,
    lineOffset: 0,
    totalLineCount: 0,
  };
  const lines = Array.isArray(nextInstall.lines) ? nextInstall.lines : [];
  const fallbackTotalLineCount = lines.length;
  const totalLineCount = Number.isFinite(nextInstall.totalLineCount)
    ? nextInstall.totalLineCount
    : fallbackTotalLineCount;
  const lineOffset = Number.isFinite(nextInstall.lineOffset)
    ? nextInstall.lineOffset
    : Math.max(0, totalLineCount - lines.length);
  const previousLineCount = state.windowsSerialDrivers.installLineCount ?? 0;
  const firstUnreadLine = previousLineCount > totalLineCount
    ? lineOffset
    : Math.max(previousLineCount, lineOffset);
  const newLines = lines.slice(firstUnreadLine - lineOffset);

  newLines.forEach((line) => appendLog(els.firmwareLogOutput, `[driver] ${line}`));
  state.windowsSerialDrivers.install = {
    ...nextInstall,
    lineOffset,
    totalLineCount,
    lines,
  };
  state.windowsSerialDrivers.installLineCount = totalLineCount;
}

function pollWindowsSerialDriverInstall() {
  if (windowsSerialDriverPollTimer) {
    return;
  }

  windowsSerialDriverPollTimer = window.setInterval(async () => {
    try {
      const response = await fetch("/api/windows-serial-drivers/install/status");
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "读取驱动安装状态失败");
      }

      applyWindowsSerialDriverInstallSnapshot(payload.install);

      if (payload.install?.status === "completed" || payload.install?.status === "failed") {
        stopWindowsSerialDriverPolling();
        await loadWindowsSerialDriversInfo();
        await refreshPorts({
          log: (message) => appendLog(els.firmwareLogOutput, message),
        });
      }
    } catch (error) {
      stopWindowsSerialDriverPolling();
      appendLog(els.firmwareLogOutput, `读取驱动安装状态失败：${getErrorMessage(error)}`);
    } finally {
      syncFirmwareUi();
    }
  }, 1_000);
}

function stopWindowsSerialDriverPolling() {
  if (!windowsSerialDriverPollTimer) {
    return;
  }

  window.clearInterval(windowsSerialDriverPollTimer);
  windowsSerialDriverPollTimer = null;
}

els.controllerInfoButton.addEventListener("click", async () => {
  await runControllerCommands(["I"], "连接手柄");
});

els.controllerResetButton.addEventListener("click", async () => {
  await runControllerCommands(["BT RESET"], "重置手柄蓝牙");
});

els.controllerDisconnectButton.addEventListener("click", async () => {
  setControllerBusy(true);

  try {
    const response = await fetch("/api/serial-session/disconnect", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const payload = await response.json();

    if (!response.ok) {
      applySerialSessionSnapshot(payload.session);
      throw new Error(payload.error ?? "断开串口失败");
    }

    applySerialSessionSnapshot(payload.session);
    appendLog(els.controllerLogOutput, "串口连接已断开。");
  } catch (error) {
    appendLog(els.controllerLogOutput, `断开串口失败：${getErrorMessage(error)}`);
  } finally {
    setControllerBusy(false);
  }
});

els.controllerActionButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const action = button.dataset.controllerAction ?? "";
    const commands = mapControllerActionToCommands(action, Number(els.controllerStepSelect.value));

    if (commands.length === 0) {
      appendLog(els.controllerLogOutput, `未知测试动作：${action}`);
      return;
    }

    await runControllerCommands(commands, `测试动作 ${action}`);
  });
});

els.controllerSendCustomButton.addEventListener("click", async () => {
  const commands = els.controllerCustomCommands.value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  if (commands.length === 0) {
    appendLog(els.controllerLogOutput, "请输入至少一条测试命令。");
    return;
  }

  await runControllerCommands(commands, "自定义命令");
});

els.controllerClearLogButton.addEventListener("click", () => {
  clearLog(els.controllerLogOutput);
});

function switchPage(pageName, options = {}) {
  const { updateHash = true, scrollToPage = true } = options;
  const nextPageName = normalizePageName(pageName);
  state.activePage = nextPageName;

  els.pageTabs.forEach((button) => {
    const isActive = button.dataset.pageTarget === nextPageName;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  els.pages.forEach((page) => {
    const isActive = page.dataset.page === nextPageName;
    page.classList.toggle("page-active", isActive);
    page.hidden = !isActive;
  });

  if (updateHash) {
    const nextHash = `#${nextPageName}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
  }

  if (scrollToPage) {
    const activePage = findPageElement(nextPageName);
    const scrollTarget = activePage?.querySelector(".page-intro") ?? activePage;
    scrollTarget?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}

function findPageElement(pageName) {
  return els.pages.find((page) => page.dataset.page === pageName) ?? null;
}

function normalizePageName(pageName) {
  const normalizedPageName = typeof pageName === "string" ? pageName.trim() : "";
  return VALID_PAGE_NAMES.has(normalizedPageName) ? normalizedPageName : "studio";
}

window.addEventListener("hashchange", () => {
  const nextPageName = normalizePageName(window.location.hash.slice(1));

  if (nextPageName !== state.activePage) {
    switchPage(nextPageName, {
      updateHash: false,
      scrollToPage: false,
    });
  }
});

function setStudioBusy(isBusy) {
  state.studio.busy = isBusy;
  els.quickStartButton.disabled = isBusy;
  els.generateButton.disabled = isBusy;
  els.refreshPortsButton.disabled = isBusy;
  els.thresholdRange.disabled = isBusy;
  els.scaleRange.disabled = isBusy;
  els.offsetXRange.disabled = isBusy;
  els.offsetYRange.disabled = isBusy;
  els.sizeSelect.disabled = isBusy;
  els.brushSizeSelect.disabled = isBusy;
  els.copyButton.disabled = isBusy || state.commands.length === 0;
  els.downloadButton.disabled = isBusy || state.commands.length === 0;
  syncStudioUi();
}

function isStudioExecutionActive() {
  return ["running", "paused", "stopping"].includes(state.studio.execution.status);
}

function applyStudioExecutionSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return;
  }

  const previousId = state.studio.execution.id;
  const nextId = snapshot.id ?? null;
  const isNewExecution = previousId !== nextId;
  const existingLineCount = isNewExecution ? 0 : state.studio.execution.lineCount;
  const lines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
  const nextLineCount = lines.length;
  const newLines = lines.slice(existingLineCount);

  state.studio.execution = {
    ...state.studio.execution,
    id: nextId,
    status: typeof snapshot.status === "string" ? snapshot.status : state.studio.execution.status,
    totalCommands:
      typeof snapshot.totalCommands === "number" ? snapshot.totalCommands : state.studio.execution.totalCommands,
    completedCommands:
      typeof snapshot.completedCommands === "number"
        ? snapshot.completedCommands
        : state.studio.execution.completedCommands,
    currentCommand:
      typeof snapshot.currentCommand === "string" || snapshot.currentCommand === null
        ? snapshot.currentCommand
        : state.studio.execution.currentCommand,
    startedAt:
      typeof snapshot.startedAt === "number" || snapshot.startedAt === null
        ? snapshot.startedAt
        : state.studio.execution.startedAt,
    finishedAt:
      typeof snapshot.finishedAt === "number" || snapshot.finishedAt === null
        ? snapshot.finishedAt
        : state.studio.execution.finishedAt,
    error:
      typeof snapshot.error === "string" || snapshot.error === null
        ? snapshot.error
        : state.studio.execution.error,
    lineCount: nextLineCount,
  };

  newLines.forEach((line) => appendLog(els.studioLogOutput, `[device] ${line}`));

  if (newLines.length > 0) {
    updateControllerStatusFromLines(newLines);
  }

  if (isStudioExecutionActive()) {
    startStudioExecutionPolling();
  } else {
    stopStudioExecutionPolling();
  }

  syncStudioUi();
}

async function pollStudioExecutionStatus() {
  try {
    const response = await fetch("/api/execution/status");
    const payload = await response.json();

    if (!response.ok) {
      applySerialSessionSnapshot(payload.session);
      throw new Error(payload.error ?? "读取绘制状态失败");
    }

    applyStudioExecutionSnapshot(payload.execution);
    applySerialSessionSnapshot(payload.session);
  } catch (error) {
    stopStudioExecutionPolling();
    appendLog(els.studioLogOutput, `读取绘制状态失败：${getErrorMessage(error)}`);
  }
}

function startStudioExecutionPolling() {
  if (studioExecutionPollTimer) {
    return;
  }

  studioExecutionPollTimer = window.setInterval(() => {
    void pollStudioExecutionStatus();
  }, 800);
}

function stopStudioExecutionPolling() {
  if (!studioExecutionPollTimer) {
    return;
  }

  window.clearInterval(studioExecutionPollTimer);
  studioExecutionPollTimer = null;
}

async function sendStudioExecutionControl(action, label) {
  try {
    const endpoint = `/api/execution/${action}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const payload = await response.json();

    if (!response.ok) {
      applySerialSessionSnapshot(payload.session);
      throw new Error(payload.error ?? `${label}失败`);
    }

    appendLog(els.studioLogOutput, `${label}请求已发送。`);
    applyStudioExecutionSnapshot(payload.execution);
    applySerialSessionSnapshot(payload.session);
  } catch (error) {
    appendLog(els.studioLogOutput, `${label}失败：${getErrorMessage(error)}`);
  }
}

function setFirmwareBusy(isBusy) {
  state.firmware.busy = isBusy;
  els.firmwareRefreshButton.disabled = isBusy;
  els.firmwareInstallToolingButton.disabled = isBusy;
  els.firmwareEnvSelect.disabled = isBusy || state.firmwareEnvironments.length === 0;
  syncFirmwareUi();
}

function setControllerBusy(isBusy) {
  state.controller.busy = isBusy;
  els.controllerRefreshButton.disabled = isBusy;
  els.controllerInfoButton.disabled = isBusy;
  els.controllerResetButton.disabled = isBusy;
  els.controllerStepSelect.disabled = isBusy;
  els.controllerActionButtons.forEach((button) => {
    button.disabled = isBusy;
  });
  els.controllerSendCustomButton.disabled = isBusy;
  syncControllerUi();
}

function readInfoLineMap(lines) {
  const info = {};

  (lines ?? []).forEach((line) => {
    const match = /^INFO\s+([^=]+)=(.*)$/u.exec(line);
    if (!match) {
      return;
    }

    const [, key, value] = match;
    info[key.trim()] = value.trim();
  });

  return info;
}

function boolFromInfo(value) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function boolLabel(value, labels) {
  if (value === true) {
    return labels[0];
  }

  if (value === false) {
    return labels[1];
  }

  return "未知";
}

function isControllerSendableStatus({ connected, paired, ready }) {
  return ready === true || (connected === true && paired === true);
}

function applySerialSessionSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return;
  }

  state.serialSession = {
    connected: snapshot.connected === true,
    portPath: typeof snapshot.portPath === "string" ? snapshot.portPath : null,
    baudRate: typeof snapshot.baudRate === "number" ? snapshot.baudRate : null,
    busy: snapshot.busy === true,
    idleTimeoutMs:
      typeof snapshot.idleTimeoutMs === "number"
        ? snapshot.idleTimeoutMs
        : state.serialSession.idleTimeoutMs,
    lastUsedAt: typeof snapshot.lastUsedAt === "number" ? snapshot.lastUsedAt : null,
  };
  syncControllerUi();
}

async function loadSerialSessionStatus() {
  try {
    const response = await fetch("/api/serial-session/status");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "读取串口连接状态失败");
    }

    applySerialSessionSnapshot(payload);
  } catch {
    applySerialSessionSnapshot({
      connected: false,
      portPath: null,
      baudRate: null,
      busy: false,
      idleTimeoutMs: state.serialSession.idleTimeoutMs,
      lastUsedAt: null,
    });
  }
}

function renderSerialSessionStatus() {
  const session = state.serialSession;
  const idleMinutes = Math.max(1, Math.round(session.idleTimeoutMs / 60_000));

  if (session.busy) {
    els.controllerSerialSessionStatus.textContent =
      session.portPath && session.baudRate
        ? `串口正在使用中：${session.portPath} @ ${session.baudRate}。`
        : "串口命令正在执行中。";
    return;
  }

  if (session.connected) {
    els.controllerSerialSessionStatus.textContent =
      `串口保持连接：${session.portPath ?? "-"} @ ${session.baudRate ?? "-"}，空闲 ${idleMinutes} 分钟后自动断开。`;
    return;
  }

  els.controllerSerialSessionStatus.textContent = "串口会在首次发送测试命令时自动连接。";
}

function setControllerStatus(partialStatus) {
  state.controller.status = {
    ...state.controller.status,
    ...partialStatus,
    updatedAt: new Date(),
  };
  renderControllerStatus();
  syncStudioUi();
}

function updateControllerStatusFromLines(lines) {
  const info = readInfoLineMap(lines);

  if (!info.transport && !info.bt_mode && !info.bt_profile) {
    return;
  }

  const discoverable = boolFromInfo(info.bt_discoverable);
  const authComplete = boolFromInfo(info.bt_auth_complete);
  const connected = boolFromInfo(info.bt_connected);
  const paired = boolFromInfo(info.bt_paired);
  const rawReady = boolFromInfo(info.bt_ready_for_reports);
  const ready = isControllerSendableStatus({ connected, paired, ready: rawReady });
  const readyInferredFromPairing = rawReady !== true && connected === true && paired === true;
  const initError = info.bt_init_error ?? "-";

  let tone = "idle";
  let pill = "待连接";
  let title = "等待连接手柄";
  let detail = "当前还没有拿到可用的蓝牙连接状态。";

  if (initError !== "-" && initError !== "ESP_OK") {
    tone = "error";
    pill = "异常";
    title = "初始化异常";
    detail = `蓝牙初始化停在 ${info.bt_init_step ?? "unknown"}，返回 ${initError}。`;
  } else if (ready === true) {
    tone = "success";
    pill = "已就绪";
    title = "手柄已连接";
    detail = readyInferredFromPairing
      ? "开发板已经完成 HID 连接和配对；固件报告通道字段可能滞后，但当前状态已经可以发送按钮和摇杆报告。"
      : "开发板已经完成连接并可发送按钮和摇杆报告，可以继续做手柄测试。";
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
  }

  setControllerStatus({
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
  });
}

function isControllerReadyForStudio() {
  return state.controller.status.readyValue === true;
}

function renderStudioConnectionStatus() {
  const ready = state.controller.status.readyValue === true;
  const connected = state.controller.status.connectedValue === true;
  const auth = state.controller.status.authValue === true;
  const discoverable = state.controller.status.discoverableValue === true;

  let tone = "idle";
  let pill = "可先生成";
  let title = "可以先生成黑白脚本";
  let detail = "生成预览和脚本不依赖手柄连接。真正发送到开发板前，再去完成一次手柄测试即可。";

  if (ready) {
    tone = "success";
    pill = "已连接";
    title = "手柄已连接，可以开始绘制";
    detail = `当前开发板已经处于可发送状态，可以把绘制脚本发到 ${state.selectedPortPath || "串口设备"}。`;
  } else {
    tone = "warning";
    pill = "需要测试";
    title = "需要先进行手柄测试";
    detail =
      connected || auth || discoverable
        ? "开发板已经开始和 Switch 握手，但还没有到“已就绪”。请先到“手柄测试”页把连接跑通。"
        : "当前还没有确认开发板已经连上 Switch。开始绘制前，请先到“手柄测试”页完成连接。";
  }

  els.studioConnectionCard.className = `studio-connection-card studio-connection-${tone}`;
  els.studioConnectionPill.textContent = pill;
  els.studioConnectionTitle.textContent = title;
  els.studioConnectionDetail.textContent = detail;
}

function renderStudioExecutionStatus() {
  const execution = state.studio.execution;

  switch (execution.status) {
    case "running":
      els.studioExecutionStatus.textContent = `绘制进行中：${execution.completedCommands} / ${execution.totalCommands}${
        execution.currentCommand ? ` · 当前命令 ${execution.currentCommand}` : ""
      }`;
      break;
    case "paused":
      els.studioExecutionStatus.textContent = `绘制已暂停：${execution.completedCommands} / ${execution.totalCommands}`;
      break;
    case "stopping":
      els.studioExecutionStatus.textContent = `正在中断绘制：${execution.completedCommands} / ${execution.totalCommands}`;
      break;
    case "completed":
      els.studioExecutionStatus.textContent = `绘制已完成：${execution.completedCommands} / ${execution.totalCommands}`;
      break;
    case "stopped":
      els.studioExecutionStatus.textContent = `绘制已中断：${execution.completedCommands} / ${execution.totalCommands}`;
      break;
    case "failed":
      els.studioExecutionStatus.textContent = `绘制失败：${execution.error ?? "请查看执行日志。"}`;
      break;
    default:
      els.studioExecutionStatus.textContent = "当前未开始绘制。";
      break;
  }
}

function renderOfficialPalettePreview() {
  const isOfficialMode = state.studio.colorMode === "official";
  const palette = state.studio.officialPalette;

  els.officialPalettePanel.classList.toggle(
    "hidden",
    !isOfficialMode || !Array.isArray(palette.grid) || palette.grid.length === 0,
  );

  if (!isOfficialMode || !Array.isArray(palette.grid) || palette.grid.length === 0) {
    els.officialPaletteGrid.innerHTML = "";
    return;
  }

  const usedIndexes = new Set(
    Array.isArray(state.studio.usedColorIndexes) ? state.studio.usedColorIndexes : [],
  );
  const usedCount = usedIndexes.size;
  els.officialPaletteSummary.textContent =
    usedCount > 0
      ? `这里显示程序当前使用的 7x12 官方色盘。当前这张图实际量化到了 ${usedCount} 个官方色，已高亮对应格子。`
      : "这里显示程序当前使用的 7x12 官方色盘，并会高亮这张图实际量化到的颜色格。";

  els.officialPaletteGrid.innerHTML = "";

  palette.grid.forEach((rowColors, rowIndex) => {
    rowColors.forEach((colorHex, colIndex) => {
      const cell = document.createElement("div");
      const flatIndex = rowIndex * palette.cols + colIndex;
      cell.className = `official-palette-cell${usedIndexes.has(flatIndex) ? " used" : ""}`;

      const swatch = document.createElement("div");
      swatch.className = "official-palette-swatch";
      swatch.style.background = colorHex;

      const meta = document.createElement("div");
      meta.className = "official-palette-meta";

      const coord = document.createElement("span");
      coord.className = "official-palette-coord";
      coord.textContent = `R${rowIndex} · C${colIndex}`;

      const hex = document.createElement("span");
      hex.className = "official-palette-hex";
      hex.textContent = colorHex;

      meta.append(coord, hex);
      cell.append(swatch, meta);
      els.officialPaletteGrid.appendChild(cell);
    });
  });
}

function syncStudioColorCountOptions() {
  const nextOptions = COLOR_COUNT_OPTIONS_BY_MODE[state.studio.colorMode] ?? [32];
  const currentValue = Number(state.studio.colorCount);
  const fallbackValue = nextOptions.includes(32) ? 32 : nextOptions[0];
  const normalizedValue = nextOptions.includes(currentValue) ? currentValue : fallbackValue;

  state.studio.colorCount = normalizedValue;
  els.colorCountSelect.innerHTML = "";

  nextOptions.forEach((value) => {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = state.studio.colorMode === "mono" ? "黑 / 白" : `${value} 色`;
    option.selected = value === normalizedValue;
    els.colorCountSelect.appendChild(option);
  });
}

function syncStudioUi() {
  const hasPort = Boolean(state.selectedPortPath);
  const controllerReady = isControllerReadyForStudio();
  const hasImage = Boolean(state.imageDataUrl);
  const executionActive = isStudioExecutionActive();
  const executionPaused = state.studio.execution.status === "paused";
  const executionRunning = state.studio.execution.status === "running";
  const executionStopping = state.studio.execution.status === "stopping";

  els.sizeSelect.value = String(state.studio.canvasSize);
  els.brushSizeSelect.value = String(state.studio.brushSize);
  els.scaleRange.value = String(state.studio.imageScalePercent);
  els.scaleInput.value = String(state.studio.imageScalePercent);
  els.offsetXRange.value = String(state.studio.imageOffsetXPercent);
  els.offsetXInput.value = String(state.studio.imageOffsetXPercent);
  els.offsetYRange.value = String(state.studio.imageOffsetYPercent);
  els.offsetYInput.value = String(state.studio.imageOffsetYPercent);
  els.previewGuideSelect.value = state.studio.previewGuideMode;
  els.previewCanvas.dataset.guide = state.studio.previewGuideMode;
  els.colorModeSelect.value = state.studio.colorMode;
  els.autoRemoveBackgroundCheckbox.checked = state.studio.removeBackground;
  syncStudioColorCountOptions();
  const backgroundHint = state.studio.removeBackground
    ? "已开启自动扣背景，会优先去掉白底、浅灰底和棋盘格假透明背景。"
    : "当前不会自动扣背景；如果素材是白底或棋盘格假透明图，建议开启。";
  const squareBrushHint = "建议同时把 Switch 里的笔刷切到方块笔刷，整体观感通常会更美观。";
  const scaleHint = `当前导入缩放是 ${state.studio.imageScalePercent}%，100% 表示完整放进画布。`;
  const positionHint = describeImagePosition(
    state.studio.imageOffsetXPercent,
    state.studio.imageOffsetYPercent,
  );
  els.studioModeHint.textContent =
    state.studio.colorMode === "mono"
      ? `深色像素会绘制，浅色像素会保留为空白背景。当前会先按 ${state.studio.imageScalePercent}% 调整图片大小，再放进 256x256 脚本坐标画布，并按 ${state.studio.brushSize} 号笔和画布中心起步生成。${scaleHint}${positionHint}${squareBrushHint}${backgroundHint}`
      : `当前会先按 ${state.studio.imageScalePercent}% 调整图片大小，再把图片压到 ${state.studio.colorCount} 个官方色以内，并映射到游戏内置的 7x12 官方色盘，再按 ${state.studio.brushSize} 号笔生成。${scaleHint}${positionHint}开始前请保持右侧 9 个槽位默认颜色不变。${squareBrushHint}${backgroundHint}`;
  els.studioPortSelect.disabled = state.studio.busy || executionActive;
  els.refreshPortsButton.disabled = state.studio.busy || executionActive;
  els.sizeSelect.disabled = state.studio.busy || executionActive;
  els.brushSizeSelect.disabled = state.studio.busy || executionActive;
  els.scaleRange.disabled = state.studio.busy || executionActive;
  els.scaleInput.disabled = state.studio.busy || executionActive;
  els.offsetXRange.disabled = state.studio.busy || executionActive;
  els.offsetXInput.disabled = state.studio.busy || executionActive;
  els.offsetYRange.disabled = state.studio.busy || executionActive;
  els.offsetYInput.disabled = state.studio.busy || executionActive;
  els.colorModeSelect.disabled = state.studio.busy || executionActive;
  els.autoRemoveBackgroundCheckbox.disabled = state.studio.busy || executionActive;
  els.previewGuideSelect.disabled = false;
  els.colorCountSelect.disabled =
    state.studio.busy || executionActive || state.studio.colorMode === "mono";
  els.thresholdLabel.textContent =
    state.studio.colorMode === "mono" ? "单色阈值" : "当前模式下不使用阈值";
  els.thresholdRange.disabled = state.studio.busy || executionActive;
  els.quickStartButton.textContent = "一键开始绘制";
  els.executeButton.textContent = "执行现有脚本";
  els.quickStartButton.disabled =
    state.studio.busy ||
    executionActive ||
    !hasImage ||
    !hasPort ||
    !controllerReady;
  els.executeButton.disabled =
    state.studio.busy ||
    executionActive ||
    state.commands.length === 0 ||
    !hasPort ||
    !controllerReady;
  els.generateButton.disabled = state.studio.busy || executionActive;
  els.pauseExecutionButton.disabled = !executionRunning;
  els.resumeExecutionButton.disabled = !executionPaused;
  els.stopExecutionButton.disabled = !(executionRunning || executionPaused);
  els.resetExecutionButton.disabled = !executionStopping;
  renderStudioExecutionStatus();
  renderOfficialPalettePreview();

  if (state.studio.colorMode !== "mono") {
    els.thresholdRange.disabled = true;
    els.thresholdValue.textContent = "-";
  } else {
    els.thresholdRange.disabled = state.studio.busy || executionActive;
    els.thresholdValue.textContent = els.thresholdRange.value;
  }

  if (!hasImage) {
    els.executionHint.textContent = "请先导入一张图片，然后可以直接点“一键开始绘制”。";
    renderStudioConnectionStatus();
    return;
  }

  if (!state.ports.length) {
    els.executionHint.textContent =
      "还没有检测到串口设备。请确认使用可传输数据的 USB 线、重新插拔 ESP32；在刷入固件页确认 PlatformIO 就绪后可安装 CP210x 或 CH340/CH341 驱动。";
    renderStudioConnectionStatus();
    return;
  }

  if (!hasPort) {
    els.executionHint.textContent = "请先选择一个串口设备。";
    renderStudioConnectionStatus();
    return;
  }

  if (!controllerReady) {
    els.executionHint.textContent =
      "串口设备已经选好，但手柄还没到“已就绪”。请先去“手柄测试”页完成连接。";
    renderStudioConnectionStatus();
    return;
  }

  els.executionHint.textContent =
    state.studio.colorMode === "mono"
      ? `当前会把按 ${state.studio.imageScalePercent}% 缩放、${describeImagePosition(state.studio.imageOffsetXPercent, state.studio.imageOffsetYPercent, false)}后的 256x256 黑白脚本通过串口发送到 ${state.selectedPortPath}，由 ESP32 从画布中心起步，按 ${state.studio.brushSize} 号笔继续翻译成方向键移动与 A 绘制。建议开始前把 Switch 里的笔刷切到方块笔刷，整体观感通常会更美观。`
      : `当前会把按 ${state.studio.imageScalePercent}% 缩放、${describeImagePosition(state.studio.imageOffsetXPercent, state.studio.imageOffsetYPercent, false)}后的 256x256 官方色脚本通过串口发送到 ${state.selectedPortPath}。请先保持右侧 9 个槽位默认颜色不变，ESP32 会按这组默认槽位状态去配置内置 7x12 色盘，并按 ${state.studio.brushSize} 号笔绘制。建议开始前把 Switch 里的笔刷切到方块笔刷，整体观感通常会更美观。`;
  renderStudioConnectionStatus();
}

function syncFirmwareUi() {
  const environment = state.firmwareEnvironments.find(
    (item) => item.id === state.firmware.environmentId,
  );

  if (environment) {
    els.firmwareEnvHint.textContent = environment.description;
    els.firmwareEnvSelect.value = environment.id;
  }

  const installStatus = state.firmwareTooling.install?.status ?? "idle";
  const installing = installStatus === "running";

  els.firmwareInstallToolingButton.classList.toggle("hidden", state.firmwareTooling.available);
  els.firmwareInstallToolingButton.disabled = state.firmware.busy || installing;
  els.firmwareInstallToolingButton.textContent = installing ? "正在准备 PlatformIO..." : "准备 PlatformIO";

  if (!state.firmwareTooling.available) {
    els.firmwarePlatformIoHint.textContent =
      installing
        ? "正在准备 PlatformIO，请等待下方日志完成。"
        : "当前没有检测到 PlatformIO。刷入固件需要先准备 PlatformIO。";
  } else {
    els.firmwarePlatformIoHint.textContent = `PlatformIO 已就绪：${state.firmwareTooling.path}`;
  }

  syncWindowsSerialDriverUi();

  els.firmwarePortSelect.disabled = state.firmware.busy;
  els.firmwareFlashButton.disabled =
    state.firmware.busy || installing || !state.firmwareTooling.available || !state.selectedPortPath;
  renderFirmwareStatus();
}

function syncWindowsSerialDriverUi() {
  const driverInstallStatus = state.windowsSerialDrivers.install?.status ?? "idle";
  const driverInstalling = driverInstallStatus === "running";
  const isWindows = state.windowsSerialDrivers.platform === "win32";
  const mainlineEnvironmentSelected = state.firmware.environmentId === "esp32dev_wireless";
  const shouldShowDriverPanel =
    isWindows &&
    mainlineEnvironmentSelected &&
    state.firmwareTooling.available &&
    state.ports.length === 0;
  const cp210xDriver = getWindowsSerialDriver("cp210x");
  const ch341Driver = getWindowsSerialDriver("ch341");

  els.windowsDriverPanel.classList.toggle("hidden", !shouldShowDriverPanel);

  if (!shouldShowDriverPanel) {
    return;
  }

  if (!state.windowsSerialDrivers.supported) {
    els.windowsDriverHint.textContent =
      state.windowsSerialDrivers.reason ?? "当前仅支持 Windows x64 的一键串口驱动安装。";
  } else {
    els.windowsDriverHint.textContent =
      "PlatformIO 已就绪但仍未检测到串口。请先确认使用可传输数据的 USB 线并重新插拔 ESP32；仍无串口时优先安装 CP210x 驱动，如果仍检测不到再安装 CH340/CH341 驱动。";
  }

  els.installCp210xDriverButton.disabled =
    state.firmware.busy || driverInstalling || !state.windowsSerialDrivers.supported || !cp210xDriver?.available;
  els.installCh341DriverButton.disabled =
    state.firmware.busy || driverInstalling || !state.windowsSerialDrivers.supported || !ch341Driver?.available;
  els.installCp210xDriverButton.textContent =
    driverInstalling && state.windowsSerialDrivers.install?.driverId === "cp210x"
      ? "正在安装 CP210x..."
      : "安装 CP210x 驱动（优先）";
  els.installCh341DriverButton.textContent =
    driverInstalling && state.windowsSerialDrivers.install?.driverId === "ch341"
      ? "正在安装 CH340/CH341..."
      : "安装 CH340/CH341 驱动（备选）";
}

function syncControllerUi() {
  const hasPort = Boolean(state.selectedPortPath);

  els.controllerPortSelect.disabled = state.controller.busy;

  const shouldDisable = state.controller.busy || !hasPort;
  els.controllerInfoButton.disabled = shouldDisable;
  els.controllerResetButton.disabled = shouldDisable;
  els.controllerSendCustomButton.disabled = shouldDisable;
  els.controllerDisconnectButton.disabled = state.controller.busy || !state.serialSession.connected;
  els.controllerActionButtons.forEach((button) => {
    button.disabled = shouldDisable;
  });
  renderSerialSessionStatus();
}

async function runExecution({
  commands,
  target,
  portPath,
  baudRate,
  ackTimeoutMs,
  retries,
  setBusy,
  logTarget,
  successLabel,
}) {
  setBusy(true);

  try {
    const response = await fetch("/api/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target,
        commands,
        portPath: target === "serial" ? portPath : undefined,
        baudRate,
        ackTimeoutMs,
        retries,
        ackDelayMs: 0,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      applySerialSessionSnapshot(payload.session);
      throw new Error(payload.error ?? "执行失败");
    }

    applySerialSessionSnapshot(payload.session);
    appendLog(logTarget, `${successLabel}完成：${payload.totalCommands} 条命令，目标 ${payload.target}`);
    (payload.lines ?? []).forEach((line) => appendLog(logTarget, `[device] ${line}`));
    return payload;
  } catch (error) {
    appendLog(logTarget, `执行失败：${getErrorMessage(error)}`);
    return null;
  } finally {
    setBusy(false);
  }
}

async function runControllerCommands(commands, label) {
  if (!state.selectedPortPath) {
    appendLog(els.controllerLogOutput, "请先选择一个串口设备。");
    return;
  }

  appendLog(
    els.controllerLogOutput,
    `${label}：${state.selectedPortPath}`,
  );

  const payload = await runExecution({
    commands,
    target: "serial",
    portPath: state.selectedPortPath,
    baudRate: state.studio.profile.baudRate,
    ackTimeoutMs: state.studio.profile.ackTimeoutMs,
    retries: state.studio.profile.commandRetryCount,
    setBusy: setControllerBusy,
    logTarget: els.controllerLogOutput,
    successLabel: label,
  });

  if (payload?.lines) {
    updateControllerStatusFromLines(payload.lines);
  }
}

function mapControllerActionToCommands(action, step) {
  const normalizedStep = Number.isFinite(step) && step > 0 ? step : 1;

  switch (action) {
    case "move-up":
      return [`M 0 ${-normalizedStep}`];
    case "move-down":
      return [`M 0 ${normalizedStep}`];
    case "move-left":
      return [`M ${-normalizedStep} 0`];
    case "move-right":
      return [`M ${normalizedStep} 0`];
    case "dpad-up":
      return ["BTN DUP"];
    case "dpad-down":
      return ["BTN DDOWN"];
    case "dpad-left":
      return ["BTN DLEFT"];
    case "dpad-right":
      return ["BTN DRIGHT"];
    case "button-a":
      return ["BTN A"];
    case "button-b":
      return ["BTN B"];
    case "button-x":
      return ["BTN X"];
    case "button-y":
      return ["BTN Y"];
    case "button-l":
      return ["BTN L"];
    case "button-r":
      return ["BTN R"];
    case "button-zl":
      return ["BTN ZL"];
    case "button-zr":
      return ["BTN ZR"];
    case "button-minus":
      return ["BTN MINUS"];
    case "button-plus":
      return ["BTN PLUS"];
    case "button-home":
      return ["BTN HOME"];
    case "button-capture":
      return ["BTN CAPTURE"];
    case "button-ls":
      return ["BTN LS"];
    case "button-rs":
      return ["BTN RS"];
    case "pair-lr":
      return ["BTN L+R"];
    default:
      return [];
  }
}

async function refreshPorts({ log } = {}) {
  if (typeof log === "function") {
    log("正在刷新串口列表...");
  }

  try {
    const response = await fetch("/api/ports");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "串口列表获取失败");
    }

    state.ports = Array.isArray(payload.ports) ? payload.ports : [];

    if (!state.ports.some((port) => port.path === state.selectedPortPath)) {
      state.selectedPortPath = pickPreferredPortPath();
    }

    renderPortSelects();
    syncStudioUi();
    syncFirmwareUi();
    syncControllerUi();

    if (typeof log === "function") {
      log(
        state.ports.length
          ? `检测到 ${state.ports.length} 个串口设备。`
          : "当前没有检测到串口设备。请换数据线、重新插拔 ESP32；PlatformIO 就绪后仍无设备时优先安装 CP210x 驱动，再尝试 CH340/CH341 驱动。",
      );
    }
  } catch (error) {
    if (typeof log === "function") {
      log(`刷新串口失败：${getErrorMessage(error)}`);
    }
  }
}

function pickPreferredPortPath() {
  const usbPort = state.ports.find((port) => /usb|slab|espressif|cp210|wch|uart/i.test(port.label));
  return usbPort?.path ?? state.ports[0]?.path ?? "";
}

function renderPortSelects() {
  const selects = [els.studioPortSelect, els.firmwarePortSelect, els.controllerPortSelect];

  selects.forEach((select) => {
    select.innerHTML = "";

    if (state.ports.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "未检测到串口";
      select.appendChild(option);
      return;
    }

    state.ports.forEach((port, index) => {
      const option = document.createElement("option");
      option.value = port.path;
      option.textContent = port.label;
      option.selected = state.selectedPortPath ? port.path === state.selectedPortPath : index === 0;
      select.appendChild(option);
    });
  });
}

async function loadFirmwareInfo() {
  try {
    const response = await fetch("/api/firmware/info");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "固件信息加载失败");
    }

    const previousLineCount = state.firmwareTooling.installLineCount;
    state.firmwareTooling = {
      ...state.firmwareTooling,
      ...(payload.platformIo ?? {}),
      python: payload.python ?? state.firmwareTooling.python,
      install: payload.install ?? state.firmwareTooling.install,
      installLineCount: previousLineCount,
    };
    state.firmwareEnvironments = Array.isArray(payload.environments) ? payload.environments : [];

    if (payload.install?.status === "running") {
      applyFirmwareToolingInstallSnapshot(payload.install);
      pollFirmwareToolingInstall();
    }

    if (!state.firmwareEnvironments.some((item) => item.id === state.firmware.environmentId)) {
      state.firmware.environmentId = state.firmwareEnvironments[0]?.id ?? "";
    }

    renderFirmwareEnvironments();
  } catch (error) {
    appendLog(els.firmwareLogOutput, `加载固件信息失败：${getErrorMessage(error)}`);
  } finally {
    syncFirmwareUi();
  }
}

async function loadWindowsSerialDriversInfo() {
  try {
    const response = await fetch("/api/windows-serial-drivers/info");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Windows 串口驱动信息加载失败");
    }

    const previousLineCount = state.windowsSerialDrivers.installLineCount;
    state.windowsSerialDrivers = {
      ...state.windowsSerialDrivers,
      supported: payload.supported === true,
      platform: payload.platform ?? null,
      arch: payload.arch ?? null,
      reason: payload.reason ?? null,
      drivers: Array.isArray(payload.drivers) ? payload.drivers : [],
      install: payload.install ?? state.windowsSerialDrivers.install,
      installLineCount: previousLineCount,
    };

    if (payload.install?.status === "running") {
      applyWindowsSerialDriverInstallSnapshot(payload.install);
      pollWindowsSerialDriverInstall();
    }
  } catch (error) {
    appendLog(els.firmwareLogOutput, `加载 Windows 串口驱动信息失败：${getErrorMessage(error)}`);
  } finally {
    syncFirmwareUi();
  }
}

function getWindowsSerialDriver(driverId) {
  return state.windowsSerialDrivers.drivers.find((driver) => driver.id === driverId) ?? null;
}

async function loadOfficialPalette() {
  try {
    const response = await fetch("/api/official-palette");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "官方色盘加载失败");
    }

    state.studio.officialPalette = {
      rows: typeof payload.rows === "number" ? payload.rows : 0,
      cols: typeof payload.cols === "number" ? payload.cols : 0,
      grid: Array.isArray(payload.grid) ? payload.grid : [],
    };
    renderOfficialPalettePreview();
  } catch (error) {
    appendLog(els.studioLogOutput, `加载官方色盘失败：${getErrorMessage(error)}`);
  }
}

function renderFirmwareEnvironments() {
  els.firmwareEnvSelect.innerHTML = "";

  if (state.firmwareEnvironments.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "未检测到可用环境";
    els.firmwareEnvSelect.appendChild(option);
    return;
  }

  state.firmwareEnvironments.forEach((environment, index) => {
    const option = document.createElement("option");
    option.value = environment.id;
    option.textContent = environment.recommended
      ? `${environment.label}（推荐）`
      : environment.label;
    option.selected = state.firmware.environmentId
      ? environment.id === state.firmware.environmentId
      : index === 0;
    els.firmwareEnvSelect.appendChild(option);
  });
}

function setFirmwareResult({ status, title, detail, environmentLabel, portPath }) {
  state.firmware.result = {
    status,
    title,
    detail,
    environmentLabel,
    portPath,
    updatedAt: new Date(),
  };
  renderFirmwareStatus();
}

function renderFirmwareStatus() {
  const environment = state.firmwareEnvironments.find(
    (item) => item.id === state.firmware.environmentId,
  );
  const result = state.firmware.result;
  const metaEnvironment =
    result.environmentLabel && result.environmentLabel !== "-"
      ? result.environmentLabel
      : environment?.label ?? "-";
  const metaPort =
    result.portPath && result.portPath !== "-"
      ? result.portPath
      : state.selectedPortPath || "未选择";
  const metaTooling = state.firmwareTooling.available
    ? state.firmwareTooling.path ?? "已检测到"
    : "未检测到";
  const metaTime = result.updatedAt ? result.updatedAt.toLocaleString() : "-";

  els.firmwareStatusCard.className = `firmware-status-card firmware-status-${result.status}`;
  els.firmwareStatusPill.textContent = firmwareStatusLabel(result.status);
  els.firmwareStatusTitle.textContent = result.title;
  els.firmwareStatusDetail.textContent = result.detail;
  els.firmwareStatusEnv.textContent = metaEnvironment;
  els.firmwareStatusPort.textContent = metaPort;
  els.firmwareStatusTooling.textContent = metaTooling;
  els.firmwareStatusTime.textContent = metaTime;
}

function renderControllerStatus() {
  const result = state.controller.status;
  const metaTime = result.updatedAt ? result.updatedAt.toLocaleString() : "-";

  els.controllerStatusCard.className = `firmware-status-card controller-status-card firmware-status-${result.tone}`;
  els.controllerStatusPill.textContent = result.pill;
  els.controllerStatusTitle.textContent = result.title;
  els.controllerStatusDetail.textContent = result.detail;
  els.controllerHealthDiscoverable.textContent = result.discoverable;
  els.controllerHealthAuth.textContent = result.auth;
  els.controllerHealthConnected.textContent = result.connected;
  els.controllerHealthPaired.textContent = result.paired;
  els.controllerHealthReady.textContent = result.ready;
  els.controllerStatusTransport.textContent = result.transport;
  els.controllerStatusProfile.textContent = result.profile;
  els.controllerStatusPeer.textContent = result.peer;
  els.controllerStatusInitStep.textContent = result.initStep;
  els.controllerStatusInitError.textContent = result.initError;
  els.controllerStatusTime.textContent = metaTime;
}

function firmwareStatusLabel(status) {
  switch (status) {
    case "running":
      return "进行中";
    case "success":
      return "已成功";
    case "error":
      return "失败";
    default:
      return "待执行";
  }
}

function summarizeFirmwareError(message) {
  if (/exclusively lock port|port is busy|Resource temporarily unavailable/i.test(message)) {
    return "串口当前被占用，请先关闭串口监视器或其他串口工具后再重试。";
  }

  if (/PlatformIO not found/i.test(message)) {
    return "没有找到 PlatformIO，请先确认本机安装是否完成。";
  }

  if (/Unsupported firmware environment/i.test(message)) {
    return "当前目标环境无效，请重新选择开发板环境。";
  }

  const summaryLine = message
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  return summaryLine ?? "刷入失败，请查看下方日志。";
}

function appendLog(element, message) {
  const time = new Date().toLocaleTimeString();
  element.textContent = `${element.textContent}\n[${time}] ${message}`.trim();
  element.scrollTop = element.scrollHeight;
}

function clearLog(element) {
  element.textContent = element.dataset.emptyLog ?? "";
  element.scrollTop = 0;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseIntegerInput(value) {
  const normalized = String(value ?? "").trim();

  if (!normalized || normalized === "+" || normalized === "-") {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function normalizeStudioNumericValue(value, fallback, limits) {
  const parsed = parseIntegerInput(value);

  if (parsed === null) {
    return fallback;
  }

  return clampNumber(parsed, limits.min, limits.max);
}

function setStudioImageScalePercent(value) {
  const nextValue = normalizeStudioNumericValue(
    value,
    state.studio.imageScalePercent,
    STUDIO_IMAGE_SCALE_LIMITS,
  );
  const changed = nextValue !== state.studio.imageScalePercent;
  state.studio.imageScalePercent = nextValue;
  syncStudioUi();

  if (changed) {
    scheduleStudioPreviewRefresh();
  }
}

function setStudioImageOffsetXPercent(value) {
  const nextValue = normalizeStudioNumericValue(
    value,
    state.studio.imageOffsetXPercent,
    STUDIO_IMAGE_OFFSET_LIMITS,
  );
  const changed = nextValue !== state.studio.imageOffsetXPercent;
  state.studio.imageOffsetXPercent = nextValue;
  syncStudioUi();

  if (changed) {
    scheduleStudioPreviewRefresh();
  }
}

function setStudioImageOffsetYPercent(value) {
  const nextValue = normalizeStudioNumericValue(
    value,
    state.studio.imageOffsetYPercent,
    STUDIO_IMAGE_OFFSET_LIMITS,
  );
  const changed = nextValue !== state.studio.imageOffsetYPercent;
  state.studio.imageOffsetYPercent = nextValue;
  syncStudioUi();

  if (changed) {
    scheduleStudioPreviewRefresh();
  }
}

function formatOffsetLabel(value) {
  if (value === 0) {
    return "居中";
  }

  return `${value > 0 ? "+" : ""}${value}%`;
}

function describeImagePosition(offsetXPercent, offsetYPercent, includeTrailingPunctuation = true) {
  if (offsetXPercent === 0 && offsetYPercent === 0) {
    return includeTrailingPunctuation ? "当前位置居中。" : "位置居中";
  }

  const summary = `当前位置为横向 ${formatOffsetLabel(offsetXPercent)}、纵向 ${formatOffsetLabel(offsetYPercent)}`;
  return includeTrailingPunctuation ? `${summary}。` : summary;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("读取预览图失败"));
    image.src = dataUrl;
  });
}

async function init() {
  const initialPageName = normalizePageName(window.location.hash.slice(1));
  switchPage(initialPageName, {
    updateHash: window.location.hash.length > 0,
    scrollToPage: window.location.hash.length > 0,
  });
  state.studio.canvasSize = Number(els.sizeSelect.value || state.studio.canvasSize);
  state.studio.brushSize = Number(els.brushSizeSelect.value || state.studio.brushSize);
  state.studio.imageScalePercent = normalizeStudioNumericValue(
    els.scaleInput.value || els.scaleRange.value,
    state.studio.imageScalePercent,
    STUDIO_IMAGE_SCALE_LIMITS,
  );
  state.studio.imageOffsetXPercent = normalizeStudioNumericValue(
    els.offsetXInput.value || els.offsetXRange.value,
    state.studio.imageOffsetXPercent,
    STUDIO_IMAGE_OFFSET_LIMITS,
  );
  state.studio.imageOffsetYPercent = normalizeStudioNumericValue(
    els.offsetYInput.value || els.offsetYRange.value,
    state.studio.imageOffsetYPercent,
    STUDIO_IMAGE_OFFSET_LIMITS,
  );
  syncStudioColorCountOptions();
  await Promise.all([
    refreshPorts(),
    loadFirmwareInfo(),
    loadWindowsSerialDriversInfo(),
    loadOfficialPalette(),
    loadSerialSessionStatus(),
    pollStudioExecutionStatus(),
  ]);
  renderPortSelects();
  syncStudioUi();
  syncFirmwareUi();
  syncControllerUi();
  renderControllerStatus();
}

void init();
