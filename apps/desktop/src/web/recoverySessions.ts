import path from "node:path";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";

import { deriveResumeProgress } from "../app/recovery.js";
import type { BrushSize, ColorMode, ResumePlan } from "../types.js";

export type RecoverySessionStatus =
  | "running"
  | "paused"
  | "recoverable"
  | "failed"
  | "completed"
  | "discarded";

export interface RecoveryProfileSummary {
  brushSize: BrushSize;
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

const DAY_IN_MS = 24 * 60 * 60 * 1_000;
const COMPLETED_SESSION_RETENTION_MS = 7 * DAY_IN_MS;
const FAILED_SESSION_RETENTION_MS = 14 * DAY_IN_MS;
const RECOVERABLE_SESSION_RETENTION_MS = 30 * DAY_IN_MS;
const STALE_ACTIVE_SESSION_MESSAGE =
  "The previous drawing session ended unexpectedly. Re-enter the drawing page on your Switch and resume from the saved recovery point.";

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
  constructor(private readonly rootDirectory: string) {}

  get root(): string {
    return this.rootDirectory;
  }

  private commandsFilePath(jobId: string): string {
    return path.join(this.rootDirectory, `${jobId}.commands.txt`);
  }

  private resumeFilePath(jobId: string): string {
    return path.join(this.rootDirectory, `${jobId}.resume.json`);
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

  private async removeSessionFiles(jobId: string): Promise<void> {
    await Promise.all([
      rm(this.resumeFilePath(jobId), { force: true }),
      rm(this.commandsFilePath(jobId), { force: true }),
    ]);
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

      if (!resumeJobIds.has(jobId)) {
        await rm(path.join(this.rootDirectory, entry.name), { force: true });
      }
    }

    for (const entry of resumeEntries) {
      const jobId = entry.name.slice(0, -".resume.json".length);
      const commandsFilePath = this.commandsFilePath(jobId);
      let record: RecoverySessionRecord;

      try {
        const content = await readFile(path.join(this.rootDirectory, entry.name), "utf8");
        record = JSON.parse(content) as RecoverySessionRecord;
      } catch {
        continue;
      }

      try {
        await readFile(commandsFilePath, "utf8");
      } catch {
        await rm(path.join(this.rootDirectory, entry.name), { force: true });
        continue;
      }

      let shouldPersistRecord = false;

      if (
        options.startup &&
        (record.status === "running" || record.status === "paused")
      ) {
        record.status = "recoverable";
        record.error = record.error ?? STALE_ACTIVE_SESSION_MESSAGE;
        record.updatedAt = now;
        shouldPersistRecord = true;
      }

      if (this.shouldRemoveExpiredSession(record, now)) {
        await this.removeSessionFiles(jobId);
        continue;
      }

      if (shouldPersistRecord) {
        await this.writeSession(record);
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
    await this.ensureRoot();
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

    await writeFile(commandsFilePath, `${input.commands.join("\n")}\n`, "utf8");
    await this.writeSession(record);
    return record;
  }

  async writeSession(record: RecoverySessionRecord): Promise<void> {
    await this.ensureRoot();
    await writeFile(this.resumeFilePath(record.jobId), `${JSON.stringify(record, null, 2)}\n`, "utf8");
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
