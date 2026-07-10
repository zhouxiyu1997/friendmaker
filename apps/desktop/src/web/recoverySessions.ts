import path from "node:path";
import { randomBytes } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";

import { deriveResumeProgress } from "../app/recovery.js";
import type { BrushShape, BrushSize, ColorMode, ResumePlan } from "../types.js";

export type RecoverySessionStatus =
  | "running"
  | "paused"
  | "recoverable"
  | "failed"
  | "completed"
  | "discarded";

export interface RecoveryProfileSummary {
  brushSize: BrushSize;
  brushShape: BrushShape;
  colorMode: ColorMode;
  templateId: string;
  templateLabel: string;
  imageScalePercent: number;
  imageOffsetXPercent: number;
  imageOffsetYPercent: number;
}

export interface RecoverySessionSerialOptions {
  baudRate: number;
  ackTimeoutMs: number;
  retries: number;
}

export interface RecoverySessionRecord {
  version: 1;
  jobId: string;
  status: RecoverySessionStatus;
  sourceLabel: string;
  commandsFilePath: string;
  createdAt: number;
  updatedAt: number;
  totalCommands: number;
  completedCommands: number;
  lastCompletedSegmentIndex: number | null;
  nextResumeSegmentIndex: number | null;
  nextResumeLabel: string | null;
  profileSummary: RecoveryProfileSummary;
  serialOptions: RecoverySessionSerialOptions;
  resumePlan: ResumePlan;
  error: string | null;
}

export interface RecoverySessionSummary {
  jobId: string;
  status: RecoverySessionStatus;
  sourceLabel: string;
  commandsFilePath: string;
  createdAt: number;
  updatedAt: number;
  totalCommands: number;
  completedCommands: number;
  lastCompletedSegmentIndex: number | null;
  nextResumeSegmentIndex: number | null;
  nextResumeLabel: string | null;
  profileSummary: RecoveryProfileSummary;
  error: string | null;
}

interface RecoverySessionCleanupOptions {
  now?: number;
  startup?: boolean;
}

export interface RecoverySessionStoreAtomicWriteContext {
  jobId: string;
  finalPath: string;
  tempPath: string;
  serialized: string;
}

export interface RecoverySessionStoreOptions {
  createAtomicTempPath?: (finalPath: string) => string;
  beforeAtomicRename?: (
    context: RecoverySessionStoreAtomicWriteContext,
  ) => Promise<void> | void;
}

const DAY_IN_MS = 24 * 60 * 60 * 1_000;
const COMPLETED_SESSION_RETENTION_MS = 7 * DAY_IN_MS;
const FAILED_SESSION_RETENTION_MS = 14 * DAY_IN_MS;
const RECOVERABLE_SESSION_RETENTION_MS = 30 * DAY_IN_MS;
const STALE_ACTIVE_SESSION_MESSAGE =
  "The previous drawing session ended unexpectedly. Re-enter the drawing page on your Switch and resume from the saved recovery point; the app will switch back to the saved brush automatically.";

function sanitizeLabelSegment(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/\.[^.]+$/u, "")
    .replace(/[^a-zA-Z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLowerCase();

  return normalized.length > 0 ? normalized.slice(0, 32) : "draw-job";
}

function createJobId(sourceLabel: string, now = new Date()): string {
  const timestamp = [
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
    "-",
    String(now.getMilliseconds()).padStart(3, "0"),
  ].join("");
  const uniqueSuffix = randomBytes(3).toString("hex");

  return `${timestamp}-${uniqueSuffix}-${sanitizeLabelSegment(path.basename(sourceLabel))}`;
}

function toSummary(record: RecoverySessionRecord): RecoverySessionSummary {
  return {
    jobId: record.jobId,
    status: record.status,
    sourceLabel: record.sourceLabel,
    commandsFilePath: record.commandsFilePath,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    totalCommands: record.totalCommands,
    completedCommands: record.completedCommands,
    lastCompletedSegmentIndex: record.lastCompletedSegmentIndex,
    nextResumeSegmentIndex: record.nextResumeSegmentIndex,
    nextResumeLabel: record.nextResumeLabel,
    profileSummary: record.profileSummary,
    error: record.error,
  };
}

export function applyRecoveryProgress(
  record: RecoverySessionRecord,
  completedCommands: number,
): RecoverySessionRecord {
  const progress = deriveResumeProgress(record.resumePlan, completedCommands, record.totalCommands);

  record.completedCommands = progress.completedCommands;
  record.lastCompletedSegmentIndex = progress.lastCompletedSegmentIndex;
  record.nextResumeSegmentIndex = progress.nextResumeSegmentIndex;
  record.nextResumeLabel = progress.nextResumeLabel;
  record.updatedAt = Date.now();
  return record;
}

export function applyRecoveryStatus(
  record: RecoverySessionRecord,
  status: RecoverySessionStatus,
  error: string | null = null,
): RecoverySessionRecord {
  record.status = status;
  record.error = error;
  record.updatedAt = Date.now();
  return record;
}

export class RecoverySessionStore {
  private readonly operationChains = new Map<string, Promise<void>>();

  constructor(
    private readonly rootDirectory: string,
    private readonly options: RecoverySessionStoreOptions = {},
  ) {}

  get root(): string {
    return this.rootDirectory;
  }

  private resolveSessionPath(jobId: string, suffix: string): string {
    if (jobId.length === 0 || /[\\/]/u.test(jobId)) {
      throw new Error("Invalid recovery session id.");
    }

    const rootDirectory = path.resolve(this.rootDirectory);
    const filePath = path.resolve(rootDirectory, `${jobId}${suffix}`);

    if (filePath === rootDirectory || !filePath.startsWith(`${rootDirectory}${path.sep}`)) {
      throw new Error("Invalid recovery session id.");
    }

    return filePath;
  }

  private commandsFilePath(jobId: string): string {
    return this.resolveSessionPath(jobId, ".commands.txt");
  }

  private resumeFilePath(jobId: string): string {
    return this.resolveSessionPath(jobId, ".resume.json");
  }

  private async ensureRoot(): Promise<void> {
    await mkdir(this.rootDirectory, { recursive: true });
  }

  private shouldRemoveExpiredSession(record: RecoverySessionRecord, now: number): boolean {
    const lastUpdatedAt = Math.max(record.updatedAt, record.createdAt);
    const ageMs = Math.max(0, now - lastUpdatedAt);

    switch (record.status) {
      case "completed":
        return ageMs >= COMPLETED_SESSION_RETENTION_MS;
      case "failed":
        return ageMs >= FAILED_SESSION_RETENTION_MS;
      case "paused":
      case "recoverable":
        return ageMs >= RECOVERABLE_SESSION_RETENTION_MS;
      default:
        return false;
    }
  }

  private enqueueJobOperation(
    jobId: string,
    operation: (isLatestOperation: () => boolean) => Promise<void>,
  ): Promise<void> {
    const previous = this.operationChains.get(jobId) ?? Promise.resolve();
    let next: Promise<void>;
    const isLatestOperation = (): boolean => this.operationChains.get(jobId) === next;
    next = previous.catch(() => undefined).then(() => operation(isLatestOperation));

    this.operationChains.set(jobId, next);

    return (async () => {
      try {
        await next;
      } finally {
        if (this.operationChains.get(jobId) === next) {
          this.operationChains.delete(jobId);
        }
      }
    })();
  }

  private removeSessionFiles(jobId: string): Promise<void> {
    const resumeFilePath = this.resumeFilePath(jobId);
    const commandsFilePath = this.commandsFilePath(jobId);

    return this.enqueueJobOperation(jobId, async () => {
      await Promise.all([
        rm(resumeFilePath, { force: true }),
        rm(commandsFilePath, { force: true }),
      ]);
    });
  }

  private cleanupOrphanCommands(jobId: string): Promise<void> {
    const resumeFilePath = this.resumeFilePath(jobId);
    const commandsFilePath = this.commandsFilePath(jobId);

    return this.enqueueJobOperation(jobId, async (isLatestOperation) => {
      try {
        await readFile(resumeFilePath, "utf8");
        return;
      } catch {
        // Recheck inside the per-job queue before removing a command-file orphan.
      }

      if (isLatestOperation()) {
        await rm(commandsFilePath, { force: true });
      }
    });
  }

  private cleanupResumeSession(
    jobId: string,
    options: RecoverySessionCleanupOptions,
    now: number,
  ): Promise<void> {
    const resumeFilePath = this.resumeFilePath(jobId);
    const commandsFilePath = this.commandsFilePath(jobId);

    return this.enqueueJobOperation(jobId, async (isLatestOperation) => {
      let record: RecoverySessionRecord;

      try {
        record = JSON.parse(await readFile(resumeFilePath, "utf8")) as RecoverySessionRecord;
      } catch {
        return;
      }

      try {
        await readFile(commandsFilePath, "utf8");
      } catch {
        if (isLatestOperation()) {
          await rm(resumeFilePath, { force: true });
        }
        return;
      }

      let shouldPersistRecord = false;

      if (
        options.startup &&
        (record.status === "running" || record.status === "paused")
      ) {
        if (record.nextResumeSegmentIndex === null) {
          record.status = "completed";
          record.error = null;
        } else {
          record.status = "recoverable";
          record.error = record.error ?? STALE_ACTIVE_SESSION_MESSAGE;
        }
        record.updatedAt = now;
        shouldPersistRecord = true;
      }

      if (this.shouldRemoveExpiredSession(record, now)) {
        if (isLatestOperation()) {
          await Promise.all([
            rm(resumeFilePath, { force: true }),
            rm(commandsFilePath, { force: true }),
          ]);
        }
        return;
      }

      if (shouldPersistRecord) {
        await this.writeSerializedSession(
          jobId,
          resumeFilePath,
          `${JSON.stringify(record, null, 2)}\n`,
        );
      }
    });
  }

  private async writeSerializedSession(
    jobId: string,
    finalPath: string,
    serialized: string,
  ): Promise<void> {
    await this.ensureRoot();
    const tempPath =
      this.options.createAtomicTempPath?.(finalPath) ??
      `${finalPath}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;

    if (path.dirname(tempPath) !== path.dirname(finalPath)) {
      throw new Error("Recovery session temporary file must be next to the final file.");
    }

    const context: RecoverySessionStoreAtomicWriteContext = {
      jobId,
      finalPath,
      tempPath,
      serialized,
    };
    let operationError: unknown;
    let tempCreated = false;

    try {
      const tempFile = await open(tempPath, "wx");
      tempCreated = true;
      let writeError: unknown;

      try {
        await tempFile.writeFile(serialized, "utf8");
      } catch (error) {
        writeError = error;
        throw error;
      } finally {
        try {
          await tempFile.close();
        } catch (closeError) {
          if (writeError === undefined) {
            throw closeError;
          }
        }
      }

      await this.options.beforeAtomicRename?.(context);
      await rename(tempPath, finalPath);
    } catch (error) {
      operationError = error;
      throw error;
    } finally {
      if (tempCreated) {
        try {
          await rm(tempPath, { force: true });
        } catch (cleanupError) {
          if (operationError === undefined) {
            throw cleanupError;
          }
        }
      }
    }
  }

  async cleanupSessions(options: RecoverySessionCleanupOptions = {}): Promise<void> {
    await this.ensureRoot();
    const now = options.now ?? Date.now();
    const entries = await readdir(this.rootDirectory, { withFileTypes: true });
    const resumeEntries = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".resume.json"));
    const commandEntries = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".commands.txt"));
    const resumeJobIds = new Set(
      resumeEntries.map((entry) => entry.name.slice(0, -".resume.json".length)),
    );

    for (const entry of commandEntries) {
      const jobId = entry.name.slice(0, -".commands.txt".length);

      if (!resumeJobIds.has(jobId) && !this.operationChains.has(jobId)) {
        await this.cleanupOrphanCommands(jobId);
      }
    }

    for (const entry of resumeEntries) {
      const jobId = entry.name.slice(0, -".resume.json".length);

      if (!this.operationChains.has(jobId)) {
        await this.cleanupResumeSession(jobId, options, now);
      }
    }
  }

  async createSession(input: {
    commands: string[];
    resumePlan: ResumePlan;
    sourceLabel: string;
    profileSummary: RecoveryProfileSummary;
    serialOptions: RecoverySessionSerialOptions;
  }): Promise<RecoverySessionRecord> {
    await this.cleanupSessions();
    const now = Date.now();
    const jobId = createJobId(input.sourceLabel, new Date(now));
    const commandsFilePath = this.commandsFilePath(jobId);
    const progress = deriveResumeProgress(input.resumePlan, 0, input.commands.length);
    const record: RecoverySessionRecord = {
      version: 1,
      jobId,
      status: "running",
      sourceLabel: input.sourceLabel,
      commandsFilePath,
      createdAt: now,
      updatedAt: now,
      totalCommands: input.commands.length,
      completedCommands: progress.completedCommands,
      lastCompletedSegmentIndex: progress.lastCompletedSegmentIndex,
      nextResumeSegmentIndex: progress.nextResumeSegmentIndex,
      nextResumeLabel: progress.nextResumeLabel,
      profileSummary: input.profileSummary,
      serialOptions: input.serialOptions,
      resumePlan: input.resumePlan,
      error: null,
    };
    const serializedCommands = `${input.commands.join("\n")}\n`;
    const serializedRecord = `${JSON.stringify(record, null, 2)}\n`;
    const resumeFilePath = this.resumeFilePath(jobId);

    await this.enqueueJobOperation(jobId, async () => {
      await this.ensureRoot();
      let commandsCreated = false;
      let creationError: unknown;

      try {
        await writeFile(commandsFilePath, serializedCommands, { encoding: "utf8", flag: "wx" });
        commandsCreated = true;
        await this.writeSerializedSession(jobId, resumeFilePath, serializedRecord);
      } catch (error) {
        creationError = error;
        throw error;
      } finally {
        if (creationError !== undefined && commandsCreated) {
          try {
            await rm(commandsFilePath, { force: true });
          } catch {
            // Preserve the original creation failure; regular cleanup handles leftovers.
          }
        }
      }
    });
    return record;
  }

  writeSession(record: RecoverySessionRecord): Promise<void> {
    const jobId = record.jobId;
    const finalPath = this.resumeFilePath(jobId);
    const serialized = `${JSON.stringify(record, null, 2)}\n`;

    return this.enqueueJobOperation(jobId, async () => {
      await this.writeSerializedSession(jobId, finalPath, serialized);
    });
  }

  async loadSession(jobId: string): Promise<RecoverySessionRecord> {
    const content = await readFile(this.resumeFilePath(jobId), "utf8");
    return JSON.parse(content) as RecoverySessionRecord;
  }

  async loadCommands(jobId: string): Promise<string[]> {
    const content = await readFile(this.commandsFilePath(jobId), "utf8");
    return content
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  async listSessions(): Promise<RecoverySessionSummary[]> {
    await this.cleanupSessions();
    await this.ensureRoot();
    const entries = await readdir(this.rootDirectory, { withFileTypes: true });
    const records: RecoverySessionSummary[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".resume.json")) {
        continue;
      }

      try {
        const content = await readFile(path.join(this.rootDirectory, entry.name), "utf8");
        records.push(toSummary(JSON.parse(content) as RecoverySessionRecord));
      } catch {
        // Ignore corrupted recovery files so one bad file does not block the UI.
      }
    }

    return records.sort((left, right) => {
      if (right.updatedAt !== left.updatedAt) {
        return right.updatedAt - left.updatedAt;
      }

      return right.createdAt - left.createdAt;
    });
  }

  async discardSession(jobId: string): Promise<void> {
    await this.removeSessionFiles(jobId);
  }
}

export function summarizeRecoverySession(record: RecoverySessionRecord): RecoverySessionSummary {
  return toSummary(record);
}
