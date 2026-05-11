import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import test from "node:test";

import {
  buildRecoveryExecutionPlan,
  deriveResumeProgress,
} from "../src/app/recovery.js";
import { generateScanlinePlan } from "../src/path/scanline.js";
import { serializeCommands } from "../src/protocol/serializer.js";
import { SimulatedAckSender } from "../src/simulator/sender.js";
import { startWebServer } from "../src/web/server.js";
import {
  RecoverySessionStore,
  applyRecoveryStatus,
} from "../src/web/recoverySessions.js";
import type { DrawingProfile, Pixel, PixelMap } from "../src/types.js";

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
    colorMode: profile.colorMode,
    templateId: "none",
    templateLabel: "无模板（正方形）",
    imageScalePercent: 100,
    imageOffsetXPercent: 0,
    imageOffsetYPercent: 0,
  };
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
  assert.deepEqual(segment.resumePrefixCommands, ["C 1"]);
  assert.deepEqual(segment.firstCanvasPosition, { x: 2, y: 0 });
  assert.equal(segment.bodyStartCommandIndex, 1);
  assert.equal(commands[segment.bodyStartCommandIndex], "P");
  assert.equal(segment.commandEndExclusive, 2);
});

test("official and palette resume segments rebuild only unfinished color slots", () => {
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

  assert.equal(officialSegments.length, 3);
  assert.equal(officialSegments[0]?.resumePrefixCommands[0], "BC RESET");
  assert.equal(officialSegments[1]?.resumePrefixCommands[0], "BC RESET");
  assert.match(officialSegments[1]?.resumePrefixCommands[1] ?? "", /^BC 1 /u);
  assert.match(officialSegments[1]?.resumePrefixCommands[2] ?? "", /^BC 2 /u);
  assert.equal(
    officialSegments[1]?.resumePrefixCommands.some((command) => /^BC 0 /u.test(command)),
    false,
  );
  assert.equal(
    officialSegments[1]?.resumePrefixCommands[officialSegments[1].resumePrefixCommands.length - 1],
    "C 1",
  );
  assert.equal(officialCommands[officialSegments[1]?.bodyStartCommandIndex ?? 0], "P");

  const paletteProfile = makeProfile({
    canvasWidth: 9,
    canvasHeight: 1,
    colorMode: "palette",
    colorCount: 16,
    palette: Array.from({ length: 16 }, (_, index) => `#${String(index + 1).padStart(6, "0")}`),
  });
  const palettePlan = generateScanlinePlan(pixelMap, paletteProfile);
  const paletteSegments = palettePlan.resumePlan.segments;

  assert.match(paletteSegments[0]?.resumePrefixCommands[0] ?? "", /^PC 0 /u);
  assert.match(paletteSegments[0]?.resumePrefixCommands[1] ?? "", /^PC 1 /u);
  assert.match(paletteSegments[1]?.resumePrefixCommands[0] ?? "", /^PC 1 /u);
  assert.match(paletteSegments[1]?.resumePrefixCommands[1] ?? "", /^PC 2 /u);
  assert.equal(
    paletteSegments[1]?.resumePrefixCommands.some((command) => /^PC 0 /u.test(command)),
    false,
  );
  assert.equal(
    paletteSegments[1]?.resumePrefixCommands[paletteSegments[1].resumePrefixCommands.length - 1],
    "C 1",
  );
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

    let finalExecutionStatus = "idle";

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const statusResponse = await fetch(`${firstServer.url}/api/execution/status`);
      const statusPayload = (await statusResponse.json()) as {
        execution?: { status?: string };
      };

      finalExecutionStatus = statusPayload.execution?.status ?? finalExecutionStatus;

      if (finalExecutionStatus === "completed") {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 20));
    }

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
