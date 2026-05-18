import "esp-web-tools/dist/web/install-button.js";
import i18next from "i18next";
import firmwareReleaseConfig from "../shared/firmware-releases.json";
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

type FirmwareReleaseDefinition = (typeof firmwareReleaseConfig.versions)[number];
type FirmwareVariantDefinition = (typeof firmwareVariantConfig.variants)[number];
type SwitchModelId = FirmwareVariantDefinition["switchModelId"];
type FirmwareReleaseVersion = FirmwareReleaseDefinition["version"];

interface FirmwareReleaseOption {
  version: FirmwareReleaseVersion;
  recommended: boolean;
}

interface SwitchModelDefinition {
  id: SwitchModelId;
  label: string;
  description: string;
  manifestFileName: string;
  boardLabel: string;
  hidden: boolean;
}

const LANGUAGE_STORAGE_KEY = "friend-maker.flasher.language";
const SOURCE_LANGUAGE = "zh-CN";
const DEFAULT_LANGUAGE = SOURCE_LANGUAGE;
const ENGLISH_LANGUAGE = "en";
const TRANSLATIONS = {
  en: {
    translation: {
      "page.title": "Friend Maker Firmware Flasher",
      "page.description":
        "Friend Maker firmware flasher: flash mainline ESP32 firmware directly from the browser without installing a local development environment.",
      "hero.eyebrow": "Friend Maker Web Flasher",
      "hero.title": "Open the page and flash ESP32 firmware directly",
      "hero.body":
        "This site does one thing: flash Friend Maker firmware to the mainline <code>ESP32-WROOM-32 / ESP-32S</code>. Users do not need to install <code>Node</code>, <code>PlatformIO</code>, or any other development environment locally.",
      "hero.browserPill": "Chrome / Edge desktop",
      "hero.pagesPill": "GitHub Pages",
      "hero.boardPill": "ESP32-WROOM-32 / ESP-32S",
      "support.heading": "Browser and device requirements",
      "support.copy":
        "The first release supports only the mainline board and desktop browsers with Web Serial.",
      "support.checkingPill": "Checking",
      "support.checkingTitle": "Checking browser capabilities",
      "support.checkingDetail": "This page checks whether your browser supports Web Serial.",
      "support.browser": "Recommended browser: <code>Chrome</code> / <code>Edge</code> desktop",
      "support.board": "Target board: <code>ESP32-WROOM-32 / ESP-32S</code>",
      "support.cable": "Prepare a USB cable that supports data transfer",
      "support.availablePill": "Available",
      "support.availableTitle": "This browser supports Web Serial",
      "support.availableDetail":
        "You can flash firmware directly from this page. After flashing, download {{desktopLabel}} to continue connecting the board and drawing.",
      "support.availableDetailNoVersion":
        "You can flash firmware directly from this page. After flashing, download Friend Maker Desktop to continue connecting the board and drawing.",
      "support.unsupportedPill": "Unsupported",
      "support.unsupportedTitle": "This browser does not support Web Serial",
      "support.unsupportedDetail": "Open this site in desktop Chrome or Edge.",
      "firmware.heading": "Firmware version",
      "firmware.copy":
        "This shows the firmware release provided by the site. Choose Switch 1 and Lite firmware, or the Switch 2 firmware.",
      "firmware.releaseVersion": "Release version",
      "firmware.releaseRecommended": "{{version}} (recommended)",
      "firmware.switchModel": "Switch model",
      "firmware.parts": "Flash files",
      "firmware.loading": "Loading",
      "flash.heading": "One-click firmware flashing",
      "flash.copy":
        "The browser flashing flow is driven by the manifest. After flashing, continue in the desktop app to connect the board and draw.",
      "flash.hint":
        "It is normal for the serial port to re-enumerate or disconnect briefly after flashing. Next, download the desktop app to continue.",
      "flash.hintVersion":
        "It is normal for the serial port to re-enumerate or disconnect briefly after flashing. Next, download {{desktopLabel}} to continue.",
      "next.heading": "Next step",
      "next.copy":
        "This website does not connect the controller or send drawing commands. After flashing, continue directly in the mature desktop workflow.",
      "next.downloadLatest": "Download the latest Friend Maker Desktop",
      "next.downloadVersion": "Download {{desktopLabel}}",
      "next.latestLabel": "the latest Friend Maker Desktop",
      "next.stepFlash": "Use this page to flash firmware to the board first",
      "next.stepDownload": "Download and open <code id=\"desktop-step-label\">the latest Friend Maker Desktop</code>",
      "next.stepDesktop":
        "In the desktop app, continue connecting the board, pairing the controller, and drawing",
      "why.heading": "Why only flashing",
      "why.copy":
        "The web app is meant to be a zero-environment flashing entry point. Connection and drawing stay in the stable desktop app.",
      "why.noEnv": "Users can flash firmware without installing a local development environment",
      "why.desktopFlow":
        "The later drawing flow reuses <code id=\"desktop-flow-label\">the latest Friend Maker Desktop</code>",
      "why.scope":
        "The web app does not take on experimental serial execution or controller debugging responsibilities",
      "models.switch.description": "Standard Switch firmware behavior.",
      "models.switch2.description":
        "Switch 2 currently uses more conservative Bluetooth Classic HID timing and actively resends the virtual-cable request after authentication succeeds.",
      "models.switchLite.description":
        "For Switch 1 and Switch Lite. This mode uses the stable SWITCH_LITE build, disabling BT modem sleep, fixing the send cadence, and extending congestion retries to improve pairing and button stability.",
      "models.switch2.boardLabel": "ESP32-WROOM-32 / ESP-32S (Switch 2 mode)",
      "models.switchLite.boardLabel": "ESP32-WROOM-32 / ESP-32S (Switch 1 and Lite mode)",
      "manifest.loadError": "Load failed",
    },
  },
  "zh-CN": {
    translation: {
      "page.title": "Friend Maker 固件刷写器",
      "page.description":
        "Friend Maker 固件刷机站：无需本地安装开发环境，直接用浏览器给主线 ESP32 刷入固件。",
      "hero.eyebrow": "Friend Maker Web Flasher",
      "hero.title": "打开网页，直接给 ESP32 刷固件",
      "hero.body":
        "这个网站只做一件事：给主线 <code>ESP32-WROOM-32 / ESP-32S</code> 刷入 Friend Maker 固件。不需要用户本地安装 <code>Node</code>、<code>PlatformIO</code> 或其他开发环境。",
      "hero.browserPill": "Chrome / Edge 桌面端",
      "hero.pagesPill": "GitHub Pages",
      "hero.boardPill": "ESP32-WROOM-32 / ESP-32S",
      "support.heading": "浏览器与设备要求",
      "support.copy": "首期只支持主线板型和支持 Web Serial 的桌面浏览器。",
      "support.checkingPill": "检测中",
      "support.checkingTitle": "正在检查浏览器能力",
      "support.checkingDetail": "页面会检查当前浏览器是否支持 Web Serial。",
      "support.browser": "推荐浏览器：<code>Chrome</code> / <code>Edge</code> 桌面端",
      "support.board": "目标开发板：<code>ESP32-WROOM-32 / ESP-32S</code>",
      "support.cable": "准备一根可传数据的 USB 线",
      "support.availablePill": "可用",
      "support.availableTitle": "当前浏览器支持 Web Serial",
      "support.availableDetail":
        "可以直接用这个页面刷入固件。刷完后请下载 {{desktopLabel}} 继续连接板子并绘画。",
      "support.availableDetailNoVersion":
        "可以直接用这个页面刷入固件。刷完后请下载 Friend Maker Desktop 继续连接板子并绘画。",
      "support.unsupportedPill": "不支持",
      "support.unsupportedTitle": "当前浏览器不支持 Web Serial",
      "support.unsupportedDetail": "请改用桌面版 Chrome 或 Edge 打开这个网站。",
      "firmware.heading": "固件版本",
      "firmware.copy": "这里展示当前站点提供的固件发布信息，可选择 Switch1 和 Lite 固件，或 Switch 2 固件。",
      "firmware.releaseVersion": "发布版本",
      "firmware.releaseRecommended": "{{version}}（推荐）",
      "firmware.switchModel": "Switch 型号",
      "firmware.parts": "刷写文件",
      "firmware.loading": "加载中",
      "flash.heading": "一键刷入固件",
      "flash.copy": "通过 manifest 驱动的浏览器刷机流程，刷完固件后就可以进入桌面版继续连接板子并绘画。",
      "flash.hint": "如果刷机后串口重新枚举或临时断开，这是正常现象。下一步请下载桌面版继续使用。",
      "flash.hintVersion":
        "如果刷机后串口重新枚举或临时断开，这是正常现象。下一步请下载 {{desktopLabel}} 继续使用。",
      "next.heading": "下一步",
      "next.copy": "这个网站不负责连接手柄或发送绘画命令。刷完固件后，请直接进入成熟的桌面版流程。",
      "next.downloadLatest": "下载 Friend Maker Desktop 最新版",
      "next.downloadVersion": "下载 {{desktopLabel}}",
      "next.latestLabel": "Friend Maker Desktop 最新版",
      "next.stepFlash": "先用本页给开发板刷入固件",
      "next.stepDownload": "下载并打开 <code id=\"desktop-step-label\">Friend Maker Desktop 最新版</code>",
      "next.stepDesktop": "在桌面版里继续连接板子、配对手柄并开始绘画",
      "why.heading": "为什么只做刷机",
      "why.copy": "当前网页端主目标是零环境刷机入口，把后续连接与绘画继续交给稳定的桌面版处理。",
      "why.noEnv": "用户不需要安装本地开发环境就能刷固件",
      "why.desktopFlow": "后续绘画链路直接复用 <code id=\"desktop-flow-label\">Friend Maker Desktop 最新版</code>",
      "why.scope": "网页端不承担实验性串口执行和控制器调试职责",
      "models.switch.description": "标准 Switch 固件行为。",
      "models.switch2.description":
        "Switch 2 目前走更保守的 Bluetooth Classic HID 时序，并在认证成功后主动补发 virtual cable 请求。",
      "models.switchLite.description":
        "适用于 Switch1 和 Switch Lite；此模式使用启用 SWITCH_LITE 的稳定构建（禁用 BT modem sleep、固定发送节奏并延长拥塞重试）以提升配对与按键稳定性。",
      "models.switch2.boardLabel": "ESP32-WROOM-32 / ESP-32S（Switch 2 模式）",
      "models.switchLite.boardLabel": "ESP32-WROOM-32 / ESP-32S（Switch1 和 Lite 模式）",
      "manifest.loadError": "加载失败",
    },
  },
} as const;

function normalizeLanguage(language: string | null | undefined): string {
  if (language === SOURCE_LANGUAGE || language === "zh" || language === "zh-Hans") {
    return SOURCE_LANGUAGE;
  }

  if (language === ENGLISH_LANGUAGE) {
    return ENGLISH_LANGUAGE;
  }

  return DEFAULT_LANGUAGE;
}

function readInitialLanguage(): string {
  const params = new URLSearchParams(window.location.search);
  return normalizeLanguage(
    params.get("lng") ??
      params.get("lang") ??
      window.localStorage.getItem(LANGUAGE_STORAGE_KEY) ??
      DEFAULT_LANGUAGE,
  );
}

function t(key: string, options?: Record<string, unknown>): string {
  return options ? i18next.t(key, options) : i18next.t(key);
}

function translateVariantDescription(modelId: SwitchModelId, fallback: string): string {
  if (modelId === "switch") {
    return t("models.switch.description");
  }

  if (modelId === "switch2") {
    return t("models.switch2.description");
  }

  if (modelId === "switch_lite") {
    return t("models.switchLite.description");
  }

  return fallback;
}

function translateBoardLabel(modelId: SwitchModelId, fallback: string): string {
  if (modelId === "switch2") {
    return t("models.switch2.boardLabel");
  }

  if (modelId === "switch_lite") {
    return t("models.switchLite.boardLabel");
  }

  return fallback;
}

function applyDocumentMetadata(): void {
  document.title = t("page.title");
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute("content", t("page.description"));
}

function applyStaticTranslations(): void {
  document.documentElement.lang = i18next.language;
  applyDocumentMetadata();
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (key) {
      element.innerHTML = t(key);
    }
  });
  els.desktopStepLabel = document.getElementById("desktop-step-label") as HTMLElement;
  els.desktopFlowLabel = document.getElementById("desktop-flow-label") as HTMLElement;
}

async function changeLanguage(language: string): Promise<void> {
  await i18next.changeLanguage(normalizeLanguage(language));
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, i18next.language);
  const languageSelect = document.getElementById("language-select") as HTMLSelectElement | null;
  if (languageSelect) {
    languageSelect.value = i18next.language;
  }
  applyStaticTranslations();
  renderReleasePicker();
  renderSwitchModelPicker();
  renderManifestLoading(getSelectedSwitchModel());
  void loadManifestForSelectedModel();
}

const FIRMWARE_RELEASES: FirmwareReleaseOption[] = firmwareReleaseConfig.versions.map((release) => ({
  version: release.version as FirmwareReleaseVersion,
  recommended: release.recommended === true,
}));
const RELEASE_BY_VERSION = new Map(FIRMWARE_RELEASES.map((release) => [release.version, release]));
const DEFAULT_RELEASE_VERSION = firmwareReleaseConfig.defaultVersion as FirmwareReleaseVersion;
const SWITCH_MODELS: SwitchModelDefinition[] = firmwareVariantConfig.variants
  .map((variant) => ({
    id: variant.switchModelId,
    label: variant.switchModelLabel,
    description: variant.switchModelDescription,
    manifestFileName: variant.manifestFileName,
    boardLabel: variant.boardLabel,
    hidden: variant.hidden === true,
  }))
  .filter((variant) => !variant.hidden);

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
  firmwareReleaseField: document.getElementById("firmware-release-field") as HTMLElement,
  firmwareReleaseVersion: document.getElementById("firmware-release-version") as HTMLSelectElement,
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
let selectedReleaseVersion: FirmwareReleaseVersion = DEFAULT_RELEASE_VERSION;
let selectedSwitchModelId: SwitchModelId = DEFAULT_SWITCH_MODEL_ID;
let activeManifestLoadRequestId = 0;
let activeManifestLoadController: AbortController | null = null;

function findRelease(version: string): FirmwareReleaseOption {
  return RELEASE_BY_VERSION.get(version as FirmwareReleaseVersion) ?? FIRMWARE_RELEASES[0]!;
}

function findSwitchModel(modelId: string): SwitchModelDefinition {
  return SWITCH_MODEL_BY_ID.get(modelId as SwitchModelId) ?? DEFAULT_SWITCH_MODEL;
}

function getSelectedRelease(): FirmwareReleaseOption {
  return findRelease(selectedReleaseVersion);
}

function getSelectedSwitchModel(): SwitchModelDefinition {
  return findSwitchModel(selectedSwitchModelId);
}

function buildManifestPath(releaseVersion: FirmwareReleaseVersion, switchModel: SwitchModelDefinition): string {
  return `./firmware/${releaseVersion}/${switchModel.manifestFileName}`;
}

function formatReleaseLabel(release: FirmwareReleaseOption): string {
  return release.recommended
    ? t("firmware.releaseRecommended", { version: release.version })
    : release.version;
}

function renderReleasePicker(): void {
  els.firmwareReleaseField.classList.toggle("hidden", FIRMWARE_RELEASES.length <= 1);
  els.firmwareReleaseVersion.replaceChildren();

  for (const release of FIRMWARE_RELEASES) {
    const option = document.createElement("option");
    option.value = release.version;
    option.textContent = formatReleaseLabel(release);
    els.firmwareReleaseVersion.append(option);
  }

  selectedReleaseVersion = findRelease(selectedReleaseVersion).version;
  els.firmwareReleaseVersion.value = selectedReleaseVersion;
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
  const selectedSwitchModel = getSelectedSwitchModel();
  els.firmwareSwitchModelDescription.textContent = translateVariantDescription(
    selectedSwitchModel.id,
    selectedSwitchModel.description,
  );
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
    els.supportPill.textContent = t("support.availablePill");
    els.supportTitle.textContent = t("support.availableTitle");
    els.supportDetail.textContent = version
      ? t("support.availableDetail", { desktopLabel: formatDesktopLabel(version) })
      : t("support.availableDetailNoVersion");
    return;
  }

  setCardTone(els.supportCard, "warning");
  els.supportPill.textContent = t("support.unsupportedPill");
  els.supportTitle.textContent = t("support.unsupportedTitle");
  els.supportDetail.textContent = t("support.unsupportedDetail");
}

function renderDesktopRelease(version: string, desktopReleaseUrl: string): void {
  const desktopLabel = formatDesktopLabel(version);
  els.flashHint.textContent = t("flash.hintVersion", { desktopLabel });
  els.desktopDownloadLink.href = desktopReleaseUrl;
  els.desktopDownloadLink.textContent = t("next.downloadVersion", { desktopLabel });
  els.desktopStepLabel.textContent = desktopLabel;
  els.desktopFlowLabel.textContent = desktopLabel;
}

function renderFallbackDesktopRelease(): void {
  els.flashHint.textContent = t("flash.hint");
  els.desktopDownloadLink.href = fallbackDesktopReleaseUrl;
  els.desktopDownloadLink.textContent = t("next.downloadLatest");
  els.desktopStepLabel.textContent = t("next.latestLabel");
  els.desktopFlowLabel.textContent = t("next.latestLabel");
}

function renderManifest(manifest: FirmwareManifest, switchModel: SwitchModelDefinition): void {
  els.firmwareVersion.textContent = manifest.version;
  els.firmwareBoardLabel.textContent = translateBoardLabel(
    switchModel.id,
    manifest.metadata?.label ?? "ESP32-WROOM-32 / ESP-32S",
  );
  els.firmwareManifestPath.textContent = buildManifestPath(selectedReleaseVersion, switchModel);
  els.firmwareSwitchModelDescription.textContent =
    translateVariantDescription(
      switchModel.id,
      manifest.metadata?.switchModelDescription ?? switchModel.description,
    );
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
  setInstallButtonManifest(buildManifestPath(selectedReleaseVersion, switchModel));
}

function renderManifestLoading(switchModel: SwitchModelDefinition): void {
  els.firmwareVersion.textContent = t("firmware.loading");
  els.firmwareBoardLabel.textContent = translateBoardLabel(switchModel.id, switchModel.boardLabel);
  els.firmwareManifestPath.textContent = buildManifestPath(selectedReleaseVersion, switchModel);
  els.firmwareSwitchModelDescription.textContent = translateVariantDescription(
    switchModel.id,
    switchModel.description,
  );
  els.firmwarePartsList.innerHTML = "";
  els.firmwareShaList.innerHTML = "";
  renderBrowserSupport();
  renderFallbackDesktopRelease();
  setInstallButtonManifest();
}

function renderManifestLoadError(message: string, switchModel: SwitchModelDefinition): void {
  const manifestPath = buildManifestPath(selectedReleaseVersion, switchModel);
  els.firmwareVersion.textContent = `${message} (${manifestPath})`;
  els.firmwareBoardLabel.textContent = translateBoardLabel(switchModel.id, switchModel.boardLabel);
  els.firmwareManifestPath.textContent = manifestPath;
  els.firmwareSwitchModelDescription.textContent = translateVariantDescription(
    switchModel.id,
    switchModel.description,
  );
  els.firmwarePartsList.innerHTML = "";
  els.firmwareShaList.innerHTML = "";
  renderBrowserSupport();
  renderFallbackDesktopRelease();
  setInstallButtonManifest();
}

async function loadManifest(): Promise<void> {
  const release = getSelectedRelease();
  const switchModel = getSelectedSwitchModel();
  const requestId = ++activeManifestLoadRequestId;
  activeManifestLoadController?.abort();
  const controller = new AbortController();
  activeManifestLoadController = controller;
  renderManifestLoading(switchModel);

  try {
    const response = await fetch(buildManifestPath(release.version, switchModel), { signal: controller.signal });
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

async function loadManifestForSelectedModel(): Promise<void> {
  await loadManifest();
}

async function bootstrap(): Promise<void> {
  await i18next.init({
    lng: readInitialLanguage(),
    fallbackLng: ENGLISH_LANGUAGE,
    supportedLngs: [SOURCE_LANGUAGE, ENGLISH_LANGUAGE],
    resources: TRANSLATIONS,
    interpolation: { escapeValue: false },
  });
  const languageSelect = document.getElementById("language-select") as HTMLSelectElement | null;
  if (languageSelect) {
    languageSelect.value = i18next.language;
    languageSelect.addEventListener("change", () => {
      void changeLanguage(languageSelect.value);
    });
  }
  applyStaticTranslations();
  renderBrowserSupport();
  renderReleasePicker();
  renderSwitchModelPicker();

  els.firmwareReleaseVersion.addEventListener("change", () => {
    selectedReleaseVersion = findRelease(els.firmwareReleaseVersion.value).version;
    void loadManifest();
  });

  els.firmwareSwitchModel.addEventListener("change", () => {
    selectedSwitchModelId = findSwitchModel(els.firmwareSwitchModel.value).id;
    void loadManifestForSelectedModel();
  });
  await loadManifestForSelectedModel();
}

void bootstrap();
