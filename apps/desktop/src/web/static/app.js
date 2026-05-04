import {
  deriveControllerStatus,
  shouldReuseExistingControllerConnection,
} from "./controllerStatus.js";

const state = {
  activePage: "studio",
  imageDataUrl: null,
  imageSourceLabel: null,
  commands: [],
  ports: [],
  selectedPortPath: "",
  missingSelectedPortPath: null,
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
    templateCategory: "all",
    templateId: "none",
    templateLabel: "无模板（正方形）",
    templates: [],
    imageScalePercent: 100,
    imageOffsetXPercent: 0,
    imageOffsetYPercent: 0,
    previewGuideMode: "none",
    colorMode: "mono",
    colorCount: 32,
    removeBackground: false,
    usedColorIndexes: [],
    generatedPalette: [],
    resumePlan: null,
    recoverySessions: [],
    officialPalette: {
      rows: 0,
      cols: 0,
      grid: [],
    },
    profile: {
      baudRate: 115200,
      ackTimeoutMs: 5000,
      commandRetryCount: 1,
      templateId: "none",
      templateLabel: "无模板（正方形）",
    },
    execution: {
      id: null,
      status: "idle",
      statusSince: null,
      totalCommands: 0,
      completedCommands: 0,
      currentCommand: null,
      startedAt: null,
      finishedAt: null,
      error: null,
      lineCount: 0,
      recoverySessionId: null,
    },
  },
  firmware: {
    busy: false,
    environmentId: "esp32dev_wireless",
    flash: {
      status: "idle",
      lines: [],
      error: null,
      startedAt: null,
      finishedAt: null,
      environmentId: null,
      environmentLabel: null,
      selectedPortPath: null,
      uploadPortPath: null,
      fallbackToAutoDetect: false,
      platformIoPath: null,
      timeoutMs: 15 * 60 * 1000,
      lineOffset: 0,
      totalLineCount: 0,
    },
    flashLineCount: 0,
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
  templateCategorySelect: document.getElementById("template-category-select"),
  templateSelect: document.getElementById("template-select"),
  templatePreviewImage: document.getElementById("template-preview-image"),
  templatePreviewLabel: document.getElementById("template-preview-label"),
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
  executionEmergencyPanel: document.getElementById("execution-emergency-panel"),
  studioExecutionStatus: document.getElementById("studio-execution-status"),
  recoverySessionList: document.getElementById("recovery-session-list"),
  recoveryEmptyState: document.getElementById("recovery-empty-state"),
  autoRemoveBackgroundCheckbox: document.getElementById("auto-remove-background-checkbox"),
  previewGuideSelect: document.getElementById("preview-guide-select"),
  previewCanvas: document.getElementById("preview-canvas"),
  previewTemplateOverlay: document.getElementById("preview-template-overlay"),
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
  firmwareStopButton: document.getElementById("firmware-stop-button"),
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
const STUDIO_RESET_REVEAL_DELAY_MS = 4_000;
let firmwareFlashPollTimer = null;
let controllerStatusPollTimer = null;
let controllerStatusPollDeadlineMs = 0;
let controllerStatusPollInFlight = false;
let studioPreviewRefreshTimer = null;
let studioGenerateRequestSerial = 0;
let studioPreviewBoundsRequestSerial = 0;
const studioTemplateOverlayCache = new Map();
const CONTROLLER_STATUS_POLL_INTERVAL_MS = 1_000;
const CONTROLLER_STATUS_POLL_WINDOW_MS = 45_000;

const COLOR_COUNT_OPTIONS_BY_MODE = {
  mono: [2],
  palette: [8, 9, 16, 18, 24, 32, 64, 84, 128],
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
const TEMPLATE_CATEGORY_LABELS = {
  all: "全部模板",
  tops: "上衣 / 长衣",
  dresses: "裙装 / 衣摆",
  bottoms: "下装",
  hats: "帽子",
  other: "几何 / 特殊",
  base: "默认",
};

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

els.templateCategorySelect.addEventListener("change", () => {
  state.studio.templateCategory = els.templateCategorySelect.value || "all";
  syncStudioTemplateOptions();
  syncStudioUi();
});

els.templateSelect.addEventListener("change", () => {
  const nextTemplateId = els.templateSelect.value || "none";
  const changed = nextTemplateId !== state.studio.templateId;
  applySelectedStudioTemplate(nextTemplateId);
  syncStudioUi();

  if (changed) {
    scheduleStudioPreviewRefresh();
  }
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
  state.studio.colorMode =
    nextMode === "official" || nextMode === "palette" ? nextMode : "mono";
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
    state.missingSelectedPortPath = null;
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

els.firmwareStopButton.addEventListener("click", async () => {
  await stopFirmwareFlash();
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
  state.imageSourceLabel = file.name;
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
  await sendStudioExecutionControl("stop", "中断并保存恢复点");
});

els.resetExecutionButton.addEventListener("click", async () => {
  const shouldReset = window.confirm(
    "这会强制清除当前卡住的绘制状态，不会继续等待当前命令自然结束。只有在“正在中断绘制”长时间不消失时才建议使用。确定继续吗？",
  );

  if (!shouldReset) {
    return;
  }

  await sendStudioExecutionControl("reset", "强制清除卡住状态");
});

els.recoverySessionList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-session-action]");

  if (!button) {
    return;
  }

  const sessionId = button.dataset.sessionId ?? "";

  if (!sessionId) {
    return;
  }

  if (button.dataset.sessionAction === "resume") {
    await resumeRecoverySession(sessionId);
    return;
  }

  if (button.dataset.sessionAction === "discard") {
    await discardRecoverySession(sessionId);
  }
});

function findStudioTemplateById(templateId) {
  return (
    state.studio.templates.find((template) => template.id === templateId) ?? {
      id: "none",
      label: "无模板（正方形）",
      category: "base",
      maskUrl: "",
      previewUrl: "",
    }
  );
}

function getFilteredStudioTemplates() {
  if (state.studio.templateCategory === "all") {
    return state.studio.templates;
  }

  return state.studio.templates.filter(
    (template) => template.id === "none" || template.category === state.studio.templateCategory,
  );
}

function applySelectedStudioTemplate(templateId) {
  const nextTemplate = findStudioTemplateById(templateId) ?? findStudioTemplateById("none");

  if (!nextTemplate) {
    return;
  }

  state.studio.templateId = nextTemplate.id;
  state.studio.templateLabel = nextTemplate.label;

  if (
    state.studio.templateCategory !== "all" &&
    nextTemplate.id !== "none" &&
    nextTemplate.category !== state.studio.templateCategory
  ) {
    state.studio.templateCategory = nextTemplate.category;
  }
}

function syncStudioTemplateOptions() {
  const categoryOptions = ["all", ...new Set(
    state.studio.templates
      .map((template) => template.category)
      .filter((category) => category !== "base"),
  )];
  const nextCategory = categoryOptions.includes(state.studio.templateCategory)
    ? state.studio.templateCategory
    : "all";
  state.studio.templateCategory = nextCategory;
  els.templateCategorySelect.innerHTML = "";

  categoryOptions.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = TEMPLATE_CATEGORY_LABELS[category] ?? category;
    option.selected = category === nextCategory;
    els.templateCategorySelect.appendChild(option);
  });

  const filteredTemplates = getFilteredStudioTemplates();

  if (!filteredTemplates.some((template) => template.id === state.studio.templateId)) {
    const fallbackTemplate = filteredTemplates[0] ?? findStudioTemplateById("none");
    applySelectedStudioTemplate(fallbackTemplate?.id ?? "none");
  }

  els.templateSelect.innerHTML = "";

  filteredTemplates.forEach((template) => {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.label;
    option.selected = template.id === state.studio.templateId;
    els.templateSelect.appendChild(option);
  });
}

function renderStudioTemplatePreview() {
  const template = findStudioTemplateById(state.studio.templateId) ?? findStudioTemplateById("none");
  const previewUrl = template?.previewUrl ?? "";

  if (previewUrl) {
    els.templatePreviewImage.src = previewUrl;
    els.templatePreviewImage.classList.add("visible");
  } else {
    els.templatePreviewImage.removeAttribute("src");
    els.templatePreviewImage.classList.remove("visible");
  }

  els.templatePreviewLabel.textContent = template?.label ?? "无模板（正方形）";
}

function clearPreviewTemplateOverlay() {
  els.previewTemplateOverlay.removeAttribute("src");
  els.previewTemplateOverlay.classList.remove("visible");
}

async function updatePreviewTemplateOverlay() {
  const template = findStudioTemplateById(state.studio.templateId);
  const maskUrl = template?.maskUrl ?? "";

  if (!template || template.id === "none" || !maskUrl) {
    clearPreviewTemplateOverlay();
    return;
  }

  try {
    const overlayUrl = await buildTemplateOverlayDataUrl(maskUrl);

    if (template.id !== state.studio.templateId) {
      return;
    }

    els.previewTemplateOverlay.src = overlayUrl;
    els.previewTemplateOverlay.classList.add("visible");
  } catch (error) {
    if (template.id === state.studio.templateId) {
      clearPreviewTemplateOverlay();
    }

    console.warn(`Failed to build template overlay for ${template.id}.`, error);
  }
}

async function buildTemplateOverlayDataUrl(previewUrl) {
  if (studioTemplateOverlayCache.has(previewUrl)) {
    return studioTemplateOverlayCache.get(previewUrl);
  }

  const image = await loadImageElement(previewUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || 256;
  canvas.height = image.naturalHeight || 256;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return previewUrl;
  }

  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] ?? 0;
    data[index] = 19;
    data[index + 1] = 34;
    data[index + 2] = 56;
    data[index + 3] = alpha > 0 ? 0 : 176;
  }

  context.putImageData(imageData, 0, 0);
  const overlayUrl = canvas.toDataURL("image/png");
  studioTemplateOverlayCache.set(previewUrl, overlayUrl);
  return overlayUrl;
}

async function loadDrawingTemplates() {
  const response = await fetch("/api/drawing-templates");
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "加载图纸模板失败");
  }

  state.studio.templates = Array.isArray(payload.templates) ? payload.templates : [];

  if (state.studio.templates.length === 0) {
    state.studio.templates = [
      {
        id: "none",
        label: "无模板（正方形）",
        category: "base",
        maskUrl: "",
        previewUrl: "",
      },
    ];
  }

  applySelectedStudioTemplate(state.studio.templateId);
  syncStudioTemplateOptions();
  renderStudioTemplatePreview();
  await updatePreviewTemplateOverlay();
}

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
    templateId: state.studio.templateId,
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
  state.studio.resumePlan = payload.resumePlan ?? null;
  state.studio.usedColorIndexes = Array.isArray(payload.stats.usedColorIndexes)
    ? payload.stats.usedColorIndexes
    : [];
  state.studio.generatedPalette = Array.isArray(payload.profile.palette)
    ? payload.profile.palette
    : [];
  state.studio.profile = {
    baudRate: payload.profile.baudRate ?? 115200,
    ackTimeoutMs: payload.profile.ackTimeoutMs ?? 5000,
    commandRetryCount: payload.profile.commandRetryCount ?? 1,
    templateId: payload.profile.templateId ?? state.studio.templateId,
    templateLabel: payload.profile.templateLabel ?? state.studio.templateLabel,
  };
  state.studio.brushSize = payload.profile.brushSize ?? state.studio.brushSize;
  applySelectedStudioTemplate(payload.profile.templateId ?? state.studio.templateId);
  state.studio.imageScalePercent =
    payload.profile.imageScalePercent ?? state.studio.imageScalePercent;
  state.studio.imageOffsetXPercent =
    payload.profile.imageOffsetXPercent ?? state.studio.imageOffsetXPercent;
  state.studio.imageOffsetYPercent =
    payload.profile.imageOffsetYPercent ?? state.studio.imageOffsetYPercent;
  state.studio.colorMode =
    payload.profile.colorMode === "official" || payload.profile.colorMode === "palette"
      ? payload.profile.colorMode
      : "mono";
  state.studio.colorCount = payload.profile.colorCount ?? state.studio.colorCount;
  state.studio.removeBackground = payload.profile.removeBackground === true;

  els.commandsOutput.value = payload.commands.join("\n");
  els.previewImage.src = payload.previewDataUrl;
  els.previewImage.classList.add("visible");
  els.previewEmpty.classList.add("hidden");
  void updatePreviewTemplateOverlay();
  if (payload.profile.colorMode === "mono") {
    els.statColors.textContent = "黑 / 白";
  } else if (payload.profile.colorMode === "official") {
    els.statColors.textContent = `${payload.stats.usedColorIndexes.length} / ${state.studio.colorCount} 官方色`;
  } else {
    els.statColors.textContent = `${payload.stats.usedColorIndexes.length} / ${state.studio.colorCount} 自动量化色`;
  }
  els.statPixels.textContent = String(payload.stats.totalPixels);
  els.statCommands.textContent = payload.stats.pathStats
    ? `${payload.stats.commandCount} · L ${payload.stats.pathStats.lineRunCount}`
    : String(payload.stats.commandCount);
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
        resumePlan: state.studio.resumePlan,
        sourceLabel: state.imageSourceLabel ?? "untitled-drawing",
        profileSummary: {
          brushSize: state.studio.brushSize,
          colorMode: state.studio.colorMode,
          templateId: state.studio.templateId,
          templateLabel: state.studio.templateLabel,
          imageScalePercent: state.studio.imageScalePercent,
          imageOffsetXPercent: state.studio.imageOffsetXPercent,
          imageOffsetYPercent: state.studio.imageOffsetYPercent,
        },
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
    await refreshRecoverySessions();
    if (payload.recoverySession?.commandsFilePath) {
      appendLog(els.studioLogOutput, `恢复脚本已保存：${payload.recoverySession.commandsFilePath}`);
    }
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
  await startFirmwareFlash();
});

els.firmwareClearLogButton.addEventListener("click", () => {
  clearLog(els.firmwareLogOutput);
});

async function startFirmwareFlash() {
  if (!state.selectedPortPath) {
    appendLog(
      els.firmwareLogOutput,
      state.missingSelectedPortPath
        ? `之前选择的串口 ${state.missingSelectedPortPath} 已断开，请重新选择目标设备后再刷入。`
        : "请先选择要刷入的串口设备。",
    );
    return;
  }

  try {
    state.firmware.flashLineCount = 0;
    const response = await fetch("/api/firmware/flash", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        environmentId: state.firmware.environmentId,
        portPath: state.selectedPortPath,
      }),
    });
    const payload = await response.json();

    applySerialSessionSnapshot(payload.session);

    if (!response.ok) {
      throw new Error(payload.error ?? "刷入固件失败");
    }

    applyFirmwareFlashSnapshot(payload.flash);
    pollFirmwareFlash();
  } catch (error) {
    setFirmwareBusy(false);
    setFirmwareResult({
      status: "error",
      title: "固件刷入失败",
      detail: summarizeFirmwareError(getErrorMessage(error)),
      environmentLabel:
        state.firmwareEnvironments.find((item) => item.id === state.firmware.environmentId)?.label ??
        state.firmware.environmentId,
      portPath: state.selectedPortPath || "-",
    });
    appendLog(els.firmwareLogOutput, `刷入失败：${getErrorMessage(error)}`);
    syncFirmwareUi();
  }
}

async function stopFirmwareFlash() {
  if (!state.firmware.busy) {
    return;
  }

  try {
    const response = await fetch("/api/firmware/flash/cancel", {
      method: "POST",
    });
    const payload = await response.json();

    applySerialSessionSnapshot(payload.session);

    if (!response.ok) {
      throw new Error(payload.error ?? "停止刷入失败");
    }

    applyFirmwareFlashSnapshot(payload.flash);
  } catch (error) {
    appendLog(els.firmwareLogOutput, `停止刷入失败：${getErrorMessage(error)}`);
  } finally {
    syncFirmwareUi();
  }
}

function formatFirmwarePortLabel(flash) {
  if (flash?.uploadPortPath) {
    return flash.uploadPortPath;
  }

  if (flash?.selectedPortPath) {
    return `自动检测（初始选择 ${flash.selectedPortPath}）`;
  }

  return "-";
}

function updateFirmwareResultFromFlashSnapshot(flash) {
  const environmentLabel =
    flash?.environmentLabel ??
    state.firmwareEnvironments.find((item) => item.id === state.firmware.environmentId)?.label ??
    state.firmware.environmentId;
  const portPath = formatFirmwarePortLabel(flash);

  if (flash?.status === "running") {
    const detail = flash.fallbackToAutoDetect
      ? "固定端口刷入失败，正在改用 PlatformIO 自动探测可用端口重试。"
      : flash.uploadPortPath
        ? "PlatformIO 正在按当前选中的串口编译并上传固件，请稍等片刻。"
        : "PlatformIO 正在自动探测可用串口并上传固件，请稍等片刻。";
    setFirmwareResult({
      status: "running",
      title: "正在刷入固件",
      detail,
      environmentLabel,
      portPath,
    });
    return;
  }

  if (flash?.status === "completed") {
    const detail = flash.fallbackToAutoDetect
      ? "固定端口失败后已自动改用 PlatformIO 串口探测并刷入成功，可以继续去手柄测试页读取设备信息。"
      : "设备已经写入完成，可以继续去手柄测试页读取设备信息。";
    setFirmwareResult({
      status: "success",
      title: "固件刷入成功",
      detail,
      environmentLabel,
      portPath,
    });
    return;
  }

  if (flash?.status === "cancelled") {
    setFirmwareResult({
      status: "error",
      title: "已停止刷入",
      detail: "当前刷入任务已经取消，可以检查端口或让开发板重新进入下载模式后再重试。",
      environmentLabel,
      portPath,
    });
    return;
  }

  if (flash?.status === "failed") {
    setFirmwareResult({
      status: "error",
      title: "固件刷入失败",
      detail: summarizeFirmwareError(flash.error ?? "刷入失败，请查看下方日志。"),
      environmentLabel,
      portPath,
    });
  }
}

function applyFirmwareFlashSnapshot(flash) {
  const nextFlash = flash ?? {
    status: "idle",
    lines: [],
    error: null,
    startedAt: null,
    finishedAt: null,
    environmentId: null,
    environmentLabel: null,
    selectedPortPath: null,
    uploadPortPath: null,
    fallbackToAutoDetect: false,
    platformIoPath: null,
    timeoutMs: 15 * 60 * 1000,
    lineOffset: 0,
    totalLineCount: 0,
  };
  const lines = Array.isArray(nextFlash.lines) ? nextFlash.lines : [];
  const fallbackTotalLineCount = lines.length;
  const totalLineCount = Number.isFinite(nextFlash.totalLineCount)
    ? nextFlash.totalLineCount
    : fallbackTotalLineCount;
  const lineOffset = Number.isFinite(nextFlash.lineOffset)
    ? nextFlash.lineOffset
    : Math.max(0, totalLineCount - lines.length);
  const previousLineCount = state.firmware.flashLineCount ?? 0;
  const firstUnreadLine = previousLineCount > totalLineCount
    ? lineOffset
    : Math.max(previousLineCount, lineOffset);
  const newLines = lines.slice(firstUnreadLine - lineOffset);

  newLines.forEach((line) => appendLog(els.firmwareLogOutput, `[flash] ${line}`));
  state.firmware.flash = {
    ...nextFlash,
    lineOffset,
    totalLineCount,
    lines,
  };
  state.firmware.flashLineCount = totalLineCount;
  setFirmwareBusy(nextFlash.status === "running");
  updateFirmwareResultFromFlashSnapshot(state.firmware.flash);
}

function pollFirmwareFlash() {
  if (firmwareFlashPollTimer) {
    return;
  }

  firmwareFlashPollTimer = window.setInterval(async () => {
    try {
      const response = await fetch("/api/firmware/flash/status");
      const payload = await response.json();

      applySerialSessionSnapshot(payload.session);

      if (!response.ok) {
        throw new Error(payload.error ?? "读取刷入状态失败");
      }

      applyFirmwareFlashSnapshot(payload.flash);

      if (payload.flash?.status === "completed" || payload.flash?.status === "failed" || payload.flash?.status === "cancelled") {
        stopFirmwareFlashPolling();
        await refreshPorts({
          log: (message) => appendLog(els.firmwareLogOutput, message),
        });
      }
    } catch (error) {
      stopFirmwareFlashPolling();
      setFirmwareBusy(false);
      appendLog(els.firmwareLogOutput, `读取刷入状态失败：${getErrorMessage(error)}`);
    } finally {
      syncFirmwareUi();
    }
  }, 1_000);
}

function stopFirmwareFlashPolling() {
  if (!firmwareFlashPollTimer) {
    return;
  }

  window.clearInterval(firmwareFlashPollTimer);
  firmwareFlashPollTimer = null;
}

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
  setControllerPendingStatus({
    title: "正在检查当前手柄状态",
    detail: "正在读取开发板当前蓝牙状态；如果已经连上 Switch，会直接复用当前连接。",
  });

  const statusOk = await requestControllerStatus();

  if (statusOk && shouldReuseExistingControllerConnection(state.controller.status)) {
    appendLog(
      els.controllerLogOutput,
      state.controller.status.readyValue === true
        ? "检测到手柄已经连接，跳过蓝牙重置。"
        : "检测到开发板已经在广播或握手中，跳过蓝牙重置并继续等待连接完成。",
    );
    startControllerStatusPolling();
    return;
  }

  if (!statusOk) {
    appendLog(els.controllerLogOutput, "当前状态读取失败，改为重置蓝牙后重新连接。");
  }

  setControllerPendingStatus({
    title: "正在准备连接手柄",
    detail: "正在重置蓝牙并重新进入可发现状态，请保持 Switch 停在“更改握法/顺序”页面。",
  });

  const payload = await runControllerCommands(["BT RESET", "I"], "连接手柄");

  if (payload) {
    startControllerStatusPolling();
  }
});

els.controllerResetButton.addEventListener("click", async () => {
  setControllerPendingStatus({
    title: "正在重置手柄蓝牙",
    detail: "正在重启蓝牙协议栈并读取最新状态，请稍等片刻。",
  });

  const payload = await runControllerCommands(["BT RESET", "I"], "重置手柄蓝牙");

  if (payload) {
    startControllerStatusPolling();
  }
});

els.controllerDisconnectButton.addEventListener("click", async () => {
  setControllerBusy(true);
  stopControllerStatusPolling();

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

  const previousStatus = state.studio.execution.status;
  const previousRecoverySessionId = state.studio.execution.recoverySessionId;
  const previousId = state.studio.execution.id;
  const nextId = snapshot.id ?? null;
  const isNewExecution = previousId !== nextId;
  const nextStatus =
    typeof snapshot.status === "string" ? snapshot.status : state.studio.execution.status;
  const existingLineCount = isNewExecution ? 0 : state.studio.execution.lineCount;
  const lines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
  const nextLineCount = lines.length;
  const newLines = lines.slice(existingLineCount);
  const nextStatusSince =
    isNewExecution || previousStatus !== nextStatus ? Date.now() : state.studio.execution.statusSince;

  state.studio.execution = {
    ...state.studio.execution,
    id: nextId,
    status: nextStatus,
    statusSince: nextStatusSince,
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
    recoverySessionId:
      typeof snapshot.recoverySessionId === "string" || snapshot.recoverySessionId === null
        ? snapshot.recoverySessionId
        : state.studio.execution.recoverySessionId,
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

  if (
    previousStatus !== state.studio.execution.status ||
    previousRecoverySessionId !== state.studio.execution.recoverySessionId
  ) {
    void refreshRecoverySessions();
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
    if (action === "pause") {
      appendLog(
        els.studioLogOutput,
        "暂停会在当前命令完成后生效；如果此时 Switch 还会继续动一下，这是正常现象。",
      );
    }
    if (action === "stop") {
      appendLog(
        els.studioLogOutput,
        "中断会在当前命令完成后生效；随后会保存恢复点，供你重新进入绘画页后继续。",
      );
    }
    applyStudioExecutionSnapshot(payload.execution);
    applySerialSessionSnapshot(payload.session);
    await refreshRecoverySessions();
  } catch (error) {
    appendLog(els.studioLogOutput, `${label}失败：${getErrorMessage(error)}`);
  }
}

function shouldShowExecutionEmergencyReset() {
  if (state.studio.execution.status !== "stopping") {
    return false;
  }

  if (typeof state.studio.execution.statusSince !== "number") {
    return false;
  }

  return Date.now() - state.studio.execution.statusSince >= STUDIO_RESET_REVEAL_DELAY_MS;
}

function formatRecoverySessionStatus(status) {
  switch (status) {
    case "running":
      return "绘制中";
    case "paused":
      return "已暂停";
    case "recoverable":
      return "可恢复";
    case "completed":
      return "已完成";
    case "discarded":
      return "已放弃";
    default:
      return "未知";
  }
}

function renderRecoverySessions() {
  const sessions = Array.isArray(state.studio.recoverySessions)
    ? state.studio.recoverySessions
    : [];
  const currentRecoverySessionId = state.studio.execution.recoverySessionId;
  const executionActive = isStudioExecutionActive();

  els.recoverySessionList.innerHTML = "";
  els.recoveryEmptyState.classList.toggle("hidden", sessions.length > 0);

  sessions.forEach((session) => {
    const card = document.createElement("article");
    card.className = "recovery-session-card";

    const title = document.createElement("strong");
    title.className = "recovery-session-title";
    title.textContent = session.sourceLabel || "未命名绘制";

    const meta = document.createElement("p");
    meta.className = "recovery-session-meta";
    meta.textContent = `${formatRecoverySessionStatus(session.status)} · ${session.completedCommands} / ${session.totalCommands}${
      session.nextResumeLabel ? ` · 下一个恢复颜色：${session.nextResumeLabel}` : ""
    }`;

    const path = document.createElement("p");
    path.className = "recovery-session-path";
    path.textContent = `脚本：${session.commandsFilePath}`;

    const actions = document.createElement("div");
    actions.className = "recovery-session-actions";

    const resumeButton = document.createElement("button");
    resumeButton.type = "button";
    resumeButton.className = "ghost";
    resumeButton.textContent = "从恢复点继续";
    resumeButton.dataset.sessionAction = "resume";
    resumeButton.dataset.sessionId = session.jobId;
    resumeButton.disabled =
      executionActive ||
      !state.selectedPortPath ||
      !isControllerReadyForStudio() ||
      session.status !== "recoverable";

    const discardButton = document.createElement("button");
    discardButton.type = "button";
    discardButton.className = "ghost";
    discardButton.textContent = "放弃恢复记录";
    discardButton.dataset.sessionAction = "discard";
    discardButton.dataset.sessionId = session.jobId;
    discardButton.disabled = executionActive || currentRecoverySessionId === session.jobId;

    actions.append(resumeButton, discardButton);
    card.append(title, meta, path, actions);
    els.recoverySessionList.appendChild(card);
  });
}

async function refreshRecoverySessions() {
  try {
    const response = await fetch("/api/recovery/sessions");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "读取恢复任务失败");
    }

    state.studio.recoverySessions = Array.isArray(payload.sessions) ? payload.sessions : [];
    renderRecoverySessions();
  } catch (error) {
    appendLog(els.studioLogOutput, `读取恢复任务失败：${getErrorMessage(error)}`);
  }
}

async function resumeRecoverySession(sessionId) {
  if (!state.selectedPortPath) {
    appendLog(els.studioLogOutput, "请先选择一个串口设备。");
    return;
  }

  if (!isControllerReadyForStudio()) {
    appendLog(els.studioLogOutput, "恢复绘制前，请先到“手柄测试”页把手柄连接状态跑到“已就绪”。");
    switchPage("controller");
    return;
  }

  const shouldResume = window.confirm(
    "请确认：你已经先在 Switch 里保存当前画作，并且已经手动重新进入绘画页；当前笔刷大小与保存任务一致，页面也回到了默认进入状态。现在开始从恢复点继续吗？",
  );

  if (!shouldResume) {
    return;
  }

  try {
    const response = await fetch("/api/recovery/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        portPath: state.selectedPortPath,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      applySerialSessionSnapshot(payload.session);
      throw new Error(payload.error ?? "恢复绘制失败");
    }

    applySerialSessionSnapshot(payload.session);
    applyStudioExecutionSnapshot(payload.execution);
    await refreshRecoverySessions();
    appendLog(els.studioLogOutput, `已从恢复点继续：${payload.recoverySession?.sourceLabel ?? sessionId}`);
    startStudioExecutionPolling();
  } catch (error) {
    appendLog(els.studioLogOutput, `恢复绘制失败：${getErrorMessage(error)}`);
  }
}

async function discardRecoverySession(sessionId) {
  const shouldDiscard = window.confirm("放弃后会删除本地脚本和恢复记录。确定继续吗？");

  if (!shouldDiscard) {
    return;
  }

  try {
    const response = await fetch("/api/recovery/discard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "放弃恢复记录失败");
    }

    state.studio.recoverySessions = Array.isArray(payload.sessions) ? payload.sessions : [];
    renderRecoverySessions();
    appendLog(els.studioLogOutput, `已放弃恢复记录：${sessionId}`);
  } catch (error) {
    appendLog(els.studioLogOutput, `放弃恢复记录失败：${getErrorMessage(error)}`);
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
  syncControllerUi();
  syncStudioUi();
}

function setControllerPendingStatus({ title, detail }) {
  setControllerStatus({
    tone: "running",
    pill: "处理中",
    title,
    detail,
    discoverable: "未知",
    auth: "未知",
    connected: "未知",
    paired: "未知",
    ready: "未就绪",
    discoverableValue: null,
    authValue: null,
    connectedValue: null,
    pairedValue: null,
    readyValue: false,
    initStep: "-",
    initError: "-",
  });
}

function updateControllerStatusFromLines(lines) {
  const status = deriveControllerStatus(lines);

  if (!status) {
    return;
  }
  setControllerStatus(status);
}

function isControllerReadyForStudio() {
  return state.controller.status.readyValue === true;
}

async function requestControllerStatus({ logErrors = false } = {}) {
  if (!state.selectedPortPath) {
    return false;
  }

  if (controllerStatusPollInFlight) {
    return null;
  }

  controllerStatusPollInFlight = true;

  try {
    const response = await fetch("/api/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: "serial",
        commands: ["I"],
        portPath: state.selectedPortPath,
        baudRate: state.studio.profile.baudRate,
        ackTimeoutMs: state.studio.profile.ackTimeoutMs,
        retries: state.studio.profile.commandRetryCount,
        ackDelayMs: 0,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      applySerialSessionSnapshot(payload.session);
      throw new Error(payload.error ?? "读取手柄状态失败");
    }

    applySerialSessionSnapshot(payload.session);
    updateControllerStatusFromLines(payload.lines ?? []);
    return true;
  } catch (error) {
    if (logErrors) {
      appendLog(els.controllerLogOutput, `读取手柄状态失败：${getErrorMessage(error)}`);
    }
    return false;
  } finally {
    controllerStatusPollInFlight = false;
  }
}

async function pollControllerStatus() {
  if (state.controller.busy) {
    return;
  }

  if (controllerStatusPollInFlight) {
    return;
  }

  if (!state.selectedPortPath) {
    stopControllerStatusPolling();
    return;
  }

  if (controllerStatusPollDeadlineMs > 0 && Date.now() > controllerStatusPollDeadlineMs) {
    stopControllerStatusPolling();
    return;
  }

  const ok = await requestControllerStatus();

  if (ok === null) {
    return;
  }

  if (!ok) {
    stopControllerStatusPolling();
    appendLog(els.controllerLogOutput, "读取手柄状态失败，请重新点击“连接手柄”后再试。");
    return;
  }

  if (
    state.controller.status.readyValue === true ||
    state.controller.status.tone === "error"
  ) {
    stopControllerStatusPolling();
  }
}

function startControllerStatusPolling(durationMs = CONTROLLER_STATUS_POLL_WINDOW_MS) {
  if (!state.selectedPortPath) {
    return;
  }

  controllerStatusPollDeadlineMs = Math.max(
    controllerStatusPollDeadlineMs,
    Date.now() + durationMs,
  );

  if (!controllerStatusPollTimer) {
    controllerStatusPollTimer = window.setInterval(() => {
      void pollControllerStatus();
    }, CONTROLLER_STATUS_POLL_INTERVAL_MS);
  }

  void pollControllerStatus();
}

function stopControllerStatusPolling() {
  controllerStatusPollDeadlineMs = 0;

  if (!controllerStatusPollTimer) {
    return;
  }

  window.clearInterval(controllerStatusPollTimer);
  controllerStatusPollTimer = null;
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
      els.studioExecutionStatus.textContent = `绘制已暂停：${execution.completedCommands} / ${execution.totalCommands}。如果你刚点了暂停，看到 Switch 还会把最后一条已发出的命令跑完，这是正常现象。`;
      break;
    case "stopping":
      els.studioExecutionStatus.textContent = `正在中断绘制：${execution.completedCommands} / ${execution.totalCommands}。Switch 还会先跑完当前命令，然后保存恢复点；如果长时间卡在这里，下面会出现应急按钮。`;
      break;
    case "completed":
      els.studioExecutionStatus.textContent = `绘制已完成：${execution.completedCommands} / ${execution.totalCommands}`;
      break;
    case "stopped":
      els.studioExecutionStatus.textContent = `绘制已中断并保存恢复点：${execution.completedCommands} / ${execution.totalCommands}。请先在 Switch 里保存，再手动重新进入绘画页后继续。`;
      break;
    case "failed":
      els.studioExecutionStatus.textContent = `绘制异常中断：${execution.error ?? "请查看执行日志。"} 请先在 Switch 里保存，再手动重新进入绘画页后，从下方恢复任务继续。`;
      break;
    default:
      els.studioExecutionStatus.textContent = "当前未开始绘制。";
      break;
  }
}

function renderOfficialPalettePreview() {
  const isOfficialMode = state.studio.colorMode === "official";
  const isPaletteMode = state.studio.colorMode === "palette";
  const palette = state.studio.officialPalette;
  const generatedPalette = Array.isArray(state.studio.generatedPalette)
    ? state.studio.generatedPalette
    : [];

  els.officialPalettePanel.classList.toggle(
    "hidden",
    isOfficialMode
      ? !Array.isArray(palette.grid) || palette.grid.length === 0
      : !isPaletteMode || generatedPalette.length === 0,
  );

  if (isOfficialMode && Array.isArray(palette.grid) && palette.grid.length > 0) {
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
    return;
  }

  if (isPaletteMode && generatedPalette.length > 0) {
    els.officialPaletteSummary.textContent =
      `这里完整列出这张图当前预览实际用到的全部颜色。当前共使用 ${generatedPalette.length} 个自动量化颜色，绘制时会按 9 槽一批写入自定义色槽。`;
    els.officialPaletteGrid.innerHTML = "";

    generatedPalette.forEach((colorHex, index) => {
      const cell = document.createElement("div");
      cell.className = "official-palette-cell used";

      const swatch = document.createElement("div");
      swatch.className = "official-palette-swatch";
      swatch.style.background = colorHex;

      const meta = document.createElement("div");
      meta.className = "official-palette-meta";

      const coord = document.createElement("span");
      coord.className = "official-palette-coord";
      coord.textContent = `P${index}`;

      const hex = document.createElement("span");
      hex.className = "official-palette-hex";
      hex.textContent = colorHex;

      meta.append(coord, hex);
      cell.append(swatch, meta);
      els.officialPaletteGrid.appendChild(cell);
    });
    return;
  }

  els.officialPaletteGrid.innerHTML = "";
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
  const showExecutionEmergencyReset = shouldShowExecutionEmergencyReset();

  els.sizeSelect.value = String(state.studio.canvasSize);
  els.brushSizeSelect.value = String(state.studio.brushSize);
  syncStudioTemplateOptions();
  els.templateCategorySelect.value = state.studio.templateCategory;
  els.templateSelect.value = state.studio.templateId;
  renderStudioTemplatePreview();
  void updatePreviewTemplateOverlay();
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
  const templateHint =
    state.studio.templateId === "none"
      ? "当前使用正方形画布，不会额外裁掉模板外区域。"
      : `当前模板是“${state.studio.templateLabel}”，纯模板外区域不会显示；边缘格子只要碰到模板，也会保留绘制来填满可见边缘。`;
  const scaleHint = `当前导入缩放是 ${state.studio.imageScalePercent}%，100% 表示完整放进画布。`;
  const positionHint = describeImagePosition(
    state.studio.imageOffsetXPercent,
    state.studio.imageOffsetYPercent,
  );
  if (state.studio.colorMode === "mono") {
    els.studioModeHint.textContent =
      `深色像素会绘制，浅色像素会保留为空白背景。当前会先按 ${state.studio.imageScalePercent}% 调整图片大小，再放进 256x256 脚本坐标画布，并按 ${state.studio.brushSize} 号笔和画布中心起步生成。${templateHint}${scaleHint}${positionHint}${squareBrushHint}${backgroundHint}`;
  } else if (state.studio.colorMode === "official") {
    els.studioModeHint.textContent =
      `当前会先按 ${state.studio.imageScalePercent}% 调整图片大小，再把图片压到 ${state.studio.colorCount} 个官方色以内，并映射到游戏内置的 7x12 官方色盘，再按 ${state.studio.brushSize} 号笔生成。${templateHint}${scaleHint}${positionHint}开始前请保持右侧 9 个槽位默认颜色不变。${squareBrushHint}${backgroundHint}`;
  } else {
    els.studioModeHint.textContent =
      `当前会先按 ${state.studio.imageScalePercent}% 调整图片大小，再把图片自动量化到最多 ${state.studio.colorCount} 个颜色，并按批次写入游戏的 9 个自定义槽位后进行绘制。下方“当前预览用色”会完整列出这次预览实际用到的全部颜色。${templateHint}${scaleHint}${positionHint}这条路线仍属于实验能力，当前优先目标是输入稳定性，不保证所有图片都稳定。${squareBrushHint}${backgroundHint}`;
  }
  els.studioPortSelect.disabled = state.studio.busy || executionActive;
  els.refreshPortsButton.disabled = state.studio.busy || executionActive;
  els.sizeSelect.disabled = state.studio.busy || executionActive;
  els.brushSizeSelect.disabled = state.studio.busy || executionActive;
  els.templateCategorySelect.disabled = state.studio.busy || executionActive;
  els.templateSelect.disabled = state.studio.busy || executionActive;
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
  els.executionEmergencyPanel.classList.toggle("hidden", !showExecutionEmergencyReset);
  els.resetExecutionButton.disabled = !showExecutionEmergencyReset;
  renderStudioExecutionStatus();
  renderOfficialPalettePreview();
  renderRecoverySessions();

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
      ? `当前会把按 ${state.studio.imageScalePercent}% 缩放、${describeImagePosition(state.studio.imageOffsetXPercent, state.studio.imageOffsetYPercent, false)}后的 256x256 黑白脚本通过串口发送到 ${state.selectedPortPath}，模板为“${state.studio.templateLabel}”。由 ESP32 从画布中心起步，按 ${state.studio.brushSize} 号笔继续翻译成方向键移动与 A 绘制。建议开始前把 Switch 里的笔刷切到方块笔刷，整体观感通常会更美观。`
      : state.studio.colorMode === "official"
        ? `当前会把按 ${state.studio.imageScalePercent}% 缩放、${describeImagePosition(state.studio.imageOffsetXPercent, state.studio.imageOffsetYPercent, false)}后的 256x256 官方色脚本通过串口发送到 ${state.selectedPortPath}，模板为“${state.studio.templateLabel}”。请先保持右侧 9 个槽位默认颜色不变，ESP32 会按这组默认槽位状态去配置内置 7x12 色盘，并按 ${state.studio.brushSize} 号笔绘制。建议开始前把 Switch 里的笔刷切到方块笔刷，整体观感通常会更美观。`
        : `当前会把按 ${state.studio.imageScalePercent}% 缩放、${describeImagePosition(state.studio.imageOffsetXPercent, state.studio.imageOffsetYPercent, false)}后的 256x256 自动量化多色脚本通过串口发送到 ${state.selectedPortPath}，模板为“${state.studio.templateLabel}”。ESP32 会分批把当前预览实际用到的颜色写入 9 个自定义槽位后再绘制；这条路线仍处于实验阶段，建议先从颜色较少、结构简单的图片开始。`;
  renderStudioConnectionStatus();
}

function syncFirmwareUi() {
  const environment = state.firmwareEnvironments.find(
    (item) => item.id === state.firmware.environmentId,
  );
  const selectedPortAvailable = state.ports.some((port) => port.path === state.selectedPortPath);

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

  if (state.missingSelectedPortPath) {
    els.firmwareEnvHint.textContent = `之前选择的串口 ${state.missingSelectedPortPath} 已断开，请重新选择目标设备。`;
  }

  syncWindowsSerialDriverUi();

  els.firmwarePortSelect.disabled = state.firmware.busy;
  els.firmwareStopButton.disabled = !state.firmware.busy;
  els.firmwareFlashButton.disabled =
    state.firmware.busy || installing || !state.firmwareTooling.available || !selectedPortAvailable;
  renderFirmwareStatus();
}

function syncWindowsSerialDriverUi() {
  const driverInstallStatus = state.windowsSerialDrivers.install?.status ?? "idle";
  const driverInstalling = driverInstallStatus === "running";
  const isWindows = state.windowsSerialDrivers.platform === "win32";
  const shouldShowDriverPanel = isWindows;
  const cp210xDriver = getWindowsSerialDriver("cp210x");
  const ch341Driver = getWindowsSerialDriver("ch341");

  els.windowsDriverPanel.classList.toggle("hidden", !shouldShowDriverPanel);

  if (!shouldShowDriverPanel) {
    return;
  }

  if (!state.windowsSerialDrivers.supported) {
    els.windowsDriverHint.textContent =
      state.windowsSerialDrivers.reason ?? "当前仅支持 Windows x64 的一键串口驱动安装。";
  } else if (state.ports.length > 0) {
    els.windowsDriverHint.textContent =
      "如果当前开发板仍未识别，或更换板子后仍没有新的串口出现，可以重装 CP210x 驱动；如果仍无效果，再安装 CH340/CH341 驱动。";
  } else {
    els.windowsDriverHint.textContent =
      "如果还没有检测到串口，请先确认使用可传输数据的 USB 线并重新插拔 ESP32；仍无串口时优先安装 CP210x 驱动，如果仍检测不到再安装 CH340/CH341 驱动。";
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
  const ready = state.controller.status.readyValue === true;
  const canSendTestCommands = !state.controller.busy && hasPort && ready;

  els.controllerPortSelect.disabled = state.controller.busy;

  const shouldDisable = state.controller.busy || !hasPort;
  els.controllerInfoButton.disabled = shouldDisable;
  els.controllerResetButton.disabled = shouldDisable;
  els.controllerSendCustomButton.disabled = !canSendTestCommands;
  els.controllerCustomCommands.disabled = !canSendTestCommands;
  els.controllerDisconnectButton.disabled = state.controller.busy || !state.serialSession.connected;
  els.controllerActionButtons.forEach((button) => {
    button.disabled = !canSendTestCommands;
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
    return null;
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

  return payload;
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
    const previousSelectedPortPath = state.selectedPortPath;
    const response = await fetch("/api/ports");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "串口列表获取失败");
    }

    state.ports = Array.isArray(payload.ports) ? payload.ports : [];

    if (!previousSelectedPortPath) {
      state.selectedPortPath = pickPreferredPortPath();
      state.missingSelectedPortPath = null;
    } else if (state.ports.some((port) => port.path === previousSelectedPortPath)) {
      state.selectedPortPath = previousSelectedPortPath;
      state.missingSelectedPortPath = null;
    } else {
      state.selectedPortPath = "";
      state.missingSelectedPortPath = previousSelectedPortPath;
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

      if (state.missingSelectedPortPath) {
        log(`之前选择的串口 ${state.missingSelectedPortPath} 已消失，请重新选择目标设备。`);
      }
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

    if (state.missingSelectedPortPath) {
      const missingOption = document.createElement("option");
      missingOption.value = "";
      missingOption.textContent = `之前选择的串口已断开：${state.missingSelectedPortPath}`;
      missingOption.selected = true;
      select.appendChild(missingOption);
    } else if (state.ports.length === 0) {
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
      option.selected = state.selectedPortPath ? port.path === state.selectedPortPath : index === 0 && !state.missingSelectedPortPath;
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

    if (payload.flash) {
      applyFirmwareFlashSnapshot(payload.flash);

      if (payload.flash.status === "running") {
        pollFirmwareFlash();
      }
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

  if (/Timed out waiting for packet header|Failed to connect|No serial data received|A fatal error occurred/i.test(message)) {
    return "设备没有顺利进入下载模式。请重新插拔开发板，必要时按住 BOOT 键后再重试刷入。";
  }

  if (/could not open port|cannot configure port|No upload port found|No such file or directory|Access is denied|Permission denied|port doesn't exist/i.test(message)) {
    return "当前串口不可用，或端口号已经变化。请刷新串口列表并重新选择目标设备后再重试。";
  }

  if (/timed out after \d+m \d+s/i.test(message)) {
    return "刷入超时了。请检查数据线、下载模式和网络，再重试；如果开发板难以进入下载模式，可以按住 BOOT 键后重新刷入。";
  }

  if (/cancelled by user/i.test(message)) {
    return "刷入任务已停止。请检查端口和开发板状态后再重试。";
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
    .find((line) => line && !line.startsWith("$ "));

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
  const message = error instanceof Error ? error.message : String(error);

  if (/Cannot lock port|exclusively lock port|port is busy|Resource temporarily unavailable/i.test(message)) {
    return "串口当前被其他进程占用，常见原因是另一个 Friend Maker 实例或串口工具仍保持连接。请先断开旧连接，或完全退出占用程序后再重试。";
  }

  if (/controller input report failed/i.test(message)) {
    return `${message}。请重新连接手柄，或改用更慢的输入时序后再开始。`;
  }

  return message;
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
    loadDrawingTemplates(),
    loadFirmwareInfo(),
    loadWindowsSerialDriversInfo(),
    loadOfficialPalette(),
    loadSerialSessionStatus(),
    pollStudioExecutionStatus(),
    refreshRecoverySessions(),
  ]);
  renderPortSelects();
  syncStudioUi();
  syncFirmwareUi();
  syncControllerUi();
  renderControllerStatus();

  if (state.serialSession.connected && state.selectedPortPath) {
    void requestControllerStatus();
  }
}

void init();
