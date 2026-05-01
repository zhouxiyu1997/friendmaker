import { app, BrowserWindow, dialog } from "electron";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { startWebServer, type WebServerHandle } from "../web/server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..", "..");

let mainWindow: BrowserWindow | null = null;
let webServer: WebServerHandle | null = null;

function getStaticRoot(): string {
  return path.resolve(__dirname, "..", "web", "static");
}

function getBundledFirmwareRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "firmware", "esp32");
  }

  return path.join(repoRoot, "firmware", "esp32");
}

function hasWhitespace(value: string): boolean {
  return /\s/u.test(value);
}

function getPlatformIoSafeDataRoot(): string {
  const homeRoot = path.join(app.getPath("home"), ".friend-maker");
  if (!hasWhitespace(homeRoot)) {
    return homeRoot;
  }

  const windowsPublicRoot = process.env.PUBLIC
    ? path.join(process.env.PUBLIC, "FriendMaker")
    : "";
  if (process.platform === "win32" && windowsPublicRoot && !hasWhitespace(windowsPublicRoot)) {
    return windowsPublicRoot;
  }

  return homeRoot;
}

async function ensureWritableFirmwareRoot(): Promise<string> {
  const dataRoot = getPlatformIoSafeDataRoot();
  const targetRoot = path.join(dataRoot, "firmware", "esp32");
  const markerPath = path.join(dataRoot, "firmware", ".friend-maker-version");
  const sourceRoot = getBundledFirmwareRoot();
  let marker = "";

  try {
    marker = (await readFile(markerPath, "utf8")).trim();
  } catch {
    marker = "";
  }

  if (marker === app.getVersion() && existsSync(path.join(targetRoot, "platformio.ini"))) {
    return targetRoot;
  }

  await rm(targetRoot, { recursive: true, force: true });
  await mkdir(path.dirname(targetRoot), { recursive: true });
  await cp(sourceRoot, targetRoot, {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}.pio${path.sep}`),
  });
  await writeFile(markerPath, `${app.getVersion()}\n`, "utf8");

  return targetRoot;
}

async function createMainWindow(): Promise<void> {
  const firmwareRoot = await ensureWritableFirmwareRoot();

  webServer = await startWebServer({
    host: "127.0.0.1",
    port: 0,
    staticRoot: getStaticRoot(),
    firmwareRoot,
    appDataRoot: getPlatformIoSafeDataRoot(),
  });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 720,
    title: "Friend Maker",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(webServer.url);
}

async function stopWebServer(): Promise<void> {
  const handle = webServer;
  webServer = null;
  await handle?.close().catch(() => undefined);
}

const hasLock = app.requestSingleInstanceLock();

if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  app.on("before-quit", () => {
    void stopWebServer();
  });

  app.whenReady()
    .then(createMainWindow)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      void dialog.showMessageBox({
        type: "error",
        title: "Friend Maker 启动失败",
        message,
      });
      app.quit();
    });

  app.on("window-all-closed", () => {
    void stopWebServer().finally(() => {
      app.quit();
    });
  });
}
