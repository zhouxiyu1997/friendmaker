import "esp-web-tools/dist/web/install-button.js";
import firmwareVariantConfig from "../shared/firmware-variants.json";
import "./styles.css";

interface FirmwareManifest {
  name: string;
  version: string;
  builds: Array<{
    chipFamily: string;
    parts: Array<{
      path: string;
      offset: number;
    }>;
  }>;
  metadata?: {
    boardId?: string;
    switchModelId?: string;
    switchModelLabel?: string;
    switchModelDescription?: string;
    desktopReleaseUrl?: string;
    label?: string;
    sha256?: Array<{
      path: string;
      value: string;
    }>;
  };
}

type InstallButtonElement = HTMLElement & {
  manifest: string | undefined;
  showLog: boolean | undefined;
  eraseFirst: boolean | undefined;
};

type FirmwareVariantDefinition = (typeof firmwareVariantConfig.variants)[number];
type SwitchModelId = FirmwareVariantDefinition["switchModelId"];

interface SwitchModelDefinition {
  id: SwitchModelId;
  label: string;
  description: string;
  manifestPath: string;
  boardLabel: string;
}

const SWITCH_MODELS: SwitchModelDefinition[] = firmwareVariantConfig.variants.map((variant) => ({
  id: variant.switchModelId,
  label: variant.switchModelLabel,
  description: variant.switchModelDescription,
  manifestPath: `./firmware/${variant.manifestFileName}`,
  boardLabel: variant.boardLabel,
}));

const SWITCH_MODEL_BY_ID = new Map(SWITCH_MODELS.map((model) => [model.id, model]));
const DEFAULT_SWITCH_MODEL_ID = firmwareVariantConfig.defaultSwitchModelId as SwitchModelId;
const DEFAULT_SWITCH_MODEL =
  SWITCH_MODEL_BY_ID.get(DEFAULT_SWITCH_MODEL_ID) ?? SWITCH_MODELS[0]!;

const els = {
  supportCard: document.getElementById("support-card") as HTMLElement,
  supportPill: document.getElementById("support-pill") as HTMLElement,
  supportTitle: document.getElementById("support-title") as HTMLElement,
  supportDetail: document.getElementById("support-detail") as HTMLElement,
  flashHint: document.getElementById("flash-hint") as HTMLElement,
  desktopDownloadLink: document.getElementById("desktop-download-link") as HTMLAnchorElement,
  desktopStepLabel: document.getElementById("desktop-step-label") as HTMLElement,
  desktopFlowLabel: document.getElementById("desktop-flow-label") as HTMLElement,
  firmwareVersion: document.getElementById("firmware-version") as HTMLElement,
  firmwareSwitchModel: document.getElementById("firmware-switch-model") as HTMLSelectElement,
  firmwareSwitchModelDescription: document.getElementById("firmware-switch-model-description") as HTMLElement,
  firmwareBoardLabel: document.getElementById("firmware-board-label") as HTMLElement,
  firmwareManifestPath: document.getElementById("firmware-manifest-path") as HTMLElement,
  firmwarePartsList: document.getElementById("firmware-parts-list") as HTMLUListElement,
  firmwareShaList: document.getElementById("firmware-sha-list") as HTMLUListElement,
  firmwareInstallButton: document.getElementById("firmware-install-button") as InstallButtonElement,
};

const fallbackDesktopReleaseUrl = els.desktopDownloadLink.href;
const fallbackDesktopDownloadLabel = els.desktopDownloadLink.textContent ?? "下载 Friend Maker Desktop 最新版";
const fallbackDesktopStepLabel = els.desktopStepLabel.textContent ?? "Friend Maker Desktop 最新版";
const fallbackDesktopFlowLabel = els.desktopFlowLabel.textContent ?? "Friend Maker Desktop 最新版";
const fallbackFlashHint =
  els.flashHint.textContent ?? "如果刷机后串口重新枚举或临时断开，这是正常现象。下一步请下载桌面版继续使用。";
let selectedSwitchModelId: SwitchModelId = DEFAULT_SWITCH_MODEL_ID;
let activeManifestLoadRequestId = 0;
let activeManifestLoadController: AbortController | null = null;

function findSwitchModel(modelId: string): SwitchModelDefinition {
  return SWITCH_MODEL_BY_ID.get(modelId as SwitchModelId) ?? DEFAULT_SWITCH_MODEL;
}

function getSelectedSwitchModel(): SwitchModelDefinition {
  return findSwitchModel(selectedSwitchModelId);
}

function renderSwitchModelPicker(): void {
  els.firmwareSwitchModel.replaceChildren();

  for (const model of SWITCH_MODELS) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.label;
    els.firmwareSwitchModel.append(option);
  }

  els.firmwareSwitchModel.value = selectedSwitchModelId;
  els.firmwareSwitchModelDescription.textContent = getSelectedSwitchModel().description;
}

function setInstallButtonManifest(manifestPath?: string): void {
  els.firmwareInstallButton.manifest = manifestPath;
  els.firmwareInstallButton.showLog = true;
  els.firmwareInstallButton.eraseFirst = false;
  els.firmwareInstallButton.toggleAttribute("active", !manifestPath);

  if (manifestPath) {
    els.firmwareInstallButton.setAttribute("manifest", manifestPath);
    return;
  }

  els.firmwareInstallButton.removeAttribute("manifest");
}

function setCardTone(card: HTMLElement, tone: "idle" | "success" | "warning" | "error"): void {
  card.classList.remove("status-idle", "status-success", "status-warning", "status-error");
  card.classList.add(`status-${tone}`);
}

function browserSupportsWebSerial(): boolean {
  return "serial" in navigator && Boolean(navigator.serial);
}

function formatDesktopLabel(version: string): string {
  return `Friend Maker Desktop v${version}`;
}

function renderBrowserSupport(version?: string): void {
  if (browserSupportsWebSerial()) {
    setCardTone(els.supportCard, "success");
    els.supportPill.textContent = "可用";
    els.supportTitle.textContent = "当前浏览器支持 Web Serial";
    els.supportDetail.textContent = version
      ? `可以直接用这个页面刷入固件。刷完后请下载 ${formatDesktopLabel(version)} 继续连接板子并绘画。`
      : "可以直接用这个页面刷入固件。刷完后请下载 Friend Maker Desktop 继续连接板子并绘画。";
    return;
  }

  setCardTone(els.supportCard, "warning");
  els.supportPill.textContent = "不支持";
  els.supportTitle.textContent = "当前浏览器不支持 Web Serial";
  els.supportDetail.textContent = "请改用桌面版 Chrome 或 Edge 打开这个网站。";
}

function renderDesktopRelease(version: string, desktopReleaseUrl: string): void {
  const desktopLabel = formatDesktopLabel(version);
  els.flashHint.textContent = `如果刷机后串口重新枚举或临时断开，这是正常现象。下一步请下载 ${desktopLabel} 继续使用。`;
  els.desktopDownloadLink.href = desktopReleaseUrl;
  els.desktopDownloadLink.textContent = `下载 ${desktopLabel}`;
  els.desktopStepLabel.textContent = desktopLabel;
  els.desktopFlowLabel.textContent = desktopLabel;
}

function renderFallbackDesktopRelease(): void {
  els.flashHint.textContent = fallbackFlashHint;
  els.desktopDownloadLink.href = fallbackDesktopReleaseUrl;
  els.desktopDownloadLink.textContent = fallbackDesktopDownloadLabel;
  els.desktopStepLabel.textContent = fallbackDesktopStepLabel;
  els.desktopFlowLabel.textContent = fallbackDesktopFlowLabel;
}

function renderManifest(manifest: FirmwareManifest, switchModel: SwitchModelDefinition): void {
  els.firmwareVersion.textContent = manifest.version;
  els.firmwareBoardLabel.textContent = manifest.metadata?.label ?? "ESP32-WROOM-32 / ESP-32S";
  els.firmwareManifestPath.textContent = switchModel.manifestPath;
  els.firmwareSwitchModelDescription.textContent =
    manifest.metadata?.switchModelDescription ?? switchModel.description;
  els.firmwarePartsList.innerHTML = "";
  els.firmwareShaList.innerHTML = "";

  for (const part of manifest.builds[0]?.parts ?? []) {
    const li = document.createElement("li");
    li.textContent = `${part.path} @ 0x${part.offset.toString(16)}`;
    els.firmwarePartsList.append(li);
  }

  for (const entry of manifest.metadata?.sha256 ?? []) {
    const li = document.createElement("li");
    li.textContent = `${entry.path}: ${entry.value}`;
    els.firmwareShaList.append(li);
  }

  renderDesktopRelease(manifest.version, manifest.metadata?.desktopReleaseUrl ?? fallbackDesktopReleaseUrl);
  renderBrowserSupport(manifest.version);
  setInstallButtonManifest(switchModel.manifestPath);
}

function renderManifestLoading(switchModel: SwitchModelDefinition): void {
  els.firmwareVersion.textContent = "加载中";
  els.firmwareBoardLabel.textContent = switchModel.boardLabel;
  els.firmwareManifestPath.textContent = switchModel.manifestPath;
  els.firmwareSwitchModelDescription.textContent = switchModel.description;
  els.firmwarePartsList.innerHTML = "";
  els.firmwareShaList.innerHTML = "";
  renderBrowserSupport();
  renderFallbackDesktopRelease();
  setInstallButtonManifest();
}

function renderManifestLoadError(message: string, switchModel: SwitchModelDefinition): void {
  els.firmwareVersion.textContent = `${message} (${switchModel.manifestPath})`;
  els.firmwareBoardLabel.textContent = switchModel.boardLabel;
  els.firmwareManifestPath.textContent = switchModel.manifestPath;
  els.firmwareSwitchModelDescription.textContent = switchModel.description;
  els.firmwarePartsList.innerHTML = "";
  els.firmwareShaList.innerHTML = "";
  renderBrowserSupport();
  renderFallbackDesktopRelease();
  setInstallButtonManifest();
}

async function loadManifest(): Promise<void> {
  const switchModel = getSelectedSwitchModel();
  const requestId = ++activeManifestLoadRequestId;
  activeManifestLoadController?.abort();
  const controller = new AbortController();
  activeManifestLoadController = controller;
  renderManifestLoading(switchModel);

  try {
    const response = await fetch(switchModel.manifestPath, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const manifest = (await response.json()) as FirmwareManifest;
    if (requestId !== activeManifestLoadRequestId || controller.signal.aborted) {
      return;
    }

    renderManifest(manifest, switchModel);
  } catch (error) {
    if (requestId !== activeManifestLoadRequestId || controller.signal.aborted) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    renderManifestLoadError(message, switchModel);
  } finally {
    if (activeManifestLoadController === controller) {
      activeManifestLoadController = null;
    }
  }
}

async function bootstrap(): Promise<void> {
  renderBrowserSupport();
  renderSwitchModelPicker();

  els.firmwareSwitchModel.addEventListener("change", () => {
    selectedSwitchModelId = findSwitchModel(els.firmwareSwitchModel.value).id;
    void loadManifest();
  });
  await loadManifest();
}

void bootstrap();
