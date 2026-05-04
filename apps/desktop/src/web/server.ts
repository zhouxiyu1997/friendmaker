import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { generateDrawPlan } from "../app/generateDrawPlan.js";
import { buildRecoveryExecutionPlan, deriveResumeProgress } from "../app/recovery.js";
import { applyCliOptions, type CliOptions } from "../cli/args.js";
import { loadProfile } from "../config/loadProfile.js";
import { OFFICIAL_COLOR_GRID } from "../config/officialPalette.js";
import {
  getDrawingTemplateDefinition,
  listDrawingTemplates,
  loadDrawingTemplateMask,
} from "../drawingTemplates.js";
import {
  FirmwareToolingManager,
  type ToolingConfig,
} from "./firmwareTooling.js";
import {
  WindowsSerialDriverManager,
  type WindowsSerialDriverId,
} from "./windowsSerialDrivers.js";
import { listPortInfos, preferSerialPath } from "../serial/listPorts.js";
import {
  SerialSessionManager,
  type SerialSessionSnapshot,
} from "../serial/sender.js";
import { SimulatedAckSender } from "../simulator/sender.js";
import type { ResumePlan, SenderControls } from "../types.js";
import {
  RecoverySessionStore,
  applyRecoveryProgress,
  applyRecoveryStatus,
  summarizeRecoverySession,
  type RecoveryProfileSummary,
  type RecoverySessionRecord,
  type RecoverySessionSummary,
} from "./recoverySessions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const defaultStaticRoot = path.join(__dirname, "static");
const defaultFirmwareRoot = resolveDefaultFirmwareRoot();
const defaultWindowsDriverRoot = resolveDefaultWindowsDriverRoot();
function resolveDefaultRecoverySessionsRoot(): string {
  const homeDocumentsRoot = path.join(os.homedir(), "Documents");

  if (process.platform !== "win32") {
    return path.join(homeDocumentsRoot, "FriendMaker", "recovery-sessions");
  }

  const oneDriveRoot =
    process.env.OneDriveConsumer?.trim() ||
    process.env.OneDriveCommercial?.trim() ||
    process.env.OneDrive?.trim() ||
    "";
  const userProfileRoot = process.env.USERPROFILE?.trim() || "";
  const windowsCandidates = [
    oneDriveRoot ? path.join(oneDriveRoot, "Documents") : "",
    userProfileRoot ? path.join(userProfileRoot, "Documents") : "",
    homeDocumentsRoot,
  ].filter((candidate) => candidate.length > 0);
  const documentsRoot =
    windowsCandidates.find((candidate) => existsSync(candidate)) ?? windowsCandidates[0] ?? homeDocumentsRoot;

  return path.join(documentsRoot, "FriendMaker", "recovery-sessions");
}

const defaultRecoverySessionsRoot = resolveDefaultRecoverySessionsRoot();
const defaultHost = "127.0.0.1";
const defaultPort = 4307;
const defaultAppDataRoot = path.join(os.homedir(), ".friend-maker");
const MAX_FIRMWARE_FLASH_LOG_LINES = 800;
const FIRMWARE_FLASH_TIMEOUT_MS = 15 * 60 * 1_000;
const FIRMWARE_FLASH_CANCEL_GRACE_MS = 5_000;
const serialSessionManager = new SerialSessionManager();

export interface StartWebServerOptions {
  host?: string;
  port?: number;
  staticRoot?: string;
  firmwareRoot?: string;
  windowsDriverRoot?: string;
  appDataRoot?: string;
  recoverySessionsRoot?: string;
  toolingPaths?: ToolingConfig;
}

export interface WebServerHandle {
  server: Server;
  host: string;
  port: number;
  url: string;
  close: () => Promise<void>;
}

interface WebRuntimeConfig {
  host: string;
  port: number;
  staticRoot: string;
  firmwareRoot: string;
  toolingManager: FirmwareToolingManager;
  windowsSerialDriverManager: WindowsSerialDriverManager;
  flashManager: FirmwareFlashManager;
  recoverySessions: RecoverySessionStore;
}

let webRuntime: WebRuntimeConfig = {
  host: defaultHost,
  port: defaultPort,
  staticRoot: defaultStaticRoot,
  firmwareRoot: defaultFirmwareRoot,
  toolingManager: new FirmwareToolingManager({ appDataRoot: defaultAppDataRoot }),
  windowsSerialDriverManager: new WindowsSerialDriverManager(defaultWindowsDriverRoot),
  flashManager: null as unknown as FirmwareFlashManager,
  recoverySessions: new RecoverySessionStore(defaultRecoverySessionsRoot),
};

function resolveDefaultFirmwareRoot(): string {
  const fallback = path.join(repoRoot, "firmware", "esp32");
  const candidates = [
    fallback,
    path.resolve(__dirname, "..", "..", "..", "..", "..", "firmware", "esp32"),
  ];

  return candidates.find((candidate) => existsSync(path.join(candidate, "platformio.ini"))) ?? fallback;
}

function resolveDefaultWindowsDriverRoot(): string {
  const fallback = path.join(repoRoot, "drivers", "windows");
  const candidates = [
    fallback,
    path.resolve(__dirname, "..", "..", "..", "..", "..", "drivers", "windows"),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? fallback;
}

const FIRMWARE_ENVIRONMENTS = [
  {
    id: "esp32dev_wireless",
    label: "ESP32-WROOM-32 / ESP-32S",
    description: "推荐主线，显式兼容常见 2MB flash 通用板，最终用于 Bluetooth Classic 模拟 Switch Pro 手柄。",
    recommended: true,
  },
  {
    id: "nodemcu_32s_wireless",
    label: "NodeMCU-32S",
    description: "适合丝印或卖家标注为 NodeMCU-32S 的兼容板。",
    recommended: false,
  },
  {
    id: "xiao_esp32c3_serial",
    label: "XIAO ESP32-C3（串口测试）",
    description: "仅用于协议、ACK 和串口联调，不是最终的 Switch Pro 路线。",
    recommended: false,
  },
] as const;

type FirmwareEnvironmentId = (typeof FIRMWARE_ENVIRONMENTS)[number]["id"];
const VALID_BRUSH_SIZES = new Set([1, 3, 7, 13, 19, 27] as const);
type ExecutionTarget = "simulate" | "serial";
type ExecutionStatus = "idle" | "running" | "paused" | "stopping" | "completed" | "failed" | "stopped";
type FirmwareFlashStatus = "idle" | "running" | "completed" | "failed" | "cancelled";
type ExecutionProgressUpdate = { index: number; total: number; command: string };

interface ExecutionStartProfileSummary extends RecoveryProfileSummary {}

interface ManagedExecution {
  id: number | null;
  status: ExecutionStatus;
  target: ExecutionTarget;
  portPath: string | null;
  baudRate: number | null;
  totalCommands: number;
  completedCommands: number;
  currentCommand: string | null;
  lines: string[];
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  sender: SenderControls | null;
  progressMap: number[] | null;
  recoverySession: RecoverySessionRecord | null;
}

let executionCounter = 0;

function createEmptyExecution(): ManagedExecution {
  return {
    id: null,
    status: "idle",
    target: "serial",
    portPath: null,
    baudRate: null,
    totalCommands: 0,
    completedCommands: 0,
    currentCommand: null,
    lines: [],
    startedAt: null,
    finishedAt: null,
    error: null,
    sender: null,
    progressMap: null,
    recoverySession: null,
  };
}

let managedExecution: ManagedExecution = createEmptyExecution();

function resetManagedExecutionState(): void {
  managedExecution = createEmptyExecution();
}

class ManagedSerialSessionSender implements SenderControls {
  private paused = false;
  private stopped = false;
  private interruptAckWait: (() => void) | null = null;

  constructor(private readonly sessionManager: SerialSessionManager) {}

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  stop(): void {
    this.stopped = true;
  }

  forceStop(): void {
    this.stopped = true;
    this.interruptAckWait?.();
    this.interruptAckWait = null;
    void this.sessionManager.disconnect({ force: true }).catch(() => {
      // Forced stop uses disconnect only to interrupt a blocking ACK wait.
    });
  }

  async send(
    commands: string[],
    options: {
      path: string;
      baudRate: number;
      ackTimeoutMs: number;
      retries: number;
      onProgress?: (progress: { index: number; total: number; command: string }) => Promise<void> | void;
      onDeviceLine?: (line: string) => void;
    },
  ): Promise<void> {
    this.paused = false;
    this.stopped = false;

    await this.sessionManager.send(commands, {
      path: options.path,
      baudRate: options.baudRate,
      ackTimeoutMs: options.ackTimeoutMs,
      retries: options.retries,
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      ...(options.onDeviceLine ? { onDeviceLine: options.onDeviceLine } : {}),
      beforeCommand: () => this.waitWhilePaused(),
      shouldStop: () => this.stopped,
      onInterruptReady: (interrupt) => {
        this.interruptAckWait = interrupt;
      },
    });
  }

  private async waitWhilePaused(): Promise<void> {
    while (this.paused && !this.stopped) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

function json(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function getContentType(filePath: string): string {
  if (filePath.endsWith(".png")) {
    return "image/png";
  }

  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (filePath.endsWith(".webp")) {
    return "image/webp";
  }

  if (filePath.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (filePath.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }

  return "text/html; charset=utf-8";
}

async function serveStatic(response: ServerResponse, fileName: string): Promise<void> {
  await serveStaticAsset(response, fileName);
}

async function serveStaticAsset(
  response: ServerResponse,
  relativePath: string,
  options: { headOnly?: boolean } = {},
): Promise<void> {
  const filePath = path.resolve(webRuntime.staticRoot, relativePath);
  const staticRoot = path.resolve(webRuntime.staticRoot);

  if (!isSafeStaticAssetPath(relativePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const content = await readFile(filePath);
  response.writeHead(200, { "content-type": getContentType(filePath) });

  if (options.headOnly) {
    response.end();
    return;
  }

  response.end(content);
}

function isSafeStaticAssetPath(relativePath: string): boolean {
  if (!relativePath) {
    return false;
  }

  const filePath = path.resolve(webRuntime.staticRoot, relativePath);
  const staticRoot = path.resolve(webRuntime.staticRoot);

  if (filePath === staticRoot || !filePath.startsWith(`${staticRoot}${path.sep}`)) {
    return false;
  }

  return existsSync(filePath);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.length > 0 ? JSON.parse(raw) : {};
}

function decodeDataUrl(dataUrl: string): Buffer {
  const match = /^data:.*?;base64,(.+)$/u.exec(dataUrl);

  if (!match?.[1]) {
    throw new Error("Invalid image payload.");
  }

  return Buffer.from(match[1], "base64");
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

async function resolvePlatformIoPath(): Promise<string | null> {
  const platformIo = await webRuntime.toolingManager.resolvePlatformIo();
  return platformIo.path;
}

interface FirmwareFlashSnapshot {
  status: FirmwareFlashStatus;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  environmentId: FirmwareEnvironmentId | null;
  environmentLabel: string | null;
  selectedPortPath: string | null;
  uploadPortPath: string | null;
  fallbackToAutoDetect: boolean;
  platformIoPath: string | null;
  timeoutMs: number;
  lineOffset: number;
  totalLineCount: number;
  lines: string[];
}

interface LoggedError extends Error {
  logged?: boolean;
}

function createIdleFirmwareFlashState(): FirmwareFlashSnapshot {
  return {
    status: "idle",
    startedAt: null,
    finishedAt: null,
    error: null,
    environmentId: null,
    environmentLabel: null,
    selectedPortPath: null,
    uploadPortPath: null,
    fallbackToAutoDetect: false,
    platformIoPath: null,
    timeoutMs: FIRMWARE_FLASH_TIMEOUT_MS,
    lineOffset: 0,
    totalLineCount: 0,
    lines: [],
  };
}

function markLogged(error: Error): LoggedError {
  const loggedError = error as LoggedError;
  loggedError.logged = true;
  return loggedError;
}

export function isUploadPortFailure(message: string): boolean {
  return /Timed out waiting for packet header|Failed to connect|No serial data received|No upload port found|could not open port|cannot configure port|Serial port .* not found|Access is denied|Permission denied|PermissionError|Resource temporarily unavailable|No such file or directory|port doesn't exist|A fatal error occurred/i
    .test(message);
}

export function summarizePlatformIoFailure(output: string, exitCode: number | null): string {
  const lines = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("$ "));

  const priorityPatterns = [
    /A fatal error occurred:/iu,
    /Timed out waiting for packet header/iu,
    /Failed to connect/iu,
    /No serial data received/iu,
    /No upload port found/iu,
    /could not open port/iu,
    /cannot configure port/iu,
    /Permission(?:Error| denied)/iu,
    /Access is denied/iu,
    /Resource temporarily unavailable/iu,
    /^Error:/iu,
    /^Exception:/iu,
  ];

  for (const pattern of priorityPatterns) {
    const match = lines.find((line) => pattern.test(line));
    if (match) {
      return match;
    }
  }

  return lines.at(-1) ?? `PlatformIO exited with code ${String(exitCode ?? "unknown")}`;
}

function getFirmwareEnvironment(environmentId: string): (typeof FIRMWARE_ENVIRONMENTS)[number] {
  const environment = FIRMWARE_ENVIRONMENTS.find((item) => item.id === environmentId);

  if (!environment) {
    throw new Error(`Unsupported firmware environment: ${environmentId}`);
  }

  return environment;
}

class FirmwareFlashManager {
  private state: FirmwareFlashSnapshot = createIdleFirmwareFlashState();
  private child: ReturnType<typeof spawn> | null = null;
  private timeoutTimer: NodeJS.Timeout | null = null;
  private cancelTimer: NodeJS.Timeout | null = null;
  private cancelRequested = false;
  private stopReason: string | null = null;

  getStatus(): FirmwareFlashSnapshot {
    return {
      ...this.state,
      lines: [...this.state.lines],
    };
  }

  async start(options: {
    environmentId: FirmwareEnvironmentId;
    portPath: string;
  }): Promise<FirmwareFlashSnapshot> {
    if (this.state.status === "running") {
      throw new Error("A firmware flash is already running.");
    }

    const environment = getFirmwareEnvironment(options.environmentId);
    const selectedPortPath = preferSerialPath(options.portPath);
    const session = await serialSessionManager.disconnect();

    this.state = {
      ...createIdleFirmwareFlashState(),
      status: "running",
      startedAt: Date.now(),
      environmentId: environment.id,
      environmentLabel: environment.label,
      selectedPortPath,
    };
    this.cancelRequested = false;
    this.stopReason = null;

    this.appendLine(`INFO flashing environment=${environment.id} label=${environment.label}`);
    this.appendLine(`INFO selected upload port=${selectedPortPath}`);
    this.appendLine(`INFO flash timeout=${formatDuration(FIRMWARE_FLASH_TIMEOUT_MS)}`);
    if (session.connected) {
      this.appendLine(
        `INFO released serial session port=${session.portPath ?? selectedPortPath} baud=${session.baudRate ?? "-"}`,
      );
    } else {
      this.appendLine("INFO no active serial session to release before flashing");
    }

    void this.runFlash(environment, selectedPortPath);
    return this.getStatus();
  }

  async cancel(): Promise<FirmwareFlashSnapshot> {
    if (this.state.status !== "running") {
      throw new Error("No firmware flash is currently running.");
    }

    this.cancelRequested = true;
    this.stopReason = "Firmware flash cancelled by user.";
    this.appendLine("WARN firmware flash cancel requested");
    this.clearTimeoutTimer();

    if (this.child) {
      this.child.kill();
      this.scheduleForceKill();
    }

    return this.getStatus();
  }

  async shutdown(): Promise<void> {
    this.cancelRequested = true;
    this.stopReason = "Firmware flash stopped during app shutdown.";
    this.clearTimeoutTimer();
    this.clearCancelTimer();
    this.child?.kill("SIGKILL");
    this.child = null;
  }

  private async runFlash(
    environment: (typeof FIRMWARE_ENVIRONMENTS)[number],
    selectedPortPath: string,
  ): Promise<void> {
    try {
      const platformIoPath = await resolvePlatformIoPath();
      if (!platformIoPath) {
        throw new Error("PlatformIO not found. Install it first or set PLATFORMIO_BIN.");
      }

      this.state.platformIoPath = platformIoPath;
      this.appendLine(`INFO PlatformIO=${platformIoPath}`);
      this.appendLine(`INFO firmware root=${webRuntime.firmwareRoot}`);

      if (this.cancelRequested) {
        throw markLogged(new Error(this.stopReason ?? "Firmware flash cancelled by user."));
      }

      const detectedPortPaths = await this.listDetectedPorts();
      const selectedPortDetected =
        detectedPortPaths.length === 0 || detectedPortPaths.includes(selectedPortPath);

      if (this.cancelRequested) {
        throw markLogged(new Error(this.stopReason ?? "Firmware flash cancelled by user."));
      }

      if (!selectedPortDetected) {
        this.state.uploadPortPath = null;
        this.state.fallbackToAutoDetect = true;
        this.appendLine(
          `WARN selected port ${selectedPortPath} is no longer detected. Falling back to PlatformIO auto-detect.`,
        );
        await this.runPlatformIoUpload(environment.id, null);
        this.finish("completed", null);
        return;
      }

      this.state.uploadPortPath = selectedPortPath;

      try {
        await this.runPlatformIoUpload(environment.id, selectedPortPath);
        this.finish("completed", null);
        return;
      } catch (error) {
        if (this.cancelRequested) {
          throw error;
        }

        const message = error instanceof Error ? error.message : String(error);
        if (!isUploadPortFailure(message)) {
          throw error;
        }

        if (this.cancelRequested) {
          throw markLogged(new Error(this.stopReason ?? "Firmware flash cancelled by user."));
        }

        this.state.uploadPortPath = null;
        this.state.fallbackToAutoDetect = true;
        this.appendLine(
          `WARN upload on ${selectedPortPath} failed with a port-related error. Retrying with PlatformIO auto-detect.`,
        );
        await this.runPlatformIoUpload(environment.id, null);
        this.finish("completed", null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!(error instanceof Error) || !(error as LoggedError).logged) {
        this.appendLine(`ERR ${message}`);
      }

      this.finish(
        this.cancelRequested && !/timed out/i.test(this.stopReason ?? "") ? "cancelled" : "failed",
        message,
      );
    }
  }

  private async listDetectedPorts(): Promise<string[]> {
    try {
      const ports = await listPortInfos();
      const portPaths = ports.map((port) => port.path);

      if (portPaths.length > 0) {
        this.appendLine(`INFO detected serial ports=${portPaths.join(", ")}`);
      } else {
        this.appendLine("WARN no serial ports detected before flashing; PlatformIO will still try.");
      }

      return portPaths;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.appendLine(`WARN failed to refresh serial ports before flashing: ${message}`);
      return [];
    }
  }

  private async runPlatformIoUpload(
    environmentId: FirmwareEnvironmentId,
    uploadPortPath: string | null,
  ): Promise<void> {
    const platformIoPath = this.state.platformIoPath;
    if (!platformIoPath) {
      throw new Error("PlatformIO not found. Install it first or set PLATFORMIO_BIN.");
    }

    const args = [
      "run",
      "-e",
      environmentId,
      "-t",
      "upload",
      ...(uploadPortPath ? ["--upload-port", uploadPortPath] : []),
    ];
    const platformIoEnv = await webRuntime.toolingManager.getPlatformIoEnv();

    this.appendLine(
      uploadPortPath
        ? `INFO trying explicit upload port ${uploadPortPath}`
        : "INFO trying PlatformIO auto-detect for the upload port",
    );
    this.appendLine(`$ ${platformIoPath} ${args.join(" ")}`);

    await new Promise<void>((resolve, reject) => {
      const child = spawn(platformIoPath, args, {
        cwd: webRuntime.firmwareRoot,
        env: platformIoEnv,
      });
      this.child = child;

      let settled = false;
      let bufferedOutput = "";
      let output = `$ ${platformIoPath} ${args.join(" ")}\n`;

      const cleanup = (): void => {
        this.clearTimeoutTimer();
        this.clearCancelTimer();
        if (this.child === child) {
          this.child = null;
        }
      };

      const finish = (callback: () => void): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        callback();
      };

      const flushBufferedOutput = (): void => {
        const remainingLine = bufferedOutput.trim();
        if (!remainingLine) {
          return;
        }

        this.appendLine(remainingLine);
        output += `${remainingLine}\n`;
        bufferedOutput = "";
      };

      const handleChunk = (chunk: string | Buffer): void => {
        bufferedOutput += chunk.toString();
        const lines = bufferedOutput.split(/\r?\n/u);
        bufferedOutput = lines.pop() ?? "";

        lines
          .map((line) => line.trimEnd())
          .filter((line) => line.length > 0)
          .forEach((line) => {
            this.appendLine(line);
            output += `${line}\n`;
          });
      };

      child.stdout.on("data", handleChunk);
      child.stderr.on("data", handleChunk);
      child.on("error", (error) => {
        finish(() => reject(error));
      });
      child.on("close", (exitCode) => {
        flushBufferedOutput();

        if (this.cancelRequested) {
          finish(() =>
            reject(markLogged(new Error(this.stopReason ?? "Firmware flash cancelled by user."))),
          );
          return;
        }

        if (exitCode === 0) {
          finish(resolve);
          return;
        }

        const message = summarizePlatformIoFailure(output, exitCode);
        finish(() => reject(markLogged(new Error(message))));
      });

      this.timeoutTimer = setTimeout(() => {
        const timeoutMessage = `Firmware flash timed out after ${formatDuration(FIRMWARE_FLASH_TIMEOUT_MS)}.`;
        this.appendLine(`ERR ${timeoutMessage}`);
        this.cancelRequested = true;
        this.stopReason = timeoutMessage;
        child.kill();
        this.scheduleForceKill();
      }, FIRMWARE_FLASH_TIMEOUT_MS);
    });
  }

  private finish(status: Exclude<FirmwareFlashStatus, "idle" | "running">, error: string | null): void {
    this.clearTimeoutTimer();
    this.clearCancelTimer();
    this.child = null;

    this.state.status = status;
    this.state.finishedAt = Date.now();
    this.state.error = error;

    if (status === "completed") {
      this.appendLine("INFO firmware flash completed");
      return;
    }

    if (status === "cancelled") {
      this.appendLine("WARN firmware flash cancelled");
      return;
    }

    this.appendLine("ERR firmware flash failed");
  }

  private appendLine(line: string): void {
    this.state.totalLineCount += 1;
    this.state.lines.push(line);

    if (this.state.lines.length > MAX_FIRMWARE_FLASH_LOG_LINES) {
      this.state.lines.splice(0, this.state.lines.length - MAX_FIRMWARE_FLASH_LOG_LINES);
    }

    this.state.lineOffset = this.state.totalLineCount - this.state.lines.length;
  }

  private clearTimeoutTimer(): void {
    if (!this.timeoutTimer) {
      return;
    }

    clearTimeout(this.timeoutTimer);
    this.timeoutTimer = null;
  }

  private clearCancelTimer(): void {
    if (!this.cancelTimer) {
      return;
    }

    clearTimeout(this.cancelTimer);
    this.cancelTimer = null;
  }

  private scheduleForceKill(): void {
    this.clearCancelTimer();
    this.cancelTimer = setTimeout(() => {
      this.child?.kill("SIGKILL");
    }, FIRMWARE_FLASH_CANCEL_GRACE_MS);
  }
}

function withDefined<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function normalizeBrushSize(value: unknown, fallback: 1 | 3 | 7 | 13 | 19 | 27): 1 | 3 | 7 | 13 | 19 | 27 {
  return typeof value === "number" && VALID_BRUSH_SIZES.has(value as 1 | 3 | 7 | 13 | 19 | 27)
    ? (value as 1 | 3 | 7 | 13 | 19 | 27)
    : fallback;
}

function normalizeImageScalePercent(value: unknown, fallback = 100): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(25, Math.min(200, Math.round(value)));
}

function normalizeImageOffsetPercent(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(-100, Math.min(100, Math.round(value)));
}

function normalizeRecoveryProfileSummary(value: unknown): ExecutionStartProfileSummary {
  const summary = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    brushSize: normalizeBrushSize(summary.brushSize, 3),
    colorMode:
      summary.colorMode === "official" || summary.colorMode === "palette" ? summary.colorMode : "mono",
    templateId: typeof summary.templateId === "string" ? summary.templateId : "none",
    templateLabel: typeof summary.templateLabel === "string" ? summary.templateLabel : "无模板（正方形）",
    imageScalePercent: normalizeImageScalePercent(summary.imageScalePercent),
    imageOffsetXPercent: normalizeImageOffsetPercent(summary.imageOffsetXPercent),
    imageOffsetYPercent: normalizeImageOffsetPercent(summary.imageOffsetYPercent),
  };
}

function isManagedExecutionActive(status: ExecutionStatus): boolean {
  return status === "running" || status === "paused" || status === "stopping";
}

function appendManagedExecutionLine(execution: ManagedExecution, line: string): void {
  execution.lines.push(line);

  if (execution.lines.length > 400) {
    execution.lines.splice(0, execution.lines.length - 400);
  }
}

function getManagedExecutionRecoverySummary(
  execution: ManagedExecution,
): RecoverySessionSummary | null {
  return execution.recoverySession ? summarizeRecoverySession(execution.recoverySession) : null;
}

function snapshotManagedExecution(execution: ManagedExecution = managedExecution): Record<string, unknown> {
  return {
    id: execution.id,
    status: execution.status,
    target: execution.target,
    portPath: execution.portPath,
    baudRate: execution.baudRate,
    totalCommands: execution.totalCommands,
    completedCommands: execution.completedCommands,
    currentCommand: execution.currentCommand,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    error: execution.error,
    lines: execution.lines,
    recoverySessionId: execution.recoverySession?.jobId ?? null,
    recoverySession: getManagedExecutionRecoverySummary(execution),
  };
}

async function updateRecoverySessionProgress(
  execution: ManagedExecution,
  completedCommands: number,
): Promise<void> {
  if (!execution.recoverySession) {
    return;
  }

  applyRecoveryProgress(execution.recoverySession, completedCommands);
  await webRuntime.recoverySessions.writeSession(execution.recoverySession);
}

async function updateRecoverySessionStatus(
  execution: ManagedExecution,
  status: "running" | "paused" | "recoverable" | "completed",
  error: string | null = null,
): Promise<void> {
  if (!execution.recoverySession) {
    return;
  }

  applyRecoveryStatus(execution.recoverySession, status, error);
  await webRuntime.recoverySessions.writeSession(execution.recoverySession);
}

function resolveRecoveryTerminalStatus(execution: ManagedExecution): "recoverable" | "completed" {
  const nextResumeSegmentIndex = execution.recoverySession?.nextResumeSegmentIndex ?? null;
  return nextResumeSegmentIndex === null ? "completed" : "recoverable";
}

function makeCliOverrides(input: {
  size?: number;
  width?: number;
  height?: number;
  colors?: number;
  threshold?: number;
  resizeMode?: "contain" | "cover";
  mode?: "mono" | "palette" | "official";
  palette?: string[];
}): CliOptions {
  return {
    send: false,
    simulateDevice: false,
    listPorts: false,
    previewScale: 12,
    help: false,
    ...withDefined({
      size: input.size,
      width: input.width,
      height: input.height,
      colors: input.colors,
      threshold: input.threshold,
      resizeMode: input.resizeMode,
      mode: input.mode,
      palette: input.palette,
    }),
  };
}

async function handleGenerate(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = (await readJsonBody(request)) as {
    imageDataUrl?: string;
    profile?: string;
    templateId?: string;
    size?: number;
    brushSize?: number;
    imageScalePercent?: number;
    imageOffsetXPercent?: number;
    imageOffsetYPercent?: number;
    width?: number;
    height?: number;
    threshold?: number;
    mode?: "mono" | "palette" | "official";
    colors?: number;
    resizeMode?: "contain" | "cover";
    palette?: string[];
    previewScale?: number;
    removeBackground?: boolean;
  };

  if (!body.imageDataUrl) {
    json(response, 400, { error: "Missing imageDataUrl." });
    return;
  }

  const loadedProfile = await loadProfile(body.profile);
  const baseProfile = applyCliOptions(
    loadedProfile,
    makeCliOverrides(
      withDefined({
        size: body.size,
        width: body.width,
        height: body.height,
        colors: body.colors,
        threshold: body.threshold,
        resizeMode: body.resizeMode ?? loadedProfile.resizeMode,
        mode: body.mode,
        palette: body.palette,
      }),
    ),
  );
  const imageScalePercent = normalizeImageScalePercent(body.imageScalePercent);
  const imageOffsetXPercent = normalizeImageOffsetPercent(body.imageOffsetXPercent);
  const imageOffsetYPercent = normalizeImageOffsetPercent(body.imageOffsetYPercent);
  const template = getDrawingTemplateDefinition(body.templateId ?? "none");

  if (!template) {
    json(response, 400, { error: `Unknown drawing template: ${body.templateId}` });
    return;
  }

  const profile = {
    ...baseProfile,
    brushSize: normalizeBrushSize(body.brushSize, baseProfile.brushSize),
  };
  const drawingMask = await loadDrawingTemplateMask(template.id, profile.canvasWidth, profile.canvasHeight);

  const plan = await generateDrawPlan(
    decodeDataUrl(body.imageDataUrl),
    profile,
    body.previewScale ?? 12,
    {
      imageScalePercent,
      imageOffsetXPercent,
      imageOffsetYPercent,
      removeBackground: body.removeBackground === true,
      drawingMask,
    },
  );

  json(response, 200, {
    profile: {
      profileName: profile.profileName,
      canvasWidth: profile.canvasWidth,
      canvasHeight: profile.canvasHeight,
      brushSize: profile.brushSize,
      templateId: template.id,
      templateLabel: template.label,
      imageScalePercent,
      imageOffsetXPercent,
      imageOffsetYPercent,
      colorMode: profile.colorMode,
      colorCount: profile.colorCount,
      removeBackground: body.removeBackground === true,
      palette: plan.paletteHexes,
      baudRate: profile.baudRate,
      ackTimeoutMs: profile.ackTimeoutMs,
      commandRetryCount: profile.commandRetryCount,
    },
    stats: {
      usedColorIndexes: plan.usedColorIndexes,
      totalPixels: plan.totalPixels,
      commandCount: plan.commands.length,
      estimatedRuntimeMs: plan.estimatedRuntimeMs,
      estimatedRuntimeLabel: formatDuration(plan.estimatedRuntimeMs),
      imageBounds: plan.imageBounds,
      pathStats: plan.pathStats,
    },
    previewDataUrl: `data:image/png;base64,${plan.previewPng.toString("base64")}`,
    commands: plan.commands,
    resumePlan: plan.resumePlan,
  });
}

function handleDrawingTemplates(response: ServerResponse): void {
  json(response, 200, {
    templates: listDrawingTemplates().map((template) => ({
      ...template,
      maskUrl: `/${template.maskAssetPath}`,
      previewUrl: `/${template.previewAssetPath}`,
    })),
  });
}

async function executeCommands(body: {
  commands?: string[];
  target?: "simulate" | "serial";
  portPath?: string;
  baudRate?: number;
  ackTimeoutMs?: number;
  retries?: number;
  ackDelayMs?: number;
  errorAtCommand?: number;
}): Promise<{
  success: true;
  target: "simulate" | "serial";
  totalCommands: number;
  lines: string[];
  session: SerialSessionSnapshot;
}> {
  if (!Array.isArray(body.commands) || body.commands.length === 0) {
    throw new Error("Missing commands.");
  }

  const target = body.target === "serial" ? "serial" : "simulate";
  const ackTimeoutMs = body.ackTimeoutMs ?? 5_000;
  const retries = body.retries ?? 1;
  const lines: string[] = [`INFO target=${target} commands=${body.commands.length}`];

  if (target === "serial") {
    if (!body.portPath) {
      throw new Error("Missing portPath.");
    }

    if (isManagedExecutionActive(managedExecution.status)) {
      throw new Error("Drawing execution is already running.");
    }

    lines.push(`INFO port=${body.portPath} baud=${body.baudRate ?? 115200}`);

    await serialSessionManager.send(body.commands, {
      path: body.portPath,
      baudRate: body.baudRate ?? 115200,
      ackTimeoutMs,
      retries,
      onDeviceLine: (line) => {
        lines.push(line);
      },
    });
  } else {
    const sender = new SimulatedAckSender();

    await sender.send(body.commands, {
      ackTimeoutMs,
      retries,
      ackDelayMs: body.ackDelayMs ?? 0,
      ...(body.errorAtCommand !== undefined ? { errorAtCommand: body.errorAtCommand } : {}),
      onDeviceLine: (line) => {
        lines.push(line);
      },
    });
  }

  lines.push("INFO completed");

  return {
    success: true,
    target,
    totalCommands: body.commands.length,
    lines,
    session: serialSessionManager.snapshot(),
  };
}

async function runManagedExecution(
  execution: ManagedExecution,
  body: {
    commands: string[];
    target: ExecutionTarget;
    portPath?: string;
    baudRate?: number;
    ackTimeoutMs?: number;
    retries?: number;
    ackDelayMs?: number;
    errorAtCommand?: number;
  },
): Promise<void> {
  const ackTimeoutMs = body.ackTimeoutMs ?? 5_000;
  const retries = body.retries ?? 1;

  appendManagedExecutionLine(
    execution,
    `INFO target=${body.target} commands=${body.commands.length}`,
  );
  if (execution.recoverySession) {
    appendManagedExecutionLine(
      execution,
      `INFO recovery_session=${execution.recoverySession.commandsFilePath}`,
    );
  }

  try {
    if (body.target === "serial") {
      if (!body.portPath) {
        throw new Error("Missing portPath.");
      }

      const sender = execution.sender as ManagedSerialSessionSender;
      appendManagedExecutionLine(
        execution,
        `INFO port=${body.portPath} baud=${body.baudRate ?? 115200}`,
      );

      await sender.send(body.commands, {
        path: body.portPath,
        baudRate: body.baudRate ?? 115200,
        ackTimeoutMs,
        retries,
        onProgress: async ({ index, command }: ExecutionProgressUpdate) => {
          const mappedCompletedCommands = execution.progressMap?.[index - 1] ?? index;
          execution.completedCommands = mappedCompletedCommands;
          execution.currentCommand = command;
          await updateRecoverySessionProgress(execution, mappedCompletedCommands);
        },
        onDeviceLine: (line) => {
          appendManagedExecutionLine(execution, line);
        },
      });
    } else {
      const sender = execution.sender as SimulatedAckSender;

      await sender.send(body.commands, {
        ackTimeoutMs,
        retries,
        ackDelayMs: body.ackDelayMs ?? 0,
        ...(body.errorAtCommand !== undefined ? { errorAtCommand: body.errorAtCommand } : {}),
        onProgress: async ({ index, command }: ExecutionProgressUpdate) => {
          const mappedCompletedCommands = execution.progressMap?.[index - 1] ?? index;
          execution.completedCommands = mappedCompletedCommands;
          execution.currentCommand = command;
          await updateRecoverySessionProgress(execution, mappedCompletedCommands);
        },
        onDeviceLine: (line) => {
          appendManagedExecutionLine(execution, line);
        },
      });
    }

    execution.currentCommand = null;

    if (execution.status === "stopping") {
      execution.status = "stopped";
      appendManagedExecutionLine(execution, "INFO stopped");
      await updateRecoverySessionStatus(
        execution,
        resolveRecoveryTerminalStatus(execution),
      );
    } else {
      execution.status = "completed";
      appendManagedExecutionLine(execution, "INFO completed");
      await updateRecoverySessionStatus(execution, "completed");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    execution.currentCommand = null;

    if (execution.status === "stopping") {
      execution.status = "stopped";
      execution.error = null;
      appendManagedExecutionLine(execution, "INFO stopped");
      await updateRecoverySessionStatus(
        execution,
        resolveRecoveryTerminalStatus(execution),
      );
    } else {
      execution.status = "failed";
      execution.error = message;
      appendManagedExecutionLine(execution, `ERR ${message}`);
      const recoveryStatus = resolveRecoveryTerminalStatus(execution);
      await updateRecoverySessionStatus(
        execution,
        recoveryStatus,
        recoveryStatus === "recoverable" ? message : null,
      );
    }
  } finally {
    execution.finishedAt = Date.now();
    execution.sender = null;
  }
}

async function startManagedExecution(body: {
  commands: string[];
  target?: ExecutionTarget;
  portPath?: string;
  baudRate?: number;
  ackTimeoutMs?: number;
  retries?: number;
  ackDelayMs?: number;
  errorAtCommand?: number;
  progressMap?: number[];
  totalCommands?: number;
  initialCompletedCommands?: number;
  recoverySession?: RecoverySessionRecord | null;
}): Promise<Record<string, unknown>> {
  if (!Array.isArray(body.commands) || body.commands.length === 0) {
    throw new Error("Missing commands.");
  }

  if (isManagedExecutionActive(managedExecution.status)) {
    throw new Error("A drawing execution is already running.");
  }

  const target: ExecutionTarget = body.target === "simulate" ? "simulate" : "serial";
  const portPath = target === "serial" ? preferSerialPath(body.portPath ?? "") : null;

  if (target === "serial" && !portPath) {
    throw new Error("Missing portPath.");
  }

  if (body.progressMap && body.progressMap.length !== body.commands.length) {
    throw new Error("Progress map does not match commands.");
  }

  const sender: SenderControls =
    target === "serial" ? new ManagedSerialSessionSender(serialSessionManager) : new SimulatedAckSender();

  const execution: ManagedExecution = {
    id: executionCounter += 1,
    status: "running",
    target,
    portPath,
    baudRate: body.baudRate ?? 115200,
    totalCommands: body.totalCommands ?? body.commands.length,
    completedCommands: body.initialCompletedCommands ?? 0,
    currentCommand: null,
    lines: [],
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
    sender,
    progressMap: body.progressMap ?? null,
    recoverySession: body.recoverySession ?? null,
  };

  managedExecution = execution;

  void runManagedExecution(
    execution,
    withDefined({
      commands: body.commands,
      target,
      ...(portPath ? { portPath } : {}),
      baudRate: body.baudRate,
      ackTimeoutMs: body.ackTimeoutMs,
      retries: body.retries,
      ackDelayMs: body.ackDelayMs,
      errorAtCommand: body.errorAtCommand,
    }) as {
      commands: string[];
      target: ExecutionTarget;
      portPath?: string;
      baudRate?: number;
      ackTimeoutMs?: number;
      retries?: number;
      ackDelayMs?: number;
      errorAtCommand?: number;
    },
  );

  return snapshotManagedExecution(execution);
}

async function handlePorts(response: ServerResponse): Promise<void> {
  json(response, 200, {
    ports: await listPortInfos(),
  });
}

function handleOfficialPalette(response: ServerResponse): void {
  json(response, 200, {
    rows: OFFICIAL_COLOR_GRID.length,
    cols: OFFICIAL_COLOR_GRID[0]?.length ?? 0,
    grid: OFFICIAL_COLOR_GRID,
  });
}

async function handleFirmwareInfo(response: ServerResponse): Promise<void> {
  const tooling = await webRuntime.toolingManager.getInfo();

  json(response, 200, {
    platformIo: {
      ...tooling.platformIo,
      firmwareRoot: webRuntime.firmwareRoot,
    },
    python: tooling.python,
    install: tooling.install,
    flash: webRuntime.flashManager.getStatus(),
    environments: FIRMWARE_ENVIRONMENTS,
  });
}

async function handleToolingInstall(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = (await readJsonBody(request)) as {
    allowPythonDownload?: boolean;
  };

  json(response, 202, {
    success: true,
    install: await webRuntime.toolingManager.startInstall({
      allowPythonDownload: body.allowPythonDownload === true,
    }),
  });
}

function handleToolingInstallStatus(response: ServerResponse): void {
  json(response, 200, {
    success: true,
    install: webRuntime.toolingManager.getInstallStatus(),
  });
}

function handleWindowsSerialDriversInfo(response: ServerResponse): void {
  json(response, 200, { ...webRuntime.windowsSerialDriverManager.getInfo() });
}

async function handleWindowsSerialDriverInstall(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = (await readJsonBody(request)) as {
    driverId?: WindowsSerialDriverId;
  };

  if (body.driverId !== "cp210x" && body.driverId !== "ch341") {
    json(response, 400, { error: "Unsupported Windows serial driver." });
    return;
  }

  try {
    json(response, 202, {
      success: true,
      install: await webRuntime.windowsSerialDriverManager.startInstall(body.driverId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    json(response, 400, {
      error: message,
      install: webRuntime.windowsSerialDriverManager.getInstallStatus(),
    });
  }
}

function handleWindowsSerialDriverInstallStatus(response: ServerResponse): void {
  json(response, 200, {
    success: true,
    install: webRuntime.windowsSerialDriverManager.getInstallStatus(),
  });
}

async function handleFirmwareFlash(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = (await readJsonBody(request)) as {
    environmentId?: FirmwareEnvironmentId;
    portPath?: string;
  };

  try {
    if (!body.environmentId) {
      throw new Error("Missing environmentId.");
    }

    if (!body.portPath) {
      throw new Error("Missing portPath.");
    }

    json(response, 202, {
      success: true,
      flash: await webRuntime.flashManager.start({
        environmentId: body.environmentId,
        portPath: body.portPath,
      }),
      session: serialSessionManager.snapshot(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    json(response, 400, { error: message, session: serialSessionManager.snapshot() });
  }
}

function handleFirmwareFlashStatus(response: ServerResponse): void {
  json(response, 200, {
    success: true,
    flash: webRuntime.flashManager.getStatus(),
    session: serialSessionManager.snapshot(),
  });
}

async function handleFirmwareFlashCancel(response: ServerResponse): Promise<void> {
  try {
    json(response, 200, {
      success: true,
      flash: await webRuntime.flashManager.cancel(),
      session: serialSessionManager.snapshot(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    json(response, 400, {
      error: message,
      flash: webRuntime.flashManager.getStatus(),
      session: serialSessionManager.snapshot(),
    });
  }
}

async function handleExecute(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = (await readJsonBody(request)) as {
    commands?: string[];
    target?: "simulate" | "serial";
    portPath?: string;
    baudRate?: number;
    ackTimeoutMs?: number;
    retries?: number;
    ackDelayMs?: number;
    errorAtCommand?: number;
  };

  try {
    json(response, 200, await executeCommands(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    json(response, 400, { error: message, session: serialSessionManager.snapshot() });
  }
}

async function handleExecutionStart(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = (await readJsonBody(request)) as {
    commands?: string[];
    target?: ExecutionTarget;
    portPath?: string;
    baudRate?: number;
    ackTimeoutMs?: number;
    retries?: number;
    ackDelayMs?: number;
    errorAtCommand?: number;
    resumePlan?: ResumePlan;
    sourceLabel?: string;
    profileSummary?: ExecutionStartProfileSummary;
  };

  try {
    if (!Array.isArray(body.commands) || body.commands.length === 0) {
      throw new Error("Missing commands.");
    }

    if (isManagedExecutionActive(managedExecution.status)) {
      throw new Error("A drawing execution is already running.");
    }

    const target: ExecutionTarget = body.target === "simulate" ? "simulate" : "serial";
    const portPath = target === "serial" ? preferSerialPath(body.portPath ?? "") : null;

    if (target === "serial" && !portPath) {
      throw new Error("Missing portPath.");
    }

    const recoverySession =
      body.resumePlan && typeof body.resumePlan === "object"
        ? await webRuntime.recoverySessions.createSession({
            commands: body.commands,
            resumePlan: body.resumePlan,
            sourceLabel:
              typeof body.sourceLabel === "string" && body.sourceLabel.trim().length > 0
                ? body.sourceLabel.trim()
                : "untitled-drawing",
            profileSummary: normalizeRecoveryProfileSummary(body.profileSummary),
            serialOptions: {
              baudRate: body.baudRate ?? 115200,
              ackTimeoutMs: body.ackTimeoutMs ?? 5_000,
              retries: body.retries ?? 1,
            },
          })
        : null;

    json(response, 200, {
      success: true,
      execution: await startManagedExecution(
        withDefined({
          commands: body.commands,
          target,
          ...(portPath ? { portPath } : {}),
          baudRate: body.baudRate,
          ackTimeoutMs: body.ackTimeoutMs,
          retries: body.retries,
          ackDelayMs: body.ackDelayMs,
          errorAtCommand: body.errorAtCommand,
          totalCommands: body.commands.length,
          initialCompletedCommands: 0,
          recoverySession,
        }) as {
          commands: string[];
          target?: ExecutionTarget;
          portPath?: string;
          baudRate?: number;
          ackTimeoutMs?: number;
          retries?: number;
          ackDelayMs?: number;
          errorAtCommand?: number;
          progressMap?: number[];
          totalCommands?: number;
          initialCompletedCommands?: number;
          recoverySession?: RecoverySessionRecord | null;
        },
      ),
      recoverySession: recoverySession ? summarizeRecoverySession(recoverySession) : null,
      session: serialSessionManager.snapshot(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    json(response, 400, { error: message, session: serialSessionManager.snapshot() });
  }
}

async function handleExecutionStatus(response: ServerResponse): Promise<void> {
  json(response, 200, {
    success: true,
    execution: snapshotManagedExecution(),
    session: serialSessionManager.snapshot(),
  });
}

async function handleSerialSessionStatus(response: ServerResponse): Promise<void> {
  json(response, 200, { ...serialSessionManager.snapshot() });
}

async function handleSerialSessionDisconnect(response: ServerResponse): Promise<void> {
  try {
    if (isManagedExecutionActive(managedExecution.status)) {
      throw new Error("Drawing execution is active.");
    }

    json(response, 200, {
      success: true,
      session: await serialSessionManager.disconnect(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    json(response, 400, { error: message, session: serialSessionManager.snapshot() });
  }
}

async function updateManagedExecutionState(
  nextStatus: ExecutionStatus,
  line: string,
  recoveryStatus?: "running" | "paused" | "recoverable" | "completed",
): Promise<Record<string, unknown>> {
  if (!managedExecution.sender || !managedExecution.id) {
    throw new Error("No active drawing execution.");
  }

  managedExecution.status = nextStatus;
  appendManagedExecutionLine(managedExecution, line);
  if (recoveryStatus) {
    await updateRecoverySessionStatus(managedExecution, recoveryStatus);
  }
  return snapshotManagedExecution();
}

async function handleExecutionPause(response: ServerResponse): Promise<void> {
  try {
    if (managedExecution.status !== "running" || !managedExecution.sender) {
      throw new Error("Drawing execution is not running.");
    }

    managedExecution.sender.pause();
    json(response, 200, {
      success: true,
      execution: await updateManagedExecutionState("paused", "INFO execution paused", "paused"),
      session: serialSessionManager.snapshot(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    json(response, 400, { error: message, session: serialSessionManager.snapshot() });
  }
}

async function handleExecutionResume(response: ServerResponse): Promise<void> {
  try {
    if (managedExecution.status !== "paused" || !managedExecution.sender) {
      throw new Error("Drawing execution is not paused.");
    }

    managedExecution.sender.resume();
    json(response, 200, {
      success: true,
      execution: await updateManagedExecutionState("running", "INFO execution resumed", "running"),
      session: serialSessionManager.snapshot(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    json(response, 400, { error: message, session: serialSessionManager.snapshot() });
  }
}

async function handleExecutionStop(response: ServerResponse): Promise<void> {
  try {
    if (!managedExecution.sender || !isManagedExecutionActive(managedExecution.status)) {
      throw new Error("No active drawing execution to stop.");
    }

    managedExecution.sender.stop();
    json(response, 200, {
      success: true,
      execution: await updateManagedExecutionState("stopping", "INFO execution stop requested"),
      session: serialSessionManager.snapshot(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    json(response, 400, { error: message, session: serialSessionManager.snapshot() });
  }
}

async function handleExecutionReset(response: ServerResponse): Promise<void> {
  try {
    if (managedExecution.sender) {
      if (managedExecution.sender instanceof ManagedSerialSessionSender) {
        managedExecution.sender.forceStop();
      } else {
        managedExecution.sender.stop();
      }
    }

    if (managedExecution.recoverySession) {
      applyRecoveryProgress(managedExecution.recoverySession, managedExecution.completedCommands);
      await updateRecoverySessionStatus(
        managedExecution,
        resolveRecoveryTerminalStatus(managedExecution),
      );
    }

    resetManagedExecutionState();
    json(response, 200, {
      success: true,
      execution: snapshotManagedExecution(),
      session: serialSessionManager.snapshot(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    json(response, 400, { error: message, session: serialSessionManager.snapshot() });
  }
}

async function handleRecoverySessions(response: ServerResponse): Promise<void> {
  json(response, 200, {
    success: true,
    sessions: await webRuntime.recoverySessions.listSessions(),
  });
}

async function handleRecoveryResume(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = (await readJsonBody(request)) as {
    sessionId?: string;
    portPath?: string;
  };

  try {
    if (isManagedExecutionActive(managedExecution.status)) {
      throw new Error("A drawing execution is already running.");
    }

    if (!body.sessionId) {
      throw new Error("Missing sessionId.");
    }

    const portPath = preferSerialPath(body.portPath ?? "");

    if (!portPath) {
      throw new Error("Missing portPath.");
    }

    const recoverySession = await webRuntime.recoverySessions.loadSession(body.sessionId);
    const commands = await webRuntime.recoverySessions.loadCommands(body.sessionId);
    const recoveryPlan = buildRecoveryExecutionPlan({
      commands,
      resumePlan: recoverySession.resumePlan,
      completedCommands: recoverySession.completedCommands,
    });

    applyRecoveryProgress(recoverySession, recoveryPlan.resumedFromCompletedCommands);
    applyRecoveryStatus(recoverySession, "running");
    await webRuntime.recoverySessions.writeSession(recoverySession);

    json(response, 200, {
      success: true,
      execution: await startManagedExecution({
        commands: recoveryPlan.commands,
        target: "serial",
        portPath,
        baudRate: recoverySession.serialOptions.baudRate,
        ackTimeoutMs: recoverySession.serialOptions.ackTimeoutMs,
        retries: recoverySession.serialOptions.retries,
        progressMap: recoveryPlan.progressMap,
        totalCommands: recoverySession.totalCommands,
        initialCompletedCommands: recoverySession.completedCommands,
        recoverySession,
      }),
      recoverySession: summarizeRecoverySession(recoverySession),
      session: serialSessionManager.snapshot(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    json(response, 400, { error: message, session: serialSessionManager.snapshot() });
  }
}

async function handleRecoveryDiscard(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = (await readJsonBody(request)) as {
    sessionId?: string;
  };

  try {
    if (!body.sessionId) {
      throw new Error("Missing sessionId.");
    }

    if (
      managedExecution.recoverySession?.jobId === body.sessionId &&
      isManagedExecutionActive(managedExecution.status)
    ) {
      throw new Error("Cannot discard an active recovery session.");
    }

    await webRuntime.recoverySessions.loadSession(body.sessionId);
    await webRuntime.recoverySessions.discardSession(body.sessionId);
    json(response, 200, {
      success: true,
      sessionId: body.sessionId,
      sessions: await webRuntime.recoverySessions.listSessions(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    json(response, 400, { error: message });
  }
}

async function handleSimulate(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = (await readJsonBody(request)) as {
    commands?: string[];
    ackDelayMs?: number;
    errorAtCommand?: number;
  };

  try {
    json(
      response,
      200,
      await executeCommands({
        ...body,
        target: "simulate",
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    json(response, 400, { error: message, session: serialSessionManager.snapshot() });
  }
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    if (!request.url || !request.method) {
      json(response, 400, { error: "Invalid request." });
      return;
    }

    const url = new URL(request.url, `http://${webRuntime.host}:${webRuntime.port}`);

    if (request.method === "GET" && url.pathname === "/") {
      await serveStatic(response, "index.html");
      return;
    }

    if (request.method === "GET" && url.pathname === "/app.js") {
      await serveStatic(response, "app.js");
      return;
    }

    if (request.method === "GET" && url.pathname === "/styles.css") {
      await serveStatic(response, "styles.css");
      return;
    }

    if (
      (request.method === "GET" || request.method === "HEAD") &&
      url.pathname !== "/" &&
      !url.pathname.startsWith("/api/") &&
      isSafeStaticAssetPath(url.pathname.slice(1))
    ) {
      await serveStaticAsset(response, url.pathname.slice(1), {
        headOnly: request.method === "HEAD",
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/ports") {
      await handlePorts(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/drawing-templates") {
      handleDrawingTemplates(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/official-palette") {
      handleOfficialPalette(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/firmware/info") {
      await handleFirmwareInfo(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/firmware/tooling/install") {
      await handleToolingInstall(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/firmware/tooling/install/status") {
      handleToolingInstallStatus(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/windows-serial-drivers/info") {
      handleWindowsSerialDriversInfo(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/windows-serial-drivers/install") {
      await handleWindowsSerialDriverInstall(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/windows-serial-drivers/install/status") {
      handleWindowsSerialDriverInstallStatus(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/generate") {
      await handleGenerate(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/firmware/flash") {
      await handleFirmwareFlash(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/firmware/flash/status") {
      handleFirmwareFlashStatus(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/firmware/flash/cancel") {
      await handleFirmwareFlashCancel(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/execute") {
      await handleExecute(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/serial-session/status") {
      await handleSerialSessionStatus(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/serial-session/disconnect") {
      await handleSerialSessionDisconnect(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/execution/start") {
      await handleExecutionStart(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/execution/status") {
      await handleExecutionStatus(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/execution/pause") {
      await handleExecutionPause(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/execution/resume") {
      await handleExecutionResume(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/execution/stop") {
      await handleExecutionStop(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/execution/reset") {
      await handleExecutionReset(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/recovery/sessions") {
      await handleRecoverySessions(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/recovery/resume") {
      await handleRecoveryResume(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/recovery/discard") {
      await handleRecoveryDiscard(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/simulate") {
      await handleSimulate(request, response);
      return;
    }

    json(response, 404, { error: "Not found." });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    json(response, 500, { error: message });
  }
}

export async function startWebServer(
  options: StartWebServerOptions = {},
): Promise<WebServerHandle> {
  webRuntime = {
    host: options.host ?? defaultHost,
    port: options.port ?? defaultPort,
    staticRoot: options.staticRoot ?? defaultStaticRoot,
    firmwareRoot: options.firmwareRoot ?? defaultFirmwareRoot,
    toolingManager: new FirmwareToolingManager({
      appDataRoot: options.appDataRoot ?? defaultAppDataRoot,
      ...(options.toolingPaths ? { initialConfig: options.toolingPaths } : {}),
    }),
    windowsSerialDriverManager: new WindowsSerialDriverManager(
      options.windowsDriverRoot ?? defaultWindowsDriverRoot,
    ),
    flashManager: new FirmwareFlashManager(),
    recoverySessions: new RecoverySessionStore(
      options.recoverySessionsRoot ?? defaultRecoverySessionsRoot,
    ),
  };

  await webRuntime.recoverySessions.cleanupSessions({ startup: true });

  const server = createServer(handleRequest);

  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error): void => {
      reject(error);
    };

    server.once("error", handleError);
    server.listen(webRuntime.port, webRuntime.host, () => {
      server.off("error", handleError);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : webRuntime.port;
  webRuntime.port = actualPort;

  return {
    server,
    host: webRuntime.host,
    port: actualPort,
    url: `http://${webRuntime.host}:${actualPort}`,
    close: async () => {
      await webRuntime.flashManager.shutdown();
      await serialSessionManager.disconnect({ force: true }).catch(() => undefined);
      resetManagedExecutionState();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}

function isDirectRun(): boolean {
  return Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);
}

if (isDirectRun()) {
  void startWebServer()
    .then((handle) => {
      console.log(`Switch Auto Draw UI running at ${handle.url}`);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exitCode = 1;
    });
}
