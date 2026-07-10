import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { access, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import test from "node:test";

import {
  buildRecoveryExecutionPlan,
  deriveResumeProgress,
} from "../src/app/recovery.js";
import { estimateRuntimeMs, generateScanlinePlan } from "../src/path/scanline.js";
import { serializeCommands } from "../src/protocol/serializer.js";
import { SimulatedAckSender } from "../src/simulator/sender.js";
import { startWebServer } from "../src/web/server.js";
import {
  RecoverySessionStore,
  applyRecoveryProgress,
  applyRecoveryStatus,
} from "../src/web/recoverySessions.js";
import type { DrawingProfile, Pixel, PixelMap, ResumePlan } from "../src/types.js";

function makeProfile(overrides: Partial<DrawingProfile> = {}): DrawingProfile {
  return {
    profileName: "test",
    baudRate: 115200,
    canvasWidth: 8,
    canvasHeight: 4,
    resizeMode: "contain",
    cellMoveDuration: 80,
    inputDelay: 100,
    homeDuration: 1800,
    buttonPressDuration: 100,
    colorChangeDuration: 450,
    ackTimeoutMs: 2_000,
    commandRetryCount: 1,
    drawButton: "A",
    colorMode: "mono",
    colorCount: 2,
    monoThreshold: 128,
    palette: ["#000000", "#ffffff"],
    brushSize: 1,
    brushShape: "square",
    startCursor: "center",
    startTool: "pen",
    startColorIndex: 0,
    centerToTopLeftDx: 0,
    centerToTopLeftDy: 0,
    ...overrides,
  };
}

function makePixelMap(
  width: number,
  height: number,
  pixels: Array<{ x: number; y: number; colorIndex: number; colorHex: string }>,
): PixelMap {
  const pixelByKey = new Map(pixels.map((pixel) => [`${pixel.x},${pixel.y}`, pixel]));

  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x): Pixel => {
      const pixel = pixelByKey.get(`${x},${y}`);

      return {
        x,
        y,
        colorIndex: pixel?.colorIndex ?? -1,
        colorHex: pixel?.colorHex ?? "#ffffff",
        alpha: pixel ? 255 : 0,
      };
    }),
  );
}

function makeRecoveryProfileSummary(profile: DrawingProfile) {
  return {
    brushSize: profile.brushSize,
    brushShape: profile.brushShape,
    colorMode: profile.colorMode,
    templateId: "none",
    templateLabel: "无模板（正方形）",
    imageScalePercent: 100,
    imageOffsetXPercent: 0,
    imageOffsetYPercent: 0,
  };
}

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

async function createRecoverySession(
  store: RecoverySessionStore,
  sourceLabel = "recovery-test.png",
) {
  const profile = makeProfile({
    canvasWidth: 6,
    canvasHeight: 1,
    colorMode: "palette",
    palette: ["#000000", "#ffffff"],
  });
  const pixelMap = makePixelMap(6, 1, [
    { x: 1, y: 0, colorIndex: 0, colorHex: "#000000" },
    { x: 4, y: 0, colorIndex: 1, colorHex: "#ffffff" },
  ]);
  const scanlinePlan = generateScanlinePlan(pixelMap, profile);
  const commands = serializeCommands(scanlinePlan.commands);
  const record = await store.createSession({
    commands,
    resumePlan: scanlinePlan.resumePlan,
    sourceLabel,
    profileSummary: makeRecoveryProfileSummary(profile),
    serialOptions: {
      baudRate: profile.baudRate,
      ackTimeoutMs: profile.ackTimeoutMs,
      retries: profile.commandRetryCount,
    },
  });

  return { commands, profile, record, resumePlan: scanlinePlan.resumePlan };
}

async function waitForCondition(
  condition: () => boolean,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    if (condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.fail("Timed out waiting for recovery test condition.");
}

async function settlesWithin(promise: Promise<void>, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);

    promise.then(
      () => {
        clearTimeout(timeout);
        resolve(true);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function makeFileSystemError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`simulated ${code}`), { code });
}

function expectedBrushSetupPrefix(
  brushSize: DrawingProfile["brushSize"],
  brushShape: DrawingProfile["brushShape"],
): string[] {
  const columnsBySize = {
    1: 0,
    3: 1,
    7: 2,
    13: 3,
    19: 4,
    27: 5,
  } as const;
  const rowsByShape = {
    round: 0,
    square: 1,
  } as const;
  const dx = columnsBySize[brushSize] - 2;
  const dy = rowsByShape[brushShape];
  const commands = ["BTN X", "W 150", "BTN X", "W 150"];

  if (dx !== 0 || dy !== 0) {
    commands.push(`M ${dx} ${dy}`);
    commands.push("W 150");
  }

  commands.push("BTN A");
  commands.push("W 150");
  commands.push("BTN A");
  commands.push("W 150");
  commands.push("BTN A");
  commands.push("W 3000");
  return commands;
}

async function waitForExecutionStatus(
  serverUrl: string,
  expectedStatus: string,
  timeoutMs = 2_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "idle";

  while (Date.now() <= deadline) {
    const statusResponse = await fetch(`${serverUrl}/api/execution/status`);
    const statusPayload = (await statusResponse.json()) as {
      execution?: { status?: string };
    };

    lastStatus = statusPayload.execution?.status ?? lastStatus;

    if (lastStatus === expectedStatus) {
      return lastStatus;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  return lastStatus;
}

test("mono resume segments keep the first draw command when the segment already starts at center", () => {
  const profile = makeProfile({
    canvasWidth: 5,
    canvasHeight: 1,
    startColorIndex: 1,
  });
  const pixelMap = makePixelMap(5, 1, [
    { x: 2, y: 0, colorIndex: 1, colorHex: "#ffffff" },
  ]);
  const scanlinePlan = generateScanlinePlan(pixelMap, profile);
  const commands = serializeCommands(scanlinePlan.commands);
  const [segment] = scanlinePlan.resumePlan.segments;

  assert.ok(segment);
  assert.deepEqual(scanlinePlan.resumePlan.initialCursor, { x: 2, y: 0 });
  assert.deepEqual(segment.resumePrefixCommands, [
    ...expectedBrushSetupPrefix(1, "square"),
    "C 1",
    "W 500",
  ]);
  assert.deepEqual(segment.firstCanvasPosition, { x: 2, y: 0 });
  assert.equal(segment.bodyStartCommandIndex, 13);
  assert.equal(commands[segment.bodyStartCommandIndex], "P");
  assert.equal(segment.commandEndExclusive, 14);
});

test("official and palette segments interleave config and use standalone recovery prefixes", () => {
  const profile = makeProfile({
    canvasWidth: 9,
    canvasHeight: 1,
    colorMode: "official",
    colorCount: 16,
    palette: Array.from({ length: 16 }, (_, index) => `#${String(index + 1).padStart(6, "0")}`),
  });
  const pixelMap = makePixelMap(9, 1, [
    { x: 1, y: 0, colorIndex: 2, colorHex: "#ff0000" },
    { x: 4, y: 0, colorIndex: 5, colorHex: "#00ff00" },
    { x: 7, y: 0, colorIndex: 7, colorHex: "#0000ff" },
  ]);
  const officialPlan = generateScanlinePlan(pixelMap, profile);
  const officialCommands = serializeCommands(officialPlan.commands);
  const officialSegments = officialPlan.resumePlan.segments;
  const expectedSquarePrefix = expectedBrushSetupPrefix(1, "square");
  const expectedOfficialConfigs = ["BC 0 0 2", "BC 1 0 5", "BC 2 0 7"];

  assert.equal(officialSegments.length, 3);
  assert.equal(officialCommands.filter((command) => command === "BC RESET").length, 1);
  assert.equal(officialCommands.some((command) => /^C /u.test(command)), false);

  officialSegments.forEach((segment, index) => {
    const configCommand = expectedOfficialConfigs[index]!;
    const configIndex = officialCommands.indexOf(configCommand);

    assert.deepEqual(segment.resumePrefixCommands, [
      ...expectedSquarePrefix,
      "BC RESET",
      configCommand,
      "W 500",
    ]);
    assert.ok(configIndex >= 0);
    if (index === 0) {
      assert.equal(officialCommands[configIndex - 1], "BC RESET");
    } else {
      assert.equal(configIndex, officialSegments[index - 1]?.commandEndExclusive);
    }
    assert.equal(officialCommands[configIndex + 1], "W 500");
    assert.ok(configIndex + 1 < segment.bodyStartCommandIndex);
    assert.equal(officialCommands[segment.bodyStartCommandIndex], "P");
  });

  const paletteProfile = makeProfile({
    canvasWidth: 9,
    canvasHeight: 1,
    colorMode: "palette",
    colorCount: 16,
    palette: Array.from({ length: 16 }, (_, index) => `#${String(index + 1).padStart(6, "0")}`),
  });
  const palettePlan = generateScanlinePlan(pixelMap, paletteProfile);
  const paletteCommands = serializeCommands(palettePlan.commands);
  const paletteSegments = palettePlan.resumePlan.segments;
  const expectedPaletteConfigs = ["PC 0 #ff0000", "PC 1 #00ff00", "PC 2 #0000ff"];

  assert.equal(paletteCommands.some((command) => /^C /u.test(command)), false);
  paletteSegments.forEach((segment, index) => {
    const configCommand = expectedPaletteConfigs[index]!;
    const configIndex = paletteCommands.indexOf(configCommand);

    assert.deepEqual(segment.resumePrefixCommands, [
      ...expectedSquarePrefix,
      configCommand,
      "W 500",
    ]);
    assert.ok(configIndex >= 0);
    if (index > 0) {
      assert.equal(configIndex, paletteSegments[index - 1]?.commandEndExclusive);
    }
    assert.equal(paletteCommands[configIndex + 1], "W 500");
    assert.ok(configIndex + 1 < segment.bodyStartCommandIndex);
  });
});

test("recovery execution plan redraws the current failed color segment and still reaches the original total", async () => {
  const profile = makeProfile({
    canvasWidth: 6,
    canvasHeight: 1,
    colorMode: "mono",
  });
  const pixelMap = makePixelMap(6, 1, [
    { x: 1, y: 0, colorIndex: 0, colorHex: "#000000" },
    { x: 4, y: 0, colorIndex: 0, colorHex: "#000000" },
  ]);
  const scanlinePlan = generateScanlinePlan(pixelMap, profile);
  const commands = serializeCommands(scanlinePlan.commands);
  const failAtCommand = commands.length - 1;
  const sender = new SimulatedAckSender();
  let completedCommands = 0;

  await assert.rejects(
    sender.send(commands, {
      ackTimeoutMs: profile.ackTimeoutMs,
      retries: 0,
      ackDelayMs: 0,
      inputReportFailureAtCommand: failAtCommand,
      onProgress: ({ index }) => {
        completedCommands = index;
      },
    }),
    /Device returned/u,
  );

  const recoveryPlan = buildRecoveryExecutionPlan({
    commands,
    resumePlan: scanlinePlan.resumePlan,
    completedCommands,
  });

  assert.equal(recoveryPlan.resumeSegment.segmentIndex, 0);
  assert.equal(recoveryPlan.progressMap.at(0), 0);
  let resumedCompletedCommands = recoveryPlan.resumedFromCompletedCommands;

  await new SimulatedAckSender().send(recoveryPlan.commands, {
    ackTimeoutMs: profile.ackTimeoutMs,
    retries: profile.commandRetryCount,
    ackDelayMs: 0,
    onProgress: ({ index }) => {
      resumedCompletedCommands = recoveryPlan.progressMap[index - 1] ?? resumedCompletedCommands;
    },
  });

  assert.equal(resumedCompletedCommands, commands.length);
});

test("recovery progress resumes from the next unfinished color when the failure already reached the next batch config", () => {
  const palette = Array.from({ length: 12 }, (_, index) => `#${(index + 1).toString(16).padStart(6, "0")}`);
  const profile = makeProfile({
    canvasWidth: 12,
    canvasHeight: 1,
    colorMode: "palette",
    colorCount: 12,
    palette,
  });
  const pixelMap = makePixelMap(
    12,
    1,
    palette.map((colorHex, x) => ({
      x,
      y: 0,
      colorIndex: x,
      colorHex,
    })),
  );
  const scanlinePlan = generateScanlinePlan(pixelMap, profile);
  const commands = serializeCommands(scanlinePlan.commands);
  const ninthSegment = scanlinePlan.resumePlan.segments[8];
  const progress = deriveResumeProgress(
    scanlinePlan.resumePlan,
    (ninthSegment?.commandEndExclusive ?? 0) + 1,
    commands.length,
  );
  const recoveryPlan = buildRecoveryExecutionPlan({
    commands,
    resumePlan: scanlinePlan.resumePlan,
    completedCommands: (ninthSegment?.commandEndExclusive ?? 0) + 1,
  });

  assert.equal(progress.lastCompletedSegmentIndex, 8);
  assert.equal(recoveryPlan.resumeSegment.segmentIndex, 9);
});

test("recovery cleanup removes expired completed sessions and orphaned command files", async () => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-recovery-cleanup-"));
  try {
    const profile = makeProfile({ canvasWidth: 5, canvasHeight: 1 });
    const pixelMap = makePixelMap(5, 1, [
      { x: 2, y: 0, colorIndex: 0, colorHex: "#000000" },
    ]);
    const scanlinePlan = generateScanlinePlan(pixelMap, profile);
    const commands = serializeCommands(scanlinePlan.commands);
    const store = new RecoverySessionStore(recoverySessionsRoot);
    const record = await store.createSession({
      commands,
      resumePlan: scanlinePlan.resumePlan,
      sourceLabel: "cleanup-demo.png",
      profileSummary: makeRecoveryProfileSummary(profile),
      serialOptions: {
        baudRate: profile.baudRate,
        ackTimeoutMs: profile.ackTimeoutMs,
        retries: profile.commandRetryCount,
      },
    });
    const staleTimestamp = Date.now() - 8 * 24 * 60 * 60 * 1_000;
    const orphanCommandsFilePath = path.join(recoverySessionsRoot, "orphan.commands.txt");
    const resumeFilePath = path.join(recoverySessionsRoot, `${record.jobId}.resume.json`);

    applyRecoveryStatus(record, "completed");
    record.createdAt = staleTimestamp;
    record.updatedAt = staleTimestamp;
    await store.writeSession(record);
    await writeFile(orphanCommandsFilePath, "P\n", "utf8");

    await store.cleanupSessions();

    await assert.rejects(access(record.commandsFilePath));
    await assert.rejects(access(resumeFilePath));
    await assert.rejects(access(orphanCommandsFilePath));
    assert.deepEqual(await store.listSessions(), []);
  } finally {
    await rm(recoverySessionsRoot, { recursive: true, force: true });
  }
});

test("recovery sessions keep unique job ids even within the same millisecond", async () => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-recovery-unique-"));
  const profile = makeProfile({ canvasWidth: 5, canvasHeight: 1 });
  const pixelMap = makePixelMap(5, 1, [
    { x: 2, y: 0, colorIndex: 0, colorHex: "#000000" },
  ]);
  const scanlinePlan = generateScanlinePlan(pixelMap, profile);
  const commands = serializeCommands(scanlinePlan.commands);
  const store = new RecoverySessionStore(recoverySessionsRoot);
  const originalNow = Date.now;

  Date.now = () => 1_714_816_800_000;

  try {
    const first = await store.createSession({
      commands,
      resumePlan: scanlinePlan.resumePlan,
      sourceLabel: "same-image.png",
      profileSummary: makeRecoveryProfileSummary(profile),
      serialOptions: {
        baudRate: profile.baudRate,
        ackTimeoutMs: profile.ackTimeoutMs,
        retries: profile.commandRetryCount,
      },
    });
    const second = await store.createSession({
      commands,
      resumePlan: scanlinePlan.resumePlan,
      sourceLabel: "same-image.png",
      profileSummary: makeRecoveryProfileSummary(profile),
      serialOptions: {
        baudRate: profile.baudRate,
        ackTimeoutMs: profile.ackTimeoutMs,
        retries: profile.commandRetryCount,
      },
    });
    const sessions = await store.listSessions();

    assert.notEqual(first.jobId, second.jobId);
    assert.equal(sessions.length, 2);
  } finally {
    Date.now = originalNow;
    await rm(recoverySessionsRoot, { recursive: true, force: true });
  }
});

test("recovery writes serialize immutable snapshots and leave no temporary files", async () => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-recovery-atomic-"));
  const setupStore = new RecoverySessionStore(recoverySessionsRoot);

  try {
    const { record } = await createRecoverySession(setupStore, "atomic-order.png");
    const firstRenameEntered = createDeferred();
    const releaseFirstRename = createDeferred();
    let renameEntries = 0;
    const store = new RecoverySessionStore(recoverySessionsRoot, {
      beforeAtomicRename: async () => {
        renameEntries += 1;

        if (renameEntries === 1) {
          firstRenameEntered.resolve();
          await releaseFirstRename.promise;
        }
      },
    });
    const firstSnapshot = { ...record, completedCommands: 1, updatedAt: record.updatedAt + 1 };
    const secondSnapshot = { ...record, completedCommands: 2, updatedAt: record.updatedAt + 2 };
    const firstWrite = store.writeSession(firstSnapshot);

    await waitForCondition(() => renameEntries === 1, 500);
    const secondWrite = store.writeSession(secondSnapshot);
    secondSnapshot.completedCommands = 999;
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(renameEntries, 1, "the second rename must wait for the first operation");
    releaseFirstRename.resolve();
    await Promise.all([firstWrite, secondWrite]);

    assert.equal((await store.loadSession(record.jobId)).completedCommands, 2);
    assert.equal(
      (await readdir(recoverySessionsRoot)).some((name) => name.includes(".tmp-")),
      false,
    );
  } finally {
    await rm(recoverySessionsRoot, { recursive: true, force: true });
  }
});

test("a failed recovery write does not poison the next queued snapshot", async () => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-recovery-retry-"));
  const setupStore = new RecoverySessionStore(recoverySessionsRoot);

  try {
    const { record } = await createRecoverySession(setupStore, "atomic-retry.png");
    let renameAttempts = 0;
    const store = new RecoverySessionStore(recoverySessionsRoot, {
      beforeAtomicRename: () => {
        renameAttempts += 1;

        if (renameAttempts === 1) {
          throw new Error("simulated atomic rename failure");
        }
      },
    });
    const firstWrite = store.writeSession({ ...record, completedCommands: 1 });
    const secondWrite = store.writeSession({ ...record, completedCommands: 2 });

    await assert.rejects(firstWrite, /simulated atomic rename failure/u);
    await secondWrite;

    assert.equal((await store.loadSession(record.jobId)).completedCommands, 2);
    assert.equal(renameAttempts, 2);
    assert.equal(
      (await readdir(recoverySessionsRoot)).some((name) => name.includes(".tmp-")),
      false,
    );
  } finally {
    await rm(recoverySessionsRoot, { recursive: true, force: true });
  }
});

test("a temporary-file collision never deletes a file this store did not create", async () => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-recovery-collision-"));
  const setupStore = new RecoverySessionStore(recoverySessionsRoot);

  try {
    const { record } = await createRecoverySession(setupStore, "atomic-collision.png");
    const finalPath = path.join(recoverySessionsRoot, `${record.jobId}.resume.json`);
    const collidingTempPath = `${finalPath}.tmp-collision`;
    await writeFile(collidingTempPath, "foreign temp contents", "utf8");
    const store = new RecoverySessionStore(recoverySessionsRoot, {
      createAtomicTempPath: () => collidingTempPath,
    });

    await assert.rejects(
      store.writeSession({ ...record, completedCommands: 1 }),
      (error: NodeJS.ErrnoException) => error.code === "EEXIST",
    );
    assert.equal(await readFile(collidingTempPath, "utf8"), "foreign temp contents");
  } finally {
    await rm(recoverySessionsRoot, { recursive: true, force: true });
  }
});

test("cleanup skips jobs while their atomic create or update operation is pending", async () => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-recovery-cleanup-race-"));
  const renameEntered = createDeferred();
  const releaseRename = createDeferred();
  let gatedJobId: string | null = null;
  let shouldGate = true;
  const store = new RecoverySessionStore(recoverySessionsRoot, {
    beforeAtomicRename: async ({ jobId }) => {
      if (!shouldGate) {
        return;
      }

      gatedJobId = jobId;
      renameEntered.resolve();
      await releaseRename.promise;
    },
  });

  try {
    const create = createRecoverySession(store, "cleanup-create-race.png");
    await renameEntered.promise;
    assert.ok(gatedJobId);

    const cleanup = store.cleanupSessions();
    const cleanupSettledBeforeRelease = await settlesWithin(cleanup, 500);
    shouldGate = false;
    releaseRename.resolve();
    const { record } = await create;
    await cleanup;

    assert.equal(cleanupSettledBeforeRelease, true);
    assert.equal((await store.loadSession(record.jobId)).jobId, record.jobId);
    await access(record.commandsFilePath);

    applyRecoveryStatus(record, "completed");
    record.createdAt = Date.now() - 8 * 24 * 60 * 60 * 1_000;
    record.updatedAt = record.createdAt;
    await store.writeSession(record);

    const updateRenameEntered = createDeferred();
    const releaseUpdateRename = createDeferred();
    const updateStore = new RecoverySessionStore(recoverySessionsRoot, {
      beforeAtomicRename: async () => {
        updateRenameEntered.resolve();
        await releaseUpdateRename.promise;
      },
    });
    const activeSnapshot = { ...record, status: "running" as const, updatedAt: Date.now() };
    const update = updateStore.writeSession(activeSnapshot);
    await updateRenameEntered.promise;

    const updateCleanup = updateStore.cleanupSessions();
    const updateCleanupSettledBeforeRelease = await settlesWithin(updateCleanup, 500);
    releaseUpdateRename.resolve();
    await Promise.all([update, updateCleanup]);

    assert.equal(updateCleanupSettledBeforeRelease, true);
    assert.equal((await updateStore.loadSession(record.jobId)).status, "running");
    await access(record.commandsFilePath);
  } finally {
    shouldGate = false;
    releaseRename.resolve();
    await rm(recoverySessionsRoot, { recursive: true, force: true });
  }
});

test("a failed session delete waits for every removal before the next write starts", async () => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-recovery-delete-settle-"));
  const setupStore = new RecoverySessionStore(recoverySessionsRoot);
  const releaseResumeRemoval = createDeferred();
  const nextWriteRenameEntered = createDeferred();
  let resumeRemovalEntries = 0;

  try {
    const { record } = await createRecoverySession(setupStore, "delete-settle.png");
    const resumeFilePath = path.join(recoverySessionsRoot, `${record.jobId}.resume.json`);
    const store = new RecoverySessionStore(recoverySessionsRoot, {
      removeRecoveryFile: async (filePath) => {
        if (filePath === record.commandsFilePath) {
          throw makeFileSystemError("EIO");
        }

        if (filePath === resumeFilePath) {
          resumeRemovalEntries += 1;
          await releaseResumeRemoval.promise;
        }

        await rm(filePath, { force: true });
      },
      beforeAtomicRename: () => {
        nextWriteRenameEntered.resolve();
      },
    });
    const discard = store.discardSession(record.jobId);
    void discard.catch(() => undefined);

    await waitForCondition(() => resumeRemovalEntries === 1, 500);
    const write = store.writeSession({ ...record, completedCommands: 1 });
    const writeStartedBeforeRemovalFinished = await settlesWithin(
      nextWriteRenameEntered.promise,
      200,
    );

    releaseResumeRemoval.resolve();
    await assert.rejects(discard, (error: NodeJS.ErrnoException) => error.code === "EIO");
    await write;

    assert.equal(writeStartedBeforeRemovalFinished, false);
    assert.equal((await store.loadSession(record.jobId)).completedCommands, 1);
  } finally {
    releaseResumeRemoval.resolve();
    await rm(recoverySessionsRoot, { recursive: true, force: true });
  }
});

test("claiming a recovery session keeps cleanup outside the read-to-write window", async () => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-recovery-claim-"));
  const setupStore = new RecoverySessionStore(recoverySessionsRoot);
  const claimRenameEntered = createDeferred();
  const releaseClaimRename = createDeferred();

  try {
    const { commands, record } = await createRecoverySession(setupStore, "claim-race.png");
    applyRecoveryStatus(record, "recoverable");
    const expiredTimestamp = Date.now() - 31 * 24 * 60 * 60 * 1_000;
    record.createdAt = expiredTimestamp;
    record.updatedAt = expiredTimestamp;
    await setupStore.writeSession(record);
    const store = new RecoverySessionStore(recoverySessionsRoot, {
      beforeAtomicRename: async () => {
        claimRenameEntered.resolve();
        await releaseClaimRename.promise;
      },
    });
    const claim = store.claimSession(record.jobId, ({ commands: loadedCommands, record: loaded }) => {
      applyRecoveryStatus(loaded, "running");
      return {
        record: loaded,
        value: loadedCommands.length,
      };
    });

    await claimRenameEntered.promise;
    const cleanup = store.cleanupSessions();
    const cleanupSettledBeforeClaimWrite = await settlesWithin(cleanup, 500);
    releaseClaimRename.resolve();
    const claimed = await claim;
    await cleanup;

    assert.equal(cleanupSettledBeforeClaimWrite, true);
    assert.equal(claimed.value, commands.length);
    assert.equal(claimed.record.status, "running");
    assert.equal((await store.loadSession(record.jobId)).status, "running");
    await access(record.commandsFilePath);
  } finally {
    releaseClaimRename.resolve();
    await rm(recoverySessionsRoot, { recursive: true, force: true });
  }
});

test("cleanup treats only ENOENT as an orphan or missing recovery file", async () => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-recovery-read-error-"));
  const setupStore = new RecoverySessionStore(recoverySessionsRoot);

  try {
    const orphanCommandsPath = path.join(recoverySessionsRoot, "permission-orphan.commands.txt");
    const orphanResumePath = path.join(recoverySessionsRoot, "permission-orphan.resume.json");
    await writeFile(orphanCommandsPath, "P\n", "utf8");
    const orphanStore = new RecoverySessionStore(recoverySessionsRoot, {
      readRecoveryFile: async (filePath) => {
        if (filePath === orphanResumePath) {
          throw makeFileSystemError("EACCES");
        }

        return readFile(filePath, "utf8");
      },
    });

    await orphanStore.cleanupSessions();
    await access(orphanCommandsPath);

    const { record } = await createRecoverySession(setupStore, "permission-missing.png");
    const resumeFilePath = path.join(recoverySessionsRoot, `${record.jobId}.resume.json`);
    await rm(record.commandsFilePath, { force: true });
    const missingStore = new RecoverySessionStore(recoverySessionsRoot, {
      readRecoveryFile: async (filePath) => {
        if (filePath === record.commandsFilePath) {
          throw makeFileSystemError("EACCES");
        }

        return readFile(filePath, "utf8");
      },
    });

    await missingStore.cleanupSessions();
    await access(resumeFilePath);
  } finally {
    await rm(recoverySessionsRoot, { recursive: true, force: true });
  }
});

test("discard queued behind an in-flight write cannot resurrect recovery files", async () => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-recovery-discard-"));
  const setupStore = new RecoverySessionStore(recoverySessionsRoot);

  try {
    const { record } = await createRecoverySession(setupStore, "atomic-discard.png");
    const renameEntered = createDeferred();
    const releaseRename = createDeferred();
    let renameEntries = 0;
    const store = new RecoverySessionStore(recoverySessionsRoot, {
      beforeAtomicRename: async () => {
        renameEntries += 1;
        renameEntered.resolve();
        await releaseRename.promise;
      },
    });
    const write = store.writeSession({ ...record, completedCommands: 1 });

    await waitForCondition(() => renameEntries === 1, 500);
    const discard = store.discardSession(record.jobId);
    releaseRename.resolve();
    await Promise.all([write, discard]);

    await assert.rejects(access(record.commandsFilePath));
    await assert.rejects(access(path.join(recoverySessionsRoot, `${record.jobId}.resume.json`)));
    assert.equal(
      (await readdir(recoverySessionsRoot)).some((name) => name.includes(".tmp-")),
      false,
    );
  } finally {
    await rm(recoverySessionsRoot, { recursive: true, force: true });
  }
});

test("managed execution persists only segment checkpoints and terminal status", async () => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-recovery-checkpoints-"));
  const profile = makeProfile({ canvasWidth: 6, canvasHeight: 1 });
  const commands = ["CFG INPUT 65 45 1800", "P", "P", "P", "P", "E"];
  const resumePlan: ResumePlan = {
    inputConfigCommand: commands[0]!,
    initialCursor: { x: 0, y: 0 },
    segments: [
      {
        segmentIndex: 0,
        label: "segment 1",
        colorHex: null,
        slotIndex: null,
        resumePrefixCommands: ["C 0", "W 500"],
        firstCanvasPosition: { x: 0, y: 0 },
        bodyStartCommandIndex: 1,
        commandEndExclusive: 3,
      },
      {
        segmentIndex: 1,
        label: "segment 2",
        colorHex: null,
        slotIndex: null,
        resumePrefixCommands: ["C 1", "W 500"],
        firstCanvasPosition: { x: 0, y: 0 },
        bodyStartCommandIndex: 3,
        commandEndExclusive: 5,
      },
    ],
  };
  const snapshots: Array<{
    completedCommands: number;
    lastCompletedSegmentIndex: number | null;
    status: string;
  }> = [];
  const originalWriteSession = RecoverySessionStore.prototype.writeSession;
  RecoverySessionStore.prototype.writeSession = async function (record) {
    snapshots.push({
      completedCommands: record.completedCommands,
      lastCompletedSegmentIndex: record.lastCompletedSegmentIndex,
      status: record.status,
    });
    await originalWriteSession.call(this, record);
  };
  let server: Awaited<ReturnType<typeof startWebServer>> | null = null;

  try {
    server = await startWebServer({ port: 0, recoverySessionsRoot });
    const startResponse = await fetch(`${server.url}/api/execution/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: "simulate",
        commands,
        resumePlan,
        sourceLabel: "checkpoint-demo.png",
        profileSummary: makeRecoveryProfileSummary(profile),
      }),
    });
    assert.equal(startResponse.ok, true);
    const completionStatus = await waitForExecutionStatus(server.url, "completed", 6_000);
    const completionResponse = await fetch(`${server.url}/api/execution/status`);
    const completionPayload = await completionResponse.json();
    assert.equal(completionStatus, "completed", JSON.stringify(completionPayload));

    assert.deepEqual(
      snapshots.map(({ lastCompletedSegmentIndex, status }) => ({
        lastCompletedSegmentIndex,
        status,
      })),
      [
        { lastCompletedSegmentIndex: 0, status: "running" },
        { lastCompletedSegmentIndex: 1, status: "running" },
        { lastCompletedSegmentIndex: 1, status: "completed" },
      ],
    );
    assert.ok(commands.length > snapshots.length, "commands inside a segment must not each rewrite JSON");

    const failureStartIndex = snapshots.length;
    const failureResponse = await fetch(`${server.url}/api/execution/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: "simulate",
        commands,
        errorAtCommand: 1,
        retries: 0,
        resumePlan,
        sourceLabel: "checkpoint-failure.png",
        profileSummary: makeRecoveryProfileSummary(profile),
      }),
    });
    assert.equal(failureResponse.ok, true);
    assert.equal(await waitForExecutionStatus(server.url, "failed", 6_000), "failed");
    assert.deepEqual(
      snapshots.slice(failureStartIndex).map(({ status }) => status),
      ["recoverable"],
    );
  } finally {
    RecoverySessionStore.prototype.writeSession = originalWriteSession;
    if (server) {
      await server.close();
    }
    await rm(recoverySessionsRoot, { recursive: true, force: true });
  }
});

test("pause, late ACK progress, and stop each flush a stable recovery snapshot", async () => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-recovery-status-"));
  const profile = makeProfile({ canvasWidth: 6, canvasHeight: 1 });
  const pixelMap = makePixelMap(6, 1, [
    { x: 1, y: 0, colorIndex: 0, colorHex: "#000000" },
    { x: 4, y: 0, colorIndex: 1, colorHex: "#ffffff" },
  ]);
  const scanlinePlan = generateScanlinePlan(pixelMap, profile);
  const commands = serializeCommands(scanlinePlan.commands);
  const snapshots: Array<{ completedCommands: number; status: string }> = [];
  const originalWriteSession = RecoverySessionStore.prototype.writeSession;
  RecoverySessionStore.prototype.writeSession = async function (record) {
    snapshots.push({ completedCommands: record.completedCommands, status: record.status });
    await originalWriteSession.call(this, record);
  };
  let server: Awaited<ReturnType<typeof startWebServer>> | null = null;

  try {
    server = await startWebServer({ port: 0, recoverySessionsRoot });
    const startResponse = await fetch(`${server.url}/api/execution/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: "simulate",
        commands,
        ackDelayMs: 150,
        resumePlan: scanlinePlan.resumePlan,
        sourceLabel: "checkpoint-status.png",
        profileSummary: makeRecoveryProfileSummary(profile),
      }),
    });
    const startPayload = (await startResponse.json()) as {
      recoverySession?: { jobId: string };
    };
    assert.equal(startResponse.ok, true);
    assert.ok(startPayload.recoverySession);

    const pauseResponse = await fetch(`${server.url}/api/execution/pause`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(pauseResponse.ok, true);
    assert.equal(snapshots.at(-1)?.status, "paused");

    await waitForCondition(
      () => snapshots.some((snapshot) => snapshot.status === "paused" && snapshot.completedCommands > 0),
      3_000,
    );
    const writesBeforeStop = snapshots.length;
    const stopResponse = await fetch(`${server.url}/api/execution/stop`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(stopResponse.ok, true);
    assert.equal(snapshots.length, writesBeforeStop + 1);
    assert.equal(snapshots.at(-1)?.status, "recoverable");
    assert.equal(await waitForExecutionStatus(server.url, "stopped", 3_000), "stopped");

    const persisted = await new RecoverySessionStore(recoverySessionsRoot).loadSession(
      startPayload.recoverySession.jobId,
    );
    assert.equal(persisted.status, "recoverable");
    assert.ok(persisted.completedCommands > 0);
  } finally {
    RecoverySessionStore.prototype.writeSession = originalWriteSession;
    if (server) {
      await server.close();
    }
    await rm(recoverySessionsRoot, { recursive: true, force: true });
  }
});

test("startup marks active sessions completed when no resume segment remains", async () => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-recovery-final-segment-"));
  const store = new RecoverySessionStore(recoverySessionsRoot);

  try {
    for (const status of ["running", "paused"] as const) {
      const { commands, record } = await createRecoverySession(store, `final-${status}.png`);
      applyRecoveryProgress(record, commands.length);
      applyRecoveryStatus(record, status);
      await store.writeSession(record);
    }

    await store.cleanupSessions({ startup: true });
    const sessions = await store.listSessions();

    assert.equal(sessions.length, 2);
    for (const session of sessions) {
      assert.equal(session.nextResumeSegmentIndex, null);
      assert.equal(session.status, "completed");
      assert.equal(session.error, null);
    }
  } finally {
    await rm(recoverySessionsRoot, { recursive: true, force: true });
  }
});

test("startup cleanup converts stale running sessions into recoverable sessions", async () => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-recovery-startup-"));
  const profile = makeProfile({ canvasWidth: 5, canvasHeight: 1 });
  const pixelMap = makePixelMap(5, 1, [
    { x: 2, y: 0, colorIndex: 0, colorHex: "#000000" },
  ]);
  const scanlinePlan = generateScanlinePlan(pixelMap, profile);
  const commands = serializeCommands(scanlinePlan.commands);
  const store = new RecoverySessionStore(recoverySessionsRoot);

  await store.createSession({
    commands,
    resumePlan: scanlinePlan.resumePlan,
    sourceLabel: "startup-demo.png",
    profileSummary: makeRecoveryProfileSummary(profile),
    serialOptions: {
      baudRate: profile.baudRate,
      ackTimeoutMs: profile.ackTimeoutMs,
      retries: profile.commandRetryCount,
    },
  });

  let server: Awaited<ReturnType<typeof startWebServer>> | null = null;

  try {
    server = await startWebServer({ port: 0, recoverySessionsRoot });
    const response = await fetch(`${server.url}/api/recovery/sessions`);
    assert.equal(response.ok, true);
    const payload = (await response.json()) as {
      sessions?: Array<{ status?: string; error?: string | null }>;
    };

    assert.equal(payload.sessions?.[0]?.status, "recoverable");
    assert.match(payload.sessions?.[0]?.error ?? "", /ended unexpectedly/i);
  } finally {
    if (server) {
      await server.close();
    }

    await rm(recoverySessionsRoot, { recursive: true, force: true });
  }
});

test("startup cleanup converts stale paused sessions into recoverable sessions", async () => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-recovery-startup-paused-"));
  const profile = makeProfile({ canvasWidth: 5, canvasHeight: 1 });
  const pixelMap = makePixelMap(5, 1, [
    { x: 2, y: 0, colorIndex: 0, colorHex: "#000000" },
  ]);
  const scanlinePlan = generateScanlinePlan(pixelMap, profile);
  const commands = serializeCommands(scanlinePlan.commands);
  const store = new RecoverySessionStore(recoverySessionsRoot);
  const record = await store.createSession({
    commands,
    resumePlan: scanlinePlan.resumePlan,
    sourceLabel: "startup-paused-demo.png",
    profileSummary: makeRecoveryProfileSummary(profile),
    serialOptions: {
      baudRate: profile.baudRate,
      ackTimeoutMs: profile.ackTimeoutMs,
      retries: profile.commandRetryCount,
    },
  });

  applyRecoveryStatus(record, "paused");
  await store.writeSession(record);

  let server: Awaited<ReturnType<typeof startWebServer>> | null = null;

  try {
    server = await startWebServer({ port: 0, recoverySessionsRoot });
    const response = await fetch(`${server.url}/api/recovery/sessions`);
    assert.equal(response.ok, true);
    const payload = (await response.json()) as {
      sessions?: Array<{ status?: string; error?: string | null }>;
    };

    assert.equal(payload.sessions?.[0]?.status, "recoverable");
    assert.match(payload.sessions?.[0]?.error ?? "", /ended unexpectedly/i);
  } finally {
    if (server) {
      await server.close();
    }

    await rm(recoverySessionsRoot, { recursive: true, force: true });
  }
});

test("recovery session API persists visible files across restarts and can discard them", async () => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-recovery-"));
  const profile = makeProfile({ canvasWidth: 5, canvasHeight: 1 });
  const pixelMap = makePixelMap(5, 1, [
    { x: 2, y: 0, colorIndex: 0, colorHex: "#000000" },
  ]);
  const scanlinePlan = generateScanlinePlan(pixelMap, profile);
  const commands = serializeCommands(scanlinePlan.commands);
  const requestBody = {
    target: "simulate",
    commands,
    resumePlan: scanlinePlan.resumePlan,
    sourceLabel: "demo.png",
    profileSummary: makeRecoveryProfileSummary(profile),
  };

  let firstServer: Awaited<ReturnType<typeof startWebServer>> | null = null;
  let secondServer: Awaited<ReturnType<typeof startWebServer>> | null = null;

  try {
    firstServer = await startWebServer({ port: 0, recoverySessionsRoot });
    const startResponse = await fetch(`${firstServer.url}/api/execution/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    assert.equal(startResponse.ok, true);
    const startPayload = (await startResponse.json()) as {
      recoverySession?: { jobId: string; commandsFilePath: string };
    };

    assert.ok(startPayload.recoverySession);
    await access(startPayload.recoverySession.commandsFilePath);

    const completionTimeoutMs = Math.max(
      6_000,
      estimateRuntimeMs(scanlinePlan.commands, profile) + 2_000,
    );
    const finalExecutionStatus = await waitForExecutionStatus(
      firstServer.url,
      "completed",
      completionTimeoutMs,
    );
    assert.equal(finalExecutionStatus, "completed");

    const completedSessionsResponse = await fetch(`${firstServer.url}/api/recovery/sessions`);
    assert.equal(completedSessionsResponse.ok, true);
    const completedSessionsPayload = (await completedSessionsResponse.json()) as {
      sessions?: Array<{ jobId: string }>;
    };

    assert.equal(
      completedSessionsPayload.sessions?.some(
        (session) => session.jobId === startPayload.recoverySession?.jobId,
      ),
      true,
    );

    await firstServer.close();
    firstServer = null;

    secondServer = await startWebServer({ port: 0, recoverySessionsRoot });
    const restartedSessionsResponse = await fetch(`${secondServer.url}/api/recovery/sessions`);
    assert.equal(restartedSessionsResponse.ok, true);
    const restartedSessionsPayload = (await restartedSessionsResponse.json()) as {
      sessions?: Array<{ jobId: string }>;
    };

    assert.equal(
      restartedSessionsPayload.sessions?.some(
        (session) => session.jobId === startPayload.recoverySession?.jobId,
      ),
      true,
    );

    const discardResponse = await fetch(`${secondServer.url}/api/recovery/discard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: startPayload.recoverySession.jobId }),
    });
    assert.equal(discardResponse.ok, true);

    await assert.rejects(access(startPayload.recoverySession.commandsFilePath));
  } finally {
    if (firstServer) {
      await firstServer.close();
    }

    if (secondServer) {
      await secondServer.close();
    }

    await rm(recoverySessionsRoot, { recursive: true, force: true });
  }
});

test("execution reset keeps unfinished recovery sessions recoverable", async () => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-recovery-reset-"));
  const profile = makeProfile({ canvasWidth: 6, canvasHeight: 1 });
  const pixelMap = makePixelMap(6, 1, [
    { x: 1, y: 0, colorIndex: 0, colorHex: "#000000" },
    { x: 4, y: 0, colorIndex: 0, colorHex: "#000000" },
  ]);
  const scanlinePlan = generateScanlinePlan(pixelMap, profile);
  const commands = serializeCommands(scanlinePlan.commands);
  const requestBody = {
    target: "simulate",
    commands,
    ackDelayMs: 200,
    resumePlan: scanlinePlan.resumePlan,
    sourceLabel: "reset-demo.png",
    profileSummary: makeRecoveryProfileSummary(profile),
  };

  let server: Awaited<ReturnType<typeof startWebServer>> | null = null;

  try {
    server = await startWebServer({ port: 0, recoverySessionsRoot });
    const startResponse = await fetch(`${server.url}/api/execution/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    assert.equal(startResponse.ok, true);
    const startPayload = (await startResponse.json()) as {
      recoverySession?: { jobId: string };
    };

    assert.ok(startPayload.recoverySession);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const resetResponse = await fetch(`${server.url}/api/execution/reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(resetResponse.ok, true);
    const resetPayload = (await resetResponse.json()) as {
      execution?: { status?: string };
    };

    assert.equal(resetPayload.execution?.status, "idle");

    const sessionsResponse = await fetch(`${server.url}/api/recovery/sessions`);
    assert.equal(sessionsResponse.ok, true);
    const sessionsPayload = (await sessionsResponse.json()) as {
      sessions?: Array<{
        jobId: string;
        status: string;
        completedCommands: number;
        nextResumeSegmentIndex: number | null;
      }>;
    };
    const session = sessionsPayload.sessions?.find(
      (item) => item.jobId === startPayload.recoverySession?.jobId,
    );

    assert.ok(session);
    assert.equal(session.status, "recoverable");
    assert.ok(session.completedCommands < commands.length);
    assert.notEqual(session.nextResumeSegmentIndex, null);
  } finally {
    if (server) {
      await server.close();
    }

    await rm(recoverySessionsRoot, { recursive: true, force: true });
  }
});

test("execution start rejects unsupported round large-brush recovery sessions", async (t) => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-recovery-round-"));
  t.after(async () => {
    await rm(recoverySessionsRoot, { recursive: true, force: true });
  });

  const server = await startWebServer({ port: 0, recoverySessionsRoot });
  t.after(async () => {
    await server.close();
  });

  const response = await fetch(`${server.url}/api/execution/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      commands: ["CFG INPUT 65 45 1800", "E"],
      target: "simulate",
      profileSummary: {
        brushSize: 3,
        brushShape: "round",
        colorMode: "mono",
        templateId: "none",
        templateLabel: "无模板（正方形）",
        imageScalePercent: 100,
        imageOffsetXPercent: 0,
        imageOffsetYPercent: 0,
      },
    }),
  });

  assert.equal(response.ok, false);
  assert.equal(response.status, 400);
  const payload = (await response.json()) as { error?: string };
  assert.match(payload.error ?? "", /圆形/u);
  assert.match(payload.error ?? "", /暂不支持/u);
});
