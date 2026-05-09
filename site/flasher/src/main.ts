import "esp-web-tools/dist/web/install-button.js";
import { ESPLoader, Transport } from "esptool-js";
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
    desktopReleaseUrl?: string;
    label?: string;
    sha256?: Array<{
      path: string;
      value: string;
    }>;
  };
}

type InstallButtonElement = HTMLElement & {
  manifest?: string;
  showLog?: boolean;
  eraseFirst?: boolean;
};

interface FlashDetectionResult {
  chipName: string;
  flashBytes: number;
  flashId: number;
  usbSummary: string;
}

interface FlashDetectionCardState {
  tone: "idle" | "success" | "warning" | "error";
  pill: string;
  title: string;
  detail: string;
  buttonLabel: string;
  buttonDisabled: boolean;
}

const FLASH_DETECTION_BAUD_RATE = 115200;
const FLASH_DETECTION_BUTTON_LABEL = "检测当前开发板";
const SERIAL_PORT_FILTERS = [
  { usbVendorId: 0x10c4 }, // CP210x
  { usbVendorId: 0x1a86 }, // CH340 / CH9102
  { usbVendorId: 0x303a }, // Espressif USB
  { usbVendorId: 0x0403 }, // FTDI
] as const;

const silentLoaderTerminal = {
  clean(): void {},
  write(): void {},
  writeLine(): void {},
};

const els = {
  supportCard: document.getElementById("support-card") as HTMLElement,
  supportPill: document.getElementById("support-pill") as HTMLElement,
  supportTitle: document.getElementById("support-title") as HTMLElement,
  supportDetail: document.getElementById("support-detail") as HTMLElement,
  flashDetectCard: document.getElementById("flash-detect-card") as HTMLElement,
  flashDetectPill: document.getElementById("flash-detect-pill") as HTMLElement,
  flashDetectTitle: document.getElementById("flash-detect-title") as HTMLElement,
  flashDetectDetail: document.getElementById("flash-detect-detail") as HTMLElement,
  flashDetectButton: document.getElementById("flash-detect-button") as HTMLButtonElement,
  flashDetectChip: document.getElementById("flash-detect-chip") as HTMLElement,
  flashDetectSize: document.getElementById("flash-detect-size") as HTMLElement,
  flashDetectId: document.getElementById("flash-detect-id") as HTMLElement,
  flashDetectPort: document.getElementById("flash-detect-port") as HTMLElement,
  flashHint: document.getElementById("flash-hint") as HTMLElement,
  desktopDownloadLink: document.getElementById("desktop-download-link") as HTMLAnchorElement,
  desktopStepLabel: document.getElementById("desktop-step-label") as HTMLElement,
  desktopFlowLabel: document.getElementById("desktop-flow-label") as HTMLElement,
  firmwareVersion: document.getElementById("firmware-version") as HTMLElement,
  firmwareBoardLabel: document.getElementById("firmware-board-label") as HTMLElement,
  firmwarePartsList: document.getElementById("firmware-parts-list") as HTMLUListElement,
  firmwareShaList: document.getElementById("firmware-sha-list") as HTMLUListElement,
  firmwareInstallButton: document.getElementById("firmware-install-button") as InstallButtonElement,
};

const fallbackDesktopReleaseUrl = els.desktopDownloadLink.href;
let hasFlashDetectionResult = false;

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

function formatHex(value: number, width: number): string {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function formatFlashSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "未知";
  }

  if (bytes % (1024 * 1024) === 0) {
    return `${bytes / (1024 * 1024)} MB`;
  }

  if (bytes % 1024 === 0) {
    return `${bytes / 1024} KB`;
  }

  return `${bytes} B`;
}

function formatFlashId(flashId: number): string {
  const manufacturerId = flashId & 0xff;
  const deviceId = (flashId >>> 8) & 0xffff;
  return `MFR 0x${formatHex(manufacturerId, 2)} / DEV 0x${formatHex(deviceId, 4)}`;
}

function formatUsbSummary(portInfo: SerialPortInfo): string {
  const parts: string[] = [];

  if (typeof portInfo.usbVendorId === "number") {
    parts.push(`VID 0x${formatHex(portInfo.usbVendorId, 4)}`);
  }

  if (typeof portInfo.usbProductId === "number") {
    parts.push(`PID 0x${formatHex(portInfo.usbProductId, 4)}`);
  }

  return parts.length > 0 ? parts.join(" / ") : "浏览器未提供 USB VID/PID";
}

function renderFlashDetectionDetails(result?: FlashDetectionResult): void {
  els.flashDetectChip.textContent = result?.chipName ?? "-";
  els.flashDetectSize.textContent = result ? formatFlashSize(result.flashBytes) : "-";
  els.flashDetectId.textContent = result ? formatFlashId(result.flashId) : "-";
  els.flashDetectPort.textContent = result?.usbSummary ?? "-";
}

function renderFlashDetectionCard(state: FlashDetectionCardState): void {
  setCardTone(els.flashDetectCard, state.tone);
  els.flashDetectPill.textContent = state.pill;
  els.flashDetectTitle.textContent = state.title;
  els.flashDetectDetail.textContent = state.detail;
  els.flashDetectButton.textContent = state.buttonLabel;
  els.flashDetectButton.disabled = state.buttonDisabled;
}

function renderFlashDetectionIntro(): void {
  if (!browserSupportsWebSerial()) {
    renderFlashDetectionDetails();
    renderFlashDetectionCard({
      tone: "warning",
      pill: "不可用",
      title: "当前浏览器不支持串口检测",
      detail: "请改用桌面版 Chrome 或 Edge 打开这个页面，再读取开发板的 Flash 容量。",
      buttonLabel: FLASH_DETECTION_BUTTON_LABEL,
      buttonDisabled: true,
    });
    return;
  }

  if (!hasFlashDetectionResult) {
    renderFlashDetectionDetails();
  }

  renderFlashDetectionCard({
    tone: "idle",
    pill: "待检测",
    title: "还没有读取开发板信息",
    detail: "点击下方按钮后，浏览器会请求串口权限，然后尝试进入 bootloader 读取当前板子的 Flash 容量。",
    buttonLabel: FLASH_DETECTION_BUTTON_LABEL,
    buttonDisabled: false,
  });
}

function describeFlashDetectionError(error: unknown): Pick<
  FlashDetectionCardState,
  "tone" | "pill" | "title" | "detail"
> {
  const message = error instanceof Error ? error.message : String(error);

  if (error instanceof DOMException && error.name === "NotFoundError") {
    return {
      tone: "warning",
      pill: "已取消",
      title: "这次没有选择串口",
      detail: "你关闭了串口选择窗口。准备好开发板后，再点一次“检测当前开发板”即可。",
    };
  }

  if (error instanceof DOMException && error.name === "InvalidStateError") {
    return {
      tone: "error",
      pill: "串口忙碌",
      title: "串口当前不可用",
      detail: "这个串口可能已经被桌面版、串口监视器或其他网页占用。请先关闭它们，再重新检测。",
    };
  }

  if (message.includes("Failed to connect with the device")) {
    return {
      tone: "error",
      pill: "连接失败",
      title: "没能让开发板进入 bootloader",
      detail: "请确认使用的是可传输数据的 USB 线；如果板子不支持自动进下载模式，请按住 BOOT 再点击检测。",
    };
  }

  return {
    tone: "error",
    pill: "检测失败",
    title: "读取 Flash 容量时出了点问题",
    detail: message,
  };
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

async function detectFlashOnConnectedBoard(): Promise<FlashDetectionResult> {
  const serial = navigator.serial;
  if (!serial) {
    throw new Error("当前浏览器不支持 Web Serial。");
  }

  const port = await serial.requestPort({ filters: [...SERIAL_PORT_FILTERS] });
  const transport = new Transport(port, false);
  const loader = new ESPLoader({
    transport,
    baudrate: FLASH_DETECTION_BAUD_RATE,
    romBaudrate: FLASH_DETECTION_BAUD_RATE,
    terminal: silentLoaderTerminal,
  });

  try {
    await loader.detectChip();
    const flashId = await loader.readFlashId();
    const flashBytes = loader.DETECTED_FLASH_SIZES_NUM[(flashId >>> 16) & 0xff];

    if (!flashBytes) {
      throw new Error(`读到了 Flash ID，但没法识别容量：0x${formatHex(flashId, 6)}`);
    }

    return {
      chipName: loader.chip?.CHIP_NAME ?? "ESP32",
      flashBytes,
      flashId,
      usbSummary: formatUsbSummary(port.getInfo()),
    };
  } finally {
    try {
      await loader.after("hard_reset");
    } catch {
      // Ignore reset cleanup errors so we can still release the serial port.
    }

    try {
      await transport.disconnect();
    } catch {
      // Ignore disconnect cleanup errors after detection attempts.
    }
  }
}

async function handleFlashDetection(): Promise<void> {
  if (!browserSupportsWebSerial()) {
    renderFlashDetectionIntro();
    return;
  }

  hasFlashDetectionResult = false;
  renderFlashDetectionDetails();
  renderFlashDetectionCard({
    tone: "idle",
    pill: "检测中",
    title: "正在读取开发板信息",
    detail: "浏览器会短暂接管串口并尝试让开发板进入 bootloader，请暂时不要关闭串口权限弹窗。",
    buttonLabel: "检测中...",
    buttonDisabled: true,
  });

  try {
    const result = await detectFlashOnConnectedBoard();
    hasFlashDetectionResult = true;
    renderFlashDetectionDetails(result);
    renderFlashDetectionCard({
      tone: "success",
      pill: "已识别",
      title: `检测到 ${formatFlashSize(result.flashBytes)} SPI Flash`,
      detail: `当前开发板已识别为 ${result.chipName}，这个结果可以直接拿来判断你手上的板子是 4MB、8MB 还是 16MB。`,
      buttonLabel: FLASH_DETECTION_BUTTON_LABEL,
      buttonDisabled: false,
    });
  } catch (error) {
    const description = describeFlashDetectionError(error);
    renderFlashDetectionCard({
      ...description,
      buttonLabel: FLASH_DETECTION_BUTTON_LABEL,
      buttonDisabled: false,
    });
  }
}

function renderDesktopRelease(version: string, desktopReleaseUrl: string): void {
  const desktopLabel = formatDesktopLabel(version);
  els.flashHint.textContent = `如果刷机后串口重新枚举或临时断开，这是正常现象。下一步请下载 ${desktopLabel} 继续使用。`;
  els.desktopDownloadLink.href = desktopReleaseUrl;
  els.desktopDownloadLink.textContent = `下载 ${desktopLabel}`;
  els.desktopStepLabel.textContent = desktopLabel;
  els.desktopFlowLabel.textContent = desktopLabel;
}

function renderManifest(manifest: FirmwareManifest): void {
  els.firmwareVersion.textContent = manifest.version;
  els.firmwareBoardLabel.textContent = manifest.metadata?.label ?? "ESP32-WROOM-32 / ESP-32S";
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
  els.firmwareInstallButton.manifest = "./firmware/manifest.json";
  els.firmwareInstallButton.showLog = true;
  els.firmwareInstallButton.eraseFirst = false;
}

async function loadManifest(): Promise<void> {
  try {
    const response = await fetch("./firmware/manifest.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const manifest = (await response.json()) as FirmwareManifest;
    renderManifest(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    els.firmwareVersion.textContent = message;
    els.firmwareBoardLabel.textContent = "-";
    els.firmwarePartsList.innerHTML = "";
    els.firmwareShaList.innerHTML = "";
  }
}

async function bootstrap(): Promise<void> {
  renderBrowserSupport();
  renderFlashDetectionIntro();
  els.flashDetectButton.addEventListener("click", () => {
    void handleFlashDetection();
  });
  await loadManifest();
}

void bootstrap();
