import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { generateDrawPlan } from "../app/generateDrawPlan.js";
import { applyCliOptions, type CliOptions } from "../cli/args.js";
import { loadProfile } from "../config/loadProfile.js";
import { OFFICIAL_COLOR_GRID } from "../config/officialPalette.js";
import {
  FirmwareToolingManager,
  type ToolingConfig,
} from "./firmwareTooling.js";
import { listPortInfos, preferSerialPath } from "../serial/listPorts.js";
import {
  SerialSessionManager,
  type SerialSessionSnapshot,
} from "../serial/sender.js";
import { SimulatedAckSender } from "../simulator/sender.js";
import type { SenderControls } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const defaultStaticRoot = path.join(__dirname, "static");
const defaultFirmwareRoot = resolveDefaultFirmwareRoot();
const defaultHost = "127.0.0.1";
const defaultPort = 4307;
const defaultAppDataRoot = path.join(os.homedir(), ".friend-maker");
const serialSessionManager = new SerialSessionManager();

export interface StartWebServerOptions {
  host?: string;
  port?: number;
  staticRoot?: string;
  firmwareRoot?: string;
  appDataRoot?: string;
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
}

let webRuntime: WebRuntimeConfig = {
  host: defaultHost,
  port: defaultPort,
  staticRoot: defaultStaticRoot,
  firmwareRoot: defaultFirmwareRoot,
  toolingManager: new FirmwareToolingManager({ appDataRoot: defaultAppDataRoot }),
};

function resolveDefaultFirmwareRoot(): string {
  const fallback = path.join(repoRoot, "firmware", "esp32");
  const candidates = [
    fallback,
    path.resolve(__dirname, "..", "..", "..", "..", "..", "firmware", "esp32"),
  ];

  return candidates.find((candidate) => existsSync(path.join(candidate, "platformio.ini"))) ?? fallback;
}

const FIRMWARE_ENVIRONMENTS = [
  {
    id: "esp32dev_wireless",
    label: "ESP32-WROOM-32 / ESP-32S",
    description: "推荐主线，最终用于 Bluetooth Classic 模拟 Switch Pro 手柄。",
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
    this.interruptAckWait?.();
    this.interruptAckWait = null;
    void this.sessionManager.disconnect({ force: true }).catch(() => {
      // Stop uses disconnect only to interrupt a blocking ACK wait.
    });
  }

  async send(
    commands: string[],
    options: {
      path: string;
      baudRate: number;
      ackTimeoutMs: number;
      retries: number;
      onProgress?: (progress: { index: number; total: number; command: string }) => void;
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
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (filePath.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }

  return "text/html; charset=utf-8";
}

async function serveStatic(response: ServerResponse, fileName: string): Promise<void> {
  const filePath = path.join(webRuntime.staticRoot, fileName);
  const content = await readFile(filePath);
  response.writeHead(200, { "content-type": getContentType(filePath) });
  response.end(content);
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

function getFirmwareEnvironment(environmentId: string): (typeof FIRMWARE_ENVIRONMENTS)[number] {
  const environment = FIRMWARE_ENVIRONMENTS.find((item) => item.id === environmentId);

  if (!environment) {
    throw new Error(`Unsupported firmware environment: ${environmentId}`);
  }

  return environment;
}

async function runPlatformIo(args: string[]): Promise<{
  platformIoPath: string;
  output: string;
}> {
  const platformIoPath = await resolvePlatformIoPath();

  if (!platformIoPath) {
    throw new Error("PlatformIO not found. Install it first or set PLATFORMIO_BIN.");
  }

  const platformIoEnv = await webRuntime.toolingManager.getPlatformIoEnv();

  return new Promise((resolve, reject) => {
    const child = spawn(platformIoPath, args, {
      cwd: webRuntime.firmwareRoot,
      env: platformIoEnv,
    });

    let output = `$ ${platformIoPath} ${args.join(" ")}\n`;

    child.stdout.on("data", (chunk: string | Buffer) => {
      output += chunk.toString();
    });

    child.stderr.on("data", (chunk: string | Buffer) => {
      output += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve({
          platformIoPath,
          output,
        });
        return;
      }

      reject(new Error(output.trim() || `PlatformIO exited with code ${String(exitCode)}`));
    });
  });
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

function isManagedExecutionActive(status: ExecutionStatus): boolean {
  return status === "running" || status === "paused" || status === "stopping";
}

function appendManagedExecutionLine(execution: ManagedExecution, line: string): void {
  execution.lines.push(line);

  if (execution.lines.length > 400) {
    execution.lines.splice(0, execution.lines.length - 400);
  }
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
  };
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
  const profile = {
    ...baseProfile,
    brushSize: normalizeBrushSize(body.brushSize, baseProfile.brushSize),
  };

  const plan = await generateDrawPlan(
    decodeDataUrl(body.imageDataUrl),
    profile,
    body.previewScale ?? 12,
    {
      imageScalePercent,
      imageOffsetXPercent,
      imageOffsetYPercent,
      removeBackground: body.removeBackground === true,
    },
  );

  json(response, 200, {
    profile: {
      profileName: profile.profileName,
      canvasWidth: profile.canvasWidth,
      canvasHeight: profile.canvasHeight,
      brushSize: profile.brushSize,
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
    },
    previewDataUrl: `data:image/png;base64,${plan.previewPng.toString("base64")}`,
    commands: plan.commands,
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
        onProgress: ({ index, command }) => {
          execution.completedCommands = index;
          execution.currentCommand = command;
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
        onProgress: ({ index, command }) => {
          execution.completedCommands = index;
          execution.currentCommand = command;
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
    } else {
      execution.status = "completed";
      appendManagedExecutionLine(execution, "INFO completed");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    execution.currentCommand = null;

    if (execution.status === "stopping") {
      execution.status = "stopped";
      execution.error = null;
      appendManagedExecutionLine(execution, "INFO stopped");
    } else {
      execution.status = "failed";
      execution.error = message;
      appendManagedExecutionLine(execution, `ERR ${message}`);
    }
  } finally {
    execution.finishedAt = Date.now();
    execution.sender = null;
  }
}

async function startManagedExecution(body: {
  commands?: string[];
  target?: ExecutionTarget;
  portPath?: string;
  baudRate?: number;
  ackTimeoutMs?: number;
  retries?: number;
  ackDelayMs?: number;
  errorAtCommand?: number;
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

  const sender: SenderControls =
    target === "serial" ? new ManagedSerialSessionSender(serialSessionManager) : new SimulatedAckSender();

  const execution: ManagedExecution = {
    id: executionCounter += 1,
    status: "running",
    target,
    portPath,
    baudRate: body.baudRate ?? 115200,
    totalCommands: body.commands.length,
    completedCommands: 0,
    currentCommand: null,
    lines: [],
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
    sender,
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

    const environment = getFirmwareEnvironment(body.environmentId);
    const portPath = preferSerialPath(body.portPath);
    const session = await serialSessionManager.disconnect();
    const result = await runPlatformIo([
      "run",
      "-e",
      environment.id,
      "-t",
      "upload",
      "--upload-port",
      portPath,
    ]);

    json(response, 200, {
      success: true,
      environment,
      portPath,
      platformIoPath: result.platformIoPath,
      output: result.output,
      session,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    json(response, 400, { error: message, session: serialSessionManager.snapshot() });
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
  };

  try {
    json(response, 200, {
      success: true,
      execution: await startManagedExecution(body),
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

function updateManagedExecutionState(
  nextStatus: ExecutionStatus,
  line: string,
): Record<string, unknown> {
  if (!managedExecution.sender || !managedExecution.id) {
    throw new Error("No active drawing execution.");
  }

  managedExecution.status = nextStatus;
  appendManagedExecutionLine(managedExecution, line);
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
      execution: updateManagedExecutionState("paused", "INFO execution paused"),
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
      execution: updateManagedExecutionState("running", "INFO execution resumed"),
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
      execution: updateManagedExecutionState("stopping", "INFO execution stop requested"),
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
      managedExecution.sender.stop();
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

    if (request.method === "GET" && url.pathname === "/api/ports") {
      await handlePorts(response);
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

    if (request.method === "POST" && url.pathname === "/api/generate") {
      await handleGenerate(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/firmware/flash") {
      await handleFirmwareFlash(request, response);
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
  };

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
      await serialSessionManager.disconnect({ force: true }).catch(() => undefined);
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
