import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";

import { extract } from "tar";

const PLATFORMIO_INSTALLER_URL =
  "https://raw.githubusercontent.com/platformio/platformio-core-installer/master/get-platformio.py";
const MAX_INSTALL_LOG_LINES = 400;

type ToolingSource = "saved" | "app-local" | "env" | "home" | "path";
type InstallStatus = "idle" | "running" | "completed" | "failed";

interface PythonRuntimeAsset {
  system: string;
  url: string;
  sha256: string;
}

const PYTHON_RUNTIME_ASSETS: Record<string, PythonRuntimeAsset> = {
  "darwin-arm64": {
    system: "darwin-arm64",
    url: "https://github.com/astral-sh/python-build-standalone/releases/download/20260414/cpython-3.12.13+20260414-aarch64-apple-darwin-install_only_stripped.tar.gz",
    sha256: "38f71c324ae14ee5ef844c62e06b6faa5ba3040c898b4c1d03b8b6e88794356b",
  },
  "darwin-x64": {
    system: "darwin-x64",
    url: "https://github.com/astral-sh/python-build-standalone/releases/download/20260414/cpython-3.12.13+20260414-x86_64-apple-darwin-install_only_stripped.tar.gz",
    sha256: "bf9e2eb4834272cae196e4a8473d48f15878114cedbc278fe53cd85ab28dc0ed",
  },
  "win32-x64": {
    system: "win32-x64",
    url: "https://github.com/astral-sh/python-build-standalone/releases/download/20260414/cpython-3.12.13+20260414-x86_64-pc-windows-msvc-install_only_stripped.tar.gz",
    sha256: "d785d2e901a8194dcdb8c23c2b37a46ed84fdc04e87398dc5b832644330de71e",
  },
};

export interface ToolingConfig {
  platformioExe?: string;
  platformioCoreDir?: string;
  pythonExe?: string;
  pythonRoot?: string;
}

export interface ToolingExecutableStatus {
  available: boolean;
  path: string | null;
  source: ToolingSource | null;
}

export interface PythonToolingStatus extends ToolingExecutableStatus {
  runtimeSupported: boolean;
  runtimeSystem: string | null;
}

export interface ToolingInstallSnapshot {
  status: InstallStatus;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  platformIoExe: string | null;
  lines: string[];
}

export interface FirmwareToolingInfo {
  platformIo: ToolingExecutableStatus;
  python: PythonToolingStatus;
  install: ToolingInstallSnapshot;
}

interface ResolvedExecutable extends ToolingExecutableStatus {
  path: string | null;
}

interface ResolvedPython extends PythonToolingStatus {
  path: string | null;
}

interface FirmwareToolingManagerOptions {
  appDataRoot: string;
  initialConfig?: ToolingConfig;
}

function createIdleInstallState(): ToolingInstallSnapshot {
  return {
    status: "idle",
    startedAt: null,
    finishedAt: null,
    error: null,
    platformIoExe: null,
    lines: [],
  };
}

function compactConfig(config: ToolingConfig): ToolingConfig {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => typeof value === "string" && value.length > 0),
  ) as ToolingConfig;
}

function getPythonRuntimeAsset(): PythonRuntimeAsset | null {
  const key = `${process.platform}-${process.arch}`;
  return PYTHON_RUNTIME_ASSETS[key] ?? null;
}

function findOnPath(commands: string[]): string | null {
  const lookup = process.platform === "win32" ? "where" : "which";

  for (const command of commands) {
    const result = spawnSync(lookup, [command], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    if (result.status !== 0) {
      continue;
    }

    const resolvedPath = result.stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.length > 0);

    if (resolvedPath) {
      return resolvedPath;
    }
  }

  return null;
}

function isPythonExecutable(candidate: string): boolean {
  if (!existsSync(candidate)) {
    return false;
  }

  const result = spawnSync(candidate, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return result.status === 0 && /^Python 3\./u.test(output.trim());
}

function hasWhitespace(value: string): boolean {
  return /\s/u.test(value);
}

function getPlatformIoCandidates(config: ToolingConfig, appLocalCoreDir: string): string[] {
  return [
    config.platformioExe,
    process.env.PLATFORMIO_BIN,
    path.join(appLocalCoreDir, "penv", "bin", "pio"),
    path.join(appLocalCoreDir, "penv", "bin", "platformio"),
    path.join(appLocalCoreDir, "penv", "Scripts", "pio.exe"),
    path.join(appLocalCoreDir, "penv", "Scripts", "platformio.exe"),
    path.join(os.homedir(), ".platformio", "penv", "bin", "pio"),
    path.join(os.homedir(), ".platformio", "penv", "Scripts", "pio.exe"),
    path.join(os.homedir(), ".platformio", "penv", "Scripts", "platformio.exe"),
    path.join(os.homedir(), ".local", "bin", "pio"),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}

function getPythonCandidates(config: ToolingConfig, appLocalPythonRoot: string): string[] {
  return [
    config.pythonExe,
    process.env.PYTHON_BIN,
    path.join(appLocalPythonRoot, "python", "bin", "python3"),
    path.join(appLocalPythonRoot, "python", "bin", "python"),
    path.join(appLocalPythonRoot, "python", "python.exe"),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}

async function sha256File(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function downloadFile(url: string, destination: string, redirects = 0): Promise<void> {
  if (redirects > 5) {
    return Promise.reject(new Error("Too many redirects while downloading."));
  }

  const parsedUrl = new URL(url);
  const client = parsedUrl.protocol === "http:" ? http : https;

  return new Promise((resolve, reject) => {
    const request = client.get(
      parsedUrl,
      {
        headers: {
          "user-agent": "FriendMaker/0.1",
        },
      },
      (response) => {
        const location = response.headers.location;

        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          location
        ) {
          response.resume();
          const redirectUrl = new URL(location, parsedUrl).toString();
          void downloadFile(redirectUrl, destination, redirects + 1).then(resolve, reject);
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Download failed with HTTP ${String(response.statusCode)}`));
          return;
        }

        const file = createWriteStream(destination);
        response.pipe(file);
        file.on("finish", () => {
          file.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });
        file.on("error", reject);
      },
    );

    request.on("error", reject);
  });
}

function runProcess(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    onLine?: (line: string) => void;
  } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
    });

    let bufferedOutput = "";

    const handleChunk = (chunk: string | Buffer): void => {
      bufferedOutput += chunk.toString();
      const lines = bufferedOutput.split(/\r?\n/u);
      bufferedOutput = lines.pop() ?? "";
      lines.filter(Boolean).forEach((line) => options.onLine?.(line));
    };

    child.stdout.on("data", handleChunk);
    child.stderr.on("data", handleChunk);
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (bufferedOutput.trim().length > 0) {
        options.onLine?.(bufferedOutput.trim());
      }

      if (exitCode === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${String(exitCode)}`));
    });
  });
}

export class FirmwareToolingManager {
  private installState: ToolingInstallSnapshot = createIdleInstallState();

  constructor(private readonly options: FirmwareToolingManagerOptions) {}

  async getInfo(): Promise<FirmwareToolingInfo> {
    return {
      platformIo: await this.resolvePlatformIo(),
      python: await this.resolvePython(),
      install: this.getInstallStatus(),
    };
  }

  getInstallStatus(): ToolingInstallSnapshot {
    return {
      ...this.installState,
      lines: [...this.installState.lines],
    };
  }

  async resolvePlatformIo(): Promise<ResolvedExecutable> {
    const config = await this.readConfig();

    for (const candidate of getPlatformIoCandidates(config, this.platformIoCoreDir)) {
      if (existsSync(candidate)) {
        return {
          available: true,
          path: candidate,
          source: this.classifyPlatformIoSource(candidate, config),
        };
      }
    }

    const pathResult = findOnPath(["pio", "platformio"]);
    if (pathResult) {
      return {
        available: true,
        path: pathResult,
        source: "path",
      };
    }

    return {
      available: false,
      path: null,
      source: null,
    };
  }

  async getPlatformIoEnv(): Promise<NodeJS.ProcessEnv> {
    const config = await this.readConfig();
    const configuredCoreDir = config.platformioCoreDir;
    const coreDir =
      configuredCoreDir && !hasWhitespace(configuredCoreDir)
        ? configuredCoreDir
        : this.platformIoCoreDir;

    return {
      ...process.env,
      PLATFORMIO_CORE_DIR: coreDir,
    };
  }

  async startInstall(options: { allowPythonDownload?: boolean }): Promise<ToolingInstallSnapshot> {
    if (this.installState.status === "running") {
      return this.getInstallStatus();
    }

    this.installState = {
      status: "running",
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
      platformIoExe: null,
      lines: [],
    };

    void this.runInstall(options.allowPythonDownload === true);
    return this.getInstallStatus();
  }

  private async resolvePython(): Promise<ResolvedPython> {
    const config = await this.readConfig();
    const runtimeAsset = getPythonRuntimeAsset();

    for (const candidate of getPythonCandidates(config, this.pythonRoot)) {
      if (isPythonExecutable(candidate)) {
        return {
          available: true,
          path: candidate,
          source: this.classifyPythonSource(candidate, config),
          runtimeSupported: runtimeAsset !== null,
          runtimeSystem: runtimeAsset?.system ?? null,
        };
      }
    }

    const pathResult = findOnPath(process.platform === "win32" ? ["python"] : ["python3", "python"]);
    if (pathResult && isPythonExecutable(pathResult)) {
      return {
        available: true,
        path: pathResult,
        source: "path",
        runtimeSupported: runtimeAsset !== null,
        runtimeSystem: runtimeAsset?.system ?? null,
      };
    }

    return {
      available: false,
      path: null,
      source: null,
      runtimeSupported: runtimeAsset !== null,
      runtimeSystem: runtimeAsset?.system ?? null,
    };
  }

  private async runInstall(allowPythonDownload: boolean): Promise<void> {
    try {
      await mkdir(this.cacheDir, { recursive: true });
      await mkdir(this.platformIoCoreDir, { recursive: true });

      const existingPlatformIo = await this.resolvePlatformIo();
      if (existingPlatformIo.path) {
        this.appendInstallLine(`PlatformIO already available: ${existingPlatformIo.path}`);
        await this.saveConfig({
          platformioExe: existingPlatformIo.path,
          ...(existingPlatformIo.path.startsWith(this.platformIoCoreDir)
            ? { platformioCoreDir: this.platformIoCoreDir }
            : {}),
        });
        this.finishInstall("completed", existingPlatformIo.path);
        return;
      }

      let python = await this.resolvePython();
      if (!python.path) {
        if (!allowPythonDownload) {
          throw new Error("Python 3 was not found.");
        }

        const pythonPath = await this.installAppLocalPython();
        python = {
          available: true,
          path: pythonPath,
          source: "app-local",
          runtimeSupported: true,
          runtimeSystem: getPythonRuntimeAsset()?.system ?? null,
        };
      }

      const pythonPath = python.path;
      if (!pythonPath) {
        throw new Error("Python 3 was not found.");
      }

      this.appendInstallLine(`Using Python: ${pythonPath}`);
      const installerPath = path.join(this.cacheDir, "get-platformio.py");
      this.appendInstallLine("Downloading PlatformIO installer...");
      await downloadFile(PLATFORMIO_INSTALLER_URL, installerPath);
      this.appendInstallLine("Installing PlatformIO...");

      await runProcess(pythonPath, [installerPath], {
        env: {
          ...process.env,
          PLATFORMIO_CORE_DIR: this.platformIoCoreDir,
        },
        onLine: (line) => this.appendInstallLine(line),
      });

      const platformIo = await this.resolvePlatformIo();
      if (!platformIo.path) {
        throw new Error("PlatformIO installation finished, but no executable was found.");
      }

      await this.saveConfig({
        platformioExe: platformIo.path,
        platformioCoreDir: this.platformIoCoreDir,
        pythonExe: pythonPath,
        ...(python.source === "app-local" ? { pythonRoot: this.pythonRoot } : {}),
      });
      this.finishInstall("completed", platformIo.path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.appendInstallLine(`ERR ${message}`);
      this.finishInstall("failed", null, message);
    }
  }

  private async installAppLocalPython(): Promise<string> {
    const asset = getPythonRuntimeAsset();
    if (!asset) {
      throw new Error(`No app-local Python runtime is configured for ${process.platform}/${process.arch}.`);
    }

    await rm(this.pythonRoot, { recursive: true, force: true });
    await mkdir(this.pythonRoot, { recursive: true });
    await mkdir(this.cacheDir, { recursive: true });

    const archivePath = path.join(this.cacheDir, `${asset.system}-python.tar.gz`);
    this.appendInstallLine(`Downloading app-local Python runtime: ${asset.system}`);
    await downloadFile(asset.url, archivePath);

    const digest = await sha256File(archivePath);
    if (digest !== asset.sha256) {
      throw new Error("Downloaded Python runtime failed SHA256 verification.");
    }

    this.appendInstallLine("Extracting app-local Python runtime...");
    await extract({
      file: archivePath,
      cwd: this.pythonRoot,
    });

    const pythonPath = getPythonCandidates({}, this.pythonRoot).find(isPythonExecutable);
    if (!pythonPath) {
      throw new Error("App-local Python was extracted, but no Python executable was found.");
    }

    await this.saveConfig({
      ...(await this.readConfig()),
      pythonExe: pythonPath,
      pythonRoot: this.pythonRoot,
    });

    return pythonPath;
  }

  private appendInstallLine(line: string): void {
    this.installState.lines.push(line);

    if (this.installState.lines.length > MAX_INSTALL_LOG_LINES) {
      this.installState.lines.splice(0, this.installState.lines.length - MAX_INSTALL_LOG_LINES);
    }
  }

  private finishInstall(status: "completed" | "failed", platformIoExe: string | null, error?: string): void {
    this.installState.status = status;
    this.installState.finishedAt = Date.now();
    this.installState.platformIoExe = platformIoExe;
    this.installState.error = error ?? null;

    if (status === "completed" && platformIoExe) {
      this.appendInstallLine(`PlatformIO ready: ${platformIoExe}`);
    }
  }

  private classifyPlatformIoSource(candidate: string, config: ToolingConfig): ToolingSource {
    if (config.platformioExe === candidate) {
      return "saved";
    }

    if (candidate.startsWith(this.platformIoCoreDir)) {
      return "app-local";
    }

    if (process.env.PLATFORMIO_BIN === candidate) {
      return "env";
    }

    return candidate.startsWith(os.homedir()) ? "home" : "path";
  }

  private classifyPythonSource(candidate: string, config: ToolingConfig): ToolingSource {
    if (config.pythonExe === candidate) {
      return "saved";
    }

    if (candidate.startsWith(this.pythonRoot)) {
      return "app-local";
    }

    if (process.env.PYTHON_BIN === candidate) {
      return "env";
    }

    return "path";
  }

  private async readConfig(): Promise<ToolingConfig> {
    let fileConfig: ToolingConfig = {};

    try {
      fileConfig = JSON.parse(await readFile(this.configPath, "utf8")) as ToolingConfig;
    } catch {
      fileConfig = {};
    }

    return compactConfig({
      ...fileConfig,
      ...this.options.initialConfig,
    });
  }

  private async saveConfig(config: ToolingConfig): Promise<void> {
    await mkdir(this.toolingRoot, { recursive: true });
    await writeFile(this.configPath, `${JSON.stringify(compactConfig(config), null, 2)}\n`, "utf8");
  }

  private get toolingRoot(): string {
    return path.join(this.options.appDataRoot, "tooling");
  }

  private get cacheDir(): string {
    return path.join(this.toolingRoot, "cache");
  }

  private get configPath(): string {
    return path.join(this.toolingRoot, "tooling.json");
  }

  private get platformIoCoreDir(): string {
    return path.join(this.toolingRoot, "platformio");
  }

  private get pythonRoot(): string {
    return path.join(this.toolingRoot, "python", `${process.platform}-${process.arch}`);
  }
}
