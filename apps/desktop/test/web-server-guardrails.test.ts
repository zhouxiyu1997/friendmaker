import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import test from "node:test";

import { startWebServer } from "../src/web/server.js";

async function createRecoveryServer(prefix: string) {
  const parentRoot = await mkdtemp(path.join(os.tmpdir(), prefix));
  const recoverySessionsRoot = path.join(parentRoot, "recovery-sessions");
  await mkdir(recoverySessionsRoot, { recursive: true });
  const server = await startWebServer({ port: 0, recoverySessionsRoot });

  return {
    parentRoot,
    recoverySessionsRoot,
    server,
  };
}

test("local API rejects cross-origin POST requests even when they claim to be JSON", async (t) => {
  const { parentRoot, recoverySessionsRoot, server } = await createRecoveryServer(
    "friendmaker-web-guard-origin-",
  );

  t.after(async () => {
    await server.close();
    await rm(parentRoot, { recursive: true, force: true });
  });

  await writeFile(path.join(recoverySessionsRoot, "job.resume.json"), "{}\n", "utf8");
  await writeFile(path.join(recoverySessionsRoot, "job.commands.txt"), "BTN A\n", "utf8");

  const response = await fetch(`${server.url}/api/recovery/discard`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://evil.example",
    },
    body: JSON.stringify({ sessionId: "job" }),
  });
  const payload = (await response.json()) as { error?: string };

  assert.equal(response.status, 403);
  assert.match(payload.error ?? "", /cross-origin/i);
  await access(path.join(recoverySessionsRoot, "job.resume.json"));
  await access(path.join(recoverySessionsRoot, "job.commands.txt"));
});

test("local API rejects POST requests that do not use application/json", async (t) => {
  const { parentRoot, recoverySessionsRoot, server } = await createRecoveryServer(
    "friendmaker-web-guard-content-type-",
  );

  t.after(async () => {
    await server.close();
    await rm(parentRoot, { recursive: true, force: true });
  });

  await writeFile(path.join(recoverySessionsRoot, "job.resume.json"), "{}\n", "utf8");
  await writeFile(path.join(recoverySessionsRoot, "job.commands.txt"), "BTN A\n", "utf8");

  const response = await fetch(`${server.url}/api/recovery/discard`, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
    },
    body: JSON.stringify({ sessionId: "job" }),
  });
  const payload = (await response.json()) as { error?: string };

  assert.equal(response.status, 415);
  assert.match(payload.error ?? "", /application\/json/i);
  await access(path.join(recoverySessionsRoot, "job.resume.json"));
  await access(path.join(recoverySessionsRoot, "job.commands.txt"));
});

test("recovery session APIs reject session ids that try to escape the recovery root", async (t) => {
  const { parentRoot, server } = await createRecoveryServer("friendmaker-web-guard-session-id-");
  const escapedResumePath = path.join(parentRoot, "escape.resume.json");
  const escapedCommandsPath = path.join(parentRoot, "escape.commands.txt");

  t.after(async () => {
    await server.close();
    await rm(parentRoot, { recursive: true, force: true });
  });

  await writeFile(escapedResumePath, "{}\n", "utf8");
  await writeFile(escapedCommandsPath, "BTN A\n", "utf8");

  const response = await fetch(`${server.url}/api/recovery/discard`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ sessionId: "../escape" }),
  });
  const payload = (await response.json()) as { error?: string };

  assert.equal(response.status, 400);
  assert.match(payload.error ?? "", /invalid recovery session id/i);
  await access(escapedResumePath);
  await access(escapedCommandsPath);
});

test("web server refuses to start a second instance in the same process", async (t) => {
  const firstRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-web-guard-first-"));
  const secondRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-web-guard-second-"));
  const server = await startWebServer({
    port: 0,
    recoverySessionsRoot: path.join(firstRoot, "recovery-sessions"),
  });

  t.after(async () => {
    await server.close();
    await rm(firstRoot, { recursive: true, force: true });
    await rm(secondRoot, { recursive: true, force: true });
  });

  await assert.rejects(
    startWebServer({
      port: 0,
      recoverySessionsRoot: path.join(secondRoot, "recovery-sessions"),
    }),
    /already running in this process/i,
  );
});
