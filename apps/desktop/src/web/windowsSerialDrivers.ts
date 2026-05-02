import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_INSTALL_LOG_LINES = 120;

export type WindowsSerialDriverId = "cp210x" | "ch341";
type InstallStatus = "idle" | "running" | "completed" | "failed";

export interface WindowsSerialDriverInfo {
  id: WindowsSerialDriverId;
  label: string;
  priority: "primary" | "fallback";
  available: boolean;
  installerPath: string | null;
  error: string | null;
}

export interface WindowsSerialDriverInstallSnapshot {
  status: InstallStatus;
  driverId: WindowsSerialDriverId | null;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  lineOffset: number;
  totalLineCount: number;
  lines: string[];
}

export interface WindowsSerialDriversInfo {
  supported: boolean;
  platform: NodeJS.Platform;
  arch: string;
  reason: string | null;
  drivers: WindowsSerialDriverInfo[];
  install: WindowsSerialDriverInstallSnapshot;
}

interface DriverDefinition {
  id: WindowsSerialDriverId;
  label: string;
  priority: "primary" | "fallback";
  relativePath: string[];
}

const DRIVER_DEFINITIONS: DriverDefinition[] = [
  {
    id: "cp210x",
    label: "CP210x / CP2102",
    priority: "primary",
    relativePath: ["cp210x", "silabser.inf"],
  },
  {
    id: "ch341",
    label: "CH340 / CH341",
    priority: "fallback",
    relativePath: ["ch341", "CH341SER.EXE"],
  },
];

function createIdleInstallState(): WindowsSerialDriverInstallSnapshot {
  return {
    status: "idle",
    driverId: null,
    startedAt: null,
    finishedAt: null,
    error: null,
    lineOffset: 0,
    totalLineCount: 0,
    lines: [],
  };
}

function quotePowerShellString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function isWindowsArm64Host(): boolean {
  return [
    process.env.PROCESSOR_ARCHITECTURE,
    process.env.PROCESSOR_ARCHITEW6432,
    os.machine(),
  ].some((value) => /arm64|aarch64/iu.test(value ?? ""));
}

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });

    let errorOutput = "";
    child.stderr.on("data", (chunk: string | Buffer) => {
      errorOutput += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve();
        return;
      }

      const suffix = errorOutput.trim().length > 0 ? `: ${errorOutput.trim()}` : "";
      reject(new Error(`${command} exited with code ${String(exitCode)}${suffix}`));
    });
  });
}

export class WindowsSerialDriverManager {
  private installState: WindowsSerialDriverInstallSnapshot = createIdleInstallState();

  constructor(private readonly driverRoot: string) {}

  getInfo(): WindowsSerialDriversInfo {
    return {
      supported: this.isSupported,
      platform: process.platform,
      arch: process.arch,
      reason: this.unsupportedReason,
      drivers: this.getDrivers(),
      install: this.getInstallStatus(),
    };
  }

  getInstallStatus(): WindowsSerialDriverInstallSnapshot {
    return {
      ...this.installState,
      lines: [...this.installState.lines],
    };
  }

  async startInstall(driverId: WindowsSerialDriverId): Promise<WindowsSerialDriverInstallSnapshot> {
    if (this.installState.status === "running") {
      return this.getInstallStatus();
    }

    const driver = this.getDrivers().find((item) => item.id === driverId);
    if (!driver) {
      throw new Error(`Unsupported Windows serial driver: ${driverId}`);
    }

    if (!this.isSupported) {
      throw new Error(this.unsupportedReason ?? "Windows serial driver install is not supported on this platform.");
    }

    if (!driver.available || !driver.installerPath) {
      throw new Error(driver.error ?? `${driver.label} driver files are missing.`);
    }

    this.installState = {
      status: "running",
      driverId,
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
      lineOffset: 0,
      totalLineCount: 0,
      lines: [],
    };

    void this.runInstall(driver.id, driver.installerPath, driver.label);
    return this.getInstallStatus();
  }

  private get isSupported(): boolean {
    return process.platform === "win32" && process.arch === "x64" && !isWindowsArm64Host();
  }

  private get unsupportedReason(): string | null {
    if (process.platform !== "win32") {
      return "Windows serial driver install is only available on Windows x64.";
    }

    if (isWindowsArm64Host()) {
      return "Windows ARM64 is not supported. Please use Windows x64.";
    }

    if (process.arch !== "x64") {
      return "Windows serial driver install is only available in the Windows x64 build.";
    }

    return null;
  }

  private getDrivers(): WindowsSerialDriverInfo[] {
    return DRIVER_DEFINITIONS.map((definition) => {
      const installerPath = path.join(this.driverRoot, ...definition.relativePath);
      const available = existsSync(installerPath);

      return {
        id: definition.id,
        label: definition.label,
        priority: definition.priority,
        available,
        installerPath: available ? installerPath : null,
        error: available ? null : `Missing bundled driver file: ${installerPath}`,
      };
    });
  }

  private async runInstall(
    driverId: WindowsSerialDriverId,
    installerPath: string,
    label: string,
  ): Promise<void> {
    try {
      this.appendInstallLine(`Starting ${label} driver install.`);
      this.appendInstallLine("Windows may ask for administrator permission.");

      if (driverId === "cp210x") {
        await this.runElevatedPowerShell([
          "$ErrorActionPreference = 'Stop'",
          `$driver = ${quotePowerShellString(installerPath)}`,
          "$driverArgument = '\"' + $driver + '\"'",
          "$process = Start-Process -FilePath 'pnputil.exe' -ArgumentList @('/add-driver', $driverArgument, '/install') -Verb RunAs -Wait -PassThru",
          "if ($null -ne $process.ExitCode) { exit $process.ExitCode }",
        ]);
      } else {
        await this.runElevatedPowerShell([
          "$ErrorActionPreference = 'Stop'",
          `$installer = ${quotePowerShellString(installerPath)}`,
          "$process = Start-Process -FilePath $installer -Verb RunAs -Wait -PassThru",
          "if ($null -ne $process.ExitCode) { exit $process.ExitCode }",
        ]);
      }

      this.appendInstallLine(`${label} driver installer finished.`);
      this.appendInstallLine("Unplug and reconnect the ESP32, then refresh serial ports.");
      this.finishInstall("completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.appendInstallLine(`ERR ${message}`);
      this.finishInstall("failed", message);
    }
  }

  private async runElevatedPowerShell(lines: string[]): Promise<void> {
    await runProcess("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      lines.join("; "),
    ]);
  }

  private appendInstallLine(line: string): void {
    this.installState.totalLineCount += 1;
    this.installState.lines.push(line);

    if (this.installState.lines.length > MAX_INSTALL_LOG_LINES) {
      this.installState.lines.splice(0, this.installState.lines.length - MAX_INSTALL_LOG_LINES);
    }

    this.installState.lineOffset = this.installState.totalLineCount - this.installState.lines.length;
  }

  private finishInstall(status: "completed" | "failed", error?: string): void {
    this.installState.status = status;
    this.installState.finishedAt = Date.now();
    this.installState.error = error ?? null;
  }
}
